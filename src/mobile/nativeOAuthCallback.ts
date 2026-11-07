export const NATIVE_AUTH_SCHEME = 'com.bookourspace.app';
export const NATIVE_AUTH_REDIRECT_URL = `${NATIVE_AUTH_SCHEME}://auth/callback`;

export type NativeOAuthCallback = { kind: 'code'; code: string } | { kind: 'error' };

/** Accept only the app's one OAuth return URL and never treat an arbitrary deep link as auth. */
export function parseNativeOAuthCallback(rawUrl: string): NativeOAuthCallback | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== `${NATIVE_AUTH_SCHEME}:` ||
    url.hostname !== 'auth' ||
    url.pathname !== '/callback'
  ) {
    return null;
  }

  if (url.searchParams.has('error') || url.searchParams.has('error_description')) {
    return { kind: 'error' };
  }

  const code = url.searchParams.get('code');
  return code ? { kind: 'code', code } : { kind: 'error' };
}
