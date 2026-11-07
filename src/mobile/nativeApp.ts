import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabaseClient';
import { parseNativeOAuthCallback } from './nativeOAuthCallback';

let setupPromise: Promise<void> | null = null;

function dispatchOAuthError() {
  window.dispatchEvent(
    new CustomEvent('bos-google-oauth-error', {
      detail: { error: 'NATIVE_OAUTH_CALLBACK_FAILED', message: 'Google sign-in could not be completed. Please try again.' },
    })
  );
}

export function setupNativeAppIntegration(): Promise<void> {
  const supabaseClient = supabase;
  if (!Capacitor.isNativePlatform() || !supabaseClient) return Promise.resolve();
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const [{ App }, { Browser }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/browser'),
    ]);
    const handledUrls = new Set<string>();

    const handleUrl = async (rawUrl: string) => {
      if (handledUrls.has(rawUrl)) return;
      const callback = parseNativeOAuthCallback(rawUrl);
      if (!callback) return;
      handledUrls.add(rawUrl);

      await Browser.close().catch(() => undefined);
      if (callback.kind === 'error') {
        dispatchOAuthError();
        return;
      }

      // Supabase Auth's PKCE verifier was stored in this app's WebView before
      // the browser handoff. Exchanging only this verified callback code keeps
      // native sessions on the same Supabase project and local storage client.
      const { error } = await supabaseClient.auth.exchangeCodeForSession(callback.code);
      if (error) dispatchOAuthError();
    };

    await App.addListener('appUrlOpen', ({ url }) => {
      void handleUrl(url).catch(dispatchOAuthError);
    });

    const launch = await App.getLaunchUrl();
    if (launch?.url) await handleUrl(launch.url).catch(dispatchOAuthError);

    if (Capacitor.getPlatform() === 'android') {
      await App.addListener('backButton', () => {
        const openDialog = document.querySelector('[role="dialog"][aria-modal="true"], [aria-modal="true"]');
        if (openDialog) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          return;
        }
        if (window.location.hash) {
          window.history.back();
          return;
        }
        App.exitApp();
      });
    }
  })();

  return setupPromise;
}
