import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate skips waiting cleanly
    },
    onOfflineReady() {
      // app shell ready for offline fallback
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
