export const Peer = ({ peerName, peerVideoRef, peerAudioRef, isSelf }) => {
  return (
    <div className="peer">
      <div className="peerName">
        <span>{peerName}</span>
      </div>
      <video ref={peerVideoRef} autoPlay playsInline muted={isSelf}></video>
      {peerAudioRef && <audio ref={peerAudioRef} autoPlay playsInline></audio>}
    </div>
  );
};
