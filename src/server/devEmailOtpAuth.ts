import crypto from 'node:crypto';
import type express from 'express';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

/**
 * Local-development email one-time-code sign-in.
 *
 * Production delivers the code through Resend and verifies it against Supabase
 * Auth. Neither is reachable on a laptop, so this module keeps the *same* user
 * flow — type an address, receive a numeric code, enter it, land signed in —
 * while standing in for the two hosted dependencies:
 *
 *   - the code is generated here and printed to the server console instead of
 *     being emailed;
 *   - the account is provisioned by inserting into `auth.users`, which fires the
 *     same `handle_new_user` trigger production relies on, so `public.profiles`
 *     is populated exactly as it would be in production.
 *
 * It is hard-disabled in production, requires the local-auth opt-in, requires a
 * loopback database, and can only ever mint a `customer` session. It never
 * elevates a role and never trusts a caller-supplied identity.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const EMAIL_HOURLY_LIMIT = 10;
const IP_HOURLY_LIMIT = 30;
const VERIFY_ATTEMPT_LIMIT = 10;
const VERIFY_ATTEMPT_WINDOW_MS = 10 * 60_000;

export interface DevOtpRequestResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
  /** Development only: the code that would otherwise have been emailed. */
  devCode?: string;
}

export interface DevOtpVerifyResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface PendingCode {
  codeHash: string;
  expiresAt: number;
  attempts: number;
}

interface RateBucket {
  events: number[];
  lastSentAt: number;
}

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

function hashCode(email: string, code: string): string {
  return crypto.createHash('sha256').update(`${email}\0${code}`).digest('hex');
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * True only for a loopback PostgreSQL target. Any parse failure is a refusal:
 * this guards an authentication write path, so it fails closed.
 */
export function isLoopbackConnectionString(connectionString: string): boolean {
  try {
    const parsed = new URL(String(connectionString || '').trim());
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return false;
    return LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export class DevEmailOtpService {
  private readonly pending = new Map<string, PendingCode>();
  private readonly emailBuckets = new Map<string, RateBucket>();
  private readonly ipBuckets = new Map<string, number[]>();
  private readonly verifyBuckets = new Map<string, number[]>();

  constructor(
    private readonly deps: {
      connectionString: string;
      env?: NodeJS.ProcessEnv;
      now?: () => number;
      randomInt?: (max: number) => number;
      /** Mints the same server-authoritative session token as every other sign-in. */
      sessionTokenFor: (profile: {
        id: string;
        email: string | null;
        full_name: string | null;
        role: string;
        is_super_admin: boolean | null;
      }) => string;
    },
  ) {}

  private get now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private randomCode(): string {
    const max = 10 ** OTP_LENGTH;
    const value = this.deps.randomInt ? this.deps.randomInt(max) : crypto.randomInt(max);
    return String(value).padStart(OTP_LENGTH, '0');
  }

  requestCode(emailInput: unknown, clientAddress: string): DevOtpRequestResult {
    const email = normalizeEmail(emailInput);
    if (!isEmail(email)) {
      return { ok: false, status: 400, error: 'INVALID_EMAIL', message: 'Enter a valid email address.' };
    }

    const now = this.now;
    const bucket = this.emailBuckets.get(email);
    if (bucket && now - bucket.lastSentAt < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - bucket.lastSentAt)) / 1000);
      return {
        ok: false,
        status: 429,
        error: 'OTP_COOLDOWN',
        message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
        cooldownSeconds: retryAfterSeconds,
      };
    }
    if (bucket) {
      bucket.events = bucket.events.filter((event) => now - event < 60 * 60_000);
      if (bucket.events.length >= EMAIL_HOURLY_LIMIT) {
        return {
          ok: false,
          status: 429,
          error: 'OTP_RATE_LIMITED',
          message: 'Too many codes requested for this email. Please try again later.',
        };
      }
    }

    const ip = String(clientAddress || 'unknown').slice(0, 128);
    const ipEvents = (this.ipBuckets.get(ip) || []).filter((event) => now - event < 60 * 60_000);
    if (ipEvents.length >= IP_HOURLY_LIMIT) {
      return {
        ok: false,
        status: 429,
        error: 'OTP_RATE_LIMITED',
        message: 'Too many sign-in attempts. Please try again later.',
      };
    }

    const code = this.randomCode();
    this.pending.set(email, {
      codeHash: hashCode(email, code),
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
    });

    const nextBucket = this.emailBuckets.get(email) || { events: [], lastSentAt: 0 };
    nextBucket.events = [...nextBucket.events.filter((event) => now - event < 60 * 60_000), now];
    nextBucket.lastSentAt = now;
    this.emailBuckets.set(email, nextBucket);
    this.ipBuckets.set(ip, [...ipEvents, now]);
    this.prune();

    // Stands in for the Resend delivery step.
    console.info(`[dev-email-otp] sign-in code for ${email}: ${code}`);

    return {
      ok: true,
      status: 200,
      cooldownSeconds: 60,
      expiresInSeconds: OTP_TTL_MS / 1000,
      devCode: code,
    };
  }

  async verifyCode(
    emailInput: unknown,
    tokenInput: unknown,
    clientAddress: string,
  ): Promise<DevOtpVerifyResult> {
    const email = normalizeEmail(emailInput);
    const token = String(tokenInput || '').trim();
    if (!isEmail(email) || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(token)) {
      return {
        ok: false,
        status: 400,
        error: 'INVALID_OTP_FORMAT',
        message: 'Enter the numeric code from your email.',
      };
    }

    const now = this.now;
    const attemptKey = `${String(clientAddress || 'unknown').slice(0, 128)}\0${email}`;
    const attempts = (this.verifyBuckets.get(attemptKey) || []).filter(
      (event) => now - event < VERIFY_ATTEMPT_WINDOW_MS,
    );
    if (attempts.length >= VERIFY_ATTEMPT_LIMIT) {
      return {
        ok: false,
        status: 429,
        error: 'OTP_ATTEMPTS_EXCEEDED',
        message: 'Too many incorrect codes. Request a new code and try again.',
      };
    }
    this.verifyBuckets.set(attemptKey, [...attempts, now]);

    const pending = this.pending.get(email);
    if (!pending || pending.expiresAt < now) {
      this.pending.delete(email);
      return {
        ok: false,
        status: 401,
        error: 'EMAIL_OTP_INVALID',
        message: 'That code is invalid or has expired. Request a new code.',
      };
    }

    if (pending.codeHash !== hashCode(email, token)) {
      pending.attempts += 1;
      // Invalidate the code itself once its own attempt budget is spent, so a
      // guesser cannot keep probing the same code from a fresh address.
      if (pending.attempts >= VERIFY_ATTEMPT_LIMIT) {
        this.pending.delete(email);
      }
      return {
        ok: false,
        status: 401,
        error: 'EMAIL_OTP_INVALID',
        message: 'That code is invalid or has expired. Request a new code.',
      };
    }

    this.pending.delete(email);
    this.verifyBuckets.delete(attemptKey);

    const provisioned = await this.provisionAccount(email);
    if (!provisioned.ok) {
      return { ok: false, status: provisioned.status, error: provisioned.error, message: provisioned.message };
    }

    // A real Supabase session is not minted locally. The server session below
    // is the application authority, so it is returned directly and installed by
    // the caller exactly like the production tokens are.
    return {
      ok: true,
      status: 200,
      accessToken: provisioned.sessionToken,
      refreshToken: provisioned.sessionToken,
    };
  }

  /**
   * Mirrors the production path: insert into `auth.users` and let the
   * `handle_new_user` trigger create `public.profiles`.
   */
  private async provisionAccount(
    email: string,
  ): Promise<{ ok: true; sessionToken: string } | { ok: false; status: number; error: string; message: string }> {
    // This flow inserts authentication rows, so it is only ever allowed to talk
    // to a loopback database. `assertPostgresConnectionTarget` accepts an
    // allowlisted remote target for ordinary development repositories; that is
    // too permissive here, so the host is checked explicitly and fail-closed.
    if (!isLoopbackConnectionString(this.deps.connectionString)) {
      return {
        ok: false,
        status: 503,
        error: 'LOCAL_AUTH_DATABASE_NOT_LOOPBACK',
        message: 'Local sign-in is restricted to a loopback development database.',
      };
    }

    let pool;
    try {
      pool = getSharedPostgresPool(this.deps.connectionString, this.deps.env || process.env);
    } catch {
      return {
        ok: false,
        status: 503,
        error: 'LOCAL_AUTH_DATABASE_UNAVAILABLE',
        message: 'Local sign-in needs the development database. Check BOS_LISTINGS_DATABASE_URL.',
      };
    }

    try {
      const existing = await pool.query(
        `select p.id, p.email, p.full_name, p.role, p.account_status, p.is_super_admin
           from public.profiles p
          where lower(p.email) = $1
          limit 1`,
        [email],
      );
      let profile = existing.rows[0];

      if (!profile) {
        await pool.query(
          `insert into auth.users (id, email, raw_user_meta_data)
           values (gen_random_uuid(), $1, $2::jsonb)
           on conflict (id) do nothing`,
          [email, JSON.stringify({ full_name: email.split('@')[0], email_confirm: true })],
        );
        const created = await pool.query(
          `select p.id, p.email, p.full_name, p.role, p.account_status, p.is_super_admin
             from public.profiles p
            where lower(p.email) = $1
            limit 1`,
          [email],
        );
        profile = created.rows[0];
      }

      if (!profile) {
        return {
          ok: false,
          status: 503,
          error: 'LOCAL_AUTH_PROFILE_UNAVAILABLE',
          message: 'The account could not be provisioned locally.',
        };
      }
      if (profile.account_status !== 'active') {
        return {
          ok: false,
          status: 403,
          error: 'ACCOUNT_BLOCKED',
          message: `This account is ${String(profile.account_status).toUpperCase()} by the administrator.`,
        };
      }

      const role = String(profile.role || 'customer');
      if (role !== 'customer') {
        // The dev flow is identified by an email address alone, so it must not
        // be a way to obtain a provider or admin session. Privileged accounts
        // keep their own sign-in paths, which verify a real identity.
        return {
          ok: false,
          status: 403,
          error: 'LOCAL_OTP_CUSTOMER_ONLY',
          message: 'Local email sign-in is limited to customer accounts. Use the normal sign-in for this account.',
        };
      }

      return { ok: true, sessionToken: this.deps.sessionTokenFor(profile) };
    } catch (error) {
      // The error can carry a DSN or SQL text; record only a stable marker.
      const code = String((error as { code?: unknown })?.code || 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').slice(0, 24);
      console.error('[dev-email-otp] provision failed', code || 'UNKNOWN');
      return {
        ok: false,
        status: 503,
        error: 'LOCAL_AUTH_PROVISION_FAILED',
        message: 'The account could not be provisioned locally.',
      };
    }
  }

  private prune(): void {
    const now = this.now;
    for (const [email, pending] of this.pending) {
      if (pending.expiresAt < now) this.pending.delete(email);
    }
    for (const [email, bucket] of this.emailBuckets) {
      if (bucket.lastSentAt < now - 24 * 60 * 60_000) this.emailBuckets.delete(email);
    }
    for (const [ip, events] of this.ipBuckets) {
      if (events.every((event) => now - event > 24 * 60 * 60_000)) this.ipBuckets.delete(ip);
    }
  }
}