import React, { useState, useEffect } from 'react';
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
import {
  isSupabaseConfigured,
  SUPABASE_PROJECT_ID,
  fetchGoogleOAuthConfig,
  signInWithSupabaseGoogleOAuth,
} from '../lib/supabaseClient';
import { UserRole } from '../types/marketplace';
import { useMarketplace } from '../context/MarketplaceContext';

interface SupabaseAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthSuccess?: (message: string) => void;
  onNavigateView?: (target: 'marketplace' | 'provider_portal' | 'admin_console') => void;
}

export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onNavigateView,
}) => {
  const {
    supabaseProfile,
    authUser,
    isAccountBlocked,
    blockedReason,
    loginWithGoogle,
    logoutGoogleSession,
    updateUserProfile,
    syncAccountData,
    userRole,
    bookings,
    enquiries,
    favoriteIds,
    transactions,
  } = useMarketplace();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const activeAccount = authUser || currentUser;

  useEffect(() => {
    if (authUser) {
      setFullName(authUser.name || 'Marketplace User');
      setPhone(authUser.phone || '');
      setRole(authUser.role || userRole);
      setEmail(authUser.email || '');
    } else if (currentUser) {
      setFullName(
        supabaseProfile?.full_name ||
          currentUser.user_metadata?.full_name ||
          'Marketplace User'
      );
      setPhone(
        supabaseProfile?.phone || currentUser.user_metadata?.phone || ''
      );
      setRole(
        supabaseProfile?.role ||
          (currentUser.user_metadata?.role as UserRole) ||
          userRole
      );
      setEmail(currentUser.email || '');
    }
  }, [authUser, currentUser, supabaseProfile, userRole]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOAuthEvent = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.user) {
        const u = custom.detail.user;
        const target = custom.detail.redirectTarget as
          | 'marketplace'
          | 'provider_portal'
          | 'admin_console'
          | undefined;
        onAuthSuccess?.(
          custom.detail.isNewUser
            ? `Google account registered & signed in (${u.role.toUpperCase()})`
            : `Signed in with Google (${u.role.toUpperCase()})`
        );
        if (target && onNavigateView) {
          onNavigateView(target);
        }
        onClose();
      }
    };
    window.addEventListener('bos-google-oauth-redirect', handleOAuthEvent);
    return () => window.removeEventListener('bos-google-oauth-redirect', handleOAuthEvent);
  }, [isOpen, onAuthSuccess, onNavigateView, onClose]);

  if (!isOpen) return null;

  const handlePopupGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const supaRes = await signInWithSupabaseGoogleOAuth(role);
        if (supaRes.ok && supaRes.url) {
          const popup = window.open(
            supaRes.url,
            'bos_google_oauth_popup',
            'width=540,height=680,menubar=no,toolbar=no,location=yes,status=no'
          );
          if (popup) {
            setInfoMsg('Complete Google sign-in in the popup window...');
            setLoading(false);
            return;
          }
        }
      }

      const cfg = await fetchGoogleOAuthConfig(role);
      if (cfg.ok && cfg.url) {
        const popup = window.open(
          cfg.url,
          'bos_google_oauth_popup',
          'width=540,height=680,menubar=no,toolbar=no,location=yes,status=no'
        );
        if (popup) {
          setInfoMsg('Complete Google sign-in in the popup window...');
          setLoading(false);
          return;
        }
      }
      setErrorMsg('Popup blocked or unavailable. Use the Google Account form below to continue.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not launch Google OAuth popup.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setErrorMsg('Please enter a valid Google email address.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithGoogle({
        email: normalizedEmail,
        name: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        requestedRole: 'customer',
        allowRoleChange: false,
      });

      if (!result.ok) {
        setErrorMsg(
          result.message ||
            'Google authentication failed. Check if your account is active.'
        );
        return;
      }

      const signedUser = result.user;
      const target =
        result.redirectTarget ||
        (signedUser?.role === 'admin'
          ? 'admin_console'
          : signedUser?.role === 'provider'
          ? 'provider_portal'
          : 'marketplace');

      onAuthSuccess?.(
        result.isNewUser
          ? `Welcome ${signedUser?.name}! Google account auto-registered (${signedUser?.role.toUpperCase()})`
          : `Welcome back ${signedUser?.name}! Signed in with Google (${signedUser?.role.toUpperCase()})`
      );
      if (onNavigateView) {
        onNavigateView(target);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Google authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await updateUserProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        role,
      });
      setInfoMsg('Profile updated!');
      onAuthSuccess?.('Profile saved to your account');
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
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-5 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#4A148C] text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black">
                {activeAccount ? 'Google Verified Account' : 'Sign In with Google'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Supabase ({SUPABASE_PROJECT_ID}) • New users auto-create Customer profile • Role routing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
                  {authUser?.role || role} Role
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

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Active Workspace Role
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'customer', label: 'Customer' },
                      { id: 'provider', label: 'Provider' },
                      { id: 'admin', label: 'Admin' },
                    ] as { id: UserRole; label: string }[]
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        role === r.id
                          ? 'bg-[#4A148C] text-white border-[#4A148C]'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
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
            {/* Role Selector for New Registration / Routing */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Select Account Portal (New users auto-register with this role)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'customer', label: 'Customer Marketplace' },
                  { id: 'provider', label: 'Service Provider Portal' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id as UserRole)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                      role === r.id
                        ? 'bg-[#4A148C] text-white border-[#4A148C]'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

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

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                Or Instant Google Account Sign-In / Auto-Register
              </span>
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            </div>

            <form onSubmit={handleGoogleDirectSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Google Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3.5 py-2.5 text-xs outline-hidden focus:border-[#4A148C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Full Name (New User)
                  </label>
                  <div className="relative">
                    <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Auto-filled if existing"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-2.5 py-2 text-xs outline-hidden focus:border-[#4A148C]"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Mobile (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-2.5 py-2 text-xs outline-hidden focus:border-[#4A148C]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-[#4A148C] hover:bg-purple-900 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <span>
                  {loading
                    ? 'Verifying with Google OAuth...'
                    : 'Sign In / Auto-Register with Google'}
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
