import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, Lock, RefreshCw, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import {
  fetchAdminCustomerModuleAccess,
  fetchAdminCustomerModuleAudit,
  revokeAdminCustomerModuleAccess,
  saveAdminCustomerModuleAccess,
  type AdminCustomer,
  type CustomerModuleGrant,
} from '../lib/customerModuleAccessClient';
import { CUSTOMER_MODULE_META, CUSTOMER_VISIBLE_MODULE_KEYS, type CustomerModuleKey } from '../lib/customerModuleMeta';

const MODULE_KEYS = CUSTOMER_VISIBLE_MODULE_KEYS;

type ModuleDraft = Record<CustomerModuleKey, { enabled: boolean; expiresAt: string }>;

function emptyDraft(): ModuleDraft {
  return Object.fromEntries(
    MODULE_KEYS.map((key) => [key, { enabled: false, expiresAt: '' }]),
  ) as ModuleDraft;
}

function draftFromGrants(grants: CustomerModuleGrant[]): ModuleDraft {
  const next = emptyDraft();
  for (const grant of grants) {
    if ((MODULE_KEYS as readonly CustomerModuleKey[]).includes(grant.moduleKey)) {
      next[grant.moduleKey] = {
        enabled: true,
        expiresAt: grant.expiresAt ? grant.expiresAt.slice(0, 16) : '',
      };
    }
  }
  return next;
}

function ModuleToggle({
  moduleKey,
  checked,
  expiresAt,
  disabled,
  onToggle,
  onExpiryChange,
}: {
  moduleKey: CustomerModuleKey;
  checked: boolean;
  expiresAt: string;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  onExpiryChange: (value: string) => void;
}) {
  const meta = CUSTOMER_MODULE_META[moduleKey];
  return (
    <div className={`rounded-2xl border p-3 transition ${checked ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg" aria-hidden="true">{meta.emoji}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{meta.label}</p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{moduleKey}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`${meta.label} access`}
          disabled={disabled}
          onClick={() => onToggle(!checked)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {checked && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-emerald-200/70 pt-2.5 dark:border-emerald-900/50">
          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Expires (optional)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            min={new Date().toISOString().slice(0, 16)}
            disabled={disabled}
            onChange={(event) => onExpiryChange(event.target.value)}
            className="ml-auto w-44 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Administrator surface for per-customer module grants.
 *
 * Only an administrator reaches this section; the server re-verifies the admin
 * session on every read and write. Grants replace the customer's previous
 * allow-list atomically, and every change is recorded in the audit table.
 */
export function AdminCustomerModuleAccess() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const [draft, setDraft] = useState<ModuleDraft>(() => emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [audit, setAudit] = useState<Array<{ id: string; moduleKey: string; action: string; expiresAt: string | null; createdAt: string; grantedBy: string | null }>>([]);

  const loadCustomers = useCallback(async (q: string) => {
    setLoading(true);
    setError('');
    const result = await fetchAdminCustomerModuleAccess({ query: q, limit: 50 });
    if (result.ok && result.customers) {
      setCustomers(result.customers);
      setTotal(result.total || 0);
    } else {
      setError(result.error === 'FORBIDDEN_ADMIN_ONLY' ? 'Only an administrator can manage module access.' : 'Module access is unavailable on this deployment.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCustomers('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDraft(selected ? draftFromGrants(selected.modules) : emptyDraft());
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setAudit([]);
      return;
    }
    let mounted = true;
    void fetchAdminCustomerModuleAudit(selected.id).then((result) => {
      if (mounted) setAudit(result.ok ? (result.audit || []) : []);
    });
    return () => {
      mounted = false;
    };
  }, [selected]);

  const save = async () => {
    if (!selected || saving) return;
    const modules: CustomerModuleGrant[] = MODULE_KEYS.filter((key) => draft[key].enabled).map((key) => ({
      moduleKey: key,
      expiresAt: draft[key].expiresAt ? new Date(draft[key].expiresAt).toISOString() : null,
    }));
    setSaving(true);
    setError('');
    setSaved('');
    const result = await saveAdminCustomerModuleAccess(selected.id, modules);
    if (result.ok) {
      setSaved('Module access saved.');
      setSelected((previous) => (previous ? { ...previous, modules: result.modules || [] } : previous));
      window.dispatchEvent(new CustomEvent('bos-customer-modules-updated'));
      void loadCustomers(query);
      window.setTimeout(() => setSaved(''), 2500);
    } else {
      setError(result.message || 'Module access could not be saved.');
    }
    setSaving(false);
  };

  const revokeAll = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError('');
    setSaved('');
    const result = await revokeAdminCustomerModuleAccess(selected.id);
    if (result.ok) {
      setSaved('All module access revoked.');
      setSelected((previous) => (previous ? { ...previous, modules: [] } : previous));
      window.dispatchEvent(new CustomEvent('bos-customer-modules-updated'));
      void loadCustomers(query);
      window.setTimeout(() => setSaved(''), 2500);
    } else {
      setError('Module access could not be revoked.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#f97316]">Access control</span>
          <h3 className="mt-1 text-base font-black text-slate-900 dark:text-white sm:text-lg">Customer Module Access</h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            Choose which marketplace modules a customer may open. Providers and admins are not affected; every change
            is recorded and takes effect on the customer&apos;s next request.
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Saving…
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {!error && saved && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{saved}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        {/* Customer search + list */}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void loadCustomers(query);
            }}
          >
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800">
              <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customers by name or email"
                className="h-10 w-full bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f97316] px-3 text-xs font-black text-white transition hover:bg-[#ea580c]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Search
            </button>
          </form>

          <p className="mt-2 text-[10px] font-semibold text-slate-400">{total} customer(s)</p>

          <div className="mt-2 max-h-[440px] space-y-1.5 overflow-y-auto pr-1">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelected(customer)}
                className={`w-full rounded-xl border p-2.5 text-left transition ${selected?.id === customer.id ? 'border-[#f97316] bg-orange-50/70 dark:bg-orange-950/20' : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800'}`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-xs dark:bg-slate-900 dark:text-slate-300">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-900 dark:text-white">{customer.fullName}</p>
                    <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{customer.email}</p>
                  </div>
                  <span className="ml-auto rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {customer.modules.length}/{MODULE_KEYS.length}
                  </span>
                </div>
              </button>
            ))}
            {!loading && customers.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-700">
                No customers found.
              </p>
            )}
          </div>
        </div>

        {/* Module editor for the selected customer */}
        <div className="space-y-3">
          {selected ? (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{selected.fullName}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{selected.email}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" aria-hidden="true" /> customer
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {MODULE_KEYS.map((key) => (
                    <ModuleToggle
                      key={key}
                      moduleKey={key}
                      checked={draft[key].enabled}
                      expiresAt={draft[key].expiresAt}
                      disabled={saving}
                      onToggle={(next) => setDraft((previous) => ({ ...previous, [key]: { ...previous[key], enabled: next } }))}
                      onExpiryChange={(value) => setDraft((previous) => ({ ...previous, [key]: { ...previous[key], expiresAt: value } }))}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={save}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#f97316] px-3 text-xs font-black text-white transition hover:bg-[#ea580c] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Save access
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={revokeAll}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Revoke all
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">Audit history</h4>
                </div>
                <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {audit.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] dark:bg-slate-800/50">
                      <span className={`rounded px-1.5 py-0.5 font-black uppercase ${entry.action === 'grant' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : entry.action === 'revoke' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                        {entry.action}
                      </span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{entry.moduleKey}</span>
                      {entry.expiresAt && <span className="text-slate-400">until {new Date(entry.expiresAt).toLocaleString()}</span>}
                      <span className="ml-auto text-slate-400">{entry.grantedBy || 'system'}</span>
                    </div>
                  ))}
                  {audit.length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-[10px] font-semibold text-slate-400 dark:border-slate-700">
                      No audit records yet.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
              <div>
                <UserRound className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">Select a customer to manage their module access.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
