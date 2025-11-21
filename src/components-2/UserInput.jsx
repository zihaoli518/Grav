export default function UserInput({
  G,
  setG,
  numBodies,
  setNumBodies,
  radiusFactor,
  setRadiusFactor,
  collisionFactor,
  setCollisionFactor,
}) {
  const handleReset = () => {
    window.location.reload();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        left: 20,
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '20px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '14px',
        zIndex: 100,
        maxWidth: '300px',
        border: '1px solid #444',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Physics Controls</h3>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Gravitational Constant (G)
          <br />
          <input
            type="range"
            min="0.1"
            max="100"
            step="0.5"
            value={G}
            onChange={(e) => setG(parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{G.toFixed(2)}</small>
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Number of Bodies
          <br />
          <input
            type="range"
            min="10"
            max="6000"
            step="100"
            value={numBodies}
            onChange={(e) => setNumBodies(parseInt(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{numBodies}</small>
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Radius Factor
          <br />
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.05"
            value={radiusFactor}
            onChange={(e) => setRadiusFactor(parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{radiusFactor.toFixed(2)}</small>
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Collision Factor
          <br />
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={collisionFactor}
            onChange={(e) => setCollisionFactor(parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{collisionFactor.toFixed(2)}</small>
        </label>
      </div>

      <button
        onClick={handleReset}
        style={{
          width: '100%',
          padding: '10px',
          background: '#ff6b6b',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        Reset Simulation
      </button>
    </div>
  );
}