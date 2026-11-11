import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCheck,
  FileCheck2,
  History,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  SERVICE_BOOKING_TYPES,
  SERVICE_DELIVERY_KINDS,
  SERVICE_DELIVERY_MODES,
  SERVICE_FIELD_TYPES,
  SERVICE_PROVIDER_ASSIGNMENTS,
  SERVICE_RECURRENCE_FREQUENCIES,
  SERVICE_TOGGLE_KEYS,
  SERVICE_PRICING_MODES,
  applyServiceCategoryHardRules,
  createDefaultServiceCategoryConfig,
  isMedicineServiceCategory,
  type ServiceCategoryAdminView,
  type ServiceCategoryConfig,
  type ServiceCategoryDocument,
  type ServiceCategoryField,
  type ServiceFieldType,
} from '../../lib/serviceCatalog';
import {
  fetchAdminServiceCatalog,
  fetchAdminServiceCategory,
  fetchServiceCatalogAudit,
  fetchServiceCatalogVerifications,
  publishServiceCategory,
  reviewServiceCredential,
  reviewServiceDocument,
  rollbackServiceCategory,
  saveServiceCategoryDraft,
  serviceCatalogErrorMessage as clientErrorMessage,
  setServiceCategoryEnabled,
  type ServiceVerificationsResponse,
} from '../../lib/serviceCatalogClient';
import type { ServiceCredentialView } from '../../lib/serviceCatalog';

type TabId = 'config' | 'versions' | 'verification' | 'audit';

const ICON_OPTIONS = [
  'heart-handshake', 'pill', 'droplets', 'wrench', 'sparkles', 'package', 'truck',
  'stethoscope', 'shield-check', 'home', 'calendar', 'repeat', 'baby', 'graduation-cap',
  'leaf', 'zap', 'scissors', 'car', 'utensils', 'book-open', 'paw-print', 'briefcase',
];

const TOGGLE_LABELS: Record<(typeof SERVICE_TOGGLE_KEYS)[number], string> = {
  gpsTracking: 'GPS tracking',
  liveMap: 'Live map',
  customerOtp: 'Customer handover OTP',
  prescriptionVerification: 'Prescription verification',
  documentVerification: 'Document verification',
  payment: 'Payment collection',
  deliveryConfirmation: 'Delivery confirmation',
};

function newKey(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function versionNumber(category: ServiceCategoryAdminView | null): number | null {
  return category?.versions[0]?.versionNumber ?? null;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function FieldEditor({
  fields,
  onChange,
}: {
  fields: ServiceCategoryField[];
  onChange: (fields: ServiceCategoryField[]) => void;
}) {
  const update = (index: number, patch: Partial<ServiceCategoryField>) => {
    onChange(fields.map((field, position) => (position === index ? { ...field, ...patch } : field)));
  };
  const remove = (index: number) => onChange(fields.filter((_, position) => position !== index));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={`${field.key}-${index}`} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Key
              <input value={field.key} onChange={(event) => update(index, { key: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Label
              <input value={field.label} onChange={(event) => update(index, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Type
              <select value={field.type} onChange={(event) => update(index, { type: event.target.value as ServiceFieldType })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
                {SERVICE_FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Max length
              <input type="number" min={0} max={4000} value={field.maxLength ?? 120} onChange={(event) => update(index, { maxLength: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={field.required} onChange={(event) => update(index, { required: event.target.checked })} /> Required
            </label>
            {(field.type === 'select' || field.type === 'multiselect') && (
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
                Options (comma separated)
                <input value={(field.options || []).join(', ')} onChange={(event) => update(index, { options: event.target.value.split(',').map((option) => option.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
              </label>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={() => move(index, -1)} aria-label="Move field up" className="rounded border border-slate-200 p-1 dark:border-slate-700"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => move(index, 1)} aria-label="Move field down" className="rounded border border-slate-200 p-1 dark:border-slate-700"><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => remove(index)} className="ml-auto inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300"><Trash2 className="h-3 w-3" /> Remove</button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, { key: newKey('field'), label: 'New field', type: 'text', required: false, maxLength: 120 }])}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-200 px-3 text-[11px] font-bold text-violet-800 dark:border-violet-800 dark:text-violet-200"
      >
        <Plus className="h-3.5 w-3.5" /> Add booking field
      </button>
    </div>
  );
}

function DocumentEditor({
  documents,
  medicine,
  onChange,
}: {
  documents: ServiceCategoryDocument[];
  medicine: boolean;
  onChange: (documents: ServiceCategoryDocument[]) => void;
}) {
  const update = (index: number, patch: Partial<ServiceCategoryDocument>) => {
    onChange(documents.map((document, position) => (position === index ? { ...document, ...patch } : document)));
  };
  return (
    <div className="space-y-3">
      {documents.map((document, index) => {
        const locked = medicine && document.key === 'prescription';
        return (
          <div key={`${document.key}-${index}`} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Key
                <input value={document.key} disabled={locked} onChange={(event) => update(index, { key: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                Label
                <input value={document.label} onChange={(event) => update(index, { label: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={document.required || locked} disabled={locked} onChange={(event) => update(index, { required: event.target.checked })} /> Required
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={document.verificationRequired || locked} disabled={locked} onChange={(event) => update(index, { verificationRequired: event.target.checked })} /> Admin verification
              </label>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">
                Accepted MIME types (comma separated)
                <input value={(document.acceptedTypes || []).join(', ')} onChange={(event) => update(index, { acceptedTypes: event.target.value.split(',').map((type) => type.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
              </label>
            </div>
            {!locked && (
              <button type="button" onClick={() => onChange(documents.filter((_, position) => position !== index))} className="mt-2 inline-flex items-center gap-1 rounded border border-rose-200 px-2 py-1 text-[10px] font-bold text-rose-700 dark:border-rose-900 dark:text-rose-300"><Trash2 className="h-3 w-3" /> Remove</button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...documents, { key: newKey('document'), label: 'New document', required: false, verificationRequired: false }])}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-200 px-3 text-[11px] font-bold text-violet-800 dark:border-violet-800 dark:text-violet-200"
      >
        <Plus className="h-3.5 w-3.5" /> Add required document
      </button>
    </div>
  );
}

export function ServiceCategoryBuilder({ onNotify }: { onNotify?: (message: string) => void }) {
  const [categories, setCategories] = useState<ServiceCategoryAdminView[]>([]);
  const [actor, setActor] = useState<{ id: string; role: 'admin' | 'super_admin'; displayName: string } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ServiceCategoryConfig | null>(null);
  const [summary, setSummary] = useState('Updated service category configuration');
  const [tab, setTab] = useState<TabId>('config');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audit, setAudit] = useState<Array<Record<string, any>>>([]);
  const [verifications, setVerifications] = useState<ServiceVerificationsResponse | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [enableReason, setEnableReason] = useState('Reviewed by Super Admin');
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');

  const selected = useMemo(
    () => categories.find((category) => category.id === selectedId) || null,
    [categories, selectedId],
  );
  const medicine = selectedId ? isMedicineServiceCategory(selectedId, draft) : false;
  const canWrite = actor?.role === 'super_admin';

  const load = useCallback(async (preferred?: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchAdminServiceCatalog();
      setActor(response.actor);
      setCategories(response.categories);
      setSelectedId((current) => {
        const candidate = preferred || current;
        if (candidate && response.categories.some((category) => category.id === candidate)) return candidate;
        return response.categories[0]?.id || '';
      });
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    setDraft(
      selected.draft?.config
      || selected.published?.config
      || createDefaultServiceCategoryConfig(selected.id.replace(/_/g, ' ')),
    );
    setSummary(
      selected.draft
        ? 'Updated draft'
        : selected.published
          ? `Editing published version ${selected.published.versionNumber}`
          : 'New service category',
    );
  }, [selectedId, selected?.draft?.versionId, selected?.published?.versionId]);

  const notify = (message: string) => {
    setNotice(message);
    onNotify?.(message);
  };

  const patch = (updater: (current: ServiceCategoryConfig) => ServiceCategoryConfig) => {
    setDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      return selectedId ? applyServiceCategoryHardRules(selectedId, next) : next;
    });
  };

  const startCreate = () => {
    const key = newKey.trim();
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) {
      setError('Category id must be lower_snake_case, start with a letter and be 2–41 characters.');
      return;
    }
    if (categories.some((category) => category.id === key)) {
      setError('That category id already exists.');
      return;
    }
    setSelectedId(key);
    setDraft(createDefaultServiceCategoryConfig(newName.trim() || key.replace(/_/g, ' ')));
    setSummary('New service category');
    setCreateOpen(false);
    setNewKey('');
    setNewName('');
    setTab('config');
    setError('');
  };

  const refreshDetail = async (categoryId = selectedId): Promise<ServiceCategoryAdminView | null> => {
    const response = await fetchAdminServiceCategory(categoryId);
    setActor(response.actor);
    setCategories((current) => current.map((category) => (
      category.id === response.category.id ? response.category : category
    )));
    return response.category;
  };

  const save = async (publishAfter = false) => {
    if (!draft || !selectedId) return;
    if (!canWrite) {
      setError(clientErrorMessage(new Error('SERVICE_CATALOG_SUPER_ADMIN_REQUIRED')));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await saveServiceCategoryDraft(selectedId, draft, summary, versionNumber(selected));
      if (publishAfter) {
        await publishServiceCategory(selectedId, response.version.versionId);
        notify('Category saved and published. Customer surfaces use this version.');
      } else {
        notify('Draft saved. Publish it when the configuration is ready.');
      }
      await load(selectedId);
      await refreshDetail(selectedId);
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!selectedId || !canWrite) return;
    setBusy(true);
    setError('');
    try {
      const detail = await refreshDetail(selectedId);
      if (!detail?.draft) {
        setError('Save a draft before publishing.');
        return;
      }
      await publishServiceCategory(selectedId, detail.draft.versionId);
      await load(selectedId);
      await refreshDetail(selectedId);
      notify('Category published.');
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (targetVersionId: string) => {
    if (!selectedId || !canWrite) return;
    setBusy(true);
    setError('');
    try {
      await rollbackServiceCategory(selectedId, targetVersionId);
      await load(selectedId);
      await refreshDetail(selectedId);
      notify('Rolled back with a new published version. History is unchanged.');
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    if (!selected || !canWrite) return;
    setBusy(true);
    setError('');
    try {
      await setServiceCategoryEnabled(selected.id, !selected.enabled, enableReason);
      await load(selected.id);
      await refreshDetail(selected.id);
      notify(selected.enabled ? 'Category disabled.' : 'Category enabled.');
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const loadVerifications = async () => {
    try {
      setVerifications(await fetchServiceCatalogVerifications());
    } catch (caught) {
      setError(clientErrorMessage(caught));
    }
  };

  const loadAudit = async () => {
    try {
      const response = await fetchServiceCatalogAudit(150);
      setAudit(response.audit as unknown as Array<Record<string, any>>);
    } catch (caught) {
      setError(clientErrorMessage(caught));
    }
  };

  useEffect(() => {
    if (tab === 'verification') void loadVerifications();
    if (tab === 'audit') void loadAudit();
  }, [tab]);

  const decideDocument = async (documentId: string, status: 'verified' | 'rejected') => {
    setBusy(true);
    setError('');
    try {
      await reviewServiceDocument(documentId, status, reviewNotes[documentId] || '');
      await loadVerifications();
      notify(`Document ${status}.`);
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const decideCredential = async (credential: ServiceCredentialView, status: 'verified' | 'rejected') => {
    setBusy(true);
    setError('');
    try {
      await reviewServiceCredential(credential.id, status, reviewNotes[credential.id] || '');
      await loadVerifications();
      notify(`Licence ${status}.`);
    } catch (caught) {
      setError(clientErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">Dynamic service builder</p>
          <h2 className="mt-1 text-lg font-black text-slate-900 dark:text-white">Service categories & booking forms</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
            Create categories without code changes. Published versions drive customer forms, provider job details and admin oversight.
            Medicine keeps licensed-pharmacy and prescription rules even when a toggle is turned off.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${canWrite ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>
            {actor?.role === 'super_admin' ? 'Super Admin' : actor?.role === 'admin' ? 'Admin · read only' : 'Checking role'}
          </span>
          <button type="button" onClick={() => void load(selectedId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold dark:border-slate-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Categories</p>
            {canWrite && (
              <button type="button" onClick={() => setCreateOpen((open) => !open)} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-violet-700 px-2.5 text-[10px] font-black text-white"><Plus className="h-3 w-3" /> New</button>
            )}
          </div>
          {createOpen && canWrite && (
            <div className="space-y-2 rounded-xl border border-violet-200 p-2 dark:border-violet-900">
              <input value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder="category_id" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Customer-facing name" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
              <button type="button" onClick={startCreate} className="min-h-8 w-full rounded-lg bg-violet-700 text-[10px] font-black text-white">Start configuration</button>
            </div>
          )}
          <div className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {loading && <p className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700">Loading categories…</p>}
            {!loading && categories.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700">No categories yet. Create the first one.</p>}
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => { setSelectedId(category.id); setTab('config'); }}
                className={`w-full rounded-xl border p-2.5 text-left transition ${selectedId === category.id ? 'border-violet-500 bg-violet-50 dark:border-violet-500 dark:bg-violet-950/40' : 'border-slate-200 hover:border-violet-300 dark:border-slate-700'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-black">{category.published?.config.name || category.id}</span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${category.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{category.id}</span>
                <span className="mt-1 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  {category.published ? `v${category.published.versionNumber} published` : 'Unpublished'}
                  {category.draft ? ' · draft' : ''}
                  {category.enabled ? '' : ' · disabled'}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {([
              ['config', 'Configuration', ClipboardCheck],
              ['versions', 'Versions', History],
              ['verification', 'Verification queue', FileCheck2],
              ['audit', 'Audit', ShieldCheck],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black transition ${tab === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {tab === 'config' && !draft && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-xs text-slate-500 dark:border-slate-700">Select a category or create a new one.</p>
          )}

          {tab === 'config' && draft && selectedId && (
            <div className="space-y-5">
              {medicine && (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-[11px] font-semibold leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Medicine is a regulated category. Prescription verification, document verification and a verified licensed pharmacy are enforced by the database even if these toggles are turned off.</span>
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Identity & booking model</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Category id<input value={selectedId} disabled className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Service name<input value={draft.name} onChange={(event) => patch((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">Description<textarea value={draft.description} rows={2} onChange={(event) => patch((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Icon<select value={draft.icon} onChange={(event) => patch((current) => ({ ...current, icon: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">{ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Image URL (HTTPS)<input value={draft.imageUrl} onChange={(event) => patch((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://…" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Accent colour<input type="color" value={draft.accentColor} onChange={(event) => patch((current) => ({ ...current, accentColor: event.target.value.toUpperCase() }))} className="mt-1 h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Booking type<select value={draft.bookingType} onChange={(event) => patch((current) => ({ ...current, bookingType: event.target.value as ServiceCategoryConfig['bookingType'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">{SERVICE_BOOKING_TYPES.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Provider assignment<select value={draft.providerAssignment} onChange={(event) => patch((current) => ({ ...current, providerAssignment: event.target.value as ServiceCategoryConfig['providerAssignment'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">{SERVICE_PROVIDER_ASSIGNMENTS.map((mode) => <option key={mode} value={mode}>{statusLabel(mode)}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Delivery kind<select value={draft.deliveryKind} disabled={medicine} onChange={(event) => patch((current) => ({ ...current, deliveryKind: event.target.value as ServiceCategoryConfig['deliveryKind'] }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900">{SERVICE_DELIVERY_KINDS.map((kind) => <option key={kind} value={kind}>{statusLabel(kind)}</option>)}</select></label>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Delivery options
                    <div className="mt-1 flex flex-wrap gap-2">
                      {SERVICE_DELIVERY_MODES.map((mode) => (
                        <label key={mode} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[10px] dark:border-slate-700">
                          <input
                            type="checkbox"
                            checked={draft.deliveryModes.includes(mode)}
                            onChange={(event) => patch((current) => ({
                              ...current,
                              deliveryModes: event.target.checked
                                ? Array.from(new Set([...current.deliveryModes, mode]))
                                : current.deliveryModes.filter((entry) => entry !== mode),
                            }))}
                          />
                          {statusLabel(mode)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Pricing & quantity</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Mode<select value={draft.pricing.mode} onChange={(event) => patch((current) => ({ ...current, pricing: { ...current.pricing, mode: event.target.value as ServiceCategoryConfig['pricing']['mode'] } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">{SERVICE_PRICING_MODES.map((mode) => <option key={mode} value={mode}>{statusLabel(mode)}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Amount (₹)<input type="number" min={0} step="0.01" disabled={draft.pricing.mode === 'quote'} value={draft.pricing.amount} onChange={(event) => patch((current) => ({ ...current, pricing: { ...current.pricing, amount: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Unit<input value={draft.pricing.unit} onChange={(event) => patch((current) => ({ ...current, pricing: { ...current.pricing, unit: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.pricing.quantityEnabled} onChange={(event) => patch((current) => ({ ...current, pricing: { ...current.pricing, quantityEnabled: event.target.checked } }))} /> Ask for quantity</label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Min quantity<input type="number" min={1} max={999} value={draft.pricing.minQuantity} onChange={(event) => patch((current) => ({ ...current, pricing: { ...current.pricing, minQuantity: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Max quantity<input type="number" min={1} max={999} value={draft.pricing.maxQuantity} onChange={(event) => patch((current) => ({ ...current, pricing: { ...current.pricing, maxQuantity: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Recurring schedule</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.recurring.enabled} onChange={(event) => patch((current) => ({ ...current, recurring: { ...current.recurring, enabled: event.target.checked } }))} /> Offer recurring deliveries</label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Default frequency<select value={draft.recurring.defaultFrequency} onChange={(event) => patch((current) => ({ ...current, recurring: { ...current.recurring, defaultFrequency: event.target.value as ServiceCategoryConfig['recurring']['defaultFrequency'] } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">{SERVICE_RECURRENCE_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Max occurrences<input type="number" min={1} max={365} value={draft.recurring.maxOccurrences} onChange={(event) => patch((current) => ({ ...current, recurring: { ...current.recurring, maxOccurrences: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:col-span-3">
                    Allowed frequencies
                    <div className="mt-1 flex flex-wrap gap-2">
                      {SERVICE_RECURRENCE_FREQUENCIES.map((frequency) => (
                        <label key={frequency} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[10px] dark:border-slate-700">
                          <input type="checkbox" checked={draft.recurring.frequencies.includes(frequency)} onChange={(event) => patch((current) => ({ ...current, recurring: { ...current.recurring, frequencies: event.target.checked ? Array.from(new Set([...current.recurring.frequencies, frequency])) : current.recurring.frequencies.filter((entry) => entry !== frequency) } }))} />
                          {frequency}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Feature toggles</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {SERVICE_TOGGLE_KEYS.map((toggle) => {
                    const locked = medicine && (toggle === 'prescriptionVerification' || toggle === 'documentVerification');
                    return (
                      <label key={toggle} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${locked ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>
                        <input type="checkbox" checked={draft.toggles[toggle]} disabled={locked} onChange={(event) => patch((current) => ({ ...current, toggles: { ...current.toggles, [toggle]: event.target.checked } }))} className="mt-0.5" />
                        <span>{TOGGLE_LABELS[toggle]}{locked ? ' · enforced for medicine' : ''}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Customer booking fields</h3>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Rendered generically on the booking form and shown on provider/admin jobs.</p>
                <div className="mt-3"><FieldEditor fields={draft.fields} onChange={(fields) => patch((current) => ({ ...current, fields }))} /></div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Required documents</h3>
                <div className="mt-3"><DocumentEditor documents={draft.documents} medicine={medicine} onChange={(documents) => patch((current) => ({ ...current, documents }))} /></div>
              </section>

              <section className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Approval workflow & validation</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.approvalWorkflow.requiresProviderAcceptance} onChange={(event) => patch((current) => ({ ...current, approvalWorkflow: { ...current.approvalWorkflow, requiresProviderAcceptance: event.target.checked } }))} /> Provider acceptance required</label>
                  <label className={`flex items-center gap-2 text-[11px] font-bold ${medicine ? 'text-amber-900 dark:text-amber-100' : 'text-slate-600 dark:text-slate-300'}`}><input type="checkbox" checked={draft.approvalWorkflow.requiresDocumentVerification || medicine} disabled={medicine} onChange={(event) => patch((current) => ({ ...current, approvalWorkflow: { ...current.approvalWorkflow, requiresDocumentVerification: event.target.checked } }))} /> Documents must be verified{medicine ? ' · enforced' : ''}</label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.approvalWorkflow.requiresAdminApproval} onChange={(event) => patch((current) => ({ ...current, approvalWorkflow: { ...current.approvalWorkflow, requiresAdminApproval: event.target.checked } }))} /> Admin approval before provider accepts</label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Min lead time (minutes)<input type="number" min={0} max={10080} value={draft.validation.minLeadTimeMinutes} onChange={(event) => patch((current) => ({ ...current, validation: { ...current.validation, minLeadTimeMinutes: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Max advance days<input type="number" min={1} max={365} value={draft.validation.maxAdvanceDays} onChange={(event) => patch((current) => ({ ...current, validation: { ...current.validation, maxAdvanceDays: Number(event.target.value) } }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.validation.requiresServiceAddress} onChange={(event) => patch((current) => ({ ...current, validation: { ...current.validation, requiresServiceAddress: event.target.checked } }))} /> Require service address</label>
                  <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={draft.validation.requiresPhone} onChange={(event) => patch((current) => ({ ...current, validation: { ...current.validation, requiresPhone: event.target.checked } }))} /> Require contact phone</label>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:col-span-2">Legacy category ids (comma separated)<input value={draft.legacyCategoryIds.join(', ')} onChange={(event) => patch((current) => ({ ...current, legacyCategoryIds: event.target.value.split(',').map((id) => id.trim()).filter(Boolean) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Change summary<input value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Enable/disable audit reason<input value={enableReason} onChange={(event) => setEnableReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" /></label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !canWrite} onClick={() => void save(false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-700 px-4 text-xs font-black text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save draft</button>
                  <button type="button" disabled={busy || !canWrite} onClick={() => void save(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-50"><Send className="h-4 w-4" /> Save & publish</button>
                  <button type="button" disabled={busy || !canWrite} onClick={() => void publish()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-700 px-4 text-xs font-black text-emerald-800 disabled:opacity-50 dark:text-emerald-200"><Check className="h-4 w-4" /> Publish saved draft</button>
                  {selected && (
                    <button type="button" disabled={busy || !canWrite} onClick={() => void toggleEnabled()} className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-black text-white disabled:opacity-50 ${selected.enabled ? 'bg-rose-700' : 'bg-slate-900 dark:bg-slate-700'}`}>
                      {selected.enabled ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />} {selected.enabled ? 'Disable category' : 'Enable category'}
                    </button>
                  )}
                </div>
                {!canWrite && <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">You can review this configuration, but only a Super Admin can save, publish or disable it.</p>}
              </section>
            </div>
          )}

          {tab === 'versions' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Published versions are immutable. Rollback writes a new published version that references the restored one.</p>
              {(selected?.versions || []).map((version) => (
                <div key={version.versionId} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black">Version {version.versionNumber} · {statusLabel(version.status)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{version.summary}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Created {version.createdAt ? new Date(version.createdAt).toLocaleString() : '—'}{version.publishedAt ? ` · Published ${new Date(version.publishedAt).toLocaleString()}` : ''}</p>
                    </div>
                    <div className="flex gap-2">
                      {version.status === 'draft' && <button type="button" disabled={busy || !canWrite} onClick={() => void publishServiceCategory(selectedId, version.versionId).then(() => load(selectedId)).catch((caught) => setError(clientErrorMessage(caught)))} className="min-h-8 rounded-lg bg-emerald-700 px-3 text-[10px] font-black text-white disabled:opacity-50">Publish</button>}
                      {version.status === 'published' && version.versionNumber !== selected?.published?.versionNumber && <button type="button" disabled={busy || !canWrite} onClick={() => void rollback(version.versionId)} className="min-h-8 rounded-lg border border-violet-300 px-3 text-[10px] font-black text-violet-800 disabled:opacity-50 dark:border-violet-800 dark:text-violet-200">Restore</button>}
                    </div>
                  </div>
                </div>
              ))}
              {!selected?.versions.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">No versions yet.</p>}
            </div>
          )}

          {tab === 'verification' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Pending customer documents</h3>
                <button type="button" onClick={() => void loadVerifications()} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold dark:border-slate-700"><RefreshCw className="h-3 w-3" /> Refresh</button>
              </div>
              {(verifications?.documents || []).map((document) => (
                <div key={document.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="text-xs font-black">{document.documentKey} · {document.bookingRef}</p>
                  <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-300">{document.listingTitle} · {document.fileName || document.mimeType || 'document'}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">{document.reference}</p>
                  <input value={reviewNotes[document.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [document.id]: event.target.value }))} placeholder="Review note (required)" className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void decideDocument(document.id, 'verified')} className="min-h-8 rounded-lg bg-emerald-700 px-3 text-[10px] font-black text-white disabled:opacity-50">Verify</button>
                    <button type="button" disabled={busy} onClick={() => void decideDocument(document.id, 'rejected')} className="min-h-8 rounded-lg border border-rose-300 px-3 text-[10px] font-black text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">Reject</button>
                  </div>
                </div>
              ))}
              {!verifications?.documents.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">No customer documents are waiting.</p>}

              <h3 className="text-xs font-black text-slate-800 dark:text-slate-100">Provider licences</h3>
              {(verifications?.credentials || []).map((credential) => (
                <div key={credential.id} className="rounded-2xl border border-sky-200 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/20">
                  <p className="text-xs font-black">{credential.credentialType} · {credential.providerName || credential.providerId}</p>
                  <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-300">Licence {credential.licenseNumber}{credential.expiresOn ? ` · expires ${credential.expiresOn}` : ''}</p>
                  <input value={reviewNotes[credential.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [credential.id]: event.target.value }))} placeholder="Review note (required)" className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" />
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void decideCredential(credential, 'verified')} className="min-h-8 rounded-lg bg-emerald-700 px-3 text-[10px] font-black text-white disabled:opacity-50">Verify licence</button>
                    <button type="button" disabled={busy} onClick={() => void decideCredential(credential, 'rejected')} className="min-h-8 rounded-lg border border-rose-300 px-3 text-[10px] font-black text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">Reject</button>
                  </div>
                </div>
              ))}
              {!verifications?.credentials.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">No provider licences are waiting.</p>}
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-2">
              <button type="button" onClick={() => void loadAudit()} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold dark:border-slate-700"><RefreshCw className="h-3 w-3" /> Refresh audit</button>
              {audit.map((entry) => (
                <div key={String(entry.id)} className="rounded-xl border border-slate-200 p-2.5 text-[11px] dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black">{String(entry.action).replace(/_/g, ' ')} · {entry.categoryId}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{entry.actorRole} · {entry.createdAt ? new Date(String(entry.createdAt)).toLocaleString() : ''}</span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{entry.summary}</p>
                </div>
              ))}
              {!audit.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">No audit entries yet.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ServiceCategoryBuilder;
