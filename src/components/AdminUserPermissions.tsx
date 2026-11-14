import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  History,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import {
  copyAdminPermissions,
  fetchAdminCustomerModuleAccess,
  fetchAdminPermissionHistory,
  resetAdminPermissions,
  revokeAdminCustomerModuleAccess,
  saveAdminCustomerModuleAccess,
  type AdminCustomer,
  type CustomerModuleGrant,
  type PermissionHistoryEntry,
} from '../lib/customerModuleAccessClient';
import {
  ACCESS_ACTIONS,
  ACCESS_ACTION_LABELS,
  ACCESS_MODULES,
  ACCESS_MODULE_LABELS,
  MODULE_SECTION_KEYS,
} from '../lib/businessAccess';
import {
  CUSTOMER_MODULE_META,
  CUSTOMER_MODULE_SECTIONS,
  CUSTOMER_VISIBLE_MODULE_KEYS,
  type CustomerModuleKey,
} from '../lib/customerModuleMeta';
import { fetchBusinessMembers, setBusinessMemberAccess, type BusinessMember } from '../lib/businessClient';
import { buildAuthHeaders } from '../lib/supabaseClient';

/**
 * Administrator console for every per-user permission grant.
 *
 * Two independent scopes live here because the product stores them in two
 * different tables with two different shapes:
 *   * customer marketplace modules (`customer_module_access`, one row per
 *     module with its own section and action arrays);
 *   * business members (`business_member_access`, one row per member across
 *     all modules).
 *
 * Neither can be edited from the other, and the server re-verifies the admin
 * session on every read and write. Every save, copy, reset and revoke is
 * recorded in the audit trail shown beside the editor.
 */

type Scope = 'customers' | 'members';

interface GuardEntry {
  enabled: boolean;
  expiresAt: string;
  /** Empty means every section. */
  sections: string[];
  /** Empty means every action. */
  actions: string[];
}

type CustomerDraft = Record<CustomerModuleKey, GuardEntry>;
type MemberDraft = Record<string, GuardEntry>;

const EMPTY_ENTRY: GuardEntry = { enabled: false, expiresAt: '', sections: [], actions: [] };

function customerDraftEmpty(): CustomerDraft {
  return Object.fromEntries(
    CUSTOMER_VISIBLE_MODULE_KEYS.map((key) => [key, { ...EMPTY_ENTRY }]),
  ) as CustomerDraft;
}

function customerDraftFrom(grants: CustomerModuleGrant[]): CustomerDraft {
  const next = customerDraftEmpty();
  for (const grant of grants) {
    if (!(CUSTOMER_VISIBLE_MODULE_KEYS as readonly string[]).includes(grant.moduleKey)) continue;
    next[grant.moduleKey as CustomerModuleKey] = {
      enabled: true,
      expiresAt: grant.expiresAt ? grant.expiresAt.slice(0, 16) : '',
      sections: Array.isArray(grant.sections) ? grant.sections : [],
      actions: Array.isArray(grant.actions) ? grant.actions : [],
    };
  }
  return next;
}

function memberDraftFrom(member: BusinessMember | null): MemberDraft {
  const next: MemberDraft = {};
  for (const moduleKey of ACCESS_MODULES) {
    const unrestricted = !member || !Array.isArray(member.allowed_modules);
    next[moduleKey] = {
      enabled: unrestricted ? true : member.allowed_modules!.includes(moduleKey),
      expiresAt: '',
      sections: member?.allowed_sections?.[moduleKey] ?? [],
      actions: member?.allowed_actions?.[moduleKey] ?? [],
    };
  }
  return next;
}

/** Toggling the last missing chip collapses the list to `[]` (= everything). */
function toggleChip(list: string[], value: string, universe: readonly string[]): string[] {
  const next = list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  if (next.length === 0 || next.length === universe.length) return [];
  return next;
}

function chipActive(list: string[], value: string): boolean {
  return list.length === 0 || list.includes(value);
}

/** One module card: enable switch, section chips and action chips. */
function ModuleCard({
  title,
  subtitle,
  emoji,
  sectionOptions,
  entry,
  disabled,
  onToggle,
  onExpires,
  onSection,
  onAction,
  onAllSections,
  onAllActions,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  sectionOptions: ReadonlyArray<{ key: string; label: string }>;
  entry: GuardEntry;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  onExpires: (value: string) => void;
  onSection: (key: string) => void;
  onAction: (key: string) => void;
  onAllSections: () => void;
  onAllActions: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        entry.enabled
          ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/25'
          : 'border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-lg" aria-hidden="true">{emoji}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{title}</p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={entry.enabled}
          aria-label={`${title} access`}
          disabled={disabled}
          onClick={() => onToggle(!entry.enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
            entry.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
              entry.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {entry.enabled && (
        <div className="mt-2.5 space-y-2 border-t border-emerald-200/70 pt-2.5 dark:border-emerald-900/50">
          {sectionOptions.length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Sections</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onAllSections}
                  className="text-[9px] font-black text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-300"
                >
                  {entry.sections.length === 0 ? 'Restrict to one' : 'Allow all'}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {sectionOptions.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    aria-pressed={chipActive(entry.sections, section.key)}
                    disabled={disabled}
                    onClick={() => onSection(section.key)}
                    className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition disabled:opacity-50 ${
                      chipActive(entry.sections, section.key)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700'
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Actions</span>
              <button
                type="button"
                disabled={disabled}
                onClick={onAllActions}
                className="text-[9px] font-black text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-300"
              >
                {entry.actions.length === 0 ? 'Restrict actions' : 'Allow all'}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {ACCESS_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={chipActive(entry.actions, action)}
                  disabled={disabled}
                  title={ACCESS_ACTION_LABELS[action]}
                  onClick={() => onAction(action)}
                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase transition disabled:opacity-50 ${
                    chipActive(entry.actions, action)
                      ? 'bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-white text-slate-400 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">Expires</span>
            <input
              type="datetime-local"
              value={entry.expiresAt}
              min={new Date().toISOString().slice(0, 16)}
              disabled={disabled}
              onChange={(event) => onExpires(event.target.value)}
              className="ml-auto w-40 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface Confirmation {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => Promise<void>;
}

export function AdminUserPermissions() {
  const [scope, setScope] = useState<Scope>('customers');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // ---- customer scope -----------------------------------------------------
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [grantedFilter, setGrantedFilter] = useState('');
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomer | null>(null);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(() => customerDraftEmpty());
  const [copySource, setCopySource] = useState('');

  // ---- member scope -------------------------------------------------------
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string; module_type: string }>>([]);
  const [businessId, setBusinessId] = useState('');
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<BusinessMember | null>(null);
  const [memberDraft, setMemberDraft] = useState<MemberDraft>(() => memberDraftFrom(null));
  const [memberCopySource, setMemberCopySource] = useState('');

  // ---- shared -------------------------------------------------------------
  const [history, setHistory] = useState<PermissionHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }, []);

  const loadCustomers = useCallback(async () => {
    setBusy(true);
    setError('');
    const result = await fetchAdminCustomerModuleAccess({
      query,
      limit: 50,
      module: moduleFilter || undefined,
      granted: grantedFilter || undefined,
    });
    if (result.ok && result.customers) {
      setCustomers(result.customers);
      setCustomerTotal(result.total || 0);
    } else {
      setError(
        result.error === 'FORBIDDEN_ADMIN_ONLY'
          ? 'Only an administrator can manage permissions.'
          : 'Permission data is unavailable on this deployment.',
      );
    }
    setBusy(false);
  }, [query, moduleFilter, grantedFilter]);

  useEffect(() => {
    if (scope !== 'customers') return;
    void loadCustomers();
  }, [scope, loadCustomers]);

  useEffect(() => {
    setCustomerDraft(selectedCustomer ? customerDraftFrom(selectedCustomer.modules) : customerDraftEmpty());
    setCopySource('');
  }, [selectedCustomer]);

  useEffect(() => {
    setMemberDraft(memberDraftFrom(selectedMember));
    setMemberCopySource('');
  }, [selectedMember]);

  const loadBusinesses = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/businesses', {
        headers: { ...buildAuthHeaders(), accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
      const rows = Array.isArray(data.businesses) ? data.businesses : [];
      setBusinesses(rows);
      if (!businessId && rows.length > 0) setBusinessId(String(rows[0].id));
    } catch {
      setError('Businesses are unavailable on this deployment.');
    }
  }, [businessId]);

  useEffect(() => {
    if (scope !== 'members') return;
    void loadBusinesses();
  }, [scope, loadBusinesses]);

  const loadMembers = useCallback(async (id: string) => {
    if (!id) {
      setMembers([]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const rows = await fetchBusinessMembers(id);
      setMembers(rows);
    } catch {
      setError('Members are unavailable for this business.');
      setMembers([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setSelectedMember(null);
    void loadMembers(businessId);
  }, [businessId, loadMembers]);

  const activeUserId = scope === 'customers' ? selectedCustomer?.id || '' : selectedMember?.user_id || '';

  const loadHistory = useCallback(async () => {
    if (!activeUserId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    const result = await fetchAdminPermissionHistory(activeUserId);
    setHistory(result.ok ? result.history || [] : []);
    setHistoryLoading(false);
  }, [activeUserId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const customerModuleKeys = useMemo(
    () => CUSTOMER_VISIBLE_MODULE_KEYS.filter((key) => customerDraft[key]?.enabled),
    [customerDraft],
  );

  const enabledModules = (): string[] => {
    if (scope === 'customers') return customerModuleKeys;
    return ACCESS_MODULES.filter((moduleKey) => memberDraft[moduleKey]?.enabled);
  };

  const setAllEnabled = (enabled: boolean) => {
    if (scope === 'customers') {
      setCustomerDraft((previous) =>
        Object.fromEntries(
          CUSTOMER_VISIBLE_MODULE_KEYS.map((key) => [
            key,
            enabled ? { ...previous[key], enabled: true } : { ...EMPTY_ENTRY },
          ]),
        ) as CustomerDraft,
      );
      return;
    }
    setMemberDraft((previous) =>
      Object.fromEntries(
        ACCESS_MODULES.map((moduleKey) => [
          moduleKey,
          enabled ? { ...previous[moduleKey], enabled: true } : { ...EMPTY_ENTRY },
        ]),
      ) as MemberDraft,
    );
  };

  const saveCustomer = async () => {
    if (!selectedCustomer || busy) return;
    const modules: CustomerModuleGrant[] = CUSTOMER_VISIBLE_MODULE_KEYS.filter(
      (key) => customerDraft[key].enabled,
    ).map((key) => ({
      moduleKey: key,
      expiresAt: customerDraft[key].expiresAt ? new Date(customerDraft[key].expiresAt).toISOString() : null,
      sections: customerDraft[key].sections,
      actions: customerDraft[key].actions,
    }));
    if (modules.length === 0) {
      setError('Enable at least one module, or use Revoke all to remove every grant.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await saveAdminCustomerModuleAccess(selectedCustomer.id, modules);
    if (result.ok) {
      const saved = result.modules || [];
      setSelectedCustomer((previous) => (previous ? { ...previous, modules: saved } : previous));
      setCustomers((previous) =>
        previous.map((row) => (row.id === selectedCustomer.id ? { ...row, modules: saved } : row)),
      );
      window.dispatchEvent(new CustomEvent('bos-customer-modules-updated'));
      flash('Customer permissions saved.');
      void loadHistory();
    } else {
      setError(result.message || 'Permissions could not be saved.');
    }
    setBusy(false);
  };

  const saveMember = async () => {
    if (!selectedMember || !businessId || busy) return;
    const allowedModules = ACCESS_MODULES.filter((moduleKey) => memberDraft[moduleKey]?.enabled);
    if (allowedModules.length === 0) {
      setError('A business member must keep at least one module. Use Restore full access to clear the restriction instead.');
      return;
    }
    const allowedSections: Record<string, string[]> = {};
    const allowedActions: Record<string, string[]> = {};
    for (const moduleKey of allowedModules) {
      const entry = memberDraft[moduleKey];
      if (entry.sections.length > 0) allowedSections[moduleKey] = entry.sections;
      if (entry.actions.length > 0) allowedActions[moduleKey] = entry.actions;
    }
    setBusy(true);
    setError('');
    try {
      await setBusinessMemberAccess(businessId, selectedMember.user_id, {
        allowedModules: [...allowedModules],
        allowedSections,
        allowedActions,
      });
      flash('Member permissions saved.');
      await loadMembers(businessId);
      void loadHistory();
    } catch {
      setError('Permissions could not be saved.');
    }
    setBusy(false);
  };

  const runReset = async () => {
    setBusy(true);
    setError('');
    try {
      if (scope === 'customers' && selectedCustomer) {
        const result = await resetAdminPermissions({ scope: 'customer', userId: selectedCustomer.id });
        if (!result.ok) throw new Error(result.error);
        setSelectedCustomer((previous) =>
          previous
            ? {
                ...previous,
                modules: (result.modules || []).map((moduleKey) => ({
                  moduleKey: moduleKey as CustomerModuleKey,
                  expiresAt: null,
                  sections: [],
                  actions: [],
                })),
              }
            : previous,
        );
        window.dispatchEvent(new CustomEvent('bos-customer-modules-updated'));
        void loadCustomers();
        flash('Restored full access for every enabled module.');
      } else if (scope === 'members' && selectedMember) {
        const result = await resetAdminPermissions({
          scope: 'member',
          userId: selectedMember.user_id,
          businessId,
        });
        if (!result.ok) throw new Error(result.error);
        await loadMembers(businessId);
        flash('Member restriction cleared — full business access restored.');
      }
      void loadHistory();
    } catch {
      setError('Permissions could not be reset.');
    }
    setBusy(false);
    setConfirmation(null);
  };

  const runRevokeAll = async () => {
    if (!selectedCustomer) return;
    setBusy(true);
    setError('');
    const result = await revokeAdminCustomerModuleAccess(selectedCustomer.id);
    if (result.ok) {
      setSelectedCustomer((previous) => (previous ? { ...previous, modules: [] } : previous));
      window.dispatchEvent(new CustomEvent('bos-customer-modules-updated'));
      void loadCustomers();
      flash('Every customer grant revoked.');
      void loadHistory();
    } else {
      setError('Grants could not be revoked.');
    }
    setBusy(false);
    setConfirmation(null);
  };

  const runCopy = async () => {
    setBusy(true);
    setError('');
    try {
      if (scope === 'customers' && selectedCustomer && copySource) {
        const result = await copyAdminPermissions({
          scope: 'customer',
          fromUserId: copySource,
          toUserId: selectedCustomer.id,
        });
        if (!result.ok) throw new Error(result.error);
        window.dispatchEvent(new CustomEvent('bos-customer-modules-updated'));
        await loadCustomers();
        const refreshed = await fetchAdminCustomerModuleAccess({ query, limit: 50 });
        const updated = refreshed.customers?.find((row) => row.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
        flash(`Copied ${result.copiedModules?.length || 0} module grant(s).`);
      } else if (scope === 'members' && selectedMember && memberCopySource) {
        const result = await copyAdminPermissions({
          scope: 'member',
          fromUserId: memberCopySource,
          toUserId: selectedMember.user_id,
          businessId,
        });
        if (!result.ok) throw new Error(result.error);
        await loadMembers(businessId);
        flash(`Copied ${result.copiedModules?.length || 0} module grant(s).`);
      }
      void loadHistory();
    } catch {
      setError('Permissions could not be copied.');
    }
    setBusy(false);
    setConfirmation(null);
  };

  const customerSectionOptions = (key: CustomerModuleKey) => CUSTOMER_MODULE_SECTIONS[key] || [];

  const renderCustomerEditor = () => {
    if (!selectedCustomer) {
      return (
        <div className="flex h-full min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <div>
            <UserRound className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
              Select a customer to edit their module, section and action grants.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900 dark:text-white">{selectedCustomer.fullName}</p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{selectedCustomer.email}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ShieldCheck className="h-3 w-3 text-emerald-500" aria-hidden="true" /> {enabledModules().length} module(s)
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAllEnabled(true)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              Enable all
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAllEnabled(false)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Disable all
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {CUSTOMER_VISIBLE_MODULE_KEYS.map((key) => (
            <ModuleCard
              key={key}
              title={CUSTOMER_MODULE_META[key].label}
              subtitle={`${key} · ${customerSectionOptions(key).length} section(s)`}
              emoji={CUSTOMER_MODULE_META[key].emoji}
              sectionOptions={customerSectionOptions(key)}
              entry={customerDraft[key]}
              disabled={busy}
              onToggle={(next) =>
                setCustomerDraft((previous) => ({ ...previous, [key]: { ...previous[key], enabled: next } }))
              }
              onExpires={(value) =>
                setCustomerDraft((previous) => ({ ...previous, [key]: { ...previous[key], expiresAt: value } }))
              }
              onSection={(sectionKey) =>
                setCustomerDraft((previous) => ({
                  ...previous,
                  [key]: {
                    ...previous[key],
                    sections: toggleChip(previous[key].sections, sectionKey, customerSectionOptions(key).map((s) => s.key)),
                  },
                }))
              }
              onAction={(action) =>
                setCustomerDraft((previous) => ({
                  ...previous,
                  [key]: {
                    ...previous[key],
                    actions: toggleChip(previous[key].actions, action, ACCESS_ACTIONS),
                  },
                }))
              }
              onAllSections={() =>
                setCustomerDraft((previous) => ({ ...previous, [key]: { ...previous[key], sections: [] } }))
              }
              onAllActions={() =>
                setCustomerDraft((previous) => ({ ...previous, [key]: { ...previous[key], actions: [] } }))
              }
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveCustomer()}
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B8F76] px-3 text-xs font-black text-white transition hover:bg-[#3730a3] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Save permissions
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setConfirmation({
                title: 'Restore full access?',
                body: `${selectedCustomer.fullName} will be granted every currently enabled module with no section or action limit. This replaces their current grants.`,
                confirmLabel: 'Restore full access',
                run: runReset,
              })
            }
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset to full
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setConfirmation({
                title: 'Revoke every grant?',
                body: `${selectedCustomer.fullName} will lose access to every marketplace module until you grant one again.`,
                confirmLabel: 'Revoke all grants',
                danger: true,
                run: runRevokeAll,
              })
            }
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Revoke all
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <select
              value={copySource}
              disabled={busy}
              onChange={(event) => setCopySource(event.target.value)}
              className="h-9 max-w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              aria-label="Copy permissions from another customer"
            >
              <option value="">Copy from…</option>
              {customers
                .filter((row) => row.id !== selectedCustomer.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.fullName} ({row.modules.length})
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={busy || !copySource}
              onClick={() => {
                const source = customers.find((row) => row.id === copySource);
                setConfirmation({
                  title: 'Copy permissions?',
                  body: `${selectedCustomer.fullName} will receive exactly the grants currently held by ${source?.fullName || 'the selected customer'}. Their existing grants are replaced.`,
                  confirmLabel: 'Copy permissions',
                  run: runCopy,
                });
              }}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMemberEditor = () => {
    if (!businessId) {
      return (
        <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center text-xs font-semibold text-slate-400 dark:border-slate-700">
          Create a business first — permissions belong to a business member.
        </div>
      );
    }
    if (!selectedMember) {
      return (
        <div className="flex h-full min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <div>
            <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
              Select a business member to edit their section and action grants.
            </p>
          </div>
        </div>
      );
    }
    const unrestricted = !Array.isArray(selectedMember.allowed_modules);
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900 dark:text-white">
              {selectedMember.full_name || selectedMember.email || selectedMember.user_id}
            </p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
              {selectedMember.role} · {unrestricted ? 'full business access' : 'restricted'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => setAllEnabled(true)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              Enable all
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAllEnabled(false)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>

        {unrestricted && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            This member has no restrictions. Saving will replace that with exactly the modules, sections and actions selected below.
          </p>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ACCESS_MODULES.map((moduleKey) => (
            <ModuleCard
              key={moduleKey}
              title={ACCESS_MODULE_LABELS[moduleKey]}
              subtitle={moduleKey}
              emoji="🔐"
              sectionOptions={MODULE_SECTION_KEYS[moduleKey] || []}
              entry={memberDraft[moduleKey] || EMPTY_ENTRY}
              disabled={busy}
              onToggle={(next) =>
                setMemberDraft((previous) => ({ ...previous, [moduleKey]: { ...previous[moduleKey], enabled: next } }))
              }
              onExpires={() => undefined}
              onSection={(sectionKey) =>
                setMemberDraft((previous) => ({
                  ...previous,
                  [moduleKey]: {
                    ...previous[moduleKey],
                    sections: toggleChip(
                      previous[moduleKey].sections,
                      sectionKey,
                      (MODULE_SECTION_KEYS[moduleKey] || []).map((section) => section.key),
                    ),
                  },
                }))
              }
              onAction={(action) =>
                setMemberDraft((previous) => ({
                  ...previous,
                  [moduleKey]: {
                    ...previous[moduleKey],
                    actions: toggleChip(previous[moduleKey].actions, action, ACCESS_ACTIONS),
                  },
                }))
              }
              onAllSections={() =>
                setMemberDraft((previous) => ({ ...previous, [moduleKey]: { ...previous[moduleKey], sections: [] } }))
              }
              onAllActions={() =>
                setMemberDraft((previous) => ({ ...previous, [moduleKey]: { ...previous[moduleKey], actions: [] } }))
              }
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveMember()}
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0B8F76] px-3 text-xs font-black text-white transition hover:bg-[#3730a3] disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Save permissions
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setConfirmation({
                title: 'Remove the restriction?',
                body: `${selectedMember.full_name || selectedMember.email || 'This member'} will regain full business access — every module, section and action.`,
                confirmLabel: 'Restore full access',
                run: runReset,
              })
            }
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ShieldOff className="h-4 w-4" aria-hidden="true" /> Restore full access
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <select
              value={memberCopySource}
              disabled={busy}
              onChange={(event) => setMemberCopySource(event.target.value)}
              className="h-9 max-w-[190px] rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              aria-label="Copy permissions from another member"
            >
              <option value="">Copy from…</option>
              {members
                .filter((row) => row.user_id !== selectedMember.user_id && row.role !== 'owner')
                .map((row) => (
                  <option key={row.user_id} value={row.user_id}>
                    {row.full_name || row.email || row.user_id}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={busy || !memberCopySource}
              onClick={() => {
                const source = members.find((row) => row.user_id === memberCopySource);
                setConfirmation({
                  title: 'Copy member permissions?',
                  body: `${selectedMember.full_name || selectedMember.email || 'The selected member'} will receive exactly the grants held by ${source?.full_name || source?.email || 'the selected member'}.`,
                  confirmLabel: 'Copy permissions',
                  run: runCopy,
                });
              }}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#f97316]">Access control</span>
          <h3 className="mt-1 flex items-center gap-2 text-base font-black text-slate-900 dark:text-white sm:text-lg">
            <KeyRound className="h-4 w-4 text-[#0B8F76]" aria-hidden="true" /> User Permissions
          </h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            Grant modules, sections and actions per account. Customer grants and business-member grants are independent;
            the server enforces both and refuses anything not granted here.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {([
            ['customers', 'Customers'],
            ['members', 'Business members'],
          ] as Array<[Scope, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-black transition ${
                scope === value
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="text-[10px] font-black uppercase">Dismiss</button>
        </div>
      )}
      {!error && notice && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.4fr]">
        <div className="space-y-3">
          {scope === 'customers' ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadCustomers();
                }}
              >
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name or email"
                    className="h-10 w-full bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-[#f97316] px-3 text-xs font-black text-white transition hover:bg-[#ea580c]"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  Search
                </button>
              </form>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <select
                  value={moduleFilter}
                  onChange={(event) => setModuleFilter(event.target.value)}
                  aria-label="Filter by module"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <option value="">Any module</option>
                  {CUSTOMER_VISIBLE_MODULE_KEYS.map((key) => (
                    <option key={key} value={key}>{CUSTOMER_MODULE_META[key].label}</option>
                  ))}
                </select>
                <select
                  value={grantedFilter}
                  onChange={(event) => setGrantedFilter(event.target.value)}
                  aria-label="Filter by grant state"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <option value="">Any grant state</option>
                  <option value="yes">Has grants</option>
                  <option value="no">No grants</option>
                </select>
              </div>

              <p className="mt-2 text-[10px] font-semibold text-slate-400">{customerTotal} customer(s)</p>

              <div className="mt-2 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => setSelectedCustomer(customer)}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      selectedCustomer?.id === customer.id
                        ? 'border-[#0B8F76] bg-teal-50/70 dark:bg-indigo-950/20'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800'
                    }`}
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
                        {customer.modules.length}/{CUSTOMER_VISIBLE_MODULE_KEYS.length}
                      </span>
                    </div>
                  </button>
                ))}
                {!busy && customers.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-700">
                    No customers match this filter.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400" htmlFor="permission-business">
                Business
              </label>
              <select
                id="permission-business"
                value={businessId}
                onChange={(event) => setBusinessId(event.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">Select a business…</option>
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name} · {business.module_type}
                  </option>
                ))}
              </select>

              <div className="mt-3 max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
                {members.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => setSelectedMember(member)}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      selectedMember?.user_id === member.user_id
                        ? 'border-[#0B8F76] bg-teal-50/70 dark:bg-indigo-950/20'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-xs dark:bg-slate-900 dark:text-slate-300">
                        <Users className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                          {member.full_name || member.email || member.user_id}
                        </p>
                        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {member.role} · {Array.isArray(member.allowed_modules) ? 'restricted' : 'full access'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
                {!busy && businessId && members.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-700">
                    This business has no members yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* History — one account at a time, both scopes. */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <h4 className="text-xs font-black text-slate-900 dark:text-white">Change history</h4>
              </div>
              <button
                type="button"
                onClick={() => void loadHistory()}
                disabled={!activeUserId || historyLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-black text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              >
                <History className={`h-3 w-3 ${historyLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
              </button>
            </div>
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {history.map((entry) => (
                <div key={`${entry.scope}-${entry.id}`} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] dark:bg-slate-800/50">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-black uppercase ${
                        /revoke/.test(entry.action)
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : /update|changed|copy|reset/.test(entry.action)
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {entry.action.replace('business.member_access_', '')}
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{entry.moduleKey || entry.scope}</span>
                    <span className="ml-auto text-slate-400">{entry.actor || 'system'}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-slate-500 dark:text-slate-400">
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    {entry.sections.length > 0 && <span>· {entry.sections.length} section(s)</span>}
                    {entry.actions.length > 0 && <span>· {entry.actions.join(', ')}</span>}
                    {entry.expiresAt && <span>· until {new Date(entry.expiresAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-[10px] font-semibold text-slate-400 dark:border-slate-700">
                  {activeUserId ? 'No changes recorded yet.' : 'Select an account to see its history.'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div>{scope === 'customers' ? renderCustomerEditor() : renderMemberEditor()}</div>
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label={confirmation.title}>
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-sm font-black text-slate-900 dark:text-white">{confirmation.title}</h4>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">{confirmation.body}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="min-h-[36px] rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmation.run()}
                className={`flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-black text-white disabled:opacity-50 ${
                  confirmation.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0B8F76] hover:bg-[#3730a3]'
                }`}
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
