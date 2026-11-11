import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mail,
  User as UserIcon,
  Phone,
  LogOut,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import {
  isSupabaseConfigured,
  fetchGoogleOAuthConfig,
  signInWithSupabaseGoogleOAuth,
  signInWithMagicLinkOtp,
  verifyEmailOtp,
} from '../lib/supabaseClient';
import { useMarketplace } from '../context/MarketplaceContext';
import { launchGoogleOAuthWindow } from '../lib/googleOAuthLauncher';
import BOSOfficialLogo from './BOSOfficialLogo';

interface SupabaseAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthSuccess?: (message: string) => void;
  onNavigateView?: (target: 'marketplace' | 'provider_portal' | 'admin_console') => void;
  returnSection?: string;
  forceDark?: boolean;
}

export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onNavigateView,
  returnSection = 'pg_hostels',
  forceDark = false,
}) => {
  const {
    supabaseProfile,
    authUser,
    isAccountBlocked,
    blockedReason,
    logoutGoogleSession,
    updateUserProfile,
    syncAccountData,
    bookings,
    enquiries,
    favoriteIds,
    transactions,
  } = useMarketplace();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailOtpEmail, setEmailOtpEmail] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localDevLoading, setLocalDevLoading] = useState<'admin' | 'customer' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Last element the user pressed. Safari/WebKit does not focus buttons on
  // click, so this is the only reliable opener to return focus to.
  const lastPointerOpenerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Only a server-verified session is a finished sign-in. A Supabase client
  // user without the authoritative session must see the simple sign-in view
  // instead of a "verified" profile that cannot book anything.
  const activeAccount = authUser;

  // A failure from an earlier Google attempt must never sit next to a
  // signed-in account. Opening the panel starts clean, and signing in clears
  // any message that was already on screen.
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setEmailOtpSent(false);
    setEmailOtpCode('');
  }, [isOpen]);

  useEffect(() => {
    if (authUser) setErrorMsg(null);
  }, [Boolean(authUser)]);

  useEffect(() => {
    if (authUser) {
      setFullName(authUser.name || 'Marketplace User');
      setPhone(authUser.phone || '');
    } else if (currentUser) {
      setFullName(
        supabaseProfile?.full_name ||
          currentUser.user_metadata?.full_name ||
          'Marketplace User'
      );
      setPhone(
        supabaseProfile?.phone || currentUser.user_metadata?.phone || ''
      );
    }
  }, [authUser, currentUser, supabaseProfile]);

  useEffect(() => {
    if (!isOpen) return;
    const callbackParams = new URLSearchParams(window.location.search);
    const callbackError = callbackParams.get('error_description') || callbackParams.get('error');
    if (callbackError) {
      // The URL may carry an error from an abandoned attempt. A signed-in
      // account is still valid, so do not contradict it with that message.
      if (!authUser) setErrorMsg(callbackError.replace(/[+_]/g, ' '));
      for (const key of ['code', 'state', 'error', 'error_description']) callbackParams.delete(key);
      const query = callbackParams.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
    const handleOAuthEvent = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.user) {
        const u = custom.detail.user;
        onAuthSuccess?.(
          custom.detail.isNewUser
            ? `Google account registered & signed in (${u.role.toUpperCase()})`
            : `Signed in with Google (${u.role.toUpperCase()})`
        );
        // OAuth always returns to Home. Server-assigned permissions remain
        // available from the account profile and protected routes.
        onNavigateView?.('marketplace');
        onClose();
      }
    };
    const handleOAuthError = (e: Event) => {
      // The browser already holds a verified account. A late error from an
      // abandoned attempt must not contradict the signed-in profile.
      if (authUser) return;
      const message = (e as CustomEvent<{ message?: string }>).detail?.message;
      setLoading(false);
      setInfoMsg(null);
      setErrorMsg(message || 'Google sign-in could not be completed. Please try again.');
    };
    window.addEventListener('bos-google-oauth-redirect', handleOAuthEvent);
    window.addEventListener('bos-google-oauth-error', handleOAuthError);
    return () => {
      window.removeEventListener('bos-google-oauth-redirect', handleOAuthEvent);
      window.removeEventListener('bos-google-oauth-error', handleOAuthError);
    };
  }, [isOpen, onAuthSuccess, onNavigateView, onClose, authUser, currentUser]);

  // The sign-in surface is a modal dialog: Escape closes it, Tab stays inside,
  // focus moves to the close control, and focus returns to the opener on exit.
  useEffect(() => {
    // While the dialog is open the focus trap owns focus; remember only the
    // control that opened it.
    if (isOpen) return;
    const rememberOpener = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      lastPointerOpenerRef.current =
        target?.closest<HTMLElement>('button, a[href], [tabindex]') || null;
    };
    document.addEventListener('pointerdown', rememberOpener, true);
    return () => document.removeEventListener('pointerdown', rememberOpener, true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement as HTMLElement | null;
    const activeIsUseful = Boolean(active && active !== document.body && active !== document.documentElement);
    // Prefer a real focused control; otherwise fall back to what the user
    // clicked so WebKit still returns focus to the opener.
    const previousFocus = activeIsUseful ? active : lastPointerOpenerRef.current;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // A control removed while the dialog was open can no longer take focus.
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const showLocalDevSignIn = Boolean(import.meta.env.DEV) || import.meta.env.VITE_BOS_LOCAL_DEV_AUTH === '1';

  const handleLocalDevSignIn = async (role: 'admin' | 'customer') => {
    setLocalDevLoading(role);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/auth/local-dev/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.sessionToken) {
        setErrorMsg(data?.message || 'Local demo sign-in is unavailable. Enable BOS_LOCAL_DEV_AUTH on the server.');
        return;
      }
      window.localStorage.setItem('bos_session_token_v1', String(data.sessionToken));
      window.location.reload();
    } catch {
      setErrorMsg('Local demo sign-in failed. Check that the API server is running.');
    } finally {
      setLocalDevLoading(null);
    }
  };

  const handlePopupGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    const isNative = Capacitor.isNativePlatform();
    try {
      sessionStorage.setItem('bos_oauth_return_section_v1', returnSection);
      sessionStorage.setItem('bos_oauth_return_hash_v1', window.location.hash);
      const returnPath = window.location.pathname === '/auth/callback'
        ? '/'
        : `${window.location.pathname}${window.location.search}`;
      sessionStorage.setItem('bos_oauth_return_path_v1', returnPath);
    } catch {
      // The native WebView or privacy mode may disable session storage; OAuth still works.
    }
    // Open synchronously inside the click gesture so browser popup blockers
    // do not discard user activation while the OAuth URL is being requested.
    const popup = isNative ? null : window.open(
      'about:blank',
      'bos_google_oauth_popup',
      'width=540,height=680,menubar=no,toolbar=no,location=yes,status=no'
    );
    try {
      let oauth = isSupabaseConfigured
        ? await signInWithSupabaseGoogleOAuth('customer')
        : { ok: false as const };
      if ((!oauth.ok || !oauth.url) && !isNative) {
        oauth = await fetchGoogleOAuthConfig('customer');
      }
      if (!oauth.ok || !oauth.url) {
        popup?.close();
        setErrorMsg(oauth.error || 'Secure Google sign-in is unavailable. Please try again later.');
        return;
      }
      if (isNative) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: oauth.url });
        setInfoMsg('Complete Google sign-in in the browser. You will return to BookOurSpace automatically.');
        return;
      }
      if (popup) {
        launchGoogleOAuthWindow({
          window: popup,
          url: oauth.url,
          redirect: (url) => window.location.assign(url),
        });
        setInfoMsg('Complete Google sign-in in the popup window...');
      } else {
        // Full-page OAuth is the fallback when the browser blocks popups.
        launchGoogleOAuthWindow({
          window: null,
          url: oauth.url,
          redirect: (url) => window.location.assign(url),
        });
      }
    } catch (err: any) {
      popup?.close();
      setErrorMsg(err?.message || 'Could not launch Google OAuth popup.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handlePopupGoogleSignIn();
  };

  const handleRequestEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const result = await signInWithMagicLinkOtp(emailOtpEmail);
      setEmailOtpEmail(result.email);
      setEmailOtpSent(true);
      setInfoMsg('We sent a six-digit sign-in code. It expires shortly and can be used only once.');
    } catch (error: any) {
      setErrorMsg(error?.message || 'Could not send the email sign-in code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await verifyEmailOtp(emailOtpEmail, emailOtpCode);
      setInfoMsg('Email verified. Completing secure sign-in…');
    } catch (error: any) {
      setErrorMsg(error?.message || 'That code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const result = await updateUserProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
      });
      if (result.persisted === 'profile') {
        setInfoMsg('Profile updated!');
        onAuthSuccess?.('Profile saved to your account');
      } else if (result.persisted === 'account_only') {
        // The name and phone reached the Google/Supabase account, but the
        // durable marketplace profile could not be written. Say so instead of
        // reporting a save that did not happen.
        setErrorMsg(
          'Your Google account was updated, but the marketplace profile could not be saved. Please try again later.'
        );
        onAuthSuccess?.('Account details updated; marketplace profile not saved yet');
      } else {
        setErrorMsg('Your profile could not be saved. Please sign in again and retry.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToAccount = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const count = await syncAccountData();
      setInfoMsg(`Synced ${count} records to your account.`);
      onAuthSuccess?.(`Synced ${count} records to your account`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not sync records.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await logoutGoogleSession();
      onAuthSuccess?.('Signed out of Google session');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom) + 1rem)' }}
      className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bos-auth-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: 'calc(100dvh - 56px - env(safe-area-inset-bottom) - 2rem)' }}
        className={`${forceDark ? 'dark ' : ''}w-full max-w-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5 max-h-[92vh] overflow-y-auto`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#4A148C] text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 id="bos-auth-title" className="text-base font-black">
                {activeAccount ? 'Your Account' : 'Sign In'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeAccount ? 'Signed in and verified.' : 'Continue with Google or email OTP to book and save.'}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close sign-in"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!activeAccount && (
          <div className={`flex justify-center ${forceDark ? 'rounded-2xl bg-white p-3' : ''}`} aria-label="BookOurSpace Google sign-in">
            <BOSOfficialLogo animated loading="eager" className="w-[min(82vw,320px)]" />
          </div>
        )}

        {isAccountBlocked && (
          <div className="p-3.5 rounded-2xl bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-black uppercase tracking-wider text-[11px]">Account Suspended / Blocked</p>
              <p className="mt-0.5">{blockedReason || 'Your account has been suspended or blocked by an administrator.'}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {activeAccount ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verified account</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-[#4A148C] dark:text-purple-300 capitalize">
                  {authUser?.role || supabaseProfile?.role || 'customer'}
                </span>
              </div>
              <div className="text-sm font-black truncate">
                {authUser?.email || currentUser?.email}
              </div>

              {/* Account Activity Summary */}
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>{bookings.length} Bookings</span>
                <span aria-hidden="true">·</span>
                <span>{enquiries.length} Enquiries</span>
                <span aria-hidden="true">·</span>
                <span>{favoriteIds.length} Saved</span>
                <span aria-hidden="true">·</span>
                <span>{transactions.length} Payments</span>
              </div>
            </div>

            {/* Editable Profile Fields */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3.5 py-2 text-xs outline-hidden focus:border-[#4A148C]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Mobile Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98480 12345"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3.5 py-2 text-xs outline-hidden focus:border-[#4A148C]"
                  />
                </div>
              </div>

            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleSaveProfile}
              className="w-full py-2.5 px-3 rounded-xl bg-[#4A148C] hover:bg-purple-900 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{loading ? 'Saving…' : 'Save changes'}</span>
            </button>

            <div className="flex items-center justify-between pt-1 text-xs">
              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncToAccount}
                className="inline-flex items-center gap-1.5 font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing…' : 'Sync my data'}</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50 dark:text-rose-400 dark:hover:text-rose-300"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {showLocalDevSignIn && (
              <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-800 dark:text-amber-200">Local development sign-in</p>
                <p className="mt-1 text-[11px] leading-4 text-amber-900/80 dark:text-amber-100/80">
                  Supabase Google is not configured on this machine. Choose a seeded local profile to test the app and the admin console.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={localDevLoading !== null}
                    onClick={() => void handleLocalDevSignIn('customer')}
                    className="min-h-[38px] rounded-xl border border-amber-300 bg-white px-2 text-[11px] font-bold text-amber-900 disabled:opacity-50 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200"
                  >
                    {localDevLoading === 'customer' ? 'Signing in…' : 'Continue as Customer'}
                  </button>
                  <button
                    type="button"
                    disabled={localDevLoading !== null}
                    onClick={() => void handleLocalDevSignIn('admin')}
                    className="min-h-[38px] rounded-xl bg-amber-500 px-2 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    {localDevLoading === 'admin' ? 'Signing in…' : 'Continue as Admin'}
                  </button>
                </div>
              </div>
            )}
            {/* Official Google OAuth Popup Button */}
            <button
              type="button"
              disabled={loading}
              onClick={handlePopupGoogleSignIn}
              className="w-full py-3 px-4 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 shadow-xs text-xs font-black flex items-center justify-center gap-3 cursor-pointer transition"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.24 0-5.98-2.18-6.96-5.12H1.05v3.14C3.06 21.16 7.21 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.04 14.03c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.33H1.05C.38 7.66 0 9.16 0 11.75s.38 4.09 1.05 5.42l3.99-3.14z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.79 0 3.41.62 4.68 1.82l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.06 2.84 1.05 6.83l3.99 3.14c.98-2.94 3.72-5.22 6.96-5.22z"
                />
              </svg>
              <span>Continue with Google OAuth Popup</span>
            </button>

            <form onSubmit={handleGoogleDirectSubmit} className="space-y-3">
              <p className="text-xs text-slate-500 text-center">Account identity and email are supplied by Google and verified by Supabase Auth. Profile details can be edited after sign-in.</p>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-[#4A148C] hover:bg-purple-900 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <span>
                  {loading
                    ? 'Opening secure Google sign-in…'
                    : 'Continue securely with Google'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <p className="text-xs font-black text-slate-800 dark:text-slate-200">Or sign in with email OTP</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                Supabase Auth verifies the email code before BookOurSpace creates an application session.
              </p>
              {!emailOtpSent ? (
                <form onSubmit={handleRequestEmailOtp} className="mt-3 space-y-2">
                  <label className="sr-only" htmlFor="bos-email-otp-email">Email address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="bos-email-otp-email"
                      type="email"
                      autoComplete="email"
                      value={emailOtpEmail}
                      onChange={(e) => setEmailOtpEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3.5 py-2.5 text-xs outline-hidden focus:border-[#4A148C]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !isSupabaseConfigured}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#4A148C] text-[#4A148C] dark:text-purple-300 dark:border-purple-400 text-xs font-black disabled:opacity-50"
                  >
                    {loading ? 'Sending code…' : 'Send email OTP'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyEmailOtp} className="mt-3 space-y-2">
                  <label className="sr-only" htmlFor="bos-email-otp-code">Six-digit email code</label>
                  <input
                    id="bos-email-otp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={emailOtpCode}
                    onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    required
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-center tracking-[0.35em] text-sm font-black outline-hidden focus:border-[#4A148C]"
                  />
                  <button
                    type="submit"
                    disabled={loading || emailOtpCode.length !== 6}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black disabled:opacity-50"
                  >
                    {loading ? 'Verifying…' : 'Verify email OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailOtpSent(false); setEmailOtpCode(''); setInfoMsg(null); }}
                    className="w-full text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Use a different email
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

