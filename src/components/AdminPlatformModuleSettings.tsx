import React, { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ModuleFlagRow } from '../server/moduleGate';
import { CONFIGURED_MODULE_IDS, MODULE_REGISTRY, resolveModuleConfig } from '../modules/registry';
import { evaluateModuleHealth, healthSummary } from '../server/moduleHealth';
import {
  fetchLivePageConfig,
  publishModuleConfig,
  readModulesSlice,
  saveModuleConfigDraft,
} from '../modules/moduleConfigStore';
import {
  fetchPlatformModuleFlags,
  subscribeToPlatformModuleFlags,
  updatePlatformModuleFlag,
} from '../lib/stayDiscoveryData';

const MODULE_LABELS: Record<string, string> = {
  services: 'Home Services',
  hotels: 'Hotels & Stays',
  pg: 'PG Accommodation',
  function_hall: 'Function Halls',
  classes: 'Classes & Institutes',
  movies: 'Movies & Cinemas',
  ecommerce: 'Ecommerce',
};

export function AdminPlatformModuleSettings() {
  const [flags, setFlags] = useState<ModuleFlagRow[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = window.localStorage.getItem('bos_session_token_v1');
      const [accessResponse, loadedFlags] = await Promise.all([
        fetch('/api/platform-settings/access', {
          headers: token ? { 'x-bos-session-token': token } : {},
          cache: 'no-store',
        }),
        fetchPlatformModuleFlags(),
      ]);
      const access = await accessResponse.json().catch(() => null) as { canManage?: boolean } | null;
      setIsAdmin(accessResponse.ok && access?.canManage === true);
      setFlags(loadedFlags);
    } catch {
      setFlags(null);
      setError('Supabase module settings could not be loaded. No changes have been published.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToPlatformModuleFlags(() => { void load(); });
    return unsubscribe;
  }, [load]);

  const save = async (row: ModuleFlagRow, key: 'is_enabled' | 'allow_contact_owner') => {
    if (!isAdmin) {
      setError('A Supabase-authenticated admin profile is required.');
      return;
    }
    setSavingKey(`${row.module_key}:${key}`);
    setError(null);
    setNotice(null);
    try {
      const saved = await updatePlatformModuleFlag(row.module_key, { [key]: !row[key] });
      setFlags((current) => current?.map((item) => item.module_key === saved.module_key ? saved : item) ?? null);
      setNotice(`${MODULE_LABELS[row.module_key] ?? row.module_key} setting saved to Supabase.`);
    } catch (err) {
      setError(err instanceof Error && err.message === 'BUILDER_SUPER_ADMIN_REQUIRED'
        ? 'This change requires an active Super Admin session.'
        : 'The setting was not saved. Check the connection and database permissions, then retry.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="rounded-3xl border border-teal-200 bg-white p-5 shadow-sm dark:border-teal-900 dark:bg-slate-900" aria-labelledby="admin-platform-modules-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Database-backed controls</p>
          <h3 id="admin-platform-modules-title" className="mt-1 text-lg font-black">Platform availability</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">Visibility and owner-contact settings use the existing Supabase module table and RLS. Online booking remains locked until its complete server-side workflow is ready.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:opacity-50 dark:border-slate-700" aria-label="Refresh module settings">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {!isAdmin && !loading && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Editing requires an active Super Admin account verified from the server session and database profile. Regular Admin and customer accounts cannot change public module visibility.</p>
        </div>
      )}

      {error && <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">{notice}</p>}

      {loading && <p className="mt-5 text-sm text-slate-500" role="status">Loading current settings…</p>}
      {!loading && flags && (
        <div className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
          {flags.map((row) => (
            <div key={row.module_key} className="grid gap-3 py-4 sm:grid-cols-[minmax(12rem,1fr)_auto_auto] sm:items-center">
              <div>
                <p className="text-sm font-bold">{MODULE_LABELS[row.module_key] ?? row.module_key}</p>
                <p className="text-[11px] text-slate-500">Online booking: {row.allow_online_booking ? 'configured in flags; workflow still gated' : 'disabled'}</p>
              </div>
              <button type="button" onClick={() => void save(row, 'is_enabled')} disabled={!isAdmin || savingKey !== null} aria-pressed={row.is_enabled} className={`min-h-10 rounded-xl px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${row.is_enabled ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                <ShieldCheck className="mr-1 inline h-4 w-4" /> {row.is_enabled ? 'Visible' : 'Unavailable'}
              </button>
              <button type="button" onClick={() => void save(row, 'allow_contact_owner')} disabled={!isAdmin || savingKey !== null || !row.is_enabled} aria-pressed={row.allow_contact_owner} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700">
                Owner contact: {row.allow_contact_owner ? 'On' : 'Off'}
              </button>
            </div>
          ))}
        </div>
      )}
      {!loading && flags?.length === 0 && <p className="mt-5 text-sm text-slate-500">No module settings are configured.</p>}

      <ModuleDiagnostics flags={flags} />
    </section>
  );
}

/**
 * Read-only module health plus presentation settings published through the
 * existing live-page-config draft/publish API. Nothing here writes to
 * platform_module_flags — visibility stays with the table above.
 */
function ModuleDiagnostics({ flags }: { flags: ModuleFlagRow[] | null }) {
  const [values, setValues] = useState<Record<string, { label?: string; headline?: string }>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reports = MODULE_REGISTRY.map((module) =>
    evaluateModuleHealth(module.id, { flags, configIssues: resolveModuleConfig(module.id, values[module.id]).issues }),
  );
  const summary = healthSummary(reports);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await fetchLivePageConfig();
        if (!cancelled) setValues(readModulesSlice(config.published) as Record<string, { label?: string; headline?: string }>);
      } catch {
        // Defaults stay in place; the health list already reports the failure.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = async (mode: 'draft' | 'publish') => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (mode === 'draft') await saveModuleConfigDraft(values, { actor: 'Admin' });
      else await publishModuleConfig(values, { actor: 'Admin' });
      setStatus(mode === 'draft' ? 'Draft saved. It is not visible to customers until you publish.' : 'Published. Customer screens pick this up on refresh.');
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith('LIVE_PAGE_CONFIG_')
          ? 'The configuration service rejected this change. Sign in as an admin and retry.'
          : 'Settings were not saved. Check the connection and retry.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Diagnostics</p>
          <h4 className="text-sm font-black">Module health</h4>
        </div>
        <p className="text-[11px] font-semibold text-slate-500" role="status">
          {summary.healthy} healthy · {summary.degraded} degraded · {summary.disabled} disabled · {summary.unavailable} unavailable
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {reports.map((report) => {
          const tone =
            report.status === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
              : report.status === 'degraded'
                ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
          return (
            <li key={report.moduleId} className={`rounded-xl border p-3 text-[11px] leading-5 ${tone}`}>
              <p className="flex items-center justify-between gap-2 text-xs font-bold">
                <span>{MODULE_REGISTRY.find((m) => m.id === report.moduleId)?.label ?? report.moduleId}</span>
                <span className="uppercase tracking-[0.1em]">{report.status}</span>
              </p>
              <p className="mt-1 opacity-90">{report.adminMessage}</p>
              {report.retryable && <p className="mt-1 font-semibold">Transient — safe to refresh.</p>}
            </li>
          );
        })}
      </ul>

      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Presentation</p>
        <h4 className="text-sm font-black">Section labels &amp; headlines</h4>
        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Stored in the existing live-page configuration with draft, publish and version history. Invalid values fall back to
          the module defaults rather than blank a screen.
        </p>
      </div>

      <div className="space-y-3">
        {CONFIGURED_MODULE_IDS.map((id) => {
          const module = MODULE_REGISTRY.find((entry) => entry.id === id);
          if (!module) return null;
          return (
            <div key={id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
              <label className="text-[11px] font-bold">
                {module.label} — label
                <input
                  value={values[id]?.label ?? ''}
                  placeholder={module.label}
                  maxLength={60}
                  onChange={(event) => setValues((current) => ({ ...current, [id]: { ...current[id], label: event.target.value } }))}
                  className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="text-[11px] font-bold">
                Headline
                <input
                  value={values[id]?.headline ?? ''}
                  placeholder="Leave empty for the built-in headline"
                  maxLength={120}
                  onChange={(event) => setValues((current) => ({ ...current, [id]: { ...current[id], headline: event.target.value } }))}
                  className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            </div>
          );
        })}
      </div>

      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100" role="alert">{error}</p>}
      {status && <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" role="status">{status}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void persist('draft')} disabled={busy} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold disabled:opacity-50 dark:border-slate-700">
          Save draft
        </button>
        <button type="button" onClick={() => void persist('publish')} disabled={busy} className="min-h-10 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white disabled:opacity-50">
          Publish to customers
        </button>
        <button
          type="button"
          onClick={() => {
            setValues({});
            setStatus('Editor reset to defaults. Save a draft to apply.');
          }}
          disabled={busy}
          className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold disabled:opacity-50 dark:border-slate-700"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
