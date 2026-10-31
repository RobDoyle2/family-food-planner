import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: register the service worker in production builds only.
// Not inside a hosting frame (e.g. a claude.ai artifact), where service workers are blocked.
if ('serviceWorker' in navigator && import.meta.env.PROD && window.self === window.top) {
  // When an updated version takes over, reload once so the new code is used straight away.
  // Every change is saved immediately, so nothing is lost.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* The app still works online without offline caching. */
    });
  });
}
