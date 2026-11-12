import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import {
  fetchAdminAuthAccessSettings,
  saveAdminAuthAccessSettings,
  type AdminAuthAccessSettings as AdminAuthAccessSettingsModel,
} from '../lib/authAccessClient';

function ToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onChange,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#4A148C] shadow-xs dark:bg-slate-900 dark:text-purple-300">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-black text-slate-900 dark:text-white">{title}</p>
          {badge && (
            <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Administrator switches for the public sign-in surface.
 *
 * Guest browsing is hidden everywhere unless this is explicitly enabled here.
 * Email and Google sign-in can be turned off, but the server refuses to disable
 * both so an administrator can never lock every account out of the platform.
 */
export function AdminAuthAccessSettings() {
  const [settings, setSettings] = useState<AdminAuthAccessSettingsModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void fetchAdminAuthAccessSettings().then((result) => {
      if (!mounted) return;
      if (result.ok && result.settings) {
        setSettings(result.settings);
        setError('');
      } else {
        setError(
          result.error === 'FORBIDDEN_ADMIN_ONLY'
            ? 'Only an administrator can change sign-in settings.'
            : 'Sign-in settings are unavailable on this deployment.'
        );
      }
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const save = async (patch: Partial<Pick<AdminAuthAccessSettingsModel, 'guestLoginEnabled' | 'emailOtpEnabled' | 'googleLoginEnabled'>>) => {
    if (!settings || saving) return;
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    setError('');
    setSaved('');
    const result = await saveAdminAuthAccessSettings(patch);
    if (result.ok && result.settings) {
      setSettings(result.settings);
      setSaved('Sign-in settings saved.');
      window.dispatchEvent(new CustomEvent('bos-auth-access-updated'));
      window.setTimeout(() => setSaved(''), 2500);
    } else {
      setSettings(previous);
      setError(result.message || 'Sign-in settings could not be saved.');
    }
    setSaving(false);
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#f97316]">Access control</span>
          <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white sm:text-lg">
            Sign-in &amp; guest access
          </h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            These switches control the public login screen. They never grant a role: customer, provider and admin
            authority still comes from the server-side account record.
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Saving…
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {!error && saved && (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{saved}</span>
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading sign-in settings…
        </div>
      ) : settings ? (
        <div className="mt-4 space-y-2.5">
          <ToggleRow
            icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
            title="Allow guest browsing"
            description="Shows “Explore Spaces as Guest” on the welcome and login screens. Guests can browse; they cannot book, save or open a console."
            checked={settings.guestLoginEnabled}
            disabled={saving}
            onChange={(next) => void save({ guestLoginEnabled: next })}
            badge={settings.guestLoginEnabled ? 'Visible' : 'Hidden'}
          />
          <ToggleRow
            icon={<Mail className="h-4 w-4" aria-hidden="true" />}
            title="Email one-time code sign-in"
            description={
              settings.emailOtpConfigured
                ? 'Sends a 6-digit code by email through Supabase and Resend. No password is stored.'
                : 'Uses Supabase\'s own email provider until SUPABASE_SECRET_KEY, RESEND_API_KEY and RESEND_FROM_EMAIL are configured.'
            }
            checked={settings.emailOtpEnabled}
            disabled={saving}
            onChange={(next) => void save({ emailOtpEnabled: next })}
            badge={settings.emailOtpConfigured ? 'Ready' : 'Needs setup'}
          />
          <ToggleRow
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            title="Google sign-in"
            description="Keeps the existing Google OAuth entry available on the login screen."
            checked={settings.googleLoginEnabled}
            disabled={saving || !settings.googleConfigured}
            onChange={(next) => void save({ googleLoginEnabled: next })}
            badge={settings.googleConfigured ? 'Ready' : 'Needs setup'}
          />
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Guest browsing is off by default. Turning off both account sign-in methods is refused by the server so
              no one can be locked out.
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
