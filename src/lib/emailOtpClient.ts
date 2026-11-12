/**
 * Browser client for the email one-time-code sign-in.
 *
 * The code is generated in Supabase and delivered by Resend from the API
 * server. This module never sees the code from the server; it only sends the
 * address the user typed and the code the user read from their inbox.
 */

import { supabase } from './supabaseClient';

export interface EmailOtpRequestResponse {
  ok: boolean;
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  cooldownSeconds?: number;
  expiresInSeconds?: number;
}

export interface EmailOtpVerifyResponse {
  ok: boolean;
  error?: string;
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function requestEmailOtp(emailInput: string): Promise<EmailOtpRequestResponse> {
  const email = emailInput.trim().toLowerCase();
  if (!isValidEmailAddress(email)) {
    return { ok: false, error: 'INVALID_EMAIL', message: 'Enter a valid email address.' };
  }
  try {
    const response = await fetch('/api/auth/email-otp/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error || 'OTP_REQUEST_FAILED',
        message: data?.message || 'The code could not be sent. Please try again.',
        retryAfterSeconds: Number(data?.retryAfterSeconds) || undefined,
      };
    }
    return {
      ok: true,
      cooldownSeconds: Number(data?.cooldownSeconds) || 60,
      expiresInSeconds: Number(data?.expiresInSeconds) || 600,
    };
  } catch {
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: 'Could not reach the sign-in service. Check your connection and try again.',
    };
  }
}

export async function verifyEmailOtpCode(emailInput: string, tokenInput: string): Promise<EmailOtpVerifyResponse> {
  const email = emailInput.trim().toLowerCase();
  const token = tokenInput.trim();
  if (!isValidEmailAddress(email)) {
    return { ok: false, error: 'INVALID_EMAIL', message: 'Enter a valid email address.' };
  }
  if (!/^\d{6,10}$/.test(token)) {
    return { ok: false, error: 'INVALID_OTP_FORMAT', message: 'Enter the 6-digit code from your email.' };
  }
  try {
    const response = await fetch('/api/auth/email-otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, token }),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.ok || !data?.accessToken || !data?.refreshToken) {
      return {
        ok: false,
        error: data?.error || 'EMAIL_OTP_INVALID',
        message: data?.message || 'That code is invalid or has expired. Request a new code.',
      };
    }
    return { ok: true, accessToken: String(data.accessToken), refreshToken: String(data.refreshToken) };
  } catch {
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: 'Could not reach the sign-in service. Check your connection and try again.',
    };
  }
}


/**
 * Fallback delivery through Supabase Auth's own email provider.
 *
 * It is used only when the API reports that Resend is not configured but the
 * browser has a Supabase client. The identity and session still come from
 * Supabase; the server re-verifies the access token exactly as it does for the
 * Resend path.
 */
export async function requestSupabaseEmailOtp(emailInput: string): Promise<EmailOtpRequestResponse> {
  const email = emailInput.trim().toLowerCase();
  if (!isValidEmailAddress(email)) {
    return { ok: false, error: 'INVALID_EMAIL', message: 'Enter a valid email address.' };
  }
  if (!supabase) {
    return {
      ok: false,
      error: 'EMAIL_OTP_NOT_CONFIGURED',
      message: 'Email sign-in is not configured on this deployment yet.',
    };
  }
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      return {
        ok: false,
        error: 'EMAIL_OTP_DELIVERY_FAILED',
        message: error.message || 'The code could not be sent. Please try again.',
      };
    }
    return { ok: true, cooldownSeconds: 60, expiresInSeconds: 600 };
  } catch {
    return {
      ok: false,
      error: 'EMAIL_OTP_DELIVERY_FAILED',
      message: 'The code could not be sent. Please try again.',
    };
  }
}
