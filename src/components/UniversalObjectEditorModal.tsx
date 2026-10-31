import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Plus,
  Trash2,
  CheckSquare,
  Type,
  List,
  Hash,
  Calendar,
  ToggleLeft,
  Link2,
  FileText,
  Sparkles,
  CheckCircle2,
  Sliders,
  Film,
} from 'lucide-react';
import { MarketSectionType } from '../data/servicesStayMoviesData';
import { AppLanguage } from '../utils/translations';

export type UniversalWebElementType =
  | 'textbox'
  | 'dropdown'
  | 'checkbox'
  | 'number'
  | 'date'
  | 'toggle'
  | 'radio'
  | 'textarea'
  | 'url';

export interface UniversalDynamicElement {
  id: string;
  sectionScope: MarketSectionType;
  categoryScope?: string; // optional specific categoryId or 'all'
  label: string;
  key: string;
  elementType: UniversalWebElementType;
  placeholder?: string;
  options?: string[]; // for dropdown / radio
  defaultValue: string | number | boolean;
  required?: boolean;
  labelTe?: string;
}

export type CustomWebElementSpec = UniversalDynamicElement;

const STORAGE_KEY = 'bos_universal_plug_and_play_elements_v1';

const DEFAULT_SECTION_ELEMENTS: UniversalDynamicElement[] = [
  // Movies Specific Dynamic Web Elements
  {
    id: 'uni-mov-format',
    sectionScope: 'movies',
    categoryScope: 'all',
    label: 'Screen & Audio Format',
    key: 'movieScreenFormat',
    elementType: 'dropdown',
    options: ['IMAX 3D Laser', 'Dolby Atmos 4K', '4DX Motion Seats', 'Gold Class Recliner', 'Standard 2D'],
    defaultValue: 'Dolby Atmos 4K',
    required: true,
  },
  {
    id: 'uni-mov-showtime',
    sectionScope: 'movies',
    categoryScope: 'all',
    label: 'Show Timings / Matinee Slot',
    key: 'movieShowTiming',
    elementType: 'dropdown',
    options: ['11:00 AM (Morning)', '02:30 PM (Matinee)', '06:15 PM (First Show)', '09:45 PM (Second Show)'],
    defaultValue: '06:15 PM (First Show)',
    required: true,
  },
  {
    id: 'uni-mov-subtitles',
    sectionScope: 'movies',
    categoryScope: 'all',
    label: 'English Subtitles Included',
    key: 'movieSubtitles',
    elementType: 'checkbox',
    defaultValue: true,
  },
  {
    id: 'uni-mov-censor',
    sectionScope: 'movies',
    categoryScope: 'all',
    label: 'CBFC Censor Certificate & Runtime',
    key: 'movieCensorRuntime',
    elementType: 'textbox',
    placeholder: 'e.g. U/A • 2h 48m • Telugu / Hindi / English',
    defaultValue: 'U/A • 2h 45m',
  },
  // Hotel & Stay Specific Dynamic Web Elements
  {
    id: 'uni-htl-hourly',
    sectionScope: 'hotel_stay',
    categoryScope: 'all',
    label: 'Supports Hourly Booking (3h / 6h / 12h)',
    key: 'supportsHourly',
    elementType: 'checkbox',
    defaultValue: true,
  },
  {
    id: 'uni-htl-checkin',
    sectionScope: 'hotel_stay',
    categoryScope: 'all',
    label: '24/7 Flexible Check-In Policy',
    key: 'flexCheckInPolicy',
    elementType: 'dropdown',
    options: ['24/7 Instant Check-In', 'Standard 12:00 PM Check-In', 'Early Check-In Allowed'],
    defaultValue: '24/7 Instant Check-In',
  },
  // Classes Specific Dynamic Web Elements
  {
    id: 'uni-cls-placement',
    sectionScope: 'classes',
    categoryScope: 'all',
    label: '100% Placement & Certification Track',
    key: 'placementTrackEnabled',
    elementType: 'checkbox',
    defaultValue: true,
  },
  // Venues Specific Dynamic Web Elements
  {
    id: 'uni-ven-ac-capacity',
    sectionScope: 'venues',
    categoryScope: 'all',
    label: 'Central AC & Generator Backup Included',
    key: 'venueGeneratorBackup',
    elementType: 'checkbox',
    defaultValue: true,
  },
  // PGs & Hostels Specific Dynamic Web Elements
  {
    id: 'uni-pg-wifi-food',
    sectionScope: 'pg_hostels',
    categoryScope: 'all',
    label: '3-Times Homely Food + High-Speed Wi-Fi',
    key: 'pgFoodWifi',
    elementType: 'checkbox',
    defaultValue: true,
  },
  // Services Specific Dynamic Web Elements
  {
    id: 'uni-srv-warranty',
    sectionScope: 'services',
    categoryScope: 'all',
    label: '30-Day Service Warranty & Background Checked',
    key: 'serviceWarranty30d',
    elementType: 'checkbox',
    defaultValue: true,
  },
];

export function loadUniversalElements(): UniversalDynamicElement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SECTION_ELEMENTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SECTION_ELEMENTS;
    const merged = [...parsed];
    for (const def of DEFAULT_SECTION_ELEMENTS) {
      if (!merged.some((item) => item && item.id === def.id)) {
        merged.push(def);
      }
    }
    return merged;
  } catch {
    return DEFAULT_SECTION_ELEMENTS;
  }
}

export function saveUniversalElements(elements: UniversalDynamicElement[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(elements));
    window.dispatchEvent(new CustomEvent('bos-universal-elements-updated'));
    window.dispatchEvent(new CustomEvent('bos-dynamic-schema-updated'));
    void import('../lib/supabaseClient').then(({ upsertRlsModuleConfig }) =>
      upsertRlsModuleConfig(STORAGE_KEY, elements)
    );
  } catch {
    // ignore
  }
}

export function getSectionScopedElements(
  section: MarketSectionType,
  categoryId?: string
): UniversalDynamicElement[] {
  const all = loadUniversalElements();
  return all.filter((el) => {
    if (el.sectionScope !== section) return false;
    if (
      categoryId &&
      categoryId !== 'all' &&
      el.categoryScope &&
      el.categoryScope !== 'all' &&
      el.categoryScope !== categoryId
    ) {
      return false;
    }
    return true;
  });
}

const SECTION_LABELS: Record<MarketSectionType, string> = {
  movies: '🎬 Movies & Showtimes',
  hotel_stay: '🏨 Hotel & Hourly Stay',
  classes: '🎓 Classes & Courses',
  venues: '🏛️ Function Halls & Venues',
  pg_hostels: '🛏️ PGs & Hostels',
  services: '🛠️ Local Services',
};

interface UniversalObjectEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: MarketSectionType;
  activeSection?: MarketSectionType;
  currentLang?: AppLanguage;
  onElementsChange?: (els: UniversalDynamicElement[]) => void;
}

export const UniversalObjectEditorModal: React.FC<UniversalObjectEditorModalProps> = ({
  isOpen,
  onClose,
  initialSection,
  activeSection: activeSectionProp,
  currentLang = 'en',
  onElementsChange,
}) => {
  const resolvedSection = activeSectionProp || initialSection || 'movies';
  const [activeSection, setActiveSection] = useState<MarketSectionType>(resolvedSection);
  const [elements, setElements] = useState<UniversalDynamicElement[]>(() =>
    loadUniversalElements()
  );

  // New Element Form State
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<UniversalWebElementType>('textbox');
  const [newPlaceholder, setNewPlaceholder] = useState('');
  const [newOptions, setNewOptions] = useState('Option 1, Option 2, Option 3');
  const [newRequired, setNewRequired] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection(resolvedSection);
  }, [resolvedSection]);

  useEffect(() => {
    onElementsChange?.(elements);
  }, [elements]);

  useEffect(() => {
    const sync = () => setElements(loadUniversalElements());
    window.addEventListener('bos-universal-elements-updated', sync);
    return () => window.removeEventListener('bos-universal-elements-updated', sync);
  }, []);

  if (!isOpen) return null;

  // Strictly filter elements to the active section ONLY (e.g., if user is in movies, show ONLY movies dynamic fields)
  const scopedElements = elements.filter((el) => el.sectionScope === activeSection);

  const handleAddWebElement = (presetType?: UniversalWebElementType, presetLabel?: string) => {
    const typeToUse = presetType || newType;
    const labelToUse = (presetLabel || newLabel).trim();
    if (!labelToUse) return;

    const cleanKey =
      labelToUse
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') +
      '_' +
      Date.now().toString().slice(-3);

    const parsedOptions =
      typeToUse === 'dropdown' || typeToUse === 'radio'
        ? newOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const created: UniversalDynamicElement = {
      id: `uni-${Date.now()}`,
      sectionScope: activeSection,
      categoryScope: 'all',
      label: labelToUse,
      key: cleanKey,
      elementType: typeToUse,
      placeholder: newPlaceholder || `Enter ${labelToUse}`,
      options: parsedOptions && parsedOptions.length > 0 ? parsedOptions : ['Yes', 'No'],
      defaultValue:
        typeToUse === 'checkbox' || typeToUse === 'toggle'
          ? true
          : typeToUse === 'number'
          ? 100
          : parsedOptions?.[0] || '',
      required: newRequired,
    };

    const updated = [...elements, created];
    setElements(updated);
    saveUniversalElements(updated);
    setNewLabel('');
    setNewPlaceholder('');
    setSavedToast(
      `Added "${created.label}" (${created.elementType.toUpperCase()}) strictly to ${SECTION_LABELS[activeSection]}!`
    );
    setTimeout(() => setSavedToast(null), 3500);
  };

  const handleUpdateValue = (id: string, nextVal: string | number | boolean) => {
    const updated = elements.map((el) =>
      el.id === id ? { ...el, defaultValue: nextVal } : el
    );
    setElements(updated);
    saveUniversalElements(updated);
  };

  const handleDeleteElement = (id: string) => {
    const updated = elements.filter((el) => el.id !== id);
    setElements(updated);
    saveUniversalElements(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#4A148C] via-indigo-900 to-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black">
                  Universal Object Editor (Plug & Play)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  ZERO-DEPENDENCY
                </span>
              </div>
              <p className="text-xs text-purple-200">
                {currentLang === 'te'
                  ? 'ఎంచుకున్న కేటగిరీకి మాత్రమే డైనమిక్ వెబ్ ఎలిమెంట్స్ (Textbox, Dropdown, Checkbox మొదలైనవి) జోడించండి'
                  : 'Displays & attaches dynamic Web Elements (Textbox, Dropdown, Checkbox, etc.) strictly to the selected category'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Category Scope Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              1. Select Category Scope (Displays ONLY Selected Category Dynamic Elements)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(SECTION_LABELS) as MarketSectionType[]).map((sec) => {
                const count = elements.filter((e) => e.sectionScope === sec).length;
                const isSelected = activeSection === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setActiveSection(sec)}
                    className={`px-3 py-2 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#4A148C] text-white border-[#4A148C] shadow-sm font-black'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 font-bold hover:border-purple-400'
                    }`}
                  >
                    <span className="text-xs truncate">{SECTION_LABELS[sec]}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {savedToast && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 text-emerald-800 dark:text-emerald-200 text-xs font-black flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedToast}</span>
            </div>
          )}

          {/* Plug & Play Web Element Builder */}
          <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-slate-800/70 border border-purple-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-black text-[#4A148C] dark:text-purple-300 flex items-center gap-1.5">
                <Sliders className="w-4 h-4" />
                <span>
                  2. Add Web Element to {SECTION_LABELS[activeSection]} (Plug & Play)
                </span>
              </div>

              {/* 1-Tap Quick Web Elements */}
              {activeSection === 'movies' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      handleAddWebElement('textbox', 'Director & Lead Cast Names')
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-purple-300 text-[10px] font-black text-purple-800 dark:text-purple-300 hover:bg-purple-100 cursor-pointer"
                  >
                    + 🎬 Cast Textbox
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewOptions('Recliner ₹350, Executive ₹220, Balcony ₹150');
                      handleAddWebElement('dropdown', 'Ticket Seat Class');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-purple-300 text-[10px] font-black text-purple-800 dark:text-purple-300 hover:bg-purple-100 cursor-pointer"
                  >
                    + 💺 Seat Dropdown
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAddWebElement('checkbox', 'Popcorn & Beverage Combo Available')
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-purple-300 text-[10px] font-black text-purple-800 dark:text-purple-300 hover:bg-purple-100 cursor-pointer"
                  >
                    + 🍿 F&B Checkbox
                  </button>
                </div>
              )}
            </div>

            {/* Web Element Type Selector Pills */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {(
                [
                  { id: 'textbox', label: 'Textbox', icon: Type },
                  { id: 'dropdown', label: 'Dropdown', icon: List },
                  { id: 'checkbox', label: 'Checkbox', icon: CheckSquare },
                  { id: 'number', label: 'Number / Price', icon: Hash },
                  { id: 'date', label: 'Date / Time', icon: Calendar },
                  { id: 'toggle', label: 'Toggle Switch', icon: ToggleLeft },
                  { id: 'radio', label: 'Radio Group', icon: Sparkles },
                  { id: 'textarea', label: 'Multi-line Text', icon: FileText },
                  { id: 'url', label: 'URL / Trailer', icon: Link2 },
                ] as const
              ).map((item) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setNewType(item.id)}
                    className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      newType === item.id
                        ? 'bg-[#4A148C] text-white border-[#4A148C]'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-5">
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                  Element Label (for {SECTION_LABELS[activeSection]}) *
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={
                    activeSection === 'movies'
                      ? 'e.g. Dolby Atmos Screen #, Interval Snacks...'
                      : 'e.g. Custom Field Label...'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                />
              </div>

              {(newType === 'dropdown' || newType === 'radio') ? (
                <div className="sm:col-span-5">
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Dropdown / Radio Options (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={newOptions}
                    onChange={(e) => setNewOptions(e.target.value)}
                    placeholder="Option A, Option B, Option C"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
              ) : (
                <div className="sm:col-span-5">
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                    Placeholder / Default Hint
                  </label>
                  <input
                    type="text"
                    value={newPlaceholder}
                    onChange={(e) => setNewPlaceholder(e.target.value)}
                    placeholder="Enter hint text..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => handleAddWebElement()}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Scoped Web Elements Preview & Editor */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-white">
                3. Live {SECTION_LABELS[activeSection]} Dynamic Web Elements ({scopedElements.length})
              </span>
              <span className="text-[11px] font-bold text-emerald-600">
                ✓ Isolated to {SECTION_LABELS[activeSection]} only
              </span>
            </div>

            {scopedElements.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                No dynamic web elements added for {SECTION_LABELS[activeSection]} yet. Use the builder above to add Textbox, Dropdown, or Checkbox elements.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {scopedElements.map((el) => (
                  <div
                    key={el.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300">
                          {el.elementType}
                        </span>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white mt-1">
                          {el.label}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteElement(el.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="Remove Element"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Interactive Control per Web Element Type */}
                    {el.elementType === 'textbox' || el.elementType === 'url' ? (
                      <input
                        type={el.elementType === 'url' ? 'url' : 'text'}
                        value={String(el.defaultValue || '')}
                        onChange={(e) => handleUpdateValue(el.id, e.target.value)}
                        placeholder={el.placeholder}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    ) : el.elementType === 'number' ? (
                      <input
                        type="number"
                        value={Number(el.defaultValue || 0)}
                        onChange={(e) => handleUpdateValue(el.id, Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    ) : el.elementType === 'date' ? (
                      <input
                        type="date"
                        value={String(el.defaultValue || '')}
                        onChange={(e) => handleUpdateValue(el.id, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    ) : el.elementType === 'textarea' ? (
                      <textarea
                        rows={2}
                        value={String(el.defaultValue || '')}
                        onChange={(e) => handleUpdateValue(el.id, e.target.value)}
                        placeholder={el.placeholder}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                      />
                    ) : el.elementType === 'dropdown' ? (
                      <select
                        value={String(el.defaultValue || el.options?.[0] || '')}
                        onChange={(e) => handleUpdateValue(el.id, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                      >
                        {(el.options || ['Standard']).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : el.elementType === 'radio' ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(el.options || ['Yes', 'No']).map((opt) => (
                          <label
                            key={opt}
                            className="inline-flex items-center gap-1 text-xs font-bold cursor-pointer"
                          >
                            <input
                              type="radio"
                              checked={String(el.defaultValue) === opt}
                              onChange={() => handleUpdateValue(el.id, opt)}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={Boolean(el.defaultValue)}
                          onChange={(e) => handleUpdateValue(el.id, e.target.checked)}
                          className="w-4 h-4 accent-[#4A148C] rounded"
                        />
                        <span>{Boolean(el.defaultValue) ? 'Enabled / Yes' : 'Disabled / No'}</span>
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
