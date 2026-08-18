import { useState, useRef, useEffect, useCallback } from 'react';
import { Peer } from './Peer';
import { LoadingOverlay } from './LoadingOverlay';

export const OtherPeer = ({
  otherPeerId,
  otherPeerName,
  isPcSendingOffer,
  subscribeToSignalling,
  unSuscribeFromSignalling,
  endConnection,
  localStreamRef,
  iceServers,
  srrRef
}) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const otherPeerVideoRef = useRef();
  const pcRef = useRef(null);

  const createPeerConnection = useCallback(async () => {
    if (pcRef.current) pcRef.current.close();

    if (!srrRef || !srrRef.current) {
      console.error('srrRef.current is null in createPeerConnection');
      return;
    }

    const pc = pcRef.current = new RTCPeerConnection({ iceServers });

    if (localStreamRef.current){
      localStreamRef.current
        .getTracks()
        .forEach((track) => pc.addTrack(track, localStreamRef.current));
    }

    pc.onicecandidate = (event) => {
      srrRef.current.notify('WEBRTC_ICE_CANDIDATE', {
        candidate: event.candidate,
        otherPeerId,
      });
    };

    pc.oniceconnectionstatechange = (event) => {
      if (pcRef.current) {
        console.log(`ICE state: ${pcRef.current.iceConnectionState}`);
        console.log('ICE state change event: ', event);
      }
    };

    pc.ontrack = (event) => {
      if (otherPeerVideoRef.current === null) return;

      otherPeerVideoRef.current.srcObject = event.streams[0];

      setIsConnecting(false);
    };

    return pc;
  }, [localStreamRef, iceServers, otherPeerId, srrRef]);

  const messageHandler = useCallback(async (method, data) => {

      switch (method) {

        case 'WEBRTC_OFFER': {
          const { offer } = data;

          try {
            const pc = await createPeerConnection();

            await pc.setRemoteDescription(offer);

            const desc = await pc.createAnswer();

            await pc.setLocalDescription(desc);

            srrRef.current.notify('WEBRTC_ANSWER', {
              answer: desc,
              otherPeerId,
            });
            
          } catch (err) {
            console.error('"WEBRTC_OFFER" notification error: ', err);
          }

          break;
        }

        case 'WEBRTC_ANSWER': {
          const { answer } = data;

          if (!pcRef.current) return;

          pcRef.current
            .setRemoteDescription(answer)
            .then(() => console.log('remote description set sucessfully'))
            .catch((err) =>
              console.log(`failed to set remote description: ${err.toString()}`)
            );

          break;
        }

        case 'WEBRTC_ICE_CANDIDATE': {
          const { candidate } = data;

          if (!pcRef.current) return;

          if (!pcRef.current || !candidate) return;

          pcRef.current
            .addIceCandidate(candidate)
            .then(() => console.log('ice candidate successfully added'))
            .catch((err) => console.log('failed to add ice candidate: ', err));

          break;
        }
      }

  }, [createPeerConnection, srrRef, otherPeerId]);

  useEffect(() =>{

    const start = async () => {

      if (subscribeToSignalling) {
        subscribeToSignalling(otherPeerId, messageHandler);
      }

      if(isPcSendingOffer){
          
        try {
          const pc = await createPeerConnection();
          const desc = await pc.createOffer();

          await pc.setLocalDescription(desc);

          srrRef.current.notify('WEBRTC_OFFER', {
            offer: desc,
            otherPeerId,
          });

        } catch (err) {
          console.error(`Error creating offer to ${otherPeerId}: `, err);
          endConnection();
        }
      }
    };

    start().catch((err) => {
      console.error('Error in OtherPeer useEffect: ', err);
      endConnection();
    });

    return () => {
      if (unSuscribeFromSignalling) {
        unSuscribeFromSignalling(otherPeerId);
      }

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [subscribeToSignalling, unSuscribeFromSignalling, otherPeerId, createPeerConnection, isPcSendingOffer, endConnection, messageHandler, srrRef]);

  
  return (
    <>
      {isConnecting && <LoadingOverlay />}
      <Peer peerName={otherPeerName} peerVideoRef={otherPeerVideoRef} />
    </>
  )
};