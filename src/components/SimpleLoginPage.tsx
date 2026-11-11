import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Mail, ShieldCheck } from 'lucide-react';

/**
 * Minimal full-page sign-in. It does not replace the Google/Supabase identity
 * flow; it gives local development a simple email/profile entry point and
 * keeps the Google action in one obvious place.
 */
export function SimpleLoginPage({
  onClose,
  onGoogle,
}: {
  onClose: () => void;
  onGoogle: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'email' | 'customer' | 'admin' | 'provider' | null>(null);
  const [error, setError] = useState('');

  const signIn = async (payload: { email?: string; role?: 'customer' | 'admin' | 'provider' }) => {
    setBusy(payload.role === 'admin' ? 'admin' : payload.role === 'provider' ? 'provider' : payload.email ? 'email' : 'customer');
    setError('');
    try {
      const response = await fetch('/api/auth/local-dev/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.sessionToken) {
        setError(data?.message || 'No local profile matches that email. Try the seeded demo accounts or use Google.');
        return;
      }
      window.localStorage.setItem('bos_session_token_v1', String(data.sessionToken));
      window.location.hash = payload.role === 'provider' ? '#provider_portal' : payload.role === 'admin' ? '#admin' : '#stays';
      window.location.reload();
    } catch {
      setError('Sign-in failed. Check that the API server is running.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] overflow-y-auto bg-[#faf7f2] text-[#222222] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-label="Sign in to BookOurSpace">
      <header className="border-b border-[#ebebeb] bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <button type="button" onClick={onClose} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dddddd] dark:border-slate-700">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <img src="/assets/brand/bos-logo-lockup.webp" srcSet="/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp 560w, /assets/brand/bos-logo-lockup-1120-bea9629c0067.webp 1120w" sizes="160px" width="1560" height="320" decoding="async" alt="BookOurSpace" className="h-8 w-auto" />
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Server-verified
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <section>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#f97316]">Welcome back</p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Sign in to BookOurSpace</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[#555555] dark:text-slate-300">
            Book verified stays, track your trips and manage your account. Every booking is confirmed by the server before it exists.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-[#444444] dark:text-slate-300">
            <li>✓ One account for stays, PGs, classes, halls and services</li>
            <li>✓ Bookings stay attached to your verified email</li>
            <li>✓ Cancel and refund eligibility is calculated by the server</li>
          </ul>
        </section>

        <section className="rounded-3xl border border-[#ebebeb] bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold">Continue</h2>
          <button
            type="button"
            onClick={onGoogle}
            className="mt-4 flex w-full min-h-[48px] items-center justify-center gap-3 rounded-xl border-2 border-[#e5e5e5] bg-white px-4 text-sm font-bold text-[#222222] transition hover:bg-[#f7f7f7] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.7 12.3c0-.7-.1-1.4-.2-2.1H12v4.5h6.6c-.3 1.5-1.1 2.8-2.4 3.7v3h3.9c2.3-2.1 3.6-5.2 3.6-9.1z" />
              <path fill="#34A853" d="M12 24c3.3 0 6.1-1.1 8.1-3l-3.9-3c-1.1.7-2.5 1.2-4.2 1.2-3.2 0-6-2.2-7-5.1H1v3.1C3.1 21.2 7.2 24 12 24z" />
              <path fill="#FBBC05" d="M5 14.1a7.2 7.2 0 0 1 0-4.6V6.4H1A12 12 0 0 0 0 12c0 1.9.5 3.8 1.3 5.4L5 14.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.7 1.8l3.5-3.5C18.1 1.2 15.3 0 12 0 7.2 0 3.1 2.8 1.3 6.4L5 9.5c1-2.9 3.8-4.7 7-4.7z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-wide text-[#999999]">
            <span className="h-px flex-1 bg-[#ebebeb] dark:bg-slate-800" />
            or use a local account
            <span className="h-px flex-1 bg-[#ebebeb] dark:bg-slate-800" />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void signIn({ email: email.trim().toLowerCase() });
            }}
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-[#666666] dark:text-slate-400">Email</span>
              <span className="flex items-center gap-2 rounded-xl border border-[#dddddd] bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
                <Mail className="h-4 w-4 text-[#999999]" aria-hidden="true" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="h-11 w-full bg-transparent text-sm font-semibold outline-none"
                />
              </span>
            </label>
            <button
              type="submit"
              disabled={busy !== null || !email.trim()}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#f97316] text-sm font-bold text-white transition hover:bg-[#ea580c] disabled:opacity-50"
            >
              {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
              Continue with email
            </button>
          </form>

          {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

          <div className="mt-5 grid grid-cols-1 gap-2 border-t border-[#ebebeb] pt-4 sm:grid-cols-3 dark:border-slate-800">
            <button type="button" disabled={busy !== null} onClick={() => void signIn({ role: 'customer' })} className="min-h-[40px] rounded-lg border border-[#dddddd] text-[11px] font-bold dark:border-slate-700">
              {busy === 'customer' ? 'Signing in…' : 'Local Customer'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void signIn({ role: 'admin' })} className="min-h-[40px] rounded-lg bg-slate-950 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">
              {busy === 'admin' ? 'Signing in…' : 'Local Admin'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void signIn({ role: 'provider' })} className="min-h-[40px] rounded-lg bg-[#2554db] text-[11px] font-bold text-white">
              {busy === 'provider' ? 'Signing in…' : 'Local PG Owner'}
            </button>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-[#888888] dark:text-slate-500">
            Local accounts are seeded profiles for development. In production use Google sign-in.
          </p>
        </section>
      </main>
    </div>
  );
}
