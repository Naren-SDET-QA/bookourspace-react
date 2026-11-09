/**
 * The Google OAuth window policy.
 *
 * A popup is preferred because it keeps the signed-in application on screen,
 * but a blocked popup must never silently drop the sign-in: the same authorize
 * URL is then used for a full-page redirect instead.
 *
 * The window is opened separately and synchronously, inside the click gesture,
 * because browsers discard the user activation once an await happens. This
 * module only decides where an already-opened window is sent, so the policy
 * can be verified without a browser.
 */

export interface OAuthWindow {
  location: { replace(url: string): void };
  close(): void;
}

export type OAuthLaunchOutcome = 'popup' | 'redirect';

/**
 * Send an already-opened OAuth window to the authorize URL.
 *
 * Returns `redirect` when no window is available or when the window cannot be
 * navigated (for example the user closed it), so the caller can fall back to a
 * full-page redirect.
 */
export function launchGoogleOAuthWindow(params: {
  window: OAuthWindow | null;
  url: string;
  redirect: (url: string) => void;
}): OAuthLaunchOutcome {
  const url = String(params.url || '').trim();
  if (!url) return 'redirect';
  if (!params.window) {
    params.redirect(url);
    return 'redirect';
  }
  try {
    params.window.location.replace(url);
    return 'popup';
  } catch {
    try {
      params.window.close();
    } catch {
      // The window may already be gone.
    }
    params.redirect(url);
    return 'redirect';
  }
}
