export default function UserInput(props) {
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
      <h3 style={{ marginTop: 0, marginBottom: '15px' }}>
        Physics Controls
      </h3>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Gravitational Constant (G)
          <br />
          <input
            type="range"
            min="-5"
            max="10"
            step="0.1"
            value={props.G}
            onChange={(e) => props.setG(parseFloat(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{props.G.toFixed(2)}</small>
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Number of Bodies
          <br />
          <input
            type="range"
            min="10"
            max="20000"
            step="100"
            value={props.numBodies}
            onChange={(e) => props.setNumBodies(parseInt(e.target.value))}
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{props.numBodies}</small>
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
            value={props.radiusFactor}
            onChange={(e) =>
              props.setRadiusFactor(parseFloat(e.target.value))
            }
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{props.radiusFactor.toFixed(2)}</small>
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
            value={props.collisionFactor}
            onChange={(e) =>
              props.setCollisionFactor(parseFloat(e.target.value))
            }
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{props.collisionFactor.toFixed(2)}</small>
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Simulation Speed
          <br />
          <input
            type="range"
            min="1"
            max="100"
            step="0.1"
            value={props.simSpeed}
            onChange={(e) =>
              props.setSimSpeed(parseFloat(e.target.value))
            }
            style={{ width: '100%', marginTop: '5px' }}
          />
          <small>{props.simSpeed.toFixed(2)}</small>
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          Spawn Algorithm
          <br />
          <select
            value={props.initialPattern}
            onChange={(e) => props.setInitialPattern(e.target.value)}
            style={{
              width: '100%',
              marginTop: '5px',
              padding: '4px',
              background: '#111',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            <option value="disc">Disc (Galaxy)</option>
            <option value="box">Box (Random)</option>
            <option value="ring">Ring</option>
            <option value="sphere">Sphere</option>
          </select>
          <small style={{ display: 'block', marginTop: '4px', color: '#aaa' }}>
            {props.initialPattern}
          </small>
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
