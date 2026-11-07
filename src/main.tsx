import {createRoot} from 'react-dom/client';
import { lazy, Suspense } from 'react';
import './index.css';
import { registerServiceWorker } from './utils/marketplaceCache';
import { setupNativeAppIntegration } from './mobile/nativeApp';
import { installNativeApiTransport } from './mobile/nativeApiTransport';

// Keep the boot/runtime entry small. The HTML prelaunch screen remains visible
// until App mounts and removes it, so loading the application chunk adds no
// blank frame or artificial splash delay.
const App = lazy(() => import('./App.tsx'));

installNativeApiTransport();
registerServiceWorker();
void setupNativeAppIntegration().catch(() => {
  window.dispatchEvent(new CustomEvent('bos-google-oauth-error', {
    detail: { error: 'NATIVE_APP_SETUP_FAILED', message: 'Google sign-in could not be completed. Please try again.' },
  }));
});

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>,
);
