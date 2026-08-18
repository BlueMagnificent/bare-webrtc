import { LoadingOverlay } from './LoadingOverlay';

export const Peer = ({ isConnecting = false, peerName, peerVideoRef, isSelf }) => {
  return (
    <div className="peer">
      <div className="peerName">
        <span>{peerName}</span>
      </div>
      {isConnecting && <LoadingOverlay />}
      <video ref={peerVideoRef} autoPlay playsInline muted={isSelf}></video>
    </div>
  );
};
