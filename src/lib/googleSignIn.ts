import { Capacitor } from '@capacitor/core';
import {
  fetchGoogleOAuthConfig,
  isSupabaseConfigured,
  signInWithSupabaseGoogleOAuth,
} from './supabaseClient';
import { launchGoogleOAuthWindow } from './googleOAuthLauncher';

export interface GoogleSignInLaunchResult {
  ok: boolean;
  /** How the browser was sent to Google: popup tab, or a full-page redirect. */
  mode?: 'popup' | 'native' | 'redirect';
  error?: string;
}

/**
 * Start the Google OAuth sign-in used by the customer login screen.
 *
 * This is the exact flow the account modal already used — Supabase authorize
 * URL with the PKCE callback, a popup when the browser allows one and a
 * full-page redirect otherwise — extracted so the redesigned login screen can
 * launch it directly instead of opening the legacy modal first. Session
 * exchange, role assignment and post-sign-in navigation stay in the existing
 * App-level OAuth callback handlers; nothing here mints trust.
 */
export async function startGoogleSignInPopup(): Promise<GoogleSignInLaunchResult> {
  const isNative = Capacitor.isNativePlatform();
  const popup = isNative
    ? null
    : window.open(
        'about:blank',
        'bos-google-oauth',
        'width=540,height=680,menubar=no,toolbar=no,location=yes,status=no',
      );

  try {
    let oauth = isSupabaseConfigured
      ? await signInWithSupabaseGoogleOAuth('customer')
      : { ok: false as const, url: undefined, error: 'Supabase is not configured on this deployment.' };

    if ((!oauth.ok || !oauth.url) && !isNative) {
      oauth = await fetchGoogleOAuthConfig('customer');
    }
    if (!oauth.ok || !oauth.url) {
      popup?.close();
      return { ok: false, error: (oauth as { error?: string }).error || 'Secure Google sign-in is unavailable. Please try again later.' };
    }

    if (isNative) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: oauth.url });
      return { ok: true, mode: 'native' };
    }

    launchGoogleOAuthWindow({
      window: popup,
      url: oauth.url,
      redirect: (url) => window.location.assign(url),
    });
    return { ok: true, mode: popup ? 'popup' : 'redirect' };
  } catch (error) {
    popup?.close();
    return { ok: false, error: error instanceof Error ? error.message : 'Could not launch Google sign-in.' };
  }
}
