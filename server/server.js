import crypto from 'node:crypto';
import SockRR from './sockrr-server.js';
import express from 'express';
import path from 'node:path';
import config from './config.js';

const run = async () => {
  const app = express();

  app.use(express.static(path.resolve(process.cwd(), 'public')));

  const onlinePeers = new Map();

  const httpServer = app.listen(config.http.port, () => {
    console.log(`server listening on port ${config.http.port}`);
  });

  const sockRR = SockRR(httpServer);

  // set a callback to be called when a new client connects
  sockRR.onNewClient((srr) => {
    try {
      const peerId = crypto.randomUUID();
      const peer = {
        id: peerId,
        socket: srr,
        peerName: '',
        isOnline: false,
      };

      console.log(`new peer connected with id ${peerId}`);

      srr.onRequest(async (method, data = {}, accept, reject) => {
        try {
          console.log(
            `request received from peer: ${peer.peerName || peer.id} of method: ${method} and data: `,
            data
          );

          switch (method) {
            case 'JOIN_WEBRTC': {
              onlinePeers.set(peerId, peer);
              peer.isOnline = true;

              const peerName = data.name;
              peer.peerName = peerName;
              accept();

              for (const p of onlinePeers.values()) {
                if (p.id != peerId) {
                  p.socket.notify('NEW_PEER', { peerId, peerName });

                  peer.socket.notify('NEW_PEER', {
                    peerId: p.id,
                    peerName: p.peerName,
                  });
                }
              }

              break;
            }
          }

          reject('invalid request');
        } catch (err) {
          console.log(err);
          reject('request failure');
        }
      });

      srr.onNotification(async (method, data = {}) => {
        try {
          switch (method) {
            case 'WEBRTC_OFFER': {
              const { otherPeerId, offer } = data;

              //first make sure the peerId exists
              if (!onlinePeers.has(otherPeerId)) {
                return;
              }

              const otherPeer = onlinePeers.get(otherPeerId);

              otherPeer.socket.notify('WEBRTC_OFFER', {
                offer,
                otherPeerId: peerId,
              });

              break;
            }

            case 'WEBRTC_ANSWER': {
              const { otherPeerId, answer } = data;

              //first make sure the peerId exists
              if (!onlinePeers.has(otherPeerId)) {
                return;
              }

              const otherPeer = onlinePeers.get(otherPeerId);

              otherPeer.socket.notify('WEBRTC_ANSWER', {
                answer,
                otherPeerId: peerId,
              });

              break;
            }

            case 'WEBRTC_ICE_CANDIDATE': {
              const { otherPeerId, candidate } = data;

              //first make sure the peerId exists
              if (!onlinePeers.has(otherPeerId)) {
                return;
              }

              const otherPeer = onlinePeers.get(otherPeerId);

              otherPeer.socket.notify('WEBRTC_ICE_CANDIDATE', {
                candidate,
                otherPeerId: peerId,
              });

              break;
            }
          }
        } catch (err) {
          console.log(err);
        }
      });

      srr.onClose(() => {
        onlinePeers.delete(peerId);

        for (const p of onlinePeers.values()) {
          p.socket.notify('PEER_LEFT', { peerId });
        }

        console.log(`peer: ${peer.peerName || peer.id} left`);
      });
    } catch (err) {
      console.log(err);
    }
  });
};

run().catch((err) => {
  console.error('Application Error: ', err);
  setTimeout(() => process.exit(1), 2000);
});
