import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function TestApp() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>React is Working!</h1>
      <p>If you see this, React is rendering properly.</p>
      <p>Time: {new Date().toLocaleTimeString()}</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TestApp />
  </React.StrictMode>
);
