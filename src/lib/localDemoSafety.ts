// Shared by the local CLI and browser configuration. No remote fallback in demo mode.
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function assertLocalHttpUrl(value: string): string {
  const url = new URL(value);
  // Reject shorthand/decimal IPv4 and credentials as well as remote endpoints.
  const authority = value.match(/^http:\/\/([^/]+)/)?.[1] || '';
  if (url.protocol !== 'http:' || !loopback.has(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(authority)) {
    throw new Error('Local demo requires an explicit loopback HTTP endpoint. Hosted Supabase is forbidden.');
  }
  return url.origin;
}

export function assertLocalDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !loopback.has(url.hostname) ||
      url.search || url.hash || !url.pathname || url.pathname === '/') {
    throw new Error('Local seed requires a loopback PostgreSQL database URL without query parameters.');
  }
  return value;
}
