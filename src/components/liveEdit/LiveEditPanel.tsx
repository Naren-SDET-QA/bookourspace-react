import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Loader2,
  Lock,
  RefreshCw,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  authorityModules,
  canEditListing,
  createSupabaseLiveEditAuthorityDeps,
  describeAuthority,
  resolveLiveEditAuthority,
  type LiveEditAuthorityDeps,
} from '../../lib/liveEdit/authority';
import {
  createSupabaseLiveEditAuditSink,
  type LiveEditAuditSink,
} from '../../lib/liveEdit/audit';
import {
  createLiveEditRepository,
  createServerBackedLiveEditDeps,
  type LiveEditRepository,
} from '../../lib/liveEdit/repository';
import { probeLiveEditIntegration } from '../../lib/liveEdit/integration';
import { draftFromListing, listingFromRow } from '../../lib/liveEdit/mapping';
import { subscribeToLiveEditChanges, type LiveEditRealtimeStatus } from '../../lib/liveEdit/realtime';
import { hasUnsavedChanges, validateLiveEditDraft } from '../../lib/liveEdit/validation';
import {
  LIVE_EDIT_MODULES,
  LIVE_EDIT_MODULE_ICONS,
  LIVE_EDIT_MODULE_LABELS,
  type LiveEditAuditEvent,
  type LiveEditAuthority,
  type LiveEditDraft,
  type LiveEditIntegrationStatus,
  type LiveEditListing,
  type LiveEditModule,
} from '../../lib/liveEdit/types';
import { LiveEditForm, type LiveEditFeedback } from './LiveEditForm';

export interface LiveEditPanelDeps {
  authorityDeps: LiveEditAuthorityDeps;
  createRepository(authority: LiveEditAuthority): LiveEditRepository;
  probeIntegration(): Promise<LiveEditIntegrationStatus>;
  auditSink: LiveEditAuditSink;
  subscribe?: typeof subscribeToLiveEditChanges;
}

export type LiveEditPanelDepsOverrides = Partial<LiveEditPanelDeps>;

export interface LiveEditPanelProps {
  open: boolean;
  onClose(): void;
  initialModule?: LiveEditModule;
  deps?: LiveEditPanelDepsOverrides;
}

function buildDefaultDeps(overrides: LiveEditPanelDepsOverrides | undefined): LiveEditPanelDeps {
  const auditSink = overrides?.auditSink ?? createSupabaseLiveEditAuditSink();
  return {
    authorityDeps: overrides?.authorityDeps ?? createSupabaseLiveEditAuthorityDeps(),
    createRepository:
      overrides?.createRepository ??
      (() => createLiveEditRepository({ deps: createServerBackedLiveEditDeps() })),
    probeIntegration: overrides?.probeIntegration ?? (() => probeLiveEditIntegration()),
    auditSink,
    subscribe: overrides?.subscribe ?? subscribeToLiveEditChanges,
  };
}

function statusChipTone(status: 'ready' | 'missing' | 'unknown'): string {
  if (status === 'ready') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200';
  if (status === 'missing') return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

function integrationSummary(integration: LiveEditIntegrationStatus): string {
  if (integration.listingsTable === 'missing') return 'Supabase schema missing · writes BLOCKED';
  if (integration.auditTable === 'missing') return 'Audit table missing · audit BLOCKED';
  if (integration.assignmentsTable === 'missing') return 'Assignments missing · admin scope BLOCKED';
  return 'Integration objects available';
}

export function LiveEditPanel({ open, onClose, initialModule, deps: depsOverrides }: LiveEditPanelProps) {
  const depsRef = useRef<LiveEditPanelDeps | null>(null);
  if (!depsRef.current) depsRef.current = buildDefaultDeps(depsOverrides);
  const deps = depsRef.current;

  const [phase, setPhase] = useState<'idle' | 'authorizing' | 'ready' | 'denied' | 'error'>('idle');
  const [authority, setAuthority] = useState<LiveEditAuthority | null>(null);
  const [authorityError, setAuthorityError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<LiveEditIntegrationStatus | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [module, setModule] = useState<LiveEditModule>(initialModule ?? 'pg_hostels');
  const [listings, setListings] = useState<LiveEditListing[]>([]);
  const [listPhase, setListPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [listMessage, setListMessage] = useState('');
  const [listBlocked, setListBlocked] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [originalDraft, setOriginalDraft] = useState<LiveEditDraft | null>(null);
  const [draft, setDraft] = useState<LiveEditDraft | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [pendingReload, setPendingReload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<LiveEditFeedback | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<LiveEditAuditEvent[]>([]);
  const [auditListMessage, setAuditListMessage] = useState<string | null>(null);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState<LiveEditRealtimeStatus>('closed');
  const [realtimeMessage, setRealtimeMessage] = useState<string>('');
  const [conflict, setConflict] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedListing = useMemo(
    () => listings.find((listing) => listing.id === selectedId) || null,
    [listings, selectedId]
  );
  const allowedModules = useMemo(() => authorityModules(authority), [authority]);
  const dirty = Boolean(originalDraft && draft && hasUnsavedChanges(originalDraft, draft));
  const liveValidation = useMemo(
    () => (draft ? validateLiveEditDraft(module, draft) : null),
    [module, draft]
  );
  const permission = useMemo(
    () => (authority && selectedListing ? canEditListing(authority, selectedListing) : null),
    [authority, selectedListing]
  );

  const stateRef = useRef({
    dirty: false,
    saving: false,
    selectedId: null as string | null,
    module,
    listings: [] as LiveEditListing[],
  });
  stateRef.current = { dirty, saving, selectedId, module, listings };

  const repository = useMemo(
    () => (authority?.ok ? deps.createRepository(authority) : null),
    [authority, deps]
  );

  const selectListing = useCallback((listing: LiveEditListing) => {
    const nextDraft = draftFromListing(listing);
    setSelectedId(listing.id);
    setOriginalDraft(nextDraft);
    setDraft(nextDraft);
    setTouched(new Set());
    setShowErrors(false);
    setPendingSwitchId(null);
    setFeedback(null);
    setAuditNotice(null);
    setConflict(false);
  }, []);

  const resetForNewSearch = useCallback(() => {
    setSelectedId(null);
    setOriginalDraft(null);
    setDraft(null);
    setFeedback(null);
    setAuditNotice(null);
  }, []);

  // 1. Verify identity and read the integration status.
  useEffect(() => {
    if (!open) {
      setPhase('idle');
      return;
    }
    let cancelled = false;
    setPhase('authorizing');
    setAuthority(null);
    setAuthorityError(null);
    setIntegrationError(null);
    setIntegration(null);
    resetForNewSearch();

    void (async () => {
      try {
        const resolved = await resolveLiveEditAuthority(deps.authorityDeps);
        if (cancelled) return;
        setAuthority(resolved);
        if (resolved.ok) {
          const allowed = authorityModules(resolved);
          setModule((current) => {
            const preferred = initialModule && allowed.includes(initialModule) ? initialModule : null;
            if (preferred) return preferred;
            return allowed.includes(current) ? current : allowed[0];
          });
          setPhase('ready');
        } else {
          setPhase('denied');
        }
      } catch (error) {
        if (cancelled) return;
        setAuthorityError(
          error instanceof Error ? error.message : 'Identity verification failed before any data was read.'
        );
        setPhase('error');
      }
      try {
        const status = await deps.probeIntegration();
        if (!cancelled) setIntegration(status);
      } catch (error) {
        if (!cancelled) {
          setIntegrationError(
            error instanceof Error ? error.message : 'The integration probe could not run.'
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reloadKey, deps, initialModule, resetForNewSearch]);

  // 2. Load the editable listings for the active module.
  useEffect(() => {
    if (!open || !authority?.ok || !repository) return;
    let cancelled = false;
    setListPhase('loading');
    setListMessage('');
    setListBlocked(false);
    setListings([]);
    setSelectedId(null);
    setOriginalDraft(null);
    setDraft(null);
    setFeedback(null);
    setAuditNotice(null);
    setPendingSwitchId(null);
    setConflict(false);
    setTouched(new Set());
    setShowErrors(false);

    void (async () => {
      const result = await repository.list(authority, module);
      if (cancelled) return;
      if (!result.ok) {
        setListPhase('error');
        setListMessage(result.message);
        setListBlocked(result.blocked);
        return;
      }
      setListings(result.listings);
      setListPhase('ready');
      setListMessage(result.message);
      setListBlocked(false);
      if (result.listings[0]) selectListing(result.listings[0]);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, authority, repository, module, reloadKey, selectListing]);

  // 3. Audit history for the selected listing (read-only; BLOCKED is surfaced).
  useEffect(() => {
    if (!open || !selectedId) {
      setAuditEvents([]);
      setAuditListMessage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await deps.auditSink.list(selectedId, 10);
      if (cancelled) return;
      setAuditEvents(result.events);
      setAuditListMessage(result.ok ? null : result.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, deps, reloadKey, auditRefreshKey]);

  // 4. Realtime: refresh a clean selection, warn about a dirty one.
  useEffect(() => {
    if (!open || !authority?.ok || !deps.subscribe) return;
    const unsubscribe = deps.subscribe({
      onStatus: (status, message) => {
        setRealtimeStatus(status);
        setRealtimeMessage(message || '');
      },
      onListingChange: (change) => {
        // Ignore echoes of our own in-flight write; the save handler owns that state.
        if (stateRef.current.saving) return;
        if (change.module && change.module !== stateRef.current.module) return;
        if (change.listingId !== stateRef.current.selectedId) return;
        if (change.eventType === 'DELETE') {
          setListings((previous) => previous.filter((listing) => listing.id !== change.listingId));
          setConflict(true);
          setFeedback({
            tone: 'warning',
            text: 'This listing was removed elsewhere. Reload the module before saving.',
          });
          return;
        }
        if (stateRef.current.dirty) {
          setConflict(true);
          setFeedback({
            tone: 'warning',
            text: 'This listing changed elsewhere. Reload to compare before saving; your unsaved edits were kept.',
          });
          return;
        }
        const mapped = listingFromRow(change.row as unknown as Parameters<typeof listingFromRow>[0]);
        if (!mapped) return;
        setListings((previous) =>
          previous.map((listing) => (listing.id === mapped.id ? mapped : listing))
        );
        // Refresh the form from the database but keep the last save/audit
        // feedback visible; clearing it here would make a confirmed save look
        // like it never happened when the Realtime echo lands.
        const nextDraft = draftFromListing(mapped);
        setSelectedId(mapped.id);
        setOriginalDraft(nextDraft);
        setDraft(nextDraft);
        setTouched(new Set());
        setShowErrors(false);
        setConflict(false);
        setFeedback((current) =>
          current?.tone === 'success' || current?.tone === 'warning'
            ? current
            : { tone: 'info', text: 'Updated in realtime from the database.' }
        );
      },
    });
    return unsubscribe;
  }, [open, authority, deps]);

  // 5. Modal ergonomics: close on Escape and lock the background scroll.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const visibleErrors = useMemo(() => {
    if (!liveValidation) return {};
    if (showErrors) return liveValidation.errors;
    const result: Record<string, string> = {};
    for (const [path, message] of Object.entries(liveValidation.errors)) {
      if ([...touched].some((entry) => path === entry || path.startsWith(`${entry}.`) || entry.startsWith(`${path}.`))) {
        result[path] = message;
      }
    }
    return result;
  }, [liveValidation, showErrors, touched]);

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return listings;
    return listings.filter((listing) =>
      `${listing.title} ${listing.categoryId} ${listing.subcategory}`.toLowerCase().includes(term)
    );
  }, [listings, search]);

  const categoryOptions = useMemo(
    () => [...new Set(listings.map((listing) => listing.categoryId))].sort(),
    [listings]
  );
  const subcategoryOptions = useMemo(
    () => [...new Set(listings.map((listing) => listing.subcategory))].sort().slice(0, 50),
    [listings]
  );

  const requestSelect = (listing: LiveEditListing) => {
    if (dirty && listing.id !== selectedId) {
      setPendingSwitchId(listing.id);
      return;
    }
    selectListing(listing);
  };

  const discardAndSwitch = () => {
    const target = listings.find((listing) => listing.id === pendingSwitchId);
    if (target) selectListing(target);
    setPendingSwitchId(null);
  };

  const handleDraftChange = (next: LiveEditDraft, changedPath: string) => {
    setDraft(next);
    setTouched((previous) => {
      const updated = new Set(previous);
      updated.add(changedPath);
      return updated;
    });
    if (feedback?.tone === 'error') setFeedback(null);
  };

  const handleCancel = () => {
    if (!originalDraft) return;
    setDraft(originalDraft);
    setTouched(new Set());
    setShowErrors(false);
    setFeedback({ tone: 'info', text: 'Unsaved changes discarded.' });
    setConflict(false);
  };

  const handleReload = () => {
    if (dirty) {
      setPendingReload(true);
      return;
    }
    setReloadKey((value) => value + 1);
    setFeedback({ tone: 'info', text: 'Reloading the verified listing state…' });
  };

  const confirmReload = () => {
    setPendingReload(false);
    setPendingSwitchId(null);
    setReloadKey((value) => value + 1);
    setFeedback({ tone: 'info', text: 'Reloading the verified listing state…' });
  };

  const handleSave = async () => {
    if (!authority?.ok || !repository || !selectedListing || !draft) return;
    setShowErrors(true);
    const validation = validateLiveEditDraft(module, draft);
    if (!validation.ok) {
      setFeedback({ tone: 'error', text: 'Fix the highlighted fields before saving. Nothing was sent to the server.' });
      return;
    }
    if (!dirty) {
      setFeedback({ tone: 'info', text: 'There are no changes to save.' });
      return;
    }
    if (conflict) {
      setFeedback({
        tone: 'warning',
        text: 'This listing changed elsewhere. Reload before saving so you do not overwrite newer data.',
      });
      return;
    }
    stateRef.current.saving = true;
    setSaving(true);
    setFeedback(null);
    setAuditNotice(null);
    try {
      const result = await repository.save(authority, selectedListing, validation.draft);
      if (result.status !== 'saved' || !result.persisted) {
        setFeedback({ tone: 'error', text: result.message });
        return;
      }
      const saved = result.listing || selectedListing;
      setListings((previous) => previous.map((listing) => (listing.id === saved.id ? saved : listing)));
      setSelectedId(saved.id);
      const savedDraft = draftFromListing(saved);
      setOriginalDraft(savedDraft);
      setDraft(savedDraft);
      setTouched(new Set());
      setShowErrors(false);
      setConflict(false);
      setAuditRefreshKey((value) => value + 1);
      if (result.audit.status === 'recorded') {
        setFeedback({ tone: 'success', text: result.message });
        setAuditNotice('Audit event recorded against your verified identity.');
      } else {
        setFeedback({
          tone: 'warning',
          text: `${result.message} ${result.audit.message}`,
        });
        setAuditNotice(
          result.audit.status === 'blocked'
            ? `Audit BLOCKED — ${result.audit.message}`
            : `Audit not recorded — ${result.audit.message}`
        );
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The save failed before the server confirmed anything.',
      });
    } finally {
      stateRef.current.saving = false;
      setSaving(false);
    }
  };

  if (!open) return null;

  const denied = authority && !authority.ok ? authority : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/60 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-edit-dialog-title"
        data-testid="live-edit-panel"
        className="flex h-full w-full max-w-6xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      >
        <header className="flex flex-wrap items-start gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-4 py-4 text-white dark:border-slate-800 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id="live-edit-dialog-title" className="text-base font-black sm:text-lg">
                Live Edit
              </h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-200">
                Secure · 6 modules
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-indigo-200/90">
              {authority && authority.ok
                ? `${describeAuthority(authority)}${authority.actor.email ? ` · ${authority.actor.email}` : ''}`
                : 'Verifying your server-side identity before loading any listing data.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
              <span
                data-testid="live-edit-integration-chip"
                className={`rounded-full px-2 py-0.5 ${
                  integration?.blocked
                    ? 'bg-amber-400 text-amber-950'
                    : integration
                      ? 'bg-emerald-400 text-emerald-950'
                      : 'bg-white/15 text-white'
                }`}
              >
                {integration ? integrationSummary(integration) : 'Checking integration…'}
              </span>
              <span
                data-testid="live-edit-realtime-chip"
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-white/90"
              >
                <Radio className="h-3 w-3" />
                Realtime: {realtimeStatus}
                {realtimeMessage ? ` · ${realtimeMessage}` : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReload}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-bold text-white hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Recheck
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Live Edit"
              className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {integration && integration.blocked ? (
          <div
            role="alert"
            data-testid="live-edit-integration-banner"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100 sm:px-6"
          >
            <div className="flex items-start gap-2">
              <Database className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p>Hosted integration is BLOCKED for at least one required object. No save is simulated.</p>
                <ul className="list-disc space-y-0.5 pl-4 font-medium">
                  {integration.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
                <p className="font-medium">
                  Object status: listings {integration.listingsTable} · audit {integration.auditTable} · assignments{' '}
                  {integration.assignmentsTable} · cinema {integration.cinemaStore}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {integrationError ? (
          <p role="status" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:px-6">
            Integration probe unavailable: {integrationError}
          </p>
        ) : null}

        {phase === 'authorizing' || phase === 'idle' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-slate-500" aria-busy="true">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
            <p className="text-xs font-semibold">Verifying your verified Supabase profile and scope…</p>
            <p className="max-w-md text-center text-[11px]">
              No role selector is consulted. Authority comes from the authenticated session and the protected profile row.
            </p>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <ShieldAlert className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-black text-slate-900 dark:text-white">Identity verification failed</p>
            <p role="alert" className="max-w-md text-center text-xs text-rose-700 dark:text-rose-300">
              {authorityError || 'The verified session could not be read.'}
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Retry verification
            </button>
          </div>
        ) : null}

        {phase === 'denied' && denied ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-sm font-black text-slate-900 dark:text-white">Live Edit is locked for this account</p>
            <p role="alert" data-testid="live-edit-denied" className="max-w-lg text-center text-xs text-slate-600 dark:text-slate-300">
              {denied.message}
            </p>
            <p className="rounded-full bg-slate-100 px-3 py-1 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {denied.code}
              {denied.blocked ? ' · BLOCKED' : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white"
              >
                <ShieldCheck className="h-4 w-4" /> Re-verify identity
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Close
              </button>
            </div>
            <p className="max-w-lg text-center text-[10px] text-slate-400">
              Super Admin, Admin and Provider scopes are read from the database. A client-side role switch cannot grant access.
            </p>
          </div>
        ) : null}

        {phase === 'ready' && authority?.ok ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40 lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">Modules</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible">
                  {LIVE_EDIT_MODULES.filter((candidate) => allowedModules.includes(candidate)).map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      data-testid={`live-edit-module-${candidate}`}
                      onClick={() => setModule(candidate)}
                      aria-pressed={module === candidate}
                      className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition ${
                        module === candidate
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      <span aria-hidden="true">{LIVE_EDIT_MODULE_ICONS[candidate]}</span>
                      <span className="truncate">{LIVE_EDIT_MODULE_LABELS[candidate]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    aria-label="Search editable listings"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search listings"
                    className="min-h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {listPhase === 'loading' ? (
                  <div className="flex items-center gap-2 rounded-xl bg-white p-3 text-[11px] font-semibold text-slate-500 dark:bg-slate-900" aria-busy="true">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    Loading verified listings…
                  </div>
                ) : null}
                {listPhase === 'error' ? (
                  <div role="alert" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                    <p>{listMessage}</p>
                    {listBlocked ? <p className="font-black uppercase">BLOCKED</p> : null}
                    <button
                      type="button"
                      onClick={handleReload}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-rose-600 px-2.5 text-[10px] font-bold text-white"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry
                    </button>
                  </div>
                ) : null}
                {listPhase === 'ready' && filteredListings.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-3 text-[11px] text-slate-500 dark:border-slate-700">
                    {listings.length === 0
                      ? 'No listings you are authorized to edit exist in this module.'
                      : 'No listing matches this search.'}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {filteredListings.map((listing) => {
                    const allowed = canEditListing(authority, listing).allowed;
                    return (
                      <li key={listing.id}>
                        <button
                          type="button"
                          onClick={() => requestSelect(listing)}
                          aria-current={listing.id === selectedId ? 'true' : undefined}
                          className={`w-full rounded-xl border px-2.5 py-2 text-left transition ${
                            listing.id === selectedId
                              ? 'border-indigo-500 bg-white shadow-sm dark:bg-slate-900'
                              : 'border-transparent hover:border-slate-300 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-900'
                          } ${allowed ? '' : 'opacity-50'}`}
                        >
                          <span className="flex items-center gap-1">
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900 dark:text-white">
                              {listing.title || listing.id}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-400">
                            {listing.categoryId} · ₹{listing.price.toLocaleString('en-IN')} {listing.priceUnit} ·{' '}
                            {listing.status.replaceAll('_', ' ')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="border-t border-slate-200 px-3 py-2 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {listMessage || `${listings.length} listing${listings.length === 1 ? '' : 's'}`}
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
              {pendingSwitchId ? (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span>You have unsaved changes. Discard them and switch listing?</span>
                  <button
                    type="button"
                    onClick={discardAndSwitch}
                    className="ml-auto min-h-8 rounded-lg bg-amber-600 px-2.5 text-[10px] font-bold text-white"
                  >
                    Discard &amp; switch
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingSwitchId(null)}
                    className="min-h-8 rounded-lg border border-amber-400 px-2.5 text-[10px] font-bold"
                  >
                    Stay
                  </button>
                </div>
              ) : null}

              {pendingReload ? (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Reloading discards your unsaved changes. Continue?</span>
                  <button
                    type="button"
                    onClick={confirmReload}
                    className="ml-auto min-h-8 rounded-lg bg-amber-600 px-2.5 text-[10px] font-bold text-white"
                  >
                    Discard &amp; reload
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingReload(false)}
                    className="min-h-8 rounded-lg border border-amber-400 px-2.5 text-[10px] font-bold"
                  >
                    Stay
                  </button>
                </div>
              ) : null}

              {conflict ? (
                <div role="alert" data-testid="live-edit-conflict" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span>This listing changed on another device. Reload before saving.</span>
                  <button
                    type="button"
                    onClick={handleReload}
                    className="ml-auto min-h-8 rounded-lg bg-rose-600 px-2.5 text-[10px] font-bold text-white"
                  >
                    Reload
                  </button>
                </div>
              ) : null}

              {selectedListing && draft && originalDraft ? (
                <div className="space-y-3">
                  <LiveEditForm
                    module={module}
                    listing={selectedListing}
                    draft={draft}
                    errors={visibleErrors}
                    capabilities={authority.capabilities}
                    readOnly={!permission?.allowed}
                    readOnlyReason={permission?.reason}
                    saving={saving}
                    dirty={dirty}
                    feedback={feedback}
                    auditNotice={auditNotice}
                    categoryOptions={categoryOptions}
                    subcategoryOptions={subcategoryOptions}
                    onDraftChange={handleDraftChange}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    onReload={handleReload}
                  />

                  <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">Audit trail</h4>
                      <span className="ml-auto text-[10px] font-semibold text-slate-400">
                        append-only · server identity
                      </span>
                    </div>
                    {auditListMessage ? (
                      <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        {auditListMessage}
                      </p>
                    ) : auditEvents.length === 0 ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        No recorded Live Edit audit events for this listing yet.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {auditEvents.map((event) => (
                          <li key={event.id} className="rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] dark:bg-slate-800/70">
                            <p className="font-bold text-slate-800 dark:text-slate-100">{event.summary}</p>
                            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                              {event.occurredAt.replace('T', ' ').slice(0, 19)} · fields: {event.changedFields.join(', ')}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              ) : listPhase === 'ready' ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
                  <ShieldCheck className="h-7 w-7 text-slate-400" />
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100">Select a listing to edit</p>
                  <p className="max-w-sm text-[11px] text-slate-500 dark:text-slate-400">
                    Only listings your verified account may edit are shown. Save is confirmed by a fresh server read before
                    success is displayed.
                  </p>
                </div>
              ) : null}
            </main>
          </div>
        ) : null}
      </div>
    </div>
  );
}

