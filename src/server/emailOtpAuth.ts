import { logSafeError } from './safeLogging';

/**
 * Email one-time-code sign-in, delivered by Resend and verified by Supabase.
 *
 * Supabase Auth remains the identity authority: the server asks its Admin API
 * to create the account if needed, generates the one-time code for the
 * account, and emails that code through Resend. The browser never receives
 * the code from this API; it must arrive through the user's inbox. Verification
 * happens against Supabase Auth, which returns a normal Supabase session that
 * the existing session-minting endpoint independently re-verifies.
 *
 * Nothing here trusts a caller-supplied identity, role or Supabase user id.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d{6,10}$/;
const RESEND_API_DEFAULT = 'https://api.resend.com';

export interface EmailOtpServiceConfig {
  projectUrl: string;
  publishableKey: string;
  /** Server-only. Never exposed to the browser. */
  secretKey: string;
  resendApiKey: string;
  resendFrom: string;
  resendReplyTo?: string;
  /** Test-only override. Must be https or a loopback origin. */
  resendBaseUrl?: string;
  brandName?: string;
  supportEmail?: string;
  fetchImpl?: typeof fetch;
}

export interface EmailOtpRequestResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
}

export interface EmailOtpVerifyResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface RateBucket {
  /** Timestamps of accepted requests in the current window. */
  events: number[];
  lastSentAt: number;
}

const EMAIL_COOLDOWN_MS = 60_000;
const EMAIL_HOURLY_LIMIT = 5;
const IP_HOURLY_LIMIT = 20;
const VERIFY_ATTEMPT_WINDOW_MS = 10 * 60_000;
const VERIFY_ATTEMPT_LIMIT = 10;

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

function parseResendBaseUrl(value: string | undefined): string {
  const raw = String(value || '').trim() || RESEND_API_DEFAULT;
  try {
    const url = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !loopback) return RESEND_API_DEFAULT;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return RESEND_API_DEFAULT;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class EmailOtpService {
  private readonly fetchImpl: typeof fetch;
  private readonly resendBaseUrl: string;
  private readonly emailBuckets = new Map<string, RateBucket>();
  private readonly ipBuckets = new Map<string, number[]>();
  private readonly verifyBuckets = new Map<string, number[]>();
  private readonly enabled: boolean;

  constructor(private readonly config: EmailOtpServiceConfig) {
    this.fetchImpl = config.fetchImpl || fetch;
    this.resendBaseUrl = parseResendBaseUrl(config.resendBaseUrl);
    this.enabled = Boolean(
      config.projectUrl.trim() &&
        config.publishableKey.trim() &&
        config.secretKey.trim() &&
        config.resendApiKey.trim() &&
        config.resendFrom.trim()
    );
  }

  get configured(): boolean {
    return this.enabled;
  }

  /** Which pieces are missing, without ever printing a secret. */
  missingConfiguration(): string[] {
    const missing: string[] = [];
    if (!this.config.projectUrl.trim()) missing.push('VITE_SUPABASE_URL');
    if (!this.config.publishableKey.trim()) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
    if (!this.config.secretKey.trim()) missing.push('SUPABASE_SECRET_KEY');
    if (!this.config.resendApiKey.trim()) missing.push('RESEND_API_KEY');
    if (!this.config.resendFrom.trim()) missing.push('RESEND_FROM_EMAIL');
    return missing;
  }

  async requestCode(emailInput: unknown, clientAddress: string): Promise<EmailOtpRequestResult> {
    if (!this.enabled) {
      return {
        ok: false,
        status: 503,
        error: 'EMAIL_OTP_NOT_CONFIGURED',
        message: 'Email sign-in is not available until the mail provider is configured.',
      };
    }
    const email = normalizeEmail(emailInput);
    if (!isEmail(email)) {
      return {
        ok: false,
        status: 400,
        error: 'INVALID_EMAIL',
        message: 'Enter a valid email address.',
      };
    }

    const now = Date.now();
    const emailBucket = this.emailBuckets.get(email);
    if (emailBucket && now - emailBucket.lastSentAt < EMAIL_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((EMAIL_COOLDOWN_MS - (now - emailBucket.lastSentAt)) / 1000);
      return {
        ok: false,
        status: 429,
        error: 'OTP_COOLDOWN',
        message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
        retryAfterSeconds,
      };
    }
    if (emailBucket) {
      emailBucket.events = emailBucket.events.filter((event) => now - event < 60 * 60_000);
      if (emailBucket.events.length >= EMAIL_HOURLY_LIMIT) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((60 * 60_000 - (now - emailBucket.events[0])) / 1000)
        );
        return {
          ok: false,
          status: 429,
          error: 'OTP_RATE_LIMITED',
          message: 'Too many codes requested for this email. Please try again later.',
          retryAfterSeconds,
        };
      }
    }

    const normalizedIp = String(clientAddress || 'unknown').slice(0, 128);
    const ipEvents = (this.ipBuckets.get(normalizedIp) || []).filter((event) => now - event < 60 * 60_000);
    if (ipEvents.length >= IP_HOURLY_LIMIT) {
      return {
        ok: false,
        status: 429,
        error: 'OTP_RATE_LIMITED',
        message: 'Too many sign-in attempts. Please try again later.',
        retryAfterSeconds: 600,
      };
    }

    let code: string;
    try {
      await this.ensureSupabaseUser(email);
      const link = await this.generateCode(email);
      code = link.code;
    } catch (error) {
      logSafeError('email-otp', 'supabase code generation', error);
      return {
        ok: false,
        status: 503,
        error: 'EMAIL_OTP_DELIVERY_UNAVAILABLE',
        message: 'The sign-in code could not be created right now. Please try again.',
      };
    }

    try {
      await this.sendWithResend(email, code);
    } catch (error) {
      logSafeError('email-otp', 'resend delivery', error);
      return {
        ok: false,
        status: 503,
        error: 'EMAIL_OTP_DELIVERY_UNAVAILABLE',
        message: 'The sign-in code could not be emailed right now. Please try again.',
      };
    }

    // Record only after delivery succeeds so a provider failure does not lock
    // the user out of retrying for a minute.
    const bucket = this.emailBuckets.get(email) || { events: [], lastSentAt: 0 };
    bucket.events = [...bucket.events.filter((event) => now - event < 60 * 60_000), now];
    bucket.lastSentAt = now;
    this.emailBuckets.set(email, bucket);
    this.ipBuckets.set(normalizedIp, [...ipEvents, now]);
    this.pruneBuckets(now);

    return {
      ok: true,
      status: 200,
      cooldownSeconds: 60,
      expiresInSeconds: 10 * 60,
    };
  }

  async verifyCode(emailInput: unknown, tokenInput: unknown, clientAddress: string): Promise<EmailOtpVerifyResult> {
    if (!this.enabled) {
      return {
        ok: false,
        status: 503,
        error: 'EMAIL_OTP_NOT_CONFIGURED',
        message: 'Email sign-in is not available until the mail provider is configured.',
      };
    }
    const email = normalizeEmail(emailInput);
    const token = String(tokenInput || '').trim();
    if (!isEmail(email) || !OTP_PATTERN.test(token)) {
      return {
        ok: false,
        status: 400,
        error: 'INVALID_OTP_FORMAT',
        message: 'Enter the numeric code from your email.',
      };
    }

    const now = Date.now();
    const attemptKey = `${String(clientAddress || 'unknown').slice(0, 128)}\0${email}`;
    const attempts = (this.verifyBuckets.get(attemptKey) || []).filter(
      (event) => now - event < VERIFY_ATTEMPT_WINDOW_MS
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

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.projectUrl.replace(/\/+$/, '')}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          apikey: this.config.publishableKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ type: 'magiclink', email, token }),
      });
    } catch (error) {
      logSafeError('email-otp', 'supabase verification', error);
      return {
        ok: false,
        status: 503,
        error: 'EMAIL_OTP_VERIFICATION_UNAVAILABLE',
        message: 'Sign-in verification is temporarily unavailable. Please try again.',
      };
    }

    if (!response.ok) {
      // Never distinguish "wrong code" from "expired code" for a caller who
      // does not already know the code; both are simply invalid.
      return {
        ok: false,
        status: response.status === 429 ? 429 : 401,
        error: response.status === 429 ? 'OTP_RATE_LIMITED' : 'EMAIL_OTP_INVALID',
        message: 'That code is invalid or has expired. Request a new code.',
      };
    }

    const payload: any = await response.json().catch(() => null);
    const accessToken = typeof payload?.access_token === 'string' ? payload.access_token.trim() : '';
    const refreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token.trim() : '';
    if (accessToken.length < 20 || !refreshToken) {
      return {
        ok: false,
        status: 401,
        error: 'EMAIL_OTP_INVALID',
        message: 'That code is invalid or has expired. Request a new code.',
      };
    }

    // A successful verification consumes the attempt budget for this key.
    this.verifyBuckets.delete(attemptKey);
    return { ok: true, status: 200, accessToken, refreshToken };
  }

  private async ensureSupabaseUser(email: string): Promise<void> {
    const response = await this.fetchImpl(
      `${this.config.projectUrl.replace(/\/+$/, '')}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          apikey: this.config.secretKey,
          authorization: `Bearer ${this.config.secretKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ email, email_confirm: true }),
      }
    );
    if (response.ok) return;
    const body = await response.json().catch(() => ({}));
    const message = String(body?.msg || body?.message || body?.error_description || '');
    const alreadyExists = /already (?:been )?registered|already exists|duplicate/i.test(message);
    if (alreadyExists) return;
    throw new Error(`SUPABASE_CREATE_USER_FAILED_${response.status}`);
  }

  private async generateCode(email: string): Promise<{ code: string }> {
    const response = await this.fetchImpl(
      `${this.config.projectUrl.replace(/\/+$/, '')}/auth/v1/admin/generate_link`,
      {
        method: 'POST',
        headers: {
          apikey: this.config.secretKey,
          authorization: `Bearer ${this.config.secretKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ type: 'magiclink', email }),
      }
    );
    if (!response.ok) throw new Error(`SUPABASE_GENERATE_LINK_FAILED_${response.status}`);
    const payload: any = await response.json().catch(() => null);
    const properties = payload?.properties && typeof payload.properties === 'object' ? payload.properties : payload;
    const code = String(properties?.email_otp || '').trim();
    if (!/^\d{6,10}$/.test(code)) throw new Error('SUPABASE_OTP_MISSING');
    return { code };
  }

  private async sendWithResend(email: string, code: string): Promise<void> {
    const brand = String(this.config.brandName || 'BookOurSpace').trim() || 'BookOurSpace';
    const support = String(this.config.supportEmail || '').trim();
    const escapedCode = escapeHtml(code);
    const text = [
      `Your ${brand} sign-in code is ${code}.`,
      '',
      'It expires in 10 minutes and can be used once.',
      "If you didn't request this code, you can safely ignore this email.",
    ].join('\n');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(brand)} sign-in code</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e8eaf1;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:20px;font-weight:800;letter-spacing:-.02em;color:#111827;">${escapeHtml(brand)}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#f97316;margin-top:4px;">Find · Book · Enjoy</div>
        </td></tr>
        <tr><td style="padding:8px 28px 0;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:800;color:#111827;">Your sign-in code</h1>
          <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">Enter this one-time code to finish signing in to your BookOurSpace account.</p>
        </td></tr>
        <tr><td style="padding:22px 28px;">
          <div style="border:1px dashed #fdba74;background:#fff7ed;border-radius:14px;padding:18px;text-align:center;">
            <div style="font-size:32px;line-height:1;font-weight:800;letter-spacing:.24em;color:#c2410c;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${escapedCode}</div>
            <div style="margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9a3412;">Expires in 10 minutes · one use only</div>
          </div>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">If you didn't request this code, you can safely ignore this email.${support ? ` Need help? Contact <a href="mailto:${escapeHtml(support)}" style="color:#c2410c;text-decoration:none;">${escapeHtml(support)}</a>.` : ''}</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#fafafa;border-top:1px solid #eef0f5;font-size:11px;color:#9ca3af;">${escapeHtml(brand)} · This is an automated security email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const response = await this.fetchImpl(`${this.resendBaseUrl}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.resendFrom,
        to: [email],
        subject: `${brand} sign-in code: ${code}`,
        text,
        html,
        ...(this.config.resendReplyTo ? { reply_to: this.config.resendReplyTo } : {}),
      }),
    });
    if (!response.ok) {
      // The provider's error body can echo the recipient address; keep it out
      // of logs and surface only the status.
      throw new Error(`RESEND_FAILED_${response.status}`);
    }
  }

  private pruneBuckets(now: number): void {
    if (this.emailBuckets.size > 2_000) {
      for (const [key, bucket] of this.emailBuckets) {
        if (now - bucket.lastSentAt > 24 * 60 * 60_000) this.emailBuckets.delete(key);
      }
    }
    if (this.ipBuckets.size > 5_000) {
      for (const [key, events] of this.ipBuckets) {
        if (!events.some((event) => now - event < 60 * 60_000)) this.ipBuckets.delete(key);
      }
    }
    if (this.verifyBuckets.size > 5_000) {
      for (const [key, events] of this.verifyBuckets) {
        if (!events.some((event) => now - event < VERIFY_ATTEMPT_WINDOW_MS)) this.verifyBuckets.delete(key);
      }
    }
  }
}
