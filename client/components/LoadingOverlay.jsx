

export const LoadingOverlay = () => (
  <>
    <style jsx>{`

    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999;
      background: rgba(255, 255, 255, 0.89);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .loader {
      width: 60px;
      height: 60px;
      border: 8px solid #f3f3f3;
      border-top: 8px solid #f00;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0px auto;
    }

    @keyframes spin {
        0% { transform: rotate(0deg);}
        100% { transform: rotate(360deg);}
    }

    `}</style>
    <div className="overlay">
        <div className="loader"></div>
    </div>
  </>
);