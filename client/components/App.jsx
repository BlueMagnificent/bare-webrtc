import { useCallback, useEffect, useRef, useState } from 'react';
import SockRR from '../sockrr-client';
import { generateName } from '../random-name';
import { Peer } from './Peer';
import { OnlinePeers } from './OnlinePeers';


const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" }
];

const sortFunc = ({ peerName: a }, { peerName: b }) => {
  a = a.toLowerCase();
  b = b.toLowerCase();

  if (a < b) return -1;
  if (a > b) return 1;

  return 0;
};

export const App = () => {
  const [selfName, setSelfName] = useState('');
  const [otherPeerName] = useState('');
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [onlinePeersState, setOnlinePeersState] = useState([]);

  const onlinePeersRef = useRef(new Map());
  const selfVideoRef = useRef(null);
  const otherPeerVideoRef = useRef(null);
  const otherPeerAudioRef = useRef(null);

  const pcRef = useRef(null);
  const otherPeerIdRef = useRef(null);
  const srrRef = useRef(null);
  const localStreamRef = useRef(null);

  const updateOnlinePeersState = useCallback(() => {
    setOnlinePeersState(
      onlinePeersRef.current.size > 0
        ? Array.from(onlinePeersRef.current.values()).sort(sortFunc)
        : []
    );
  }, []);

  const createPeerConnection = useCallback(async () => {
    if (pcRef.current) pcRef.current.close();

    const pc = pcRef.current = new RTCPeerConnection({iceServers});
    const localStream = localStreamRef.current;

    if (localStream)
      localStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
      if (!otherPeerIdRef.current || !srrRef.current) return;

      srrRef.current.notify('WEBRTC_ICE_CANDIDATE', {
        candidate: event.candidate,
        otherPeerId: otherPeerIdRef.current,
      });
    };

    pc.oniceconnectionstatechange = (event) => {
      if (pcRef.current) {
        console.log(`ICE state: ${pcRef.current.iceConnectionState}`);
        console.log('ICE state change event: ', event);
      }
    };

    pc.ontrack = (event) => {
      if (otherPeerVideoRef.current)
        otherPeerVideoRef.current.srcObject = event.streams[0];
    };

    return pc;
  }, []);

  const onSocketNotification = useCallback(
    async (method, data = {}) => {
      console.log(
        'notification received with method: ' + method + ' and data: ',
        data
      );

      switch (method) {
        case 'NEW_PEER': {
          const { peerId, peerName } = data;

          onlinePeersRef.current.set(peerId, { peerId, peerName });
          updateOnlinePeersState();

          break;
        }

        case 'PEER_LEFT': {
          const { peerId } = data;

          onlinePeersRef.current.delete(peerId);
          updateOnlinePeersState();
          break;
        }

        case 'WEBRTC_OFFER': {
          const { offer, otherPeerId } = data;

          try {
            const pc = await createPeerConnection();

            await pc.setRemoteDescription(offer);

            const desc = await pc.createAnswer();

            await pc.setLocalDescription(desc);

            srrRef.current.notify('WEBRTC_ANSWER', {
              answer: desc,
              otherPeerId,
            });
            otherPeerIdRef.current = otherPeerId;
          } catch (err) {
            console.error('"WEBRTC_OFFER" notification error: ', err);
          }

          break;
        }

        case 'WEBRTC_ANSWER': {
          const { answer, otherPeerId } = data;

          if (otherPeerIdRef.current !== otherPeerId || !pcRef.current) return;

          pcRef.current
            .setRemoteDescription(answer)
            .then(() => console.log('remote description set sucessfully'))
            .catch((err) =>
              console.log(`failed to set remote description: ${err.toString()}`)
            );

          break;
        }

        case 'WEBRTC_ICE_CANDIDATE': {
          const { candidate, otherPeerId } = data;

          if (otherPeerIdRef.current !== otherPeerId) return;

          if (!pcRef.current || !candidate) return;

          pcRef.current
            .addIceCandidate(candidate)
            .then(() => console.log('ice candidate successfully added'))
            .catch((err) => console.log('failed to add ice candidate: ', err));

          break;
        }
      }
    },
    [createPeerConnection, updateOnlinePeersState]
  );

  const changeCheckBoxValue = useCallback((peerId, newValue) => {
    if (newValue) setSelectedPeerId(peerId);
    else setSelectedPeerId('');
  }, []);

  const connectToSelectedPeer = useCallback(async () => {
    if (!selectedPeerId || selectedPeerId == '') return;

    const selectedPeer = onlinePeersRef.current.get(selectedPeerId);

    if (!selectedPeer) return;

    try {
      const pc = await createPeerConnection();
      const desc = await pc.createOffer();

      await pc.setLocalDescription(desc);

      srrRef.current.notify('WEBRTC_OFFER', {
        offer: desc,
        otherPeerId: selectedPeer.peerId,
      });
      otherPeerIdRef.current = selectedPeer.peerId;
    } catch (err) {
      console.error('App::connectToSelectedPeer | error:', err);
    }
  }, [createPeerConnection, selectedPeerId]);

  useEffect(() => {
    const start = async () => {
      try {
        let socketUrl = import.meta.env.VITE_SOCKET_URL;

        if (import.meta.env.MODE == 'production') {
          socketUrl = window.location.href;
        }

        console.debug('connecting to ' + socketUrl);

        const srr = await SockRR(socketUrl);

        srrRef.current = srr;
        srr.onNotification(onSocketNotification);
        srr.onClose(() => {
          console.error('web socket connection closed');
        });

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        localStreamRef.current = localStream;

        if (selfVideoRef.current) selfVideoRef.current.srcObject = localStream;

        const name = generateName();
        setSelfName(name);

        await srr.request('JOIN_WEBRTC', { name });

      } catch (error) {
        console.log(error);
      }
    };

    start().catch((error) => console.error('Error in start(): ', error));

    return () => {
      if (pcRef.current) pcRef.current.close();

      if (localStreamRef.current)
        localStreamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [onSocketNotification]);

  return (
    <div id="app-container">
      <div id="app-display">
        <Peer peerName={selfName} peerVideoRef={selfVideoRef} isSelf={true} />
        <hr />
        <Peer
          peerName={otherPeerName}
          peerVideoRef={otherPeerVideoRef}
          peerAudioRef={otherPeerAudioRef}
        />
      </div>
      <OnlinePeers
        onlinePeers={onlinePeersState}
        selectedPeerId={selectedPeerId}
        changeCheckBoxValue={changeCheckBoxValue}
        connectToSelectedPeer={connectToSelectedPeer}
      />
    </div>
  );
};
