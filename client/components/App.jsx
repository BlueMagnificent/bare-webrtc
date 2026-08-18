import { useCallback, useEffect, useRef, useState } from 'react';
import SockRR from '../sockrr-client';
import { generateName } from '../random-name';
import { Peer } from './Peer';
import { OnlinePeers } from './OnlinePeers';
import { OtherPeer } from './OtherPeer';


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

const onlinePeers = new Map();

export const App = () => {
  const [peerName, setPeerName] = useState('');
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [onlinePeersState, setOnlinePeersState] = useState([]);
  const [connectedPeers, setConnectedPeers] = useState([]);

  const socketMessageHandlers = useRef(null);

  if(socketMessageHandlers.current === null) {
    socketMessageHandlers.current = new Map();
  }

  const peerVideoRef = useRef(null);

  const pcRef = useRef(null);
  const otherPeerRef = useRef(null);
  const srrRef = useRef(null);
  const localStreamRef = useRef(null);

  const subscribeToSignalling = useCallback((peerId, handler) => {
    socketMessageHandlers.current.set(peerId, handler);
  }, []);

  const unSuscribeFromSignalling = useCallback((peerId) => {
    socketMessageHandlers.current.delete(peerId);
  }, []);

  const updateOnlinePeersState = useCallback(() => {
    setOnlinePeersState(
      onlinePeers.size > 0
        ? Array.from(onlinePeers.values()).sort(sortFunc)
        : []
    );
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

          onlinePeers.set(peerId, { peerId, peerName });
          updateOnlinePeersState();

          break;
        }

        case 'PEER_LEFT': {
          const { peerId } = data;

          if(otherPeerRef.current && otherPeerRef.current.peerId === peerId) {
            otherPeerRef.current = null;

            if (pcRef.current) pcRef.current.close();
          }

          onlinePeers.delete(peerId);
          updateOnlinePeersState();
          break;
        }

        case 'WEBRTC_OFFER':
        case 'WEBRTC_ANSWER':
        case 'WEBRTC_ICE_CANDIDATE': {
          const { otherPeerId } = data;

          const otherPeerMessageHandler = socketMessageHandlers.current.get(otherPeerId);

          if(!otherPeerMessageHandler) {
            console.error(`No message handler found for other peer: ${otherPeerId}`);
            return;
          }
          
          await otherPeerMessageHandler(method, data);

          break;
        }
        
        default: {
          console.error('Unknown notification method: ' + method);
        }
      }
    },
    [updateOnlinePeersState]
  );

  const onSocketRequest = useCallback(async (method, data, accept, reject) => {
    try {
      console.log(
        'request received with method: ' + method + ' and data: ',
        data
      );
      
      switch (method) {
        case 'PEER_CONNECTION_REQUESTED': {
          const { otherPeerId } = data;

          // Ensure that the peer requesting connection exists in the onlinePeers map
          const requestingPeer = onlinePeers.get(otherPeerId);
          if (!requestingPeer) {
            console.error(`Peer with ID ${otherPeerId} requesting connection not found in onlinePeers.`);
            reject('peer not found');
            return;
          }

          setConnectedPeers((prevConnectedPeers) => {
            const updatedConnectedPeers = [...prevConnectedPeers, {otherPeerId, otherPeerName: requestingPeer.peerName, isPcSendingOffer: false}];
            return updatedConnectedPeers;
          });

          accept();
          break;
        }
        
        default: {
          console.error('Unknown request method: ' + method);
          reject('invalid request method');
        }
      }
    }
    catch (err) {
      console.log(err);
      reject('request failure');
    }
  }, []);

  const changeCheckBoxValue = useCallback((peerId, newValue) => {
    if (newValue) setSelectedPeerId(peerId);
    else setSelectedPeerId('');
  }, []);

  const connectToSelectedPeer = useCallback(async () => {
    if (!selectedPeerId || selectedPeerId == '') return;

    const selectedPeer = onlinePeers.get(selectedPeerId);

    if (!selectedPeer) return;

    try {

      await srrRef.current.request('CONNECT_TO_PEER', {
        otherPeerId: selectedPeer.peerId,
      });

      setConnectedPeers((prevConnectedPeers) => {
        const updatedConnectedPeers = [...prevConnectedPeers, {otherPeerId: selectedPeer.peerId, otherPeerName: selectedPeer.peerName, isPcSendingOffer: true}];
        return updatedConnectedPeers;
      });
      
    } catch (err) {
      console.error('App::connectToSelectedPeer | error:', err);
    }
  }, [selectedPeerId]);

  const endPeerConnection = useCallback((otherPeerId) => {
        setConnectedPeers((prevConnectedPeers) =>
          prevConnectedPeers.filter((peer) => peer.otherPeerId !== otherPeerId)
        );

        if (pcRef.current) {
          pcRef.current.close();
          pcRef.current = null;
        }
        if (otherPeerRef.current && otherPeerRef.current.peerId === otherPeerId) {
          otherPeerRef.current = null;
        }
  }, []);

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
        srr.onRequest(onSocketRequest);
        srr.onClose(() => {
          console.error('web socket connection closed');
        });

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        localStreamRef.current = localStream;

        if (peerVideoRef.current) peerVideoRef.current.srcObject = localStream;

        const name = generateName();

        await srr.request('JOIN_WEBRTC', { name });

        setPeerName(name);

      } catch (error) {
        console.log(error);
      }
    };

    start().catch((error) => console.error('Error in App useEffect: ', error));

    return () => {
      if (pcRef.current) pcRef.current.close();

      if (localStreamRef.current)
        localStreamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [onSocketNotification, setPeerName, onSocketRequest, updateOnlinePeersState]);

  return (
    <div id="app-container">
      <div id="app-display">
        <Peer peerName={peerName} peerVideoRef={peerVideoRef} isSelf={true} />
        <hr />
        <div className ="other-peers-container">
        {
          connectedPeers.map(({otherPeerId, otherPeerName, isPcSendingOffer}) => (
            <OtherPeer
              key={otherPeerId}
              otherPeerId={otherPeerId}
              otherPeerName={otherPeerName}
              isPcSendingOffer={isPcSendingOffer}
              subscribeToSignalling={subscribeToSignalling}
              unSuscribeFromSignalling={unSuscribeFromSignalling}
              endConnection={endPeerConnection}
              localStreamRef={localStreamRef}
              iceServers={iceServers}
              srrRef={srrRef}
            />
          ))
        }
            
        </div>
      </div>
      <OnlinePeers
        onlinePeers={onlinePeersState}
        selectedPeerId={selectedPeerId}
        changeCheckBoxValue={changeCheckBoxValue}
        connectToSelectedPeer={connectToSelectedPeer}
        connectedPeers={connectedPeers.map(peer => peer.otherPeerId)}
      />
    </div>
  );
};
