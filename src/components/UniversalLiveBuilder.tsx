import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Database,
  Eye,
  GripVertical,
  History,
  Layers,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  BUILDER_COMPONENTS,
  BUILDER_COMPONENT_MAP,
  BUILDER_METRICS,
  BUILDER_MODULES,
  BUILDER_RADII,
  BUILDER_SPACING,
  BUILDER_THEME_KEYS,
  type BuilderComponentDefinition,
  type EntityFieldDescriptor,
  type EntityRelationDescriptor,
  type EntitySchemaDocument,
} from '../lib/builder/registry';
import type { NormalizedBlock, NormalizedPageDocument } from '../lib/builder/validate';
import SafeImage from './SafeImage';
import {
  archiveRecord,
  fetchAdminPage,
  fetchAdminPages,
  fetchAudit,
  fetchEntities,
  fetchEntity,
  fetchRecords,
  fetchReport,
  fetchPolicies,
  publishEntity,
  publishPage,
  rollbackEntity,
  rollbackPage,
  savePolicies,
  saveEntityDraft,
  savePageDraft,
  saveRecord,
  type AdminPageState,
  type BuilderIdentity,
  type PublishedPage,
} from '../lib/builder/client';
import {
  POLICY_PAYMENT_METHODS,
  POLICY_REPORT_METRICS,
  POLICY_REPORT_RANGES,
  POLICY_ROLE_SECTIONS,
  POLICY_SETTLEMENT_CYCLES,
  type PolicyDocument,
} from '../lib/builder/policies';

interface UniversalLiveBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'customer' | 'provider' | 'admin';
  onNotify?: (message: string) => void;
}

type TabId = 'pages' | 'modules' | 'policies' | 'reports' | 'audit';

const EMPTY_FIELD: EntityFieldDescriptor = { key: '', label: '', type: 'text', required: false };

function newBlockId(type: string): string {
  return `${type}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function mapBlocks(blocks: NormalizedBlock[], fn: (block: NormalizedBlock) => NormalizedBlock): NormalizedBlock[] {
  return blocks.map((block) => {
    const next = fn(block);
    return { ...next, children: mapBlocks(next.children ?? [], fn) };
  });
}

function updateBlock(blocks: NormalizedBlock[], id: string, updater: (block: NormalizedBlock) => NormalizedBlock): NormalizedBlock[] {
  return blocks.map((block) => {
    if (block.id === id) return { ...updater(block), children: block.children ?? [] };
    return { ...block, children: updateBlock(block.children ?? [], id, updater) };
  });
}

function removeBlock(blocks: NormalizedBlock[], id: string): NormalizedBlock[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) => ({ ...block, children: removeBlock(block.children ?? [], id) }));
}

function findBlock(blocks: NormalizedBlock[], id: string): NormalizedBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function insertBlock(blocks: NormalizedBlock[], parentId: string | null, block: NormalizedBlock): NormalizedBlock[] {
  if (!parentId) return [...blocks, block];
  return blocks.map((candidate) =>
    candidate.id === parentId
      ? { ...candidate, children: [...(candidate.children ?? []), block] }
      : { ...candidate, children: insertBlock(candidate.children ?? [], parentId, block) },
  );
}

function moveBlock(blocks: NormalizedBlock[], id: string, direction: -1 | 1): NormalizedBlock[] {
  const index = blocks.findIndex((block) => block.id === id);
  if (index >= 0) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return blocks;
    const next = [...blocks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return next;
  }
  return blocks.map((block) => ({ ...block, children: moveBlock(block.children ?? [], id, direction) }));
}

function stripDocument(doc: NormalizedPageDocument): Record<string, unknown> {
  const strip = (block: NormalizedBlock): Record<string, unknown> => ({
    id: block.id,
    type: block.type,
    visible: block.visible,
    props: block.props,
    style: block.style,
    children: (block.children ?? []).map(strip),
  });
  return {
    schemaVersion: doc.schemaVersion,
    pageKey: doc.pageKey,
    title: doc.title,
    module: doc.module,
    description: doc.description ?? '',
    theme: doc.theme ?? {},
    navigation: doc.navigation ?? [],
    blocks: doc.blocks.map(strip),
  };
}

const FIELD_LABELS: Record<string, string> = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  hero: 'Hero',
  announcement: 'Announcement',
  badge: 'Badge',
  button: 'Button',
  nav_menu: 'Navigation',
  section: 'Section',
  tabs: 'Tabs',
  card: 'Card',
  card_grid: 'Card grid',
  gallery: 'Gallery',
  divider: 'Divider',
  spacer: 'Spacer',
  filter_bar: 'Filters',
  search_bar: 'Search',
  table: 'Table',
  calendar: 'Calendar',
  form: 'Form',
  form_field: 'Form field',
  booking_widget: 'Booking',
  inventory_widget: 'Inventory',
  listing_layout: 'Listing layout',
  report: 'Report',
  workflow_action: 'Workflow action',
};

/** Renders a published/editor block using only React text nodes and safe URLs. */
function BlockPreview({ block }: { block: NormalizedBlock }) {
  const props = block.props as Record<string, any>;
  const style: React.CSSProperties = {};
  if (block.style?.background) style.background = block.style.background;
  if (block.style?.textColor) style.color = block.style.textColor;
  if (block.style?.align) style.textAlign = block.style.align as React.CSSProperties['textAlign'];
  if (block.style?.padding) style.padding = `${Number(block.style.padding) * 2}px`;
  if (!block.visible) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-400" style={style}>
        Hidden: {FIELD_LABELS[block.type] ?? block.type}
      </div>
    );
  }
  const children = (block.children ?? []).map((child) => <BlockPreview key={child.id} block={child} />);
  switch (block.type) {
    case 'heading': {
      const Tag: React.ElementType = props.level === 'h1' ? 'h1' : props.level === 'h3' ? 'h3' : props.level === 'h4' ? 'h4' : 'h2';
      return <Tag className="font-bold text-slate-900" style={style}>{String(props.text ?? '')}</Tag>;
    }
    case 'text':
      return <p className="whitespace-pre-wrap text-sm text-slate-700" style={style}>{String(props.text ?? '')}</p>;
    case 'image':
      return (
        <figure style={style}>
          {props.src ? <SafeImage src={String(props.src)} alt={String(props.alt ?? '')} category="general" className="max-h-56 w-full rounded-lg object-cover" /> : <div className="h-24 rounded bg-slate-100" />}
          {props.caption ? <figcaption className="mt-1 text-xs text-slate-500">{String(props.caption)}</figcaption> : null}
        </figure>
      );
    case 'hero':
      return (
        <div className="rounded-xl p-6 text-white" style={{ background: 'linear-gradient(120deg,#312e81,#4338CA)', ...style }}>
          {props.badge ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">{String(props.badge)}</span> : null}
          <h2 className="mt-2 text-xl font-bold">{String(props.headline ?? '')}</h2>
          {props.subheadline ? <p className="mt-1 text-sm text-white/80">{String(props.subheadline)}</p> : null}
          {props.ctaLabel ? <span className="mt-3 inline-block rounded-lg bg-white px-3 py-1 text-xs font-semibold text-indigo-700">{String(props.ctaLabel)}</span> : null}
        </div>
      );
    case 'announcement':
      return <div className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900" style={style}>{String(props.text ?? '')}</div>;
    case 'badge':
      return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800" style={style}>{String(props.text ?? '')}</span>;
    case 'button':
      return (
        <span className={props.variant === 'secondary' ? 'inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm' : 'inline-block rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white'} style={style}>
          {String(props.label ?? 'Button')}
        </span>
      );
    case 'nav_menu':
      return (
        <div className="text-sm" style={style}>
          {String(props.items ?? '').split('\n').filter(Boolean).map((line, index) => {
            const [label, href] = line.split('|');
            return <span key={index} className="mr-3 text-indigo-700">{label}{href ? <span className="text-slate-400"> ({href})</span> : null}</span>;
          })}
        </div>
      );
    case 'section':
      return (
        <section className="rounded-xl border border-slate-200 bg-white p-4" style={style}>
          {props.title ? <h3 className="mb-2 text-sm font-semibold text-slate-900">{String(props.title)}</h3> : null}
          {props.description ? <p className="mb-2 text-xs text-slate-500">{String(props.description)}</p> : null}
          <div className="space-y-3">{children}</div>
        </section>
      );
    case 'tabs':
      return (
        <div className="rounded-xl border border-slate-200 p-4" style={style}>
          <div className="mb-2 flex gap-2 border-b border-slate-100 pb-2 text-xs text-slate-500">
            {String(props.tabs ?? '').split('\n').filter(Boolean).map((tab) => <span key={tab}>{tab}</span>)}
          </div>
          <div className="space-y-2">{children}</div>
        </div>
      );
    case 'card':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4" style={style}>
          {props.imageUrl ? <SafeImage src={String(props.imageUrl)} alt="" category="general" className="mb-2 h-24 w-full rounded object-cover" /> : null}
          <h4 className="text-sm font-semibold text-slate-900">{String(props.title ?? '')}</h4>
          {props.body ? <p className="mt-1 text-xs text-slate-600">{String(props.body)}</p> : null}
          <div className="mt-2 space-y-2">{children}</div>
        </div>
      );
    case 'card_grid':
      return <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 text-xs text-indigo-700" style={style}>{String(props.limit ?? 6)} cards from {String(props.module ?? 'platform')} in {String(props.columns ?? 3)} columns</div>;
    case 'gallery':
      return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Number(props.columns ?? 3)},minmax(0,1fr))`, ...style }}>
          {String(props.images ?? '').split('\n').filter(Boolean).slice(0, 9).map((src, index) => <SafeImage key={index} src={src} alt="" category="general" className="h-20 w-full rounded object-cover" />)}
        </div>
      );
    case 'divider':
      return <div className="flex items-center gap-2 text-[10px] uppercase text-slate-400"><span className="h-px flex-1 bg-slate-200" />{String(props.label ?? '')}<span className="h-px flex-1 bg-slate-200" /></div>;
    case 'spacer':
      return <div style={{ height: `${Number(props.size ?? 4) * 4}px` }} />;
    case 'filter_bar':
      return <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600" style={style}>Filters: {String(props.filters ?? '')}</div>;
    case 'search_bar':
      return <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-400" style={style}>{String(props.placeholder ?? 'Search')}</div>;
    case 'table':
      return <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600" style={style}>Read-only table: {String(props.source ?? 'listings')} ({String(props.columns ?? '')})</div>;
    case 'calendar':
      return <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600" style={style}>Calendar: {String(props.mode ?? 'availability')} / {String(props.module ?? 'platform')}</div>;
    case 'form':
      return (
        <div className="rounded-xl border border-slate-200 p-4" style={style}>
          <h4 className="text-sm font-semibold">{String(props.title ?? 'Form')}</h4>
          <div className="mt-2 space-y-2">{children}</div>
          <span className="mt-3 inline-block rounded bg-indigo-600 px-3 py-1 text-xs text-white">{String(props.submitLabel ?? 'Submit')}</span>
        </div>
      );
    case 'form_field':
      return (
        <label className="block text-xs text-slate-600" style={style}>
          {String(props.label ?? '')}{props.required ? ' *' : ''}
          <span className="mt-1 block rounded border border-slate-200 px-2 py-1 text-slate-400">
            {props.fieldType === 'textarea' ? 'Long answer' : props.fieldType === 'select' ? 'Choose an option' : String(props.fieldType ?? 'text')}
          </span>
        </label>
      );
    case 'booking_widget':
      return <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-800" style={style}>Booking entry: {String(props.module ?? 'platform')} ({String(props.mode ?? 'enquiry')}) — prices and availability are calculated by the server.</div>;
    case 'inventory_widget':
      return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800" style={style}>Inventory summary: {String(props.unitLabel ?? 'units')} for {String(props.module ?? 'platform')}</div>;
    case 'listing_layout':
      return <div className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500" style={style}>{String(props.layout ?? 'grid')} listing feed for {String(props.module ?? 'platform')} ({String(props.cardFields ?? '')})</div>;
    case 'report':
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600" style={style}>Report: {String(props.metric ?? '')} ({String(props.range ?? '30d')})</div>;
    case 'workflow_action':
      return <div className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700" style={style}>{String(props.label ?? 'Action')} → {String(props.action ?? '')}</div>;
    default:
      return <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">Unsupported block</div>;
  }
}

export const UniversalLiveBuilder: React.FC<UniversalLiveBuilderProps> = ({ isOpen, onClose, userRole, onNotify }) => {
  const [tab, setTab] = useState<TabId>('pages');
  const [actor, setActor] = useState<BuilderIdentity | null>(null);
  const [pageList, setPageList] = useState<Array<{ pageKey: string; published: PublishedPage | null; draft: PublishedPage | null }>>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [pageState, setPageState] = useState<AdminPageState | null>(null);
  const [doc, setDoc] = useState<NormalizedPageDocument | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [summary, setSummary] = useState('Updated page configuration');
  const [dragId, setDragId] = useState<string | null>(null);

  const [entities, setEntities] = useState<Array<Record<string, any>>>([]);
  const [entityKey, setEntityKey] = useState('');
  const [entitySchema, setEntitySchema] = useState<EntitySchemaDocument | null>(null);
  const [entityVersions, setEntityVersions] = useState<Array<Record<string, any>>>([]);
  const [records, setRecords] = useState<Array<Record<string, any>>>([]);
  const [recordDraft, setRecordDraft] = useState<Record<string, any>>({});

  const [metric, setMetric] = useState(BUILDER_METRICS[0].id);
  const [report, setReport] = useState<{ metric: string; generatedAt: string; rows: Array<Record<string, unknown>> } | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, any>>>([]);
  const [policies, setPolicies] = useState<PolicyDocument | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [error, setError] = useState('');

  const latestVersion = pageState?.versions?.[0]?.versionNumber ?? 0;
  const selectedBlock = useMemo(() => (doc && selectedBlockId ? findBlock(doc.blocks, selectedBlockId) : null), [doc, selectedBlockId]);
  const canPublish = actor?.role === 'super_admin';

  const notify = useCallback((message: string) => {
    setStatus(message);
    onNotify?.(message);
  }, [onNotify]);

  const loadPages = useCallback(async () => {
    const result = await fetchAdminPages();
    setActor(result.actor);
    setPageList(result.pages);
    if (!selectedKey && result.pages[0]) setSelectedKey(result.pages[0].pageKey);
  }, [selectedKey]);

  const loadPage = useCallback(async (key: string) => {
    if (!key) return;
    const state = await fetchAdminPage(key);
    setPageState(state);
    const document = (state.draft?.document ?? state.published?.document ?? null) as NormalizedPageDocument | null;
    setDoc(document);
    setSelectedBlockId(null);
    setError('');
    setSummary(document ? `Updated ${key}` : `Created ${key}`);
  }, []);

  useEffect(() => {
    if (!isOpen || userRole !== 'admin') return;
    let cancelled = false;
    (async () => {
      try {
        await loadPages();
        const first = selectedKey;
        if (first && !cancelled) await loadPage(first);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Builder unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, userRole, loadPages, loadPage, selectedKey]);

  useEffect(() => {
    if (!isOpen || selectedKey) return;
    if (pageList[0]) setSelectedKey(pageList[0].pageKey);
  }, [isOpen, pageList, selectedKey]);

  useEffect(() => {
    if (!isOpen) return;
    if (tab === 'modules') {
      fetchEntities().then(setEntities).catch((err) => setError(err.message));
    }
    if (tab === 'audit') {
      fetchAudit().then(setAudit).catch((err) => setError(err.message));
    }
    if (tab === 'policies') {
      fetchPolicies().then(setPolicies).catch((err) => setError(err.message));
    }
  }, [isOpen, tab]);

  useEffect(() => {
    if (!isOpen || tab !== 'reports') return;
    fetchReport(metric).then(setReport).catch((err) => setError(err.message));
  }, [isOpen, tab, metric]);

  const patchDoc = (updater: (document: NormalizedPageDocument) => NormalizedPageDocument) => {
    setDoc((current) => (current ? updater(current) : current));
  };

  const handleSave = async () => {
    if (!doc) return;
    setBusy(true);
    setError('');
    try {
      const saved = await savePageDraft(doc.pageKey, stripDocument(doc) as unknown as NormalizedPageDocument, latestVersion, summary);
      const state = await fetchAdminPage(doc.pageKey);
      setPageState(state);
      setDoc((state.draft?.document ?? saved.document) as NormalizedPageDocument);
      notify(`Draft saved (v${saved.versionNumber}). Published pages are unchanged.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      setError(message.includes('BUILDER_VERSION_CONFLICT') ? 'Someone else saved a newer draft. Reload before saving again.' : message);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!pageState?.draft) {
      setError('Save a draft before publishing.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const published = await publishPage(pageState.draft.pageKey, pageState.draft.versionId);
      await loadPages();
      await loadPage(published.pageKey);
      notify(`Published v${published.versionNumber} to Web, Android and iOS.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (targetVersionId: string) => {
    if (!doc) return;
    setBusy(true);
    setError('');
    try {
      const published = await rollbackPage(doc.pageKey, targetVersionId);
      await loadPage(doc.pageKey);
      notify(`Rolled back: published v${published.versionNumber}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setBusy(false);
    }
  };

  const addBlock = (definition: BuilderComponentDefinition) => {
    if (!doc) return;
    const block: NormalizedBlock = {
      id: newBlockId(definition.type),
      type: definition.type,
      visible: true,
      category: definition.category,
      props: { ...definition.defaultProps },
      style: {},
      children: [],
    };
    const parent = selectedBlock?.type && BUILDER_COMPONENT_MAP[selectedBlock.type]?.acceptsChildren ? selectedBlock.id : null;
    patchDoc((current) => ({ ...current, blocks: insertBlock(current.blocks, parent, block) }));
    setSelectedBlockId(block.id);
    setPaletteOpen(false);
  };

  const updateProp = (key: string, value: string | number | boolean) => {
    if (!selectedBlock) return;
    patchDoc((current) => ({
      ...current,
      blocks: updateBlock(current.blocks, selectedBlock.id, (block) => ({
        ...block,
        props: { ...block.props, [key]: value },
      })),
    }));
  };

  const updateStyle = (key: string, value: string) => {
    if (!selectedBlock) return;
    patchDoc((current) => ({
      ...current,
      blocks: updateBlock(current.blocks, selectedBlock.id, (block) => ({
        ...block,
        style: { ...block.style, [key]: value },
      })),
    }));
  };

  const reorderRoot = (sourceId: string, targetId: string) => {
    if (!doc || sourceId === targetId) return;
    const sourceIndex = doc.blocks.findIndex((block) => block.id === sourceId);
    const targetIndex = doc.blocks.findIndex((block) => block.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...doc.blocks];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    patchDoc((current) => ({ ...current, blocks: next }));
  };

  const loadEntity = async (key: string) => {
    setEntityKey(key);
    setError('');
    try {
      const state = await fetchEntity(key);
      const schema = (state.draft?.schema ?? state.published?.schema ?? null) as EntitySchemaDocument | null;
      setEntitySchema(schema);
      setEntityVersions(state.versions ?? []);
      setRecords(state.published ? await fetchRecords(key) : []);
      setRecordDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Module load failed');
    }
  };

  const startNewEntity = () => {
    setEntityKey('');
    setEntityVersions([]);
    setRecords([]);
    setEntitySchema({
      schemaVersion: 1,
      key: '',
      label: '',
      module: 'platform',
      description: '',
      fields: [{ ...EMPTY_FIELD, key: 'name', label: 'Name', type: 'text', required: true }],
      relations: [],
      listView: { columns: [], searchFields: [] },
      permissions: { read: 'authenticated', write: 'admin' },
    });
  };

  const handleSaveEntity = async () => {
    if (!entitySchema) return;
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(entitySchema.key)) {
      setError('Module key must be lower_snake_case (e.g. school_jobs).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const latest = Number(entityVersions[0]?.version_number ?? 0);
      await saveEntityDraft(entitySchema.key, entitySchema, latest, `Updated ${entitySchema.label}`);
      await fetchEntities().then(setEntities);
      await loadEntity(entitySchema.key);
      notify('Module draft saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Module save failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishEntity = async () => {
    const draft = entityVersions.find((version) => version.status === 'draft');
    if (!draft) {
      setError('Save a module draft before publishing.');
      return;
    }
    setBusy(true);
    try {
      await publishEntity(entitySchema?.key ?? '', draft.versionId);
      await fetchEntities().then(setEntities);
      await loadEntity(entitySchema?.key ?? '');
      notify('Module published. Its records are now available.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Module publish failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRollbackEntity = async (targetVersionId: string) => {
    if (!entitySchema) return;
    setBusy(true);
    setError('');
    try {
      await rollbackEntity(entitySchema.key, targetVersionId);
      await fetchEntities().then(setEntities);
      await loadEntity(entitySchema.key);
      notify('Module rolled back to the selected published version.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Module rollback failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePolicies = async () => {
    if (!policies) return;
    setPolicyBusy(true);
    setError('');
    try {
      const saved = await savePolicies(policies);
      setPolicies(saved);
      notify('Approved policy settings saved. Pricing, availability, refunds and permissions are still enforced by the server.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Policy save failed');
    } finally {
      setPolicyBusy(false);
    }
  };

  const patchPolicy = (group: keyof PolicyDocument, patch: Record<string, unknown>) => {
    setPolicies((current) => current
      ? { ...current, [group]: { ...(current[group] as unknown as Record<string, unknown>), ...patch } }
      : current);
  };

  const updateTheme = (key: string, value: string) => {
    patchDoc((current) => ({ ...current, theme: { ...current.theme, [key]: value } }));
  };

  const updateNavigation = (index: number, patch: Partial<NormalizedPageDocument['navigation'][number]>) => {
    patchDoc((current) => ({
      ...current,
      navigation: current.navigation.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const handleSaveRecord = async () => {
    if (!entitySchema) return;
    setBusy(true);
    try {
      await saveRecord(entitySchema.key, recordDraft);
      setRecordDraft({});
      setRecords(await fetchRecords(entitySchema.key));
      notify('Record saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Record save failed');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || userRole !== 'admin') return null;

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-900/60 p-2 sm:p-6">
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Universal Live Builder</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">PostgreSQL · versioned</span>
          </div>
          <nav className="ml-2 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            {([
              ['pages', 'Pages', Eye],
              ['modules', 'Modules', Database],
              ['policies', 'Policies', Settings],
              ['reports', 'Reports', BarChart3],
              ['audit', 'Audit', History],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1 rounded-md px-2 py-1 ${tab === id ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {actor ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" /> {actor.role === 'super_admin' ? 'Super Admin' : 'Admin'} · {actor.displayName}
              </span>
            ) : null}
            <button onClick={onClose} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Close builder">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {(status || error) ? (
          <div className={`flex items-center gap-2 border-b px-4 py-2 text-xs ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {error ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            <span className="flex-1">{error || status}</span>
            <button onClick={() => { setError(''); setStatus(''); }} className="text-[10px] underline">dismiss</button>
          </div>
        ) : null}

        {tab === 'pages' ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-52 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-2">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pages</p>
              {pageList.map((page) => (
                <button
                  key={page.pageKey}
                  onClick={() => loadPage(page.pageKey)}
                  className={`mb-1 w-full rounded-lg px-2 py-2 text-left text-xs ${selectedKey === page.pageKey ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-white'}`}
                >
                  <span className="block font-medium">{page.pageKey}</span>
                  <span className={`text-[10px] ${selectedKey === page.pageKey ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {page.published ? `published v${page.published.versionNumber}` : 'unpublished'}
                    {page.draft ? ' · draft' : ''}
                  </span>
                </button>
              ))}
              {pageList.length === 0 ? <p className="px-2 text-xs text-slate-400">No pages yet.</p> : null}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
                <input value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={500} className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Change summary" />
                <button onClick={handleSave} disabled={busy || !doc} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                  <Save className="h-3.5 w-3.5" /> Save draft
                </button>
                <button onClick={handlePublish} disabled={busy || !canPublish || !pageState?.draft} title={canPublish ? '' : 'Super Admin required'} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
                  <Send className="h-3.5 w-3.5" /> Publish
                </button>
                <select
                  onChange={(event) => { if (event.target.value) handleRollback(event.target.value); }}
                  defaultValue=""
                  disabled={!canPublish || busy}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                >
                  <option value="">Rollback to…</option>
                  {(pageState?.versions ?? []).filter((version) => version.status === 'published').map((version) => (
                    <option key={version.versionId} value={version.versionId}>v{version.versionNumber} · {version.summary.slice(0, 40)}</option>
                  ))}
                </select>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Blocks</span>
                    <button onClick={() => setPaletteOpen(true)} className="rounded bg-indigo-50 p-1 text-indigo-700" aria-label="Add block"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  {doc?.blocks.length === 0 ? <p className="text-xs text-slate-400">Add a heading or hero to start.</p> : null}
                  {doc?.blocks.map((block) => (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={() => setDragId(block.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => { if (dragId) reorderRoot(dragId, block.id); setDragId(null); }}
                      onClick={() => setSelectedBlockId(block.id)}
                      className={`mb-1 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs ${selectedBlockId === block.id ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-slate-100'}`}
                    >
                      <GripVertical className="h-3 w-3 shrink-0 text-slate-400" />
                      <span className="flex-1 truncate">{FIELD_LABELS[block.type] ?? block.type}</span>
                      <button onClick={(event) => { event.stopPropagation(); patchDoc((current) => ({ ...current, blocks: updateBlock(current.blocks, block.id, (candidate) => ({ ...candidate, visible: !candidate.visible })) })); }} className="text-[10px] text-slate-400">
                        {block.visible ? 'on' : 'off'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    {(['mobile', 'tablet', 'desktop'] as const).map((device) => (
                      <button key={device} onClick={() => setPreviewDevice(device)} className={`rounded px-2 py-1 ${previewDevice === device ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>{device}</button>
                    ))}
                    <span className="ml-auto text-slate-400">{doc ? `v${latestVersion} ${pageState?.draft ? '(draft)' : '(published)'}` : ''}</span>
                  </div>
                  <div className={`mx-auto space-y-3 rounded-xl bg-white p-4 shadow-sm ${previewDevice === 'mobile' ? 'max-w-[380px]' : previewDevice === 'tablet' ? 'max-w-[720px]' : 'max-w-full'}`}>
                    {doc ? doc.blocks.map((block) => <BlockPreview key={block.id} block={block} />) : <p className="text-sm text-slate-400">Select a page.</p>}
                  </div>
                </div>

                <div className="w-64 shrink-0 overflow-y-auto border-l border-slate-200 p-3">
                  {selectedBlock ? (
                    <div className="space-y-3 text-xs">
                      <p className="font-semibold text-slate-800">{FIELD_LABELS[selectedBlock.type] ?? selectedBlock.type}</p>
                      {(BUILDER_COMPONENT_MAP[selectedBlock.type]?.props ?? []).map((field) => {
                        const value = selectedBlock.props[field.key];
                        if (field.kind === 'boolean') {
                          return (
                            <label key={field.key} className="flex items-center gap-2 text-slate-600">
                              <input type="checkbox" checked={Boolean(value)} onChange={(event) => updateProp(field.key, event.target.checked)} /> {field.label}
                            </label>
                          );
                        }
                        if (field.kind === 'select' || field.kind === 'module' || field.kind === 'metric' || field.kind === 'action') {
                          const options = field.kind === 'module' ? BUILDER_MODULES : field.kind === 'metric' ? BUILDER_METRICS.map((entry) => entry.id) : field.kind === 'action'
                            ? ['open_provider_onboarding', 'open_booking', 'open_inventory', 'open_reports', 'open_contact_provider', 'request_callback', 'download_statement', 'refresh_report']
                            : field.options ?? [];
                          return (
                            <label key={field.key} className="block text-slate-600">
                              {field.label}
                              <select value={String(value ?? '')} onChange={(event) => updateProp(field.key, event.target.value)} className="mt-1 w-full rounded border border-slate-200 px-2 py-1">
                                <option value="">—</option>
                                {options.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                          );
                        }
                        if (field.kind === 'longtext') {
                          return (
                            <label key={field.key} className="block text-slate-600">
                              {field.label}
                              <textarea value={String(value ?? '')} maxLength={field.maxLength} onChange={(event) => updateProp(field.key, event.target.value)} rows={3} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" />
                            </label>
                          );
                        }
                        return (
                          <label key={field.key} className="block text-slate-600">
                            {field.label}
                            <input
                              type={field.kind === 'number' ? 'number' : field.kind === 'color' ? 'color' : 'text'}
                              value={String(value ?? '')}
                              maxLength={field.maxLength}
                              onChange={(event) => updateProp(field.key, field.kind === 'number' ? Number(event.target.value) : event.target.value)}
                              className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                            />
                          </label>
                        );
                      })}
                      <label className="block text-slate-600">
                        Background
                        <input type="color" value={selectedBlock.style?.background || '#ffffff'} onChange={(event) => updateStyle('background', event.target.value.toUpperCase())} className="mt-1 h-7 w-full" />
                      </label>
                      <label className="block text-slate-600">
                        Alignment
                        <select value={selectedBlock.style?.align ?? ''} onChange={(event) => updateStyle('align', event.target.value)} className="mt-1 w-full rounded border border-slate-200 px-2 py-1">
                          <option value="">default</option>
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                      </label>
                      <div className="flex gap-1">
                        <button onClick={() => patchDoc((current) => ({ ...current, blocks: moveBlock(current.blocks, selectedBlock.id, -1) }))} className="rounded border border-slate-200 p-1" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => patchDoc((current) => ({ ...current, blocks: moveBlock(current.blocks, selectedBlock.id, 1) }))} className="rounded border border-slate-200 p-1" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button onClick={() => { patchDoc((current) => ({ ...current, blocks: removeBlock(current.blocks, selectedBlock.id) })); setSelectedBlockId(null); }} className="ml-auto rounded border border-red-200 p-1 text-red-600" aria-label="Delete block"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ) : doc ? (
                    <div className="space-y-3 text-xs">
                      <p className="font-semibold text-slate-800">Page settings</p>
                      <label className="block text-slate-600">
                        Title
                        <input value={doc.title} maxLength={120} onChange={(event) => patchDoc((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" />
                      </label>
                      <label className="block text-slate-600">
                        Description
                        <textarea value={doc.description} maxLength={300} rows={2} onChange={(event) => patchDoc((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" />
                      </label>
                      <div>
                        <p className="mb-1 font-semibold text-slate-700">Global theme</p>
                        {BUILDER_THEME_KEYS.map((key) => (
                          <label key={key} className="mb-1 flex items-center justify-between gap-2 text-slate-600">
                            <span>{key}</span>
                            {key === 'buttonRadius' ? (
                              <select value={doc.theme[key] ?? ''} onChange={(event) => updateTheme(key, event.target.value)} className="rounded border border-slate-200 px-1 py-0.5">
                                <option value="">default</option>
                                {BUILDER_RADII.map((radius) => <option key={radius} value={radius}>{radius}</option>)}
                              </select>
                            ) : key === 'spacing' ? (
                              <select value={doc.theme[key] ?? ''} onChange={(event) => updateTheme(key, event.target.value)} className="rounded border border-slate-200 px-1 py-0.5">
                                <option value="">default</option>
                                {BUILDER_SPACING.map((step) => <option key={step} value={step}>{step}</option>)}
                              </select>
                            ) : (
                              <input type="color" value={doc.theme[key] || '#ffffff'} onChange={(event) => updateTheme(key, event.target.value.toUpperCase())} className="h-6 w-10" />
                            )}
                          </label>
                        ))}
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="font-semibold text-slate-700">Navigation</p>
                          <button
                            onClick={() => patchDoc((current) => ({
                              ...current,
                              navigation: [...current.navigation, { id: `nav_item_${Date.now().toString(36)}`, label: 'New item', href: '#', visible: true }],
                            }))}
                            className="rounded border border-slate-200 px-1 py-0.5 text-slate-600"
                          >+ Item</button>
                        </div>
                        {doc.navigation.map((item, index) => (
                          <div key={item.id} className="mb-1 space-y-1 rounded border border-slate-200 p-1">
                            <input value={item.label} maxLength={60} onChange={(event) => updateNavigation(index, { label: event.target.value })} placeholder="Label" className="w-full rounded border border-slate-200 px-1 py-0.5" />
                            <input value={item.href} maxLength={300} onChange={(event) => updateNavigation(index, { href: event.target.value })} placeholder="/path or https://" className="w-full rounded border border-slate-200 px-1 py-0.5" />
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-1 text-[10px] text-slate-500"><input type="checkbox" checked={item.visible} onChange={(event) => updateNavigation(index, { visible: event.target.checked })} /> visible</label>
                              <button onClick={() => patchDoc((current) => ({ ...current, navigation: current.navigation.filter((_, itemIndex) => itemIndex !== index) }))} className="text-red-500" aria-label="Remove navigation item"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        ))}
                        {doc.navigation.length === 0 ? <p className="text-slate-400">No navigation items.</p> : null}
                        <p className="text-[10px] text-slate-400">Navigation is presentational; it cannot grant access to a protected route.</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">Select a page.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'modules' ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Modules</p>
                <button onClick={startNewEntity} className="rounded bg-indigo-50 p-1 text-indigo-700" aria-label="New module"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {entities.map((entity) => (
                <button key={String(entity.key)} onClick={() => loadEntity(String(entity.key))} className={`mb-1 w-full rounded-lg px-2 py-2 text-left text-xs ${entityKey === entity.key ? 'bg-indigo-600 text-white' : 'hover:bg-white'}`}>
                  <span className="block font-medium">{String(entity.label)}</span>
                  <span className={`text-[10px] ${entityKey === entity.key ? 'text-indigo-100' : 'text-slate-400'}`}>{String(entity.key)} · {String(entity.status)}</span>
                </button>
              ))}
              {entities.length === 0 ? <p className="px-2 text-xs text-slate-400">No custom modules yet.</p> : null}
            </aside>
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              {!entitySchema ? <p className="text-sm text-slate-400">Create a module to add entities such as School, Job or Application.</p> : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-slate-600">Key<input value={entitySchema.key} onChange={(event) => setEntitySchema({ ...entitySchema, key: event.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" placeholder="school_jobs" /></label>
                      <label className="text-slate-600">Label<input value={entitySchema.label} onChange={(event) => setEntitySchema({ ...entitySchema, label: event.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                      <label className="text-slate-600">Module<select value={entitySchema.module} onChange={(event) => setEntitySchema({ ...entitySchema, module: event.target.value as EntitySchemaDocument['module'] })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1">{BUILDER_MODULES.map((module) => <option key={module} value={module}>{module}</option>)}</select></label>
                      <label className="text-slate-600">Read scope<select value={entitySchema.permissions.read} onChange={(event) => setEntitySchema({ ...entitySchema, permissions: { ...entitySchema.permissions, read: event.target.value as EntitySchemaDocument['permissions']['read'] } })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1"><option value="authenticated">authenticated</option><option value="public">public</option><option value="admin">admin</option></select></label>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-slate-700">Fields</p>
                      {entitySchema.fields.map((field, index) => (
                        <div key={index} className="mb-2 grid grid-cols-12 gap-1">
                          <input value={field.key} onChange={(event) => { const fields = [...entitySchema.fields]; fields[index] = { ...field, key: event.target.value }; setEntitySchema({ ...entitySchema, fields }); }} placeholder="key" className="col-span-3 rounded border border-slate-200 px-1 py-1" />
                          <input value={field.label} onChange={(event) => { const fields = [...entitySchema.fields]; fields[index] = { ...field, label: event.target.value }; setEntitySchema({ ...entitySchema, fields }); }} placeholder="label" className="col-span-4 rounded border border-slate-200 px-1 py-1" />
                          <select value={field.type} onChange={(event) => { const fields = [...entitySchema.fields]; fields[index] = { ...field, type: event.target.value as EntityFieldDescriptor['type'] }; setEntitySchema({ ...entitySchema, fields }); }} className="col-span-3 rounded border border-slate-200 px-1 py-1">
                            {['text', 'textarea', 'number', 'money', 'boolean', 'date', 'datetime', 'select', 'multiselect', 'email', 'phone', 'url', 'media', 'relation'].map((type) => <option key={type} value={type}>{type}</option>)}
                          </select>
                          <button onClick={() => setEntitySchema({ ...entitySchema, fields: entitySchema.fields.filter((_, i) => i !== index) })} className="col-span-1 text-red-500" aria-label="Remove field"><Trash2 className="h-3.5 w-3.5" /></button>
                          <label className="col-span-1 flex items-center gap-1 text-[10px] text-slate-500"><input type="checkbox" checked={field.required} onChange={(event) => { const fields = [...entitySchema.fields]; fields[index] = { ...field, required: event.target.checked }; setEntitySchema({ ...entitySchema, fields }); }} />req</label>
                        </div>
                      ))}
                      <button onClick={() => setEntitySchema({ ...entitySchema, fields: [...entitySchema.fields, { ...EMPTY_FIELD }] })} className="rounded border border-slate-200 px-2 py-1 text-slate-600">+ Field</button>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-slate-700">Relations</p>
                      {entitySchema.relations.map((relation: EntityRelationDescriptor, index: number) => (
                        <div key={index} className="mb-1 flex gap-1">
                          <input value={relation.key} onChange={(event) => { const relations = [...entitySchema.relations]; relations[index] = { ...relation, key: event.target.value }; setEntitySchema({ ...entitySchema, relations }); }} placeholder="school_id" className="flex-1 rounded border border-slate-200 px-1 py-1" />
                          <input value={relation.target} onChange={(event) => { const relations = [...entitySchema.relations]; relations[index] = { ...relation, target: event.target.value }; setEntitySchema({ ...entitySchema, relations }); }} placeholder="schools" className="flex-1 rounded border border-slate-200 px-1 py-1" />
                          <select value={relation.type} onChange={(event) => { const relations = [...entitySchema.relations]; relations[index] = { ...relation, type: event.target.value as EntityRelationDescriptor['type'] }; setEntitySchema({ ...entitySchema, relations }); }} className="rounded border border-slate-200 px-1 py-1"><option value="belongs_to">belongs to</option><option value="has_many">has many</option></select>
                          <button onClick={() => setEntitySchema({ ...entitySchema, relations: entitySchema.relations.filter((_, i) => i !== index) })} className="text-red-500" aria-label="Remove relation"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      <button onClick={() => setEntitySchema({ ...entitySchema, relations: [...entitySchema.relations, { key: '', target: '', type: 'belongs_to', required: false }] })} className="rounded border border-slate-200 px-2 py-1 text-slate-600">+ Relation</button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveEntity} disabled={busy} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Save draft</button>
                      <button onClick={handlePublishEntity} disabled={busy || !canPublish} title={canPublish ? '' : 'Super Admin required'} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-40"><Send className="h-3.5 w-3.5" /> Publish</button>
                      <select
                        onChange={(event) => { if (event.target.value) void handleRollbackEntity(event.target.value); }}
                        defaultValue=""
                        disabled={busy || !canPublish}
                        className="rounded-lg border border-slate-200 px-2 py-1"
                      >
                        <option value="">Rollback module to…</option>
                        {entityVersions.filter((version) => version.status === 'published').map((version) => (
                          <option key={String(version.id)} value={String(version.id)}>v{String(version.version_number)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <p className="font-semibold text-slate-700">Records</p>
                    {!entityVersions.some((version) => version.status === 'published') ? <p className="text-slate-400">Publish the module schema before adding records.</p> : (
                      <>
                        <div className="space-y-1 rounded-lg border border-slate-200 p-2">
                          {entitySchema.fields.map((field) => (
                            <label key={field.key} className="block text-slate-600">
                              {field.label}{field.required ? ' *' : ''}
                              <input
                                value={String(recordDraft[field.key] ?? '')}
                                onChange={(event) => setRecordDraft({ ...recordDraft, [field.key]: event.target.value })}
                                className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1"
                                type={field.type === 'number' || field.type === 'money' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                              />
                            </label>
                          ))}
                          <button onClick={handleSaveRecord} disabled={busy} className="mt-1 rounded bg-slate-900 px-2 py-1 text-white disabled:opacity-40">Add record</button>
                        </div>
                        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-400"><tr><th className="px-2 py-1">Record</th><th className="px-2 py-1">Status</th><th /></tr></thead>
                            <tbody>
                              {records.map((record) => (
                                <tr key={String(record.id)} className="border-t border-slate-100">
                                  <td className="px-2 py-1 font-mono text-[10px]">{String(record.id).slice(0, 8)}</td>
                                  <td className="px-2 py-1">{String(record.data?.status ?? 'active')}</td>
                                  <td className="px-2 py-1 text-right"><button onClick={async () => { await archiveRecord(entitySchema.key, String(record.id)); setRecords(await fetchRecords(entitySchema.key)); }} className="text-[10px] text-red-600">archive</button></td>
                                </tr>
                              ))}
                              {records.length === 0 ? <tr><td colSpan={3} className="px-2 py-2 text-slate-400">No records.</td></tr> : null}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'reports' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <select value={metric} onChange={(event) => setMetric(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5">
                {BUILDER_METRICS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
              <span className="text-slate-400">{BUILDER_METRICS.find((entry) => entry.id === metric)?.description}</span>
            </div>
            {report ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-400">
                    <tr>{Object.keys(report.rows[0] ?? {}).map((key) => <th key={key} className="px-3 py-2">{key.replace(/_/g, ' ')}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        {Object.keys(report.rows[0] ?? {}).map((key) => <td key={key} className="px-3 py-2">{String((row as Record<string, unknown>)[key] ?? '')}</td>)}
                      </tr>
                    ))}
                    {report.rows.length === 0 ? <tr><td className="px-3 py-3 text-slate-400">No data for this metric yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-slate-400">Loading report…</p>}
            <p className="mt-2 text-[10px] text-slate-400">Approved metric only; the SQL is fixed on the server. Generated {report?.generatedAt ?? '—'}.</p>
          </div>
        ) : null}

        {tab === 'policies' ? (
          <div className="flex-1 overflow-y-auto p-4 text-xs">
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Approved policy configuration only. Prices, availability, refunds and permissions are still calculated and enforced by the server; these values never bypass pricing, inventory, RLS or financial validation.
            </div>
            {!policies ? <p className="text-slate-400">Loading approved policies…</p> : (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 font-bold text-slate-800">Payment policy</h3>
                  <p className="mb-2 text-slate-500">Advertised methods only. Capture, refunds and settlement stay server-side.</p>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {POLICY_PAYMENT_METHODS.map((method) => (
                      <label key={method} className="flex items-center gap-1 text-slate-600">
                        <input type="checkbox" checked={policies.payment.methods.includes(method)} onChange={(event) => patchPolicy('payment', { methods: event.target.checked ? [...policies.payment.methods, method] : policies.payment.methods.filter((entry) => entry !== method) })} /> {method}
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-slate-600">Deposit display %<input type="number" min={0} max={100} value={policies.payment.depositDisplayPercent} onChange={(event) => patchPolicy('payment', { depositDisplayPercent: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                    <label className="text-slate-600">Refund window (days)<input type="number" min={0} max={60} value={policies.payment.refundWindowDays} onChange={(event) => patchPolicy('payment', { refundWindowDays: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                    <label className="text-slate-600">Manual review above<input type="number" min={0} value={policies.payment.manualReviewAbove} onChange={(event) => patchPolicy('payment', { manualReviewAbove: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                    <label className="text-slate-600">Settlement cycle<select value={policies.payment.settlementCycle} onChange={(event) => patchPolicy('payment', { settlementCycle: event.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1">{POLICY_SETTLEMENT_CYCLES.map((cycle) => <option key={cycle} value={cycle}>{cycle}</option>)}</select></label>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 font-bold text-slate-800">Inventory policy</h3>
                  <p className="mb-2 text-slate-500">Holds and buffers are advisory; live availability remains authoritative.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-slate-600">Hold minutes<input type="number" min={1} max={240} value={policies.inventory.holdMinutes} onChange={(event) => patchPolicy('inventory', { holdMinutes: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                    <label className="text-slate-600">Overbooking buffer<input type="number" min={0} max={20} value={policies.inventory.overbookingBuffer} onChange={(event) => patchPolicy('inventory', { overbookingBuffer: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                    <label className="text-slate-600">Minimum notice (hours)<input type="number" min={0} max={168} value={policies.inventory.minNoticeHours} onChange={(event) => patchPolicy('inventory', { minNoticeHours: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1" /></label>
                    <label className="mt-5 flex items-center gap-2 text-slate-600"><input type="checkbox" checked={policies.inventory.autoRelease} onChange={(event) => patchPolicy('inventory', { autoRelease: event.target.checked })} /> Auto-release expired holds</label>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 font-bold text-slate-800">Role-scoped UI</h3>
                  <p className="mb-2 text-slate-500">Only controls which sections are offered. Server authorization and RLS still decide access.</p>
                  {(['customerSections', 'providerSections', 'adminSections'] as const).map((group) => (
                    <div key={group} className="mb-2">
                      <p className="font-semibold text-slate-700">{group.replace('Sections', '')}</p>
                      <div className="flex flex-wrap gap-2">
                        {POLICY_ROLE_SECTIONS.map((section) => (
                          <label key={section} className="flex items-center gap-1 text-slate-600">
                            <input
                              type="checkbox"
                              checked={policies.roles[group].includes(section)}
                              onChange={(event) => patchPolicy('roles', {
                                [group]: event.target.checked
                                  ? [...policies.roles[group], section]
                                  : policies.roles[group].filter((entry) => entry !== section),
                              })}
                            /> {section}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>

                <section className="rounded-xl border border-slate-200 p-3">
                  <h3 className="mb-2 font-bold text-slate-800">Report configuration</h3>
                  <label className="mb-2 block text-slate-600">Default range<select value={policies.reports.defaultRange} onChange={(event) => patchPolicy('reports', { defaultRange: event.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1">{POLICY_REPORT_RANGES.map((range) => <option key={range} value={range}>{range}</option>)}</select></label>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {POLICY_REPORT_METRICS.map((metricId) => (
                      <label key={metricId} className="flex items-center gap-1 text-slate-600">
                        <input type="checkbox" checked={policies.reports.metrics.includes(metricId)} onChange={(event) => patchPolicy('reports', { metrics: event.target.checked ? [...policies.reports.metrics, metricId] : policies.reports.metrics.filter((entry) => entry !== metricId) })} /> {metricId}
                      </label>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={policies.reports.exportEnabled} onChange={(event) => patchPolicy('reports', { exportEnabled: event.target.checked })} /> Allow report export</label>
                </section>

                <div className="lg:col-span-2">
                  <button onClick={handleSavePolicies} disabled={policyBusy} className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-white disabled:opacity-40">
                    <Save className="h-3.5 w-3.5" /> Save approved policies
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'audit' ? (
          <div className="flex-1 overflow-y-auto p-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-slate-400">
                <tr><th className="px-2 py-2">When</th><th className="px-2 py-2">Actor</th><th className="px-2 py-2">Action</th><th className="px-2 py-2">Target</th><th className="px-2 py-2">Summary</th></tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={String(entry.id)} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-500">{String(entry.created_at).slice(0, 19).replace('T', ' ')}</td>
                    <td className="px-2 py-1.5">{String(entry.actor_role ?? '')}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px]">{String(entry.action ?? '')}</td>
                    <td className="px-2 py-1.5">{String(entry.target_kind ?? '')}:{String(entry.target_key ?? '')}</td>
                    <td className="px-2 py-1.5 text-slate-600">{String(entry.summary ?? '')}</td>
                  </tr>
                ))}
                {audit.length === 0 ? <tr><td className="px-2 py-3 text-slate-400">No builder activity yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {paletteOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="max-h-[80%] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Add an approved component</h3>
                <button onClick={() => setPaletteOpen(false)} className="rounded p-1 text-slate-500"><X className="h-4 w-4" /></button>
              </div>
              <p className="mb-3 text-xs text-slate-500">Only registry components can be added. Scripts, raw HTML and custom code are rejected by the server and the database.</p>
              {(['content', 'layout', 'navigation', 'data', 'commerce'] as const).map((category) => (
                <div key={category} className="mb-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-slate-400">{category}</p>
                  <div className="flex flex-wrap gap-1">
                    {BUILDER_COMPONENTS.filter((component) => component.category === category).map((component) => (
                      <button key={component.type} onClick={() => addBlock(component)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:border-indigo-400 hover:bg-indigo-50">
                        {component.label}
                        {component.superAdminPublish ? <span className="ml-1 text-[9px] text-amber-600">SA</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
