export const OnlinePeers = ({
  onlinePeers,
  selectedPeerId,
  changeCheckBoxValue,
  connectToSelectedPeer,
  connectedPeers = [],
}) => {
  return (
    <div id="app-control">
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <span>Online Peers: {onlinePeers.length}</span>
      </div>

      {onlinePeers.length > 0 ? (
        <>
          <div style={{ width: '98%', margin: '0px auto' }}>
            {onlinePeers.map(({ peerId, peerName }) => (
              <div key={peerId} style={{ width: '100%', marginTop: '5px' }}>
                <input
                  type="checkbox"
                  checked={peerId == selectedPeerId}
                  onChange={(e) =>
                    changeCheckBoxValue(peerId, e.target.checked)
                  }
                  disabled={connectedPeers.includes(peerId)}
                />
                &nbsp;&nbsp;
                <span>{peerName}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              width: '98%',
              margin: '20px auto',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              gap: '10px',
            }}
          >
            <button
              style={{ padding: '5px 10px' }}
              onClick={connectToSelectedPeer}
            >
              Connect
            </button>
            <button style={{ padding: '5px 10px' }}>Disconnect</button>
          </div>
        </>
      ) : null}
    </div>
  );
};
