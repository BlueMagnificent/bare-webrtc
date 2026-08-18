export const Peer = ({ peerName, peerVideoRef, isSelf }) => {
  return (
    <div className="peer">
      <div className="peerName">
        <span>{peerName}</span>
      </div>
      <video ref={peerVideoRef} autoPlay playsInline muted={isSelf}></video>
    </div>
  );
};
