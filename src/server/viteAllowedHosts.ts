/**
 * Extra Vite `server.allowedHosts` / `preview.allowedHosts` entries.
 *
 * Vite already allows `localhost`, `*.localhost`, and every IP address
 * (LAN included). This list only adds the exact Cloudflare Quick Tunnel
 * hostname used for HTTPS mobile access. Do not set `allowedHosts: true`
 * and do not use a leading-dot suffix such as `.trycloudflare.com`.
 */
export const CLOUDFLARE_QUICK_TUNNEL_HOST =
  'propecia-currencies-dublin-attacks.trycloudflare.com';

export const VITE_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  CLOUDFLARE_QUICK_TUNNEL_HOST,
]);

export function isUnrestrictedViteAllowedHosts(value: unknown): boolean {
  return value === true;
}

export function hasLeadingDotHostWildcard(hosts: readonly string[]): boolean {
  return hosts.some((host) => typeof host === 'string' && host.startsWith('.'));
}
