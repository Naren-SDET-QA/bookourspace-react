import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import {
  ACCESS_ACTIONS,
  ACCESS_ACTION_LABELS,
  type AccessAction,
} from '../lib/businessAccess';
import {
  applyRepair,
  fetchAccessAccount,
  fetchAccessAccounts,
  fetchAccessCatalog,
  fetchAccessHealth,
  fetchAccessHistory,
  fetchRepairs,
  grantCompleteAccess,
  previewRepair,
  restoreViewOnly,
  rollbackRepair,
  saveCategoryPermissions,
  setAccountStatus,
  type AccessAccountDetail,
  type AccessAccountSummary,
  type AccessCatalogCategory,
  type AccessHealthReport,
  type AccessHistoryEntry,
  type AccessRepairPlan,
} from '../lib/accessControlClient';

/**
 * User Management → Access Control.
 *
 * One console for customers and providers. Every switch is a suggestion to the
 * server, which re-validates the admin session, refuses a self-edit and decides
 * with the shared engine. The health panel only ever offers VIEW-only repairs;
 * destructive repairs need an explicit approval checkbox.
 */

type CategoryDraft = Record<string, Set<AccessAction>>;

const ACTION_TONE: Record<AccessAction, string> = {
  view: 'bg-sky-100 text-sky-800 border-sky-200',
  create: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  edit: 'bg-amber-100 text-amber-900 border-amber-200',
  delete: 'bg-rose-100 text-rose-800 border-rose-200',
  approve: 'bg-violet-100 text-violet-800 border-violet-200',
  manage: 'bg-slate-900 text-white border-slate-900',
};

function statusTone(status: string): string {
  if (status === 'active') return 'bg-emerald-100 text-emerald-800';
  if (status === 'suspended') return 'bg-amber-100 text-amber-900';
  if (status === 'blocked' || status === 'closed') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

function draftFromAccount(account: AccessAccountDetail, categories: AccessCatalogCategory[]): CategoryDraft {
  const draft: CategoryDraft = {};
  for (const category of categories) {
    if (account.role === 'provider') {
      const business = account.businesses.find((entry) => entry.category === category.key && entry.memberStatus === 'active');
      if (!business) {
        draft[category.key] = new Set();
        continue;
      }
      if (business.memberRole === 'owner') {
        draft[category.key] = new Set(ACCESS_ACTIONS);
        continue;
      }
      const actions = business.actions[business.moduleType] || [];
      draft[category.key] = new Set(
        (actions.length > 0 ? actions : [...ACCESS_ACTIONS]) as AccessAction[],
      );
      continue;
    }
    const grant = account.customerGrants.find((entry) => entry.category === category.key);
    draft[category.key] = new Set((grant?.actions || []) as AccessAction[]);
  }
  return draft;
}

function toggle(set: Set<AccessAction>, action: AccessAction): Set<AccessAction> {
  const next = new Set(set);
  if (next.has(action)) next.delete(action);
  else next.add(action);
  if (action !== 'view' && next.size > 0) next.add('view');
  return next;
}

export function AdminAccessControlConsole() {
  const [accounts, setAccounts] = useState<AccessAccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [account, setAccount] = useState<AccessAccountDetail | null>(null);
  const [catalog, setCatalog] = useState<AccessCatalogCategory[]>([]);
  const [draft, setDraft] = useState<CategoryDraft>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<AccessHistoryEntry[]>([]);
  const [health, setHealth] = useState<{ report: AccessHealthReport; plan: AccessRepairPlan } | null>(null);
  const [repairId, setRepairId] = useState<string | null>(null);
  const [approveDestructive, setApproveDestructive] = useState(false);
  const [repairs, setRepairs] = useState<Array<{ id: string; status: string; createdAt: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAccessAccounts({ query, role: role || undefined, status: status || undefined, limit: 40 });
      setAccounts(result.accounts);
      setTotal(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, [query, role, status]);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await fetchAccessHealth());
      setRepairs(await fetchRepairs());
    } catch (healthError) {
      setError(healthError instanceof Error ? healthError.message : 'Could not run the health check.');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setCatalog(await fetchAccessCatalog());
      } catch {
        setCatalog([]);
      }
    })();
    void loadAccounts();
    void loadHealth();
  }, [loadAccounts, loadHealth]);

  const selectAccount = useCallback(
    async (userId: string) => {
      setSelectedId(userId);
      setBusy('account');
      setError(null);
      setNotice(null);
      try {
        const detail = await fetchAccessAccount(userId);
        setAccount(detail);
        setDraft(draftFromAccount(detail, catalog));
        setDirty(false);
        setHistory(await fetchAccessHistory(userId));
      } catch (selectError) {
        setError(selectError instanceof Error ? selectError.message : 'Could not load the account.');
      } finally {
        setBusy(null);
      }
    },
    [catalog],
  );

  const refreshAccount = useCallback(
    async (userId: string) => {
      const detail = await fetchAccessAccount(userId);
      setAccount(detail);
      setDraft(draftFromAccount(detail, catalog));
      setDirty(false);
      setHistory(await fetchAccessHistory(userId));
    },
    [catalog],
  );

  const save = useCallback(async () => {
    if (!account) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const categories = catalog.map((category) => ({
        category: category.key,
        actions: Array.from(draft[category.key] || []),
      }));
      const updated = await saveCategoryPermissions(account.id, categories);
      setAccount(updated);
      setDraft(draftFromAccount(updated, catalog));
      setDirty(false);
      setNotice('Permissions saved. The change applies on the next request.');
      setHistory(await fetchAccessHistory(account.id));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save permissions.');
    } finally {
      setSaving(false);
    }
  }, [account, catalog, draft]);

  const runPreset = useCallback(
    async (mode: 'complete' | 'view' | 'all' | 'selected') => {
      if (!account) return;
      const selected = catalog
        .map((category) => category.key)
        .filter((key) => (draft[key]?.size || 0) > 0);
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const categories =
          mode === 'all'
            ? null
            : mode === 'selected'
              ? selected
              : catalog.map((category) => category.key);
        if (mode === 'view') {
          setAccount(await restoreViewOnly(account.id, categories));
        } else {
          // 'complete', 'all' and 'selected' all grant every action; only the
          // category scope differs.
          setAccount(await grantCompleteAccess(account.id, categories));
        }
        await refreshAccount(account.id);
        setNotice(
          mode === 'view'
            ? 'View-only access restored.'
            : 'Complete access granted to the selected categories.',
        );
      } catch (presetError) {
        setError(presetError instanceof Error ? presetError.message : 'Could not apply the preset.');
      } finally {
        setSaving(false);
      }
    },
    [account, catalog, draft, refreshAccount],
  );

  const changeStatus = useCallback(
    async (next: 'active' | 'suspended' | 'revoked') => {
      if (!account) return;
      const verb = next === 'active' ? 'reactivate' : next === 'suspended' ? 'suspend' : 'revoke';
      const pastTense = next === 'active' ? 'reactivated' : next === 'suspended' ? 'suspended' : 'revoked';
      if (!window.confirm(`Are you sure you want to ${verb} ${account.email}?`)) return;
      setBusy('status');
      setError(null);
      try {
        await setAccountStatus(account.id, next, 'Changed from the access control console');
        await refreshAccount(account.id);
        await loadAccounts();
        setNotice(`Account ${pastTense}.`);
      } catch (statusError) {
        setError(statusError instanceof Error ? statusError.message : 'Could not change the account status.');
      } finally {
        setBusy(null);
      }
    },
    [account, loadAccounts, refreshAccount],
  );

  const runRepair = useCallback(
    async (step: 'preview' | 'apply' | 'rollback') => {
      setBusy(step);
      setError(null);
      setNotice(null);
      try {
        if (step === 'preview') {
          const preview = await previewRepair();
          setRepairId(preview.repairId);
          setHealth({ report: preview.report, plan: preview.plan });
          setNotice(`Preview created with ${preview.plan.operations.length} safe operation(s).`);
        } else if (step === 'apply' && repairId) {
          const result = await applyRepair(repairId, approveDestructive);
          setNotice(`Repair applied: ${result.applied} operation(s), ${result.held} held for approval.`);
          await loadHealth();
        } else if (step === 'rollback' && repairId) {
          const result = await rollbackRepair(repairId);
          setNotice(`Repair rolled back: ${result.reversed} operation(s) reversed.`);
          await loadHealth();
        }
      } catch (repairError) {
        setError(repairError instanceof Error ? repairError.message : 'The repair step failed.');
      } finally {
        setBusy(null);
      }
    },
    [approveDestructive, loadHealth, repairId],
  );

  const totals = useMemo(
    () => ({
      customers: accounts.filter((entry) => entry.role === 'customer').length,
      providers: accounts.filter((entry) => entry.role === 'provider').length,
    }),
    [accounts],
  );

  return (
    <div className="space-y-6" data-testid="admin-access-control">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              User Management &amp; Access Control
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              One permission engine for every category. New accounts start with View only; administrators grant
              the rest. Super Admin keeps unrestricted access and is protected from self-edits.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
              {total} accounts
            </span>
            <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">
              {totals.customers} customers
            </span>
            <span className="rounded-full bg-violet-100 px-3 py-1 font-semibold text-violet-800">
              {totals.providers} providers
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadAccounts();
                }}
                placeholder="Search name or email"
                aria-label="Search customers and providers"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadAccounts()}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Search
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              aria-label="Filter by role"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All roles</option>
              <option value="customer">Customers</option>
              <option value="provider">Providers</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by account status"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {loading && (
              <p className="flex items-center gap-2 px-2 py-4 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
              </p>
            )}
            {!loading && accounts.length === 0 && (
              <p className="px-2 py-4 text-sm text-slate-500">No accounts match this search.</p>
            )}
            {accounts.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => void selectAccount(entry.id)}
                data-testid={`account-${entry.id}`}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selectedId === entry.id
                    ? 'border-slate-900 bg-slate-50 dark:border-slate-300 dark:bg-slate-800'
                    : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {entry.fullName || entry.email}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone(entry.accountStatus)}`}>
                    {entry.accountStatus}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <UserRound className="h-3 w-3" />
                  {entry.role}
                  {entry.isSuperAdmin && <span className="font-bold text-violet-700">super admin</span>}
                  <span className="truncate">{entry.email}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          {!account && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              <Users className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              Select an account to review and change its category permissions.
            </div>
          )}

          {account && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {account.fullName || account.email}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {account.email} · {account.role}
                    {account.isSuperAdmin && ' · Super Admin (unrestricted)'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="activate-account"
                    onClick={() => void changeStatus('active')}
                    disabled={busy === 'status' || account.accountStatus === 'active'}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40"
                  >
                    Activate
                  </button>
                  <button
                    type="button"
                    data-testid="suspend-account"
                    onClick={() => void changeStatus('suspended')}
                    disabled={busy === 'status' || account.accountStatus === 'suspended'}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40"
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    data-testid="revoke-account"
                    onClick={() => void changeStatus('revoked')}
                    disabled={busy === 'status'}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-40"
                  >
                    <ShieldOff className="mr-1 inline h-3 w-3" />
                    Revoke access
                  </button>
                </div>
              </div>

              {account.role === 'admin' && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Administrators bypass category grants. Super Admin is protected from permission edits.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="complete-access-all"
                  onClick={() => void runPreset('complete')}
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" /> Complete access (all categories)
                </button>
                <button
                  type="button"
                  data-testid="complete-access-selected"
                  onClick={() => void runPreset('selected')}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-50"
                >
                  Complete access (selected)
                </button>
                <button
                  type="button"
                  data-testid="restore-view-only"
                  onClick={() => void runPreset('view')}
                  disabled={saving}
                  className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-800 disabled:opacity-50"
                >
                  Restore View only
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {catalog.map((category) => {
                  const ownerLocked =
                    account.role === 'provider'
                    && account.businesses.some(
                      (business) => business.category === category.key
                        && business.memberStatus === 'active'
                        && business.memberRole === 'owner',
                    );
                  const actions = draft[category.key] || new Set<AccessAction>();
                  return (
                    <div
                      key={category.key}
                      data-testid={`category-${category.key}`}
                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span aria-hidden="true">{category.emoji}</span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{category.label}</span>
                          {!category.active && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                              not live
                            </span>
                          )}
                          {ownerLocked && (
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800">
                              owner: full access
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold uppercase text-slate-400">
                          {actions.size === ACCESS_ACTIONS.length ? 'complete' : actions.size === 0 ? 'no access' : `${actions.size} actions`}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ACCESS_ACTIONS.map((action) => {
                          const on = actions.has(action);
                          return (
                            <button
                              key={action}
                              type="button"
                              disabled={ownerLocked || account.role === 'admin'}
                              data-testid={`action-${category.key}-${action}`}
                              aria-pressed={on}
                              onClick={() => {
                                if (ownerLocked) return;
                                setDraft((current) => ({
                                  ...current,
                                  [category.key]: toggle(current[category.key] || new Set(), action),
                                }));
                                setDirty(true);
                              }}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                                on
                                  ? ACTION_TONE[action]
                                  : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800'
                              }`}
                              title={ACCESS_ACTION_LABELS[action]}
                            >
                              {ACCESS_ACTION_LABELS[action].replace(' (implies every action)', '')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  data-testid="save-permissions"
                  onClick={() => void save()}
                  disabled={!dirty || saving || account.role === 'admin'}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : null}
                  Save permissions
                </button>
                {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
              </div>
            </div>
          )}

          {account && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <History className="h-4 w-4" /> Permission history
              </h3>
              <div data-testid="permission-history" className="mt-3 space-y-2">
              {history.length === 0 && <p className="mt-2 text-sm text-slate-500">No changes recorded yet.</p>}
              <ul className="mt-2 space-y-2">
                {history.slice(0, 25).map((entry) => (
                  <li key={`${entry.scope}-${entry.id}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span className="font-semibold">{entry.action}</span>
                    {entry.category ? ` · ${entry.category}` : ''}
                    {entry.actions.length > 0 ? ` · ${entry.actions.join(', ')}` : ''}
                    <span className="ml-2 text-slate-400">
                      {new Date(entry.createdAt).toLocaleString()} · {entry.actor || 'system'}
                    </span>
                    {entry.reason && <span className="ml-2 italic text-slate-500">“{entry.reason}”</span>}
                  </li>
                ))}
              </ul>
              </div>
            </div>
          )}

          <div data-testid="permission-health" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Wrench className="h-4 w-4" /> Permission health
              </h3>
              <button
                type="button"
                data-testid="recheck-health"
                onClick={() => void loadHealth()}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" /> Re-check
              </button>
            </div>
            {!health && <p className="mt-2 text-sm text-slate-500">Running the health check…</p>}
            {health && (
              <>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-3 py-1 font-semibold ${health.report.healthy ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {health.report.healthy ? 'Healthy' : `${health.report.findings.length} finding(s)`}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    {health.report.profileCount} profiles · {health.report.customerGrantCount} grants
                  </span>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">
                    {health.report.safeRepairCount} safe repair(s)
                  </span>
                  {health.report.approvalRequiredCount > 0 && (
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
                      {health.report.approvalRequiredCount} need approval
                    </span>
                  )}
                </div>
                {health.report.findings.length > 0 && (
                  <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                    {health.report.findings.map((finding) => (
                      <li key={finding.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                        <span className="font-mono text-[10px] font-bold text-slate-500">{finding.code}</span>
                        <p className="mt-0.5 text-slate-700 dark:text-slate-200">{finding.summary}</p>
                        {finding.approvalRequired && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-rose-700">
                            <AlertTriangle className="h-3 w-3" /> needs explicit approval
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    data-testid="preview-repair"
                    onClick={() => void runRepair('preview')}
                    disabled={busy !== null}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Preview repair
                  </button>
                  <button
                    type="button"
                    data-testid="apply-repair"
                    onClick={() => void runRepair('apply')}
                    disabled={busy !== null || !repairId || health.plan.operations.length === 0}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Apply safe repair
                  </button>
                  <button
                    type="button"
                    data-testid="rollback-repair"
                    onClick={() => void runRepair('rollback')}
                    disabled={busy !== null || !repairId}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Roll back
                  </button>
                  {health.plan.requiresApproval && (
                    <label className="flex items-center gap-1 text-xs text-rose-800">
                      <input
                        type="checkbox"
                        data-testid="approve-destructive"
                        checked={approveDestructive}
                        onChange={(event) => setApproveDestructive(event.target.checked)}
                      />
                      Approve destructive repairs
                    </label>
                  )}
                </div>
                {health.plan.heldOperations.length > 0 && !approveDestructive && (
                  <p className="mt-2 text-xs text-amber-800">
                    {health.plan.heldOperations.length} destructive operation(s) are held until you approve them.
                    Safe repairs never grant more than View.
                  </p>
                )}
                {repairs.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Latest repair: {repairs[0].id.slice(0, 8)} · {repairs[0].status}
                  </p>
                )}
              </>
            )}
          </div>

          <p className="flex items-start gap-2 text-xs text-slate-500">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Category permissions are enforced server-side and by database RLS. Hiding a button is never the
            security boundary.
          </p>
        </section>
      </div>
    </div>
  );
}
