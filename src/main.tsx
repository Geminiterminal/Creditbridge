import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { PlanProvider } from './lib/store';
import './styles.css';

// Register the service worker so the app and its bundled data work offline
// after the first online visit.
registerSW({ immediate: true });

// When a new service worker takes control (a new deploy), reload once so the
// user always ends up on the latest build instead of the previously cached shell.
let reloadingForUpdate = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloadingForUpdate) return;
  reloadingForUpdate = true;
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlanProvider>
      <App />
    </PlanProvider>
  </React.StrictMode>,
);
