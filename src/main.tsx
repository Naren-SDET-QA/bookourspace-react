import {createRoot} from 'react-dom/client';
import { lazy, Suspense, useState } from 'react';
import './index.css';
import { registerServiceWorker } from './utils/marketplaceCache';
import { setupNativeAppIntegration } from './mobile/nativeApp';
import { installNativeApiTransport } from './mobile/nativeApiTransport';
import BookOurSpaceEntryExperience from './components/BookOurSpaceEntryExperience';

// Keep the boot/runtime entry small. The HTML prelaunch screen remains visible
// until App mounts and removes it, so loading the application chunk adds no
// blank frame or artificial splash delay.
const App = lazy(() => import('./App.tsx'));

function BootEntryFallback() {
  const [pending, setPending] = useState(() => Boolean(
    (window as Window & { __bosBootEntryAction?: 'guest' | 'google' }).__bosBootEntryAction
  ));
  const choose = (action: 'guest' | 'google') => {
    (window as Window & { __bosBootEntryAction?: 'guest' | 'google' }).__bosBootEntryAction = action;
    try {
      if (action === 'guest') localStorage.setItem('bos_entry_choice_v1', 'guest');
      else sessionStorage.setItem('bos_boot_auth_requested_v1', '1');
    } catch {
      // The full app rechecks Supabase and storage after its bundle loads.
    }
    setPending(true);
  };

  return (
    <BookOurSpaceEntryExperience
      mode={pending ? 'loading' : 'welcome'}
      onGoogleSignIn={() => choose('google')}
      onContinueAsGuest={() => choose('guest')}
    />
  );
}

installNativeApiTransport();
registerServiceWorker();
void setupNativeAppIntegration().catch(() => {
  window.dispatchEvent(new CustomEvent('bos-google-oauth-error', {
    detail: { error: 'NATIVE_APP_SETUP_FAILED', message: 'Google sign-in could not be completed. Please try again.' },
  }));
});

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<BootEntryFallback />}>
    <App />
  </Suspense>,
);
