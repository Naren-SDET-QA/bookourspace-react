import React, { useState, useEffect } from 'react';
import SafeImage from './SafeImage';
import UniversalMediaManager from './UniversalMediaManager';
import {
  ShieldCheck,
  Edit3,
  Eye,
  Send,
  RotateCcw,
  History,
  Layers,
  Image as ImageIcon,
  Palette,
  Type,
  Sliders,
  ArrowUp,
  ArrowDown,
  Smartphone,
  Monitor,
  Tablet,
  CheckCircle2,
  X,
  Plus,
  Trash2,
  MousePointerClick,
  Sparkles,
  Globe,
  Lock,
  ExternalLink,
} from 'lucide-react';
import {
  CustomerPageId,
  LivePageEditorConfig,
  LivePageVersionSnapshot,
  LivePageAuditEntry,
  EditablePageSectionItem,
  InspectedDomElementOverride,
  fetchLivePageConfigFromBackend,
  saveLivePageDraftToBackend,
  publishLivePageConfigToBackend,
  rollbackLivePageConfigVersion,
  loadPublishedLivePageConfig,
  loadDraftLivePageConfig,
  loadLivePageVersions,
  loadLivePageAuditLogs,
} from '../utils/livePageEditorStore';
import {
  loadSpotlightSubcategoriesModuleMap,
  toggleSpotlightSubcategoriesForSection,
  loadSearchDateRangeModuleMap,
  toggleSearchDateRangeForSection,
} from './ModularSystemEngine';

interface LiveAdminPageEditorProps {
  userRole: 'customer' | 'provider' | 'admin';
  activePageId: CustomerPageId;
  onSelectPageId: (pageId: CustomerPageId) => void;
  isOpenExternal?: boolean;
  /** Open directly in element-pick mode so every page element exposes an edit action. */
  initialInspectMode?: boolean;
  onCloseExternal?: () => void;
  onConfigUpdated?: (activeConfig: LivePageEditorConfig, isDraftPreview: boolean) => void;
  onNotify?: (msg: string) => void;
}

type EditorTabId =
  | 'text_buttons'
  | 'images_banners'
  | 'sections_order'
  | 'colors_style'
  | 'categories_forms'
  | 'history_rollback';

const CUSTOMER_PAGES_META: { id: CustomerPageId; label: string; icon: string }[] = [
  { id: 'pg_hostels', label: "PG's & Hostels", icon: '🏠' },
  { id: 'classes', label: 'Classes & Courses', icon: '🎓' },
  { id: 'venues', label: 'Function Halls & Venues', icon: '🏛️' },
  { id: 'services', label: 'Home & Local Services', icon: '🛠️' },
  { id: 'hotel_stay', label: 'Hotel & Stay', icon: '🏨' },
  { id: 'movies', label: 'Movies & Multiplex', icon: '🎬' },
];

export const LiveAdminPageEditor: React.FC<LiveAdminPageEditorProps> = ({
  userRole,
  activePageId,
  onSelectPageId,
  isOpenExternal,
  initialInspectMode = false,
  onCloseExternal,
  onConfigUpdated,
  onNotify,
}) => {
  const [publishedConfig, setPublishedConfig] = useState<LivePageEditorConfig>(() =>
    loadPublishedLivePageConfig()
  );
  const [draftConfig, setDraftConfig] = useState<LivePageEditorConfig>(() =>
    loadDraftLivePageConfig()
  );
  const [versions, setVersions] = useState<LivePageVersionSnapshot[]>(() =>
    loadLivePageVersions()
  );
  const [auditLogs, setAuditLogs] = useState<LivePageAuditEntry[]>(() =>
    loadLivePageAuditLogs()
  );

  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<EditorTabId>('text_buttons');
  const [previewMode, setPreviewMode] = useState<'draft' | 'published'>('draft');
  const [devicePreview, setDevicePreview] = useState<'web' | 'android' | 'ios'>('web');
  const [inspectMode, setInspectMode] = useState<boolean>(false);
  const [selectedDomKey, setSelectedDomKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editorToast, setEditorToast] = useState<string | null>(null);
  const [changeSummaryInput, setChangeSummaryInput] = useState<string>('');

  // New Category & Form Option inputs
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('✨');
  const [newCategoryBadge, setNewCategoryBadge] = useState('');
  const [newFormFieldLabel, setNewFormFieldLabel] = useState('');
  const [newFormFieldOptions, setNewFormFieldOptions] = useState('');

  const notify = (msg: string) => {
    setEditorToast(msg);
    setTimeout(() => setEditorToast(null), 3500);
    if (onNotify) onNotify(msg);
  };

  // Sync external open trigger
  useEffect(() => {
    if (isOpenExternal) {
      setIsDrawerOpen(true);
    }
  }, [isOpenExternal]);

  useEffect(() => {
    if (isOpenExternal && initialInspectMode && userRole === 'admin') {
      setIsDrawerOpen(false);
      setInspectMode(true);
      notify('🎯 Edit mode: hover any element and click the ✏️ Edit badge (or the element) to change it.');
    }
  }, [isOpenExternal, initialInspectMode, userRole]);

  // Initial fetch from backend
  useEffect(() => {
    let mounted = true;
    fetchLivePageConfigFromBackend()
      .then((res) => {
        if (!mounted) return;
        setPublishedConfig(res.published);
        setDraftConfig(res.draft);
        setVersions(res.versions);
        setAuditLogs(res.auditLogs);
      })
      .catch(() => {
        if (mounted) setEditorToast('Central App Builder storage is unavailable. No remote configuration was loaded.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Broadcast active config to parent App whenever draft/published or previewMode changes
  useEffect(() => {
    const active =
      userRole === 'admin' && (isDrawerOpen || previewMode === 'draft')
        ? previewMode === 'draft'
          ? draftConfig
          : publishedConfig
        : publishedConfig;
    if (onConfigUpdated) {
      onConfigUpdated(active, userRole === 'admin' && previewMode === 'draft');
    }
  }, [draftConfig, publishedConfig, previewMode, userRole, isDrawerOpen]);

  // Apply non-destructive DOM overrides for inspected elements
  useEffect(() => {
    const activeCfg =
      userRole === 'admin' && previewMode === 'draft' ? draftConfig : publishedConfig;
    const overrides = activeCfg.domOverrides || {};
    Object.values(overrides).forEach((ov) => {
      if (ov.pageId !== activePageId) return;
      try {
        const el = document.querySelector<HTMLElement>(`[data-bos-dom-key="${ov.selectorKey}"]`);
        if (!el) return;
        if (ov.hidden !== undefined) {
          el.style.display = ov.hidden ? 'none' : '';
        }
        if (ov.customBgColor) {
          el.style.backgroundColor = ov.customBgColor;
        }
        if (ov.customTextColor) {
          el.style.color = ov.customTextColor;
        }
        if (el.tagName === 'IMG' && ov.customImageUrl) {
          (el as HTMLImageElement).src = ov.customImageUrl;
        } else if (ov.customText && el.childNodes.length <= 2) {
          el.textContent = ov.customText;
        }
      } catch {
        // Ignore invalid selector
      }
    });
  }, [draftConfig, publishedConfig, previewMode, activePageId, userRole]);

  // Click-to-Select Page Element Inspector (Only active when Admin explicitly turns on Inspect Mode)
  useEffect(() => {
    if (userRole !== 'admin' || !inspectMode) return;

    // A floating pencil badge makes the edit affordance visible on every
    // hovered element, not just an outline.
    const chip = document.createElement('div');
    chip.id = 'bos-inline-edit-chip';
    chip.textContent = '\u270F\uFE0F Edit';
    chip.setAttribute('aria-hidden', 'true');
    Object.assign(chip.style, {
      position: 'fixed',
      zIndex: '2147483000',
      display: 'none',
      pointerEvents: 'none',
      padding: '2px 7px',
      borderRadius: '999px',
      background: '#f59e0b',
      color: '#111827',
      fontSize: '10px',
      fontWeight: '900',
      lineHeight: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    });
    document.body.appendChild(chip);
    const cursorStyle = document.createElement('style');
    cursorStyle.id = 'bos-inline-edit-cursor';
    cursorStyle.textContent = 'body[data-bos-inline-edit="1"] { cursor: crosshair; }';
    document.head.appendChild(cursorStyle);
    document.body.dataset.bosInlineEdit = '1';

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('[data-bos-live-editor-ui="true"]')) return;
      target.style.outline = '2px dashed #F59E0B';
      target.style.outlineOffset = '2px';
      const rect = target.getBoundingClientRect();
      chip.style.display = 'block';
      chip.style.top = `${Math.max(2, rect.top + 3)}px`;
      chip.style.left = `${Math.max(2, rect.right - 58)}px`;
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('[data-bos-live-editor-ui="true"]')) return;
      target.style.outline = '';
      target.style.outlineOffset = '';
      chip.style.display = 'none';
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('[data-bos-live-editor-ui="true"]')) return;

      e.preventDefault();
      e.stopPropagation();
      target.style.outline = '';

      let domKey = target.getAttribute('data-bos-dom-key');
      if (!domKey) {
        domKey = `el-${activePageId}-${target.tagName.toLowerCase()}-${Date.now().toString().slice(-4)}`;
        target.setAttribute('data-bos-dom-key', domKey);
      }

      const existing = draftConfig.domOverrides[domKey];
      const textSample = (target.textContent || '').trim().slice(0, 120);
      const imgSrc = target.tagName === 'IMG' ? (target as HTMLImageElement).src : undefined;

      const nextOverride: InspectedDomElementOverride = existing || {
        selectorKey: domKey,
        tagName: target.tagName,
        pageId: activePageId,
        originalText: textSample || target.tagName,
        customText: textSample,
        customImageUrl: imgSrc,
        hidden: false,
        updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      };

      setDraftConfig((prev) => ({
        ...prev,
        domOverrides: {
          ...prev.domOverrides,
          [domKey!]: nextOverride,
        },
      }));
      setSelectedDomKey(domKey);
      setIsDrawerOpen(true);
      setActiveTab('text_buttons');
      setInspectMode(false);
      notify(`🎯 Selected <${target.tagName.toLowerCase()}> element for live editing!`);
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      document.removeEventListener('click', handleClick, true);
      chip.remove();
      cursorStyle.remove();
      delete document.body.dataset.bosInlineEdit;
    };
  }, [userRole, inspectMode, activePageId, draftConfig.domOverrides]);

  // Security guard: Never render editor controls for non-admin users
  if (userRole !== 'admin') {
    return null;
  }

  const currentPageDraft = draftConfig.pages[activePageId];
  const selectedDomOverride = selectedDomKey
    ? draftConfig.domOverrides[selectedDomKey]
    : null;

  const updateCurrentPageDraft = (
    updater: (page: typeof currentPageDraft) => typeof currentPageDraft
  ) => {
    setDraftConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        [activePageId]: updater(prev.pages[activePageId]),
      },
    }));
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const sorted = [...currentPageDraft.sections].sort((a, b) => a.order - b.order);
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const temp = sorted[index];
    sorted[index] = sorted[targetIdx];
    sorted[targetIdx] = temp;
    const reordered: EditablePageSectionItem[] = sorted.map((sec, idx) => ({
      ...sec,
      order: idx + 1,
    }));
    updateCurrentPageDraft((p) => ({ ...p, sections: reordered }));
    notify(`↕️ Updated section order for ${currentPageDraft.pageName}`);
  };

  const handleToggleSectionVisibility = (secId: EditablePageSectionItem['id']) => {
    if (secId === 'spotlight_subcategories') {
      const curSec = currentPageDraft.sections.find((s) => s.id === 'spotlight_subcategories');
      const nextVisible = !(curSec?.visible ?? loadSpotlightSubcategoriesModuleMap()[activePageId]);
      toggleSpotlightSubcategoriesForSection(activePageId, nextVisible);
      updateCurrentPageDraft((p) => ({
        ...p,
        sections: p.sections.map((s) =>
          s.id === 'spotlight_subcategories' ? { ...s, visible: nextVisible } : s
        ),
      }));
      notify(
        `🌟 ${currentPageDraft.pageName}: Spotlight Subcategories ${
          nextVisible ? 'ENABLED' : 'DISABLED'
        }!`
      );
      return;
    }

    if (secId === 'search_date_range_filter') {
      const curSec = currentPageDraft.sections.find((s) => s.id === 'search_date_range_filter');
      const nextVisible = !(curSec?.visible ?? loadSearchDateRangeModuleMap()[activePageId]);
      toggleSearchDateRangeForSection(activePageId, nextVisible);
      updateCurrentPageDraft((p) => ({
        ...p,
        sections: p.sections.map((s) =>
          s.id === 'search_date_range_filter' ? { ...s, visible: nextVisible } : s
        ),
      }));
      notify(
        `📅 ${currentPageDraft.pageName}: Search Date-Range Filter ${
          nextVisible ? 'ENABLED' : 'DISABLED'
        }!`
      );
      return;
    }

    updateCurrentPageDraft((p) => ({
      ...p,
      sections: p.sections.map((s) =>
        s.id === secId ? { ...s, visible: !s.visible } : s
      ),
    }));
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    const summary =
      changeSummaryInput.trim() ||
      `Updated ${currentPageDraft.pageName} content, labels & layout`;
    try {
      const res = await saveLivePageDraftToBackend(draftConfig, activePageId, summary);
      setDraftConfig(res.draft);
      setVersions(res.versions);
      setAuditLogs(res.auditLogs);
      notify(`📝 Draft saved to backend for ${currentPageDraft.pageName}!`);
    } catch {
      notify('Draft was not saved. Configure the development Supabase Auth session and active admin profile, then retry.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishLive = async () => {
    setIsSaving(true);
    const summary =
      changeSummaryInput.trim() ||
      `Published ${currentPageDraft.pageName} updates for connected web clients`;
    try {
      const res = await publishLivePageConfigToBackend(draftConfig, activePageId, summary);
      setPublishedConfig(res.published);
      setDraftConfig(res.published);
      setVersions(res.versions);
      setAuditLogs(res.auditLogs);
      setChangeSummaryInput('');
      notify(
        `🚀 Published ${res.published.versionId} for connected React web clients.`
      );
    } catch {
      notify('Publish failed. Published configuration is unchanged; the latest draft may have been saved. Check history before retrying.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    setIsSaving(true);
    try {
      const res = await rollbackLivePageConfigVersion(versionId);
      setPublishedConfig(res.published);
      setDraftConfig(res.draft);
      setVersions(res.versions);
      setAuditLogs(res.auditLogs);
      notify(`⏪ Created a new rollback version from ${versionId} for connected React web clients.`);
    } catch {
      notify('Rollback failed. Published configuration is unchanged. Configure the development Supabase Auth session and active admin profile, then retry.');
    } finally {
      setIsSaving(false);
    }
  };

  const sortedSections = [...currentPageDraft.sections].sort(
    (a, b) => a.order - b.order
  );

  return (
    <div data-bos-live-editor-ui="true">
      {/* Floating Live Admin Page Editor Pill Bar (Bottom-Left / Top-Right Safe Dock) */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
        {editorToast && (
          <div className="bg-slate-950 text-white border-2 border-amber-400 px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-black flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{editorToast}</span>
          </div>
        )}

        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 text-white p-1.5 rounded-2xl shadow-2xl border-2 border-amber-400/80 flex items-center gap-1.5">
          <div className="px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Live Admin Editor</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setInspectMode(!inspectMode);
              if (!inspectMode) {
                notify('🎯 Click any heading, text, button, or image on the page to edit it!');
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition ${
              inspectMode
                ? 'bg-emerald-500 text-slate-950 animate-pulse'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Click to select and edit any element on the page"
          >
            <MousePointerClick className="w-3.5 h-3.5 text-amber-300" />
            <span>{inspectMode ? 'Click Any Element...' : 'Inspect Element'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="px-3 py-1.5 rounded-xl bg-[#4338CA] hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#FFE500]" />
            <span>
              {isDrawerOpen ? 'Close Studio' : `Edit Page (${currentPageDraft.icon} ${currentPageDraft.pageName})`}
            </span>
          </button>
        </div>
      </div>

      {/* Full Live Admin Page Editor Studio Drawer / Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Top Studio Header */}
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-purple-950 text-white p-4 border-b border-indigo-800/60 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Authorized Admin • App Builder</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black">
                    Live: {publishedConfig.versionId}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      setInspectMode(true);
                      notify('🎯 Inspect Mode Active: Click any text, button, or image on the page!');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <MousePointerClick className="w-3.5 h-3.5" />
                    <span>Pick Element on Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      if (onCloseExternal) onCloseExternal();
                    }}
                    className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Page Selector Ribbon (All 6 Customer-Facing Pages) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {CUSTOMER_PAGES_META.map((pg) => {
                  const active = pg.id === activePageId;
                  return (
                    <button
                      key={pg.id}
                      type="button"
                      onClick={() => onSelectPageId(pg.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
                        active
                          ? 'bg-[#FFE500] text-slate-950 shadow-sm'
                          : 'bg-white/10 hover:bg-white/20 text-indigo-100'
                      }`}
                    >
                      <span>{pg.icon}</span>
                      <span>{pg.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Preview Mode & responsive device preview bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-indigo-200 font-bold">State View:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('draft')}
                    className={`px-2.5 py-1 rounded-lg font-black cursor-pointer ${
                      previewMode === 'draft'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    ✏️ Editing Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('published')}
                    className={`px-2.5 py-1 rounded-lg font-black cursor-pointer ${
                      previewMode === 'published'
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    👁️ Published Live
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-indigo-200 font-bold mr-1">Device preview:</span>
                  {(
                    [
                      { id: 'web', label: 'Web', icon: Monitor },
                      { id: 'android', label: 'Android', icon: Smartphone },
                      { id: 'ios', label: 'iOS', icon: Tablet },
                    ] as const
                  ).map((dev) => {
                    const DevIcon = dev.icon;
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => setDevicePreview(dev.id)}
                        className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer ${
                          devicePreview === dev.id
                            ? 'bg-indigo-500 text-white'
                            : 'bg-white/10 text-indigo-200'
                        }`}
                      >
                        <DevIcon className="w-3 h-3" />
                        <span>{dev.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Editor Category Navigation Tabs */}
            <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'text_buttons', label: 'Text, Labels & Buttons', icon: Type },
                { id: 'images_banners', label: 'Images & Hero Banners', icon: ImageIcon },
                { id: 'sections_order', label: 'Section Order & Visibility', icon: Layers },
                { id: 'colors_style', label: 'Colors & Styling', icon: Palette },
                { id: 'categories_forms', label: 'Categories & Form Options', icon: Sliders },
                { id: 'history_rollback', label: `History & Rollback (${versions.length})`, icon: History },
              ].map((t) => {
                const TabIcon = t.icon;
                const isSelected = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id as EditorTabId)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#4338CA] text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-indigo-50'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Main Scrollable Studio Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs text-slate-800 dark:text-slate-200">
              {/* Live Device Preview Mini-Frame */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>
                      {devicePreview.toUpperCase()} Preview — {currentPageDraft.icon}{' '}
                      {currentPageDraft.pageName} ({previewMode.toUpperCase()})
                    </span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Zero-Downtime Non-Destructive Sync
                  </span>
                </div>

                <div
                  className={`mx-auto transition-all border border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 p-3 space-y-2 ${
                    devicePreview === 'web'
                      ? 'w-full'
                      : devicePreview === 'android'
                      ? 'max-w-[360px]'
                      : 'max-w-[375px]'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                    <span className="font-black text-[11px]" style={{ color: currentPageDraft.colors.primaryColor }}>
                      {draftConfig.globalBrandName} • {currentPageDraft.pageName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800">
                      {devicePreview === 'web' ? 'Web' : devicePreview === 'android' ? 'Android layout' : 'iOS layout'}
                    </span>
                  </div>
                  {currentPageDraft.heroBanner.visible && (
                    <div
                      className="p-2.5 rounded-xl text-white flex items-center gap-2.5"
                      style={{
                        background: `linear-gradient(135deg, ${currentPageDraft.heroBanner.bgColorFrom}, ${currentPageDraft.heroBanner.bgColorTo})`,
                      }}
                    >
                      <SafeImage category="general"
                        src={currentPageDraft.heroBanner.imageUrl}
                        alt="Hero preview"
                        className="w-12 h-12 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-black/30">
                          {currentPageDraft.heroBanner.badgeText}
                        </span>
                        <div className="font-black text-xs truncate mt-0.5">
                          {currentPageDraft.heroBanner.headline}
                        </div>
                        <div className="text-[10px] opacity-90 truncate">
                          {currentPageDraft.heroBanner.subheadline}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-xs text-slate-900 dark:text-white truncate">
                        {currentPageDraft.labelsAndButtons.pageHeadingTitle}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {currentPageDraft.labelsAndButtons.pageSubheading}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-white text-[10px] font-black shrink-0 ${currentPageDraft.colors.buttonRadius}`}
                      style={{ backgroundColor: currentPageDraft.colors.primaryColor }}
                    >
                      {currentPageDraft.labelsAndButtons.primaryBookButtonLabel}
                    </span>
                  </div>
                </div>
              </div>

              {/* TAB 1: TEXT, LABELS, BUTTONS & CLICK-TO-INSPECT ELEMENT */}
              {activeTab === 'text_buttons' && (
                <div className="space-y-4">
                  {/* Selected DOM Element Inspector (if admin clicked an element on page) */}
                  {selectedDomOverride && (
                    <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border-2 border-amber-400 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-amber-900 dark:text-amber-200 uppercase text-[11px] flex items-center gap-1.5">
                          <MousePointerClick className="w-4 h-4 text-amber-600" />
                          <span>
                            Inspected Page Element (&lt;{selectedDomOverride.tagName.toLowerCase()}&gt;)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDomKey(null)}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          Close Inspector ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="font-bold block mb-1">Element Text Content</label>
                          <input
                            type="text"
                            value={selectedDomOverride.customText || ''}
                            onChange={(e) =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                domOverrides: {
                                  ...prev.domOverrides,
                                  [selectedDomKey!]: {
                                    ...selectedDomOverride,
                                    customText: e.target.value,
                                  },
                                },
                              }))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                          />
                        </div>

                        {selectedDomOverride.tagName === 'IMG' && (
                          <div className="sm:col-span-2">
                            <label className="font-bold block mb-1">Image URL Override</label>
                            <input
                              type="text"
                              value={selectedDomOverride.customImageUrl || ''}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  domOverrides: {
                                    ...prev.domOverrides,
                                    [selectedDomKey!]: {
                                      ...selectedDomOverride,
                                      customImageUrl: e.target.value,
                                    },
                                  },
                                }))
                              }
                              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                        )}

                        <div>
                          <label className="font-bold block mb-1">Custom Text Color</label>
                          <input
                            type="color"
                            value={selectedDomOverride.customTextColor || '#1e293b'}
                            onChange={(e) =>
                              setDraftConfig((prev) => ({
                                ...prev,
                                domOverrides: {
                                  ...prev.domOverrides,
                                  [selectedDomKey!]: {
                                    ...selectedDomOverride,
                                    customTextColor: e.target.value,
                                  },
                                },
                              }))
                            }
                            className="w-full h-9 rounded-xl cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-5">
                          <label className="flex items-center gap-2 font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!selectedDomOverride.hidden}
                              onChange={(e) =>
                                setDraftConfig((prev) => ({
                                  ...prev,
                                  domOverrides: {
                                    ...prev.domOverrides,
                                    [selectedDomKey!]: {
                                      ...selectedDomOverride,
                                      hidden: e.target.checked,
                                    },
                                  },
                                }))
                              }
                            />
                            <span>Hide This Element on Page</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Global Brand & Announcement Copy */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      Global Brand & Cross-Platform Header Copy
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold block mb-1">Global Brand Name</label>
                        <input
                          type="text"
                          value={draftConfig.globalBrandName}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, globalBrandName: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Global Support / CTA Link</label>
                        <input
                          type="text"
                          value={draftConfig.globalSupportLink}
                          onChange={(e) =>
                            setDraftConfig({ ...draftConfig, globalSupportLink: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="font-bold block mb-1">Global Top Ribbon Text</label>
                        <input
                          type="text"
                          value={draftConfig.globalAnnouncementBarText}
                          onChange={(e) =>
                            setDraftConfig({
                              ...draftConfig,
                              globalAnnouncementBarText: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Page-Specific Headings, Labels, Buttons & Links */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      {currentPageDraft.icon} {currentPageDraft.pageName} — Page Headings, Buttons & Links
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <label className="font-bold block mb-1">Page Main Heading Title</label>
                        <input
                          type="text"
                          value={currentPageDraft.labelsAndButtons.pageHeadingTitle}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              labelsAndButtons: {
                                ...p.labelsAndButtons,
                                pageHeadingTitle: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold block mb-1">Page Subheading Description</label>
                        <input
                          type="text"
                          value={currentPageDraft.labelsAndButtons.pageSubheading}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              labelsAndButtons: {
                                ...p.labelsAndButtons,
                                pageSubheading: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="font-bold block mb-1">Primary Booking Button Label</label>
                        <input
                          type="text"
                          value={currentPageDraft.labelsAndButtons.primaryBookButtonLabel}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              labelsAndButtons: {
                                ...p.labelsAndButtons,
                                primaryBookButtonLabel: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                        />
                      </div>

                      <div>
                        <label className="font-bold block mb-1">Secondary Enquiry Button Label</label>
                        <input
                          type="text"
                          value={currentPageDraft.labelsAndButtons.secondaryEnquireButtonLabel}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              labelsAndButtons: {
                                ...p.labelsAndButtons,
                                secondaryEnquireButtonLabel: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                        />
                      </div>

                      <div>
                        <label className="font-bold block mb-1">Promo Ribbon Callout Text</label>
                        <input
                          type="text"
                          value={currentPageDraft.labelsAndButtons.promoRibbonText}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              labelsAndButtons: {
                                ...p.labelsAndButtons,
                                promoRibbonText: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                      </div>

                      <div>
                        <label className="font-bold block mb-1">Promo Ribbon Target Link / Anchor</label>
                        <input
                          type="text"
                          value={currentPageDraft.labelsAndButtons.promoRibbonLink}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              labelsAndButtons: {
                                ...p.labelsAndButtons,
                                promoRibbonLink: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: IMAGES & HERO BANNERS */}
              {activeTab === 'images_banners' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                        {currentPageDraft.icon} {currentPageDraft.pageName} — Custom Hero Banner
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Configure promotional hero banner image, headline, badge, CTA button, and link for this page.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 font-black text-indigo-700 dark:text-indigo-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={currentPageDraft.heroBanner.visible}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            heroBanner: { ...p.heroBanner, visible: e.target.checked },
                            sections: p.sections.map((s) =>
                              s.id === 'custom_page_hero'
                                ? { ...s, visible: e.target.checked }
                                : s
                            ),
                          }))
                        }
                        className="rounded text-indigo-600"
                      />
                      <span>Show Hero Banner on Page</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold block mb-1">Spotlight Badge Label</label>
                      <input
                        type="text"
                        value={currentPageDraft.heroBanner.badgeText}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            heroBanner: { ...p.heroBanner, badgeText: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>

                    <div>
                      <label className="font-bold block mb-1">CTA Button Text</label>
                      <input
                        type="text"
                        value={currentPageDraft.heroBanner.ctaButtonText}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            heroBanner: { ...p.heroBanner, ctaButtonText: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-bold block mb-1">Banner Headline</label>
                      <input
                        type="text"
                        value={currentPageDraft.heroBanner.headline}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            heroBanner: { ...p.heroBanner, headline: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-bold block mb-1">Banner Subheadline</label>
                      <input
                        type="text"
                        value={currentPageDraft.heroBanner.subheadline}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            heroBanner: { ...p.heroBanner, subheadline: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="font-bold block mb-1">Banner Image URL</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={currentPageDraft.heroBanner.imageUrl}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              heroBanner: { ...p.heroBanner, imageUrl: e.target.value },
                            }))
                          }
                          className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Use an approved HTTPS object URL for a publishable banner. Inline file data is not stored in App Builder records.</p>
                      <div className="mt-3">
                        <UniversalMediaManager moduleKey={activePageId} parentType="live_builder_banner" title="Preview banner media" maxFiles={8} />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold block mb-1">CTA Link / Target URL</label>
                      <input
                        type="text"
                        value={currentPageDraft.heroBanner.ctaButtonLinkOrAction}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            heroBanner: {
                              ...p.heroBanner,
                              ctaButtonLinkOrAction: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold block mb-1">Gradient Start</label>
                        <input
                          type="color"
                          value={currentPageDraft.heroBanner.bgColorFrom}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              heroBanner: { ...p.heroBanner, bgColorFrom: e.target.value },
                            }))
                          }
                          className="w-full h-9 rounded-xl cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="font-bold block mb-1">Gradient End</label>
                        <input
                          type="color"
                          value={currentPageDraft.heroBanner.bgColorTo}
                          onChange={(e) =>
                            updateCurrentPageDraft((p) => ({
                              ...p,
                              heroBanner: { ...p.heroBanner, bgColorTo: e.target.value },
                            }))
                          }
                          className="w-full h-9 rounded-xl cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: SECTION ORDER & VISIBILITY */}
              {activeTab === 'sections_order' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div>
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      {currentPageDraft.icon} {currentPageDraft.pageName} — Section Order & Visibility
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Reorder page modules or toggle section visibility on/off without breaking customer filters or bookings.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {sortedSections.map((sec, idx) => (
                      <div
                        key={sec.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition ${
                          sec.visible
                            ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                            : 'bg-slate-100/70 dark:bg-slate-900/40 border-slate-200/50 opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-black flex items-center justify-center text-[11px] shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 dark:text-white truncate">
                              {sec.label}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Section ID: {sec.id}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveSection(idx, 'up')}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 disabled:opacity-30 cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === sortedSections.length - 1}
                            onClick={() => handleMoveSection(idx, 'down')}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 disabled:opacity-30 cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSectionVisibility(sec.id)}
                            className={`px-2.5 py-1 rounded-lg font-black text-[10px] cursor-pointer ${
                              sec.visible
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {sec.visible ? 'VISIBLE' : 'HIDDEN'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: COLORS & STYLING */}
              {activeTab === 'colors_style' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4">
                  <div>
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      {currentPageDraft.icon} {currentPageDraft.pageName} — Brand Colors & Button Styling
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Customize primary CTA color, accent highlights, card borders, and button corner radius for this page.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold block mb-1">
                        Primary Brand / CTA Color ({currentPageDraft.colors.primaryColor})
                      </label>
                      <input
                        type="color"
                        value={currentPageDraft.colors.primaryColor}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            colors: { ...p.colors, primaryColor: e.target.value },
                          }))
                        }
                        className="w-full h-10 rounded-xl cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="font-bold block mb-1">
                        Secondary Accent / Highlight ({currentPageDraft.colors.accentColor})
                      </label>
                      <input
                        type="color"
                        value={currentPageDraft.colors.accentColor}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            colors: { ...p.colors, accentColor: e.target.value },
                          }))
                        }
                        className="w-full h-10 rounded-xl cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="font-bold block mb-1">
                        Card Border Accent ({currentPageDraft.colors.cardBorderColor})
                      </label>
                      <input
                        type="color"
                        value={currentPageDraft.colors.cardBorderColor}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            colors: { ...p.colors, cardBorderColor: e.target.value },
                          }))
                        }
                        className="w-full h-10 rounded-xl cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="font-bold block mb-1">Button Corner Radius</label>
                      <select
                        value={currentPageDraft.colors.buttonRadius}
                        onChange={(e) =>
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            colors: {
                              ...p.colors,
                              buttonRadius: e.target.value as any,
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold"
                      >
                        <option value="rounded-lg">Compact (rounded-lg)</option>
                        <option value="rounded-xl">Modern Standard (rounded-xl)</option>
                        <option value="rounded-2xl">Soft Executive (rounded-2xl)</option>
                        <option value="rounded-full">Pill Buttons (rounded-full)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: CATEGORIES & FORM OPTIONS */}
              {activeTab === 'categories_forms' && (
                <div className="space-y-4">
                  {/* Categories Editor */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      {currentPageDraft.icon} {currentPageDraft.pageName} — Featured Categories & Badges
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={newCategoryIcon}
                        onChange={(e) => setNewCategoryIcon(e.target.value)}
                        placeholder="Icon (e.g. ✨)"
                        className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        value={newCategoryLabel}
                        onChange={(e) => setNewCategoryLabel(e.target.value)}
                        placeholder="Category Label *"
                        className="sm:col-span-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newCategoryLabel.trim()) return;
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            categories: [
                              ...p.categories,
                              {
                                id: `cat-${Date.now().toString().slice(-4)}`,
                                label: newCategoryLabel.trim(),
                                icon: newCategoryIcon.trim() || '✨',
                                visible: true,
                                featuredBadge: newCategoryBadge.trim() || undefined,
                              },
                            ],
                          }));
                          setNewCategoryLabel('');
                          setNewCategoryBadge('');
                          notify('✅ Added category to page draft!');
                        }}
                        className="px-3 py-2 rounded-xl bg-[#4338CA] text-white font-black flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {currentPageDraft.categories.map((cat) => (
                        <div
                          key={cat.id}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-base">{cat.icon}</span>
                            <input
                              type="text"
                              value={cat.label}
                              onChange={(e) =>
                                updateCurrentPageDraft((p) => ({
                                  ...p,
                                  categories: p.categories.map((c) =>
                                    c.id === cat.id ? { ...c, label: e.target.value } : c
                                  ),
                                }))
                              }
                              className="font-bold bg-transparent border-b border-transparent focus:border-indigo-500 outline-hidden flex-1"
                            />
                            {cat.featuredBadge && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                                {cat.featuredBadge}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentPageDraft((p) => ({
                                  ...p,
                                  categories: p.categories.map((c) =>
                                    c.id === cat.id ? { ...c, visible: !c.visible } : c
                                  ),
                                }))
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-black cursor-pointer ${
                                cat.visible
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {cat.visible ? 'Active' : 'Hidden'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentPageDraft((p) => ({
                                  ...p,
                                  categories: p.categories.filter((c) => c.id !== cat.id),
                                }))
                              }
                              className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Form Options Editor */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      {currentPageDraft.icon} {currentPageDraft.pageName} — Booking & Enquiry Form Options
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={newFormFieldLabel}
                        onChange={(e) => setNewFormFieldLabel(e.target.value)}
                        placeholder="Field Label (e.g. Meal Preference)"
                        className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        value={newFormFieldOptions}
                        onChange={(e) => setNewFormFieldOptions(e.target.value)}
                        placeholder="Comma-separated options (Veg, Non-Veg)"
                        className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newFormFieldLabel.trim() || !newFormFieldOptions.trim()) return;
                          const opts = newFormFieldOptions
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          updateCurrentPageDraft((p) => ({
                            ...p,
                            formOptions: [
                              ...p.formOptions,
                              {
                                id: `form-${Date.now().toString().slice(-4)}`,
                                fieldLabel: newFormFieldLabel.trim(),
                                fieldType: 'select',
                                required: false,
                                options: opts,
                              },
                            ],
                          }));
                          setNewFormFieldLabel('');
                          setNewFormFieldOptions('');
                          notify('✅ Added custom form option group!');
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Form Field</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {currentPageDraft.formOptions.map((grp) => (
                        <div
                          key={grp.id}
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 dark:text-white">
                              {grp.fieldLabel}{' '}
                              <span className="text-[10px] font-bold text-indigo-600 uppercase">
                                ({grp.fieldType})
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentPageDraft((p) => ({
                                  ...p,
                                  formOptions: p.formOptions.filter((f) => f.id !== grp.id),
                                }))
                              }
                              className="text-rose-500 text-[10px] font-bold hover:underline cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                          <input
                            type="text"
                            value={grp.options.join(', ')}
                            onChange={(e) => {
                              const nextOpts = e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean);
                              updateCurrentPageDraft((p) => ({
                                ...p,
                                formOptions: p.formOptions.map((f) =>
                                  f.id === grp.id ? { ...f, options: nextOpts } : f
                                ),
                              }));
                            }}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: VERSION HISTORY, AUDIT LOGS & 1-CLICK ROLLBACK */}
              {activeTab === 'history_rollback' && (
                <div className="space-y-4">
                  {/* Version History & Rollback */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      App Builder Version History & Rollback
                    </div>
                    <div className="space-y-2">
                      {versions.map((ver, idx) => (
                        <div
                          key={`${ver.versionId}-${idx}`}
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-black text-[10px]">
                                {ver.versionId}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">
                                {(ver.status || 'published').replace('_', ' ')}
                              </span>
                              <span className="font-black text-slate-900 dark:text-white">
                                {ver.summary}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1">
                              {ver.status === 'draft' ? 'Draft saved by' : 'Recorded by'} {ver.publishedBy} at {ver.publishedAt} • Targets:{' '}
                              {ver.platforms.join(' • ')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRollback(ver.versionId)}
                            disabled={ver.status !== 'published' && Boolean(ver.recordId)}
                            className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-black text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Rollback to {ver.versionId}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Page Editor Audit Trail */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="font-black text-slate-900 dark:text-white uppercase text-[11px]">
                      Live Page Editor Security & Audit Trail ({auditLogs.length})
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="font-black text-slate-900 dark:text-white">
                              {log.action}{' '}
                              <span className="text-[10px] font-bold text-indigo-600">
                                [{log.pageId}]
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">{log.details}</div>
                          </div>
                          <div className="text-right text-[10px] text-slate-400 shrink-0">
                            <div className="font-bold text-slate-600 dark:text-slate-300">
                              {log.actor}
                            </div>
                            <div>{log.timestamp}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Sticky Draft / Publish / Rollback Action Bar */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={changeSummaryInput}
                  onChange={(e) => setChangeSummaryInput(e.target.value)}
                  placeholder={`Release note for ${currentPageDraft.pageName} (e.g., Updated hero banner & CTA button)...`}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Central config for connected React web clients</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveDraft}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black cursor-pointer"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handlePublishLive}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Publish to connected web clients</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
