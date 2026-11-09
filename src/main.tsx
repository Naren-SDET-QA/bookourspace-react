import {createRoot} from 'react-dom/client';
import './index.css';
import { registerServiceWorker } from './utils/marketplaceCache';
import { setupNativeAppIntegration } from './mobile/nativeApp';
import { installNativeApiTransport } from './mobile/nativeApiTransport';
import App from './App.tsx';

installNativeApiTransport();
registerServiceWorker();
void setupNativeAppIntegration().catch(() => {
  window.dispatchEvent(new CustomEvent('bos-google-oauth-error', {
    detail: { error: 'NATIVE_APP_SETUP_FAILED', message: 'Google sign-in could not be completed. Please try again.' },
  }));
});

createRoot(document.getElementById('root')!).render(<App />);
