import React, { useState, useEffect } from 'react';
import SafeImage from './SafeImage';
import { SelfHealingBoundary } from './SelfHealingBoundary';
import {
  DynamicAdminFeature,
  ModularTemplateConfig,
  DEFAULT_TEMPLATES,
  loadDynamicAdminFeatures,
  loadModularTemplates,
  loadSearchDateRangeModuleMap,
  loadSpotlightSubcategoriesModuleMap,
  saveDynamicAdminFeatures,
  saveModularTemplates,
  toggleSearchDateRangeForSection,
  toggleSpotlightSubcategoriesForSection,
} from './ModularSystemStore';
export * from './ModularSystemStore';
export { SelfHealingBoundary } from './SelfHealingBoundary';

import {
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  GripVertical,
  Sliders,
  Plus,
  Trash2,
  CheckSquare,
  Type,
  Image as ImageIcon,
  Hash,
  List,
  Calendar,
  Globe,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  ArrowUp,
  ArrowDown,
  Upload,
} from 'lucide-react';

/**
 * 1. SELF-HEALING ERROR BOUNDARY FOR INDEPENDENT MODULES
 * Guarantees that if any template/module encounters a runtime error or undefined data,
 * it self-heals automatically without crashing the application.
 */
export const UserModularTemplateBar: React.FC<{
  templates: ModularTemplateConfig[];
  onUpdateTemplates: (next: ModularTemplateConfig[]) => void;
  onOpenAdminBuilder?: () => void;
}> = ({ templates, onUpdateTemplates, onOpenAdminBuilder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [newUndefinedName, setNewUndefinedName] = useState('');

  const handleToggleTemplate = (id: string) => {
    const updated = templates.map((t) =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    onUpdateTemplates(updated);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= templates.length) return;
    const copy = [...templates];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    const reordered = copy.map((t, i) => ({ ...t, order: i + 1 }));
    onUpdateTemplates(reordered);
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIdx === null || draggedIdx === targetIndex) return;
    const copy = [...templates];
    const [moved] = copy.splice(draggedIdx, 1);
    copy.splice(targetIndex, 0, moved);
    const reordered = copy.map((t, i) => ({ ...t, order: i + 1 }));
    setDraggedIdx(null);
    onUpdateTemplates(reordered);
  };

  const handleAddUndefinedTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newUndefinedName.trim() || `Custom Template #${templates.length + 1}`;
    const created: ModularTemplateConfig = {
      id: `custom_tpl_${Date.now()}`,
      name: label,
      icon: '🧩',
      enabled: true,
      order: templates.length + 1,
      isUndefinedTemplate: true,
      customTitle: label,
      customContent: `Dynamic modular section "${label}" added and enabled automatically.`,
    };
    onUpdateTemplates([...templates, created]);
    setNewUndefinedName('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-3 py-2 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Zero-Dependency Independent Modules</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-[#4338CA] dark:text-indigo-300 text-[10px] font-black border border-indigo-200 dark:border-indigo-800">
            <Cpu className="w-3 h-3" />
            <span>Isolated State • No Cross-Module Dependency</span>
          </span>
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {templates.filter((t) => t.enabled).length}/{templates.length} Modules Active
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-[#4338CA] dark:text-indigo-300 text-[11px] font-black flex items-center gap-1 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
          >
            <Sliders className="w-3 h-3" />
            <span>{isOpen ? 'Hide Module Controls' : '⚙️ Independent Modules & Templates'}</span>
          </button>

          {onOpenAdminBuilder && (
            <button
              type="button"
              onClick={onOpenAdminBuilder}
              className="px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-black flex items-center gap-1 cursor-pointer"
            >
              <Wrench className="w-3 h-3" />
              <span className="hidden sm:inline">No-Code Builder</span>
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              ✋ Drag and drop any module below to reorder the screen, or tap the switch to Enable / Disable (even if a template is undefined):
            </p>
            <button
              type="button"
              onClick={() => {
                saveModularTemplates(DEFAULT_TEMPLATES);
                onUpdateTemplates(DEFAULT_TEMPLATES);
              }}
              className="text-[11px] font-bold text-indigo-600 hover:underline self-start sm:self-auto cursor-pointer"
            >
              Reset Default Layout
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {templates.map((tpl, idx) => (
              <div
                key={tpl.id}
                draggable
                onDragStart={() => setDraggedIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-move transition-all ${
                  tpl.enabled
                    ? 'bg-slate-50 dark:bg-slate-800/80 border-indigo-200 dark:border-indigo-800'
                    : 'bg-slate-100/60 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-65'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-base shrink-0">{tpl.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {tpl.name}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                      <span>{tpl.isUndefinedTemplate ? 'Optional / Undefined Slot' : 'Core Module'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === templates.length - 1}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleTemplate(tpl.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition-colors ${
                      tpl.enabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tpl.enabled ? (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>ON</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>OFF</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add New / Undefined Template Slot on the fly */}
          <form onSubmit={handleAddUndefinedTemplate} className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newUndefinedName}
              onChange={(e) => setNewUndefinedName(e.target.value)}
              placeholder="Add custom or undefined template name (e.g. Festival Offers Banner)..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold outline-hidden"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-[#4338CA] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Template</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

/**
 * 6. LIVE INTERACTIVE RENDERER FOR ADMIN'S NO-CODE DYNAMIC FEATURES (EditBox, CheckBox, Image, etc.)
 * Automatically displays in the application and saves user/provider interactions to the DB.
 */
export const DynamicAdminFeaturesShowcase: React.FC<{
  features: DynamicAdminFeature[];
  activeSection: string;
  onUpdateFeatureValue: (id: string, value: any) => void;
}> = ({ features, activeSection, onUpdateFeatureValue }) => {
  const visibleFeatures = features.filter(
    (f) => f.targetSection === 'all' || f.targetSection === activeSection
  );

  if (visibleFeatures.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200/80 dark:border-slate-800 p-3.5 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#4338CA]" />
          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
            Live Dynamic Features & Filters (Auto-Synced from Admin No-Code Builder)
          </h4>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-[#4338CA] dark:text-indigo-300">
          {visibleFeatures.length} Active Widget(s)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {visibleFeatures.map((feat) => (
          <div
            key={feat.id}
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-1.5"
          >
            <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>
                {feat.label} {feat.required && <span className="text-rose-500">*</span>}
              </span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                {feat.fieldType}
              </span>
            </label>

            {feat.fieldType === 'editbox' && (
              <input
                type="text"
                value={String(feat.value || '')}
                onChange={(e) => onUpdateFeatureValue(feat.id, e.target.value)}
                placeholder={`Enter ${feat.label}...`}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium outline-hidden"
              />
            )}

            {feat.fieldType === 'number' && (
              <input
                type="number"
                value={Number(feat.value || 0)}
                onChange={(e) => onUpdateFeatureValue(feat.id, Number(e.target.value))}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-hidden"
              />
            )}

            {feat.fieldType === 'checkbox' && (
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-emerald-700 dark:text-emerald-400 pt-0.5">
                <input
                  type="checkbox"
                  checked={Boolean(feat.value)}
                  onChange={(e) => onUpdateFeatureValue(feat.id, e.target.checked)}
                  className="w-4 h-4 rounded text-[#4338CA] cursor-pointer"
                />
                <span>{feat.value ? '✓ Enabled / Yes' : 'Tap to Enable'}</span>
              </label>
            )}

            {feat.fieldType === 'dropdown' && (
              <select
                value={String(feat.value || '')}
                onChange={(e) => onUpdateFeatureValue(feat.id, e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-hidden"
              >
                <option value="">Select option...</option>
                {(feat.options || ['Standard', 'Premium', 'VIP']).map((opt, idx) => (
                  <option key={idx} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {feat.fieldType === 'image' && (
              <div className="flex items-center gap-2">
                {feat.value && (
                  <SafeImage category="general"
                    src={String(feat.value)}
                    alt={feat.label}
                    className="w-9 h-9 rounded-lg object-cover border border-slate-300 shrink-0"
                  />
                )}
                <label className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#4338CA] text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image (All Formats)</span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.heic,.tiff,.ico"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        onUpdateFeatureValue(feat.id, String(ev.target?.result || ''));
                      };
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
