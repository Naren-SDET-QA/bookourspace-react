import type { Express } from 'express';

/**
 * Trusted-proxy topology for client-address resolution.
 *
 * Cloud Run terminates TLS at a Google front end and appends the caller's
 * address to `X-Forwarded-For`. Express only resolves `req.ip` from that header
 * when `trust proxy` describes the hops in front of the process. Without it,
 * `req.ip` is the front end's socket address and every caller collapses into a
 * single rate-limit bucket.
 *
 * Trusting the header blindly (`trust proxy = true`) is worse than not trusting
 * it: Express then takes the left-most `X-Forwarded-For` entry, which any client
 * can prepend, so a caller could move to an arbitrary bucket on every request.
 * The only safe configuration is an exact hop count that matches the real
 * topology:
 *
 *   - on Cloud Run (`K_SERVICE` is set) exactly one hop is trusted, so the
 *     address appended by the front end is used and every client-supplied
 *     prefix is ignored;
 *   - a production process that is not on Cloud Run must declare its own hop
 *     count through `BOS_TRUST_PROXY_HOPS`, otherwise startup fails closed
 *     rather than either ignoring or blindly trusting forwarded headers;
 *   - development, test and AI Studio previews trust no hop, so forwarded
 *     headers are ignored entirely.
 *
 * The resolver is configuration-only: it never reads a header and never logs a
 * value.
 */

export const TRUST_PROXY_HOPS_VAR = 'BOS_TRUST_PROXY_HOPS';

/** One Google front end sits in front of a Cloud Run container. */
export const CLOUD_RUN_TRUSTED_HOPS = 1;

/** Upper bound for an explicitly declared chain (Cloud Run + up to 3 LBs). */
export const MAX_TRUSTED_HOPS = 4;

export type TrustProxySource = 'cloud-run' | 'explicit' | 'disabled';

export interface TrustProxyDecision {
  /** Trusted proxy hops in front of this process. */
  hops: number;
  source: TrustProxySource;
  /** The value installed with `app.set('trust proxy', …)`. */
  expressValue: number | false;
}

export const TRUST_PROXY_ERRORS = {
  invalid: 'BOS_TRUST_PROXY_HOPS_INVALID',
  required: 'BOS_TRUST_PROXY_HOPS_REQUIRED',
} as const;

function isAiStudioPreview(environment: Record<string, string | undefined>): boolean {
  return environment.BOS_AI_STUDIO_PREVIEW === '1' || environment.AI_STUDIO === 'true';
}

function declaredHops(environment: Record<string, string | undefined>): number | null {
  const raw = String(environment[TRUST_PROXY_HOPS_VAR] ?? '').trim();
  if (!raw) return null;
  // Digits only: this refuses `true`, `*`, `loopback`, address lists and any
  // other expression that would trust more than the declared hops.
  if (!/^[0-9]$/.test(raw)) {
    throw new Error(
      `${TRUST_PROXY_ERRORS.invalid}: ${TRUST_PROXY_HOPS_VAR} must be a single digit 0-${MAX_TRUSTED_HOPS}, not a hostname, range or expression.`,
    );
  }
  const hops = Number(raw);
  if (hops > MAX_TRUSTED_HOPS) {
    throw new Error(
      `${TRUST_PROXY_ERRORS.invalid}: ${TRUST_PROXY_HOPS_VAR} must not exceed ${MAX_TRUSTED_HOPS} trusted hops.`,
    );
  }
  return hops;
}

export function resolveTrustProxy(
  environment: Record<string, string | undefined> = process.env,
): TrustProxyDecision {
  const declared = declaredHops(environment);
  if (declared !== null) {
    return declared === 0
      ? { hops: 0, source: 'disabled', expressValue: false }
      : { hops: declared, source: 'explicit', expressValue: declared };
  }

  if (String(environment.K_SERVICE || '').trim()) {
    return { hops: CLOUD_RUN_TRUSTED_HOPS, source: 'cloud-run', expressValue: CLOUD_RUN_TRUSTED_HOPS };
  }

  // A production process with no known proxy must not guess. Ignoring the
  // header is correct only when nothing is in front of the process; trusting an
  // unknown chain would let a caller choose its own bucket.
  if (String(environment.NODE_ENV || '') === 'production' && !isAiStudioPreview(environment)) {
    throw new Error(
      `${TRUST_PROXY_ERRORS.required}: a production process that is not running on Cloud Run must set ${TRUST_PROXY_HOPS_VAR} to the exact number of trusted proxy hops (0 when the process faces clients directly).`,
    );
  }

  return { hops: 0, source: 'disabled', expressValue: false };
}

/** Installs the resolved topology on the Express application. */
export function configureTrustProxy(
  app: Pick<Express, 'set'>,
  environment: Record<string, string | undefined> = process.env,
): TrustProxyDecision {
  const decision = resolveTrustProxy(environment);
  app.set('trust proxy', decision.expressValue);
  return decision;
}

/**
 * Canonical form of a client address for bucket keys.
 *
 * Strips the IPv4-mapped IPv6 prefix so a dual-stack peer cannot hold two
 * buckets for one client, trims, and bounds the length. Returns an empty string
 * when nothing usable was resolved.
 */
export function normalizeClientAddress(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const withoutMappedPrefix = raw.toLowerCase().startsWith('::ffff:') ? raw.slice(7) : raw;
  return withoutMappedPrefix.slice(0, 100);
}
