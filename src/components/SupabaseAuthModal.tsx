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
import { Browser } from '@capacitor/browser';
import {
  isSupabaseConfigured,
  SUPABASE_PROJECT_ID,
  fetchGoogleOAuthConfig,
  signInWithSupabaseGoogleOAuth,
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
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const activeAccount = authUser || currentUser;

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
      setErrorMsg(callbackError.replace(/[+_]/g, ' '));
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
  }, [isOpen, onAuthSuccess, onNavigateView, onClose]);

  // The sign-in surface is a modal dialog: Escape closes it, Tab stays inside,
  // focus moves to the close control, and focus returns to the opener on exit.
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
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
      previousFocus?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

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
                {activeAccount ? 'Google Verified Account' : 'Sign In with Google'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Supabase ({SUPABASE_PROJECT_ID}) • New users auto-create Customer profile • Role routing
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
                  <span>Google OAuth Verified</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-[#4A148C] dark:text-purple-300 capitalize">
                  {authUser?.role || supabaseProfile?.role || 'customer'} Role
                </span>
              </div>
              <div className="text-sm font-black truncate">
                {authUser?.email || currentUser?.email}
              </div>
              {authUser?.googleSub && (
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  ID: {authUser.googleSub}
                </div>
              )}

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

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveProfile}
                className="py-2.5 px-3 rounded-xl bg-[#4A148C] hover:bg-purple-900 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile</span>
              </button>

              <button
                type="button"
                disabled={syncing}
                onClick={handleSyncToAccount}
                className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync My Data'}</span>
              </button>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleSignOut}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out of Google</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
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
          </div>
        )}
      </div>
    </div>
  );
};

