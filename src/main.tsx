import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

console.log('🚀 [main.tsx] Starting React application...');
console.log('🚀 [main.tsx] Root element:', document.getElementById('root'));
console.log('🚀 [main.tsx] Environment:', {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('❌ [main.tsx] Root element not found!');
  document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif"><h1 style="color:red">Error: Root element not found</h1><p>The #root element is missing from the HTML.</p></div>';
} else {
  try {
    console.log('✅ [main.tsx] Creating React root...');
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    console.log('✅ [main.tsx] React app rendered successfully');
  } catch (error) {
    console.error('❌ [main.tsx] Failed to render app:', error);
    document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif"><h1 style="color:red">Render Error</h1><pre>${error}</pre></div>`;
  }
}
