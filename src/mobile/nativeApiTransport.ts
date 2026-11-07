import { Capacitor } from '@capacitor/core';

type FetchImplementation = typeof fetch;

function normalizedBackendOrigin(raw: string | undefined, isDev: boolean): string {
  const configured = raw?.trim();
  if (!configured) {
    throw new TypeError('Native API is not configured. Set VITE_NATIVE_API_ORIGIN to the HTTPS backend origin.');
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new TypeError('VITE_NATIVE_API_ORIGIN must be an absolute HTTP(S) origin.');
  }

  // Android emulators reach the host machine on 10.0.2.2. HTTP is permitted
  // only for these loopback aliases; a remote backend must still be HTTPS.
  const localHost = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('VITE_NATIVE_API_ORIGIN must contain only an origin, without credentials or a path.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
    throw new TypeError('Native API origin must use HTTPS (HTTP is allowed only for local development).');
  }
  return url.origin;
}

export function isApiRequest(input: RequestInfo | URL, currentOrigin?: string): boolean {
  const rawUrl = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(rawUrl, currentOrigin || 'https://localhost');
    if (currentOrigin) {
      const appUrl = new URL(currentOrigin);
      if (url.protocol !== appUrl.protocol || url.host !== appUrl.host) return false;
    }
    return url.pathname === '/api' || url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function readNativeSessionToken(storage: Pick<Storage, 'getItem'>): string | null {
  return storage.getItem('bos_session_token_v1');
}

export function routeNativeApiRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: { native: boolean; backendOrigin?: string; isDev: boolean; currentOrigin?: string; sessionToken?: string | null },
): [RequestInfo | URL, RequestInit | undefined] {
  if (!options.native || !isApiRequest(input, options.currentOrigin)) return [input, init];

  const backendOrigin = normalizedBackendOrigin(options.backendOrigin, options.isDev);
  const rawUrl = input instanceof Request ? input.url : String(input);
  const apiUrl = new URL(rawUrl, options.currentOrigin || 'https://localhost');
  const target = new URL(`${apiUrl.pathname}${apiUrl.search}${apiUrl.hash}`, backendOrigin);
  const request = input instanceof Request ? input : undefined;
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (!headers.has('Authorization') && options.sessionToken) {
    headers.set('Authorization', `Bearer ${options.sessionToken}`);
  }
  const requestInit: RequestInit = {
    method: request?.method,
    body: request?.body,
    cache: request?.cache,
    credentials: request?.credentials,
    integrity: request?.integrity,
    keepalive: request?.keepalive,
    mode: request?.mode,
    redirect: request?.redirect,
    referrer: request?.referrer,
    referrerPolicy: request?.referrerPolicy,
    signal: request?.signal,
    ...init,
    headers,
  };
  if (requestInit.body == null) delete requestInit.body;
  return [target.toString(), requestInit];
}

/** Route every relative API call through one explicit backend origin on native builds. */
export function installNativeApiTransport(): void {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  const target = window as Window & { __bosNativeApiTransportInstalled?: boolean };
  if (target.__bosNativeApiTransportInstalled) return;

  const originalFetch: FetchImplementation = window.fetch.bind(window);
  const env = import.meta.env;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let token: string | null = null;
    if (isApiRequest(input, window.location.origin)) {
      try {
        token = readNativeSessionToken(window.localStorage);
      } catch {
        token = null;
      }
    }
    const [routedInput, routedInit] = routeNativeApiRequest(input, init, {
      native: true,
      backendOrigin: env.VITE_NATIVE_API_ORIGIN,
      isDev: Boolean(env.DEV),
      currentOrigin: window.location.origin,
      sessionToken: token,
    });
    return originalFetch(routedInput, routedInit);
  };
  target.__bosNativeApiTransportInstalled = true;
}
