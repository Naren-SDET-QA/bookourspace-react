import React, { useState } from 'react';
import SafeImage from './SafeImage';
import UniversalMediaManager from './UniversalMediaManager';
import {
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Check,
  Eye,
  RotateCcw,
  ShieldCheck,
  Lock,
  Image as ImageIcon,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import {
  AdminThemeSettings,
  AdminRolePermissions,
  AdminAuditLogEntry,
  DEFAULT_THEME_SETTINGS,
  saveAdminThemeSettings,
  applyThemeSettingsToDocument,
} from '../utils/adminEnterpriseStore';
import { BOSBrandLogo } from './BOSBrandLogo';
import { BOS_OFFICIAL_LOGO_STATIC } from './BOSOfficialLogo';

interface AdminThemeManagementSectionProps {
  savedTheme: AdminThemeSettings;
  onUpdateSavedTheme: (next: AdminThemeSettings) => void;
  rolePerms: AdminRolePermissions[];
  onToggleRoleManageThemePermission: (role: 'customer' | 'provider' | 'admin') => void;
  onRequestConfirmation: (
    title: string,
    description: string,
    confirmLabel: string,
    onConfirm: () => void,
    danger?: boolean
  ) => void;
  onLogAction: (
    section: AdminAuditLogEntry['section'],
    action: string,
    details: string,
    status?: AdminAuditLogEntry['status']
  ) => void;
  onNotify: (msg: string) => void;
}

const ENTERPRISE_THEME_PRESETS: {
  name: string;
  primaryBrandColor: string;
  accentColor: string;
  surfaceBackgroundLight: string;
  surfaceBackgroundDark: string;
  themeMode: 'light' | 'dark' | 'system';
  borderRadiusStyle: 'rounded' | 'sharp' | 'pill';
}[] = [
  {
    name: 'BookOurSpace Signature Indigo & Saffron',
    primaryBrandColor: '#0B8F76',
    accentColor: '#EA580C',
    surfaceBackgroundLight: '#FDF6FA',
    surfaceBackgroundDark: '#020617',
    themeMode: 'light',
    borderRadiusStyle: 'rounded',
  },
  {
    name: 'Flipkart Royal Ocean & Gold',
    primaryBrandColor: '#2874F0',
    accentColor: '#F59E0B',
    surfaceBackgroundLight: '#F1F5F9',
    surfaceBackgroundDark: '#0F172A',
    themeMode: 'light',
    borderRadiusStyle: 'rounded',
  },
  {
    name: 'Emerald Trust & Warm Amber',
    primaryBrandColor: '#047857',
    accentColor: '#D97706',
    surfaceBackgroundLight: '#F0FDF4',
    surfaceBackgroundDark: '#022C22',
    themeMode: 'light',
    borderRadiusStyle: 'rounded',
  },
  {
    name: 'Royal Crimson & Gold Banquet',
    primaryBrandColor: '#BE123C',
    accentColor: '#EA580C',
    surfaceBackgroundLight: '#FFF1F2',
    surfaceBackgroundDark: '#1F0910',
    themeMode: 'light',
    borderRadiusStyle: 'pill',
  },
  {
    name: 'Midnight Cyber Violet (Dark Mode)',
    primaryBrandColor: '#6366F1',
    accentColor: '#F59E0B',
    surfaceBackgroundLight: '#F8FAFC',
    surfaceBackgroundDark: '#030712',
    themeMode: 'dark',
    borderRadiusStyle: 'rounded',
  },
  {
    name: 'Obsidian Slate & Emerald (Dark Mode)',
    primaryBrandColor: '#059669',
    accentColor: '#38BDF8',
    surfaceBackgroundLight: '#F8FAFC',
    surfaceBackgroundDark: '#090D16',
    themeMode: 'dark',
    borderRadiusStyle: 'sharp',
  },
];

// Two distinct, real choices. Each entry must point at a different asset: a
// duplicate URL made both quick-select buttons render as selected and produced
// duplicate React keys when the list was mapped.
const BUILTIN_LOGO_EMBLEMS = [
  {
    label: 'Official BOS Globe Map-Pin Emblem',
    url: '/assets/optimized/brand-emblem-512.webp',
  },
  {
    label: 'Official BookOurSpace Logo Lockup',
    url: BOS_OFFICIAL_LOGO_STATIC,
  },
  {
    label: 'Classic Golden Pin Emblem',
    url: '/assets/aistudio/image_c82d47dd.png',
  },
];

export const AdminThemeManagementSection: React.FC<
  AdminThemeManagementSectionProps
> = ({
  savedTheme,
  onUpdateSavedTheme,
  rolePerms,
  onToggleRoleManageThemePermission,
  onRequestConfirmation,
  onLogAction,
  onNotify,
}) => {
  // Working draft state so Admin can tweak & preview before publishing
  const [draftTheme, setDraftTheme] = useState<AdminThemeSettings>(() => ({
    ...savedTheme,
  }));
  const [isLiveAppPreviewActive, setIsLiveAppPreviewActive] = useState(false);
  const [activeEditorRole, setActiveEditorRole] = useState<
    'admin' | 'provider' | 'customer'
  >('admin');


  // Check role authorization
  const currentRolePerm = rolePerms.find((r) => r.role === activeEditorRole);
  const isAuthorizedForTheme =
    activeEditorRole === 'admin'
      ? currentRolePerm?.canManageTheme !== false
      : !!currentRolePerm?.canManageTheme;

  const hasUnsavedChanges =
    draftTheme.primaryBrandColor !== savedTheme.primaryBrandColor ||
    draftTheme.accentColor !== savedTheme.accentColor ||
    draftTheme.surfaceBackgroundLight !== savedTheme.surfaceBackgroundLight ||
    draftTheme.surfaceBackgroundDark !== savedTheme.surfaceBackgroundDark ||
    draftTheme.themeMode !== savedTheme.themeMode ||
    draftTheme.brandLogoEmblemUrl !== savedTheme.brandLogoEmblemUrl ||
    draftTheme.brandTagline !== savedTheme.brandTagline ||
    draftTheme.showGlobeAnimation !== savedTheme.showGlobeAnimation ||
    (draftTheme.brandLockupStyle || 'official') !== (savedTheme.brandLockupStyle || 'official') ||
    draftTheme.borderRadiusStyle !== savedTheme.borderRadiusStyle ||
    draftTheme.compactDensity !== savedTheme.compactDensity;

  const handleToggleLiveDomPreview = () => {
    const nextPreview = !isLiveAppPreviewActive;
    setIsLiveAppPreviewActive(nextPreview);
    if (nextPreview) {
      applyThemeSettingsToDocument(draftTheme);
      window.dispatchEvent(
        new CustomEvent('bos-theme-settings-updated', { detail: draftTheme })
      );
      onNotify(
        '👁️ Live App Theme Preview is ON — Inspect colors, logo & light/dark mode across the app!'
      );
    } else {
      applyThemeSettingsToDocument(savedTheme);
      window.dispatchEvent(
        new CustomEvent('bos-theme-settings-updated', { detail: savedTheme })
      );
      onNotify('↩️ Reverted live DOM to last published theme.');
    }
  };

  const handleSaveThemeDraft = () => {
    if (!isAuthorizedForTheme) return;
    const now = new Date();
    const updated: AdminThemeSettings = {
      ...draftTheme,
      updatedBy: `Narendra (${activeEditorRole.toUpperCase()})`,
      updatedAt: `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`,
      publishState: 'draft',
    };
    setDraftTheme(updated);
    onUpdateSavedTheme(updated);
    saveAdminThemeSettings(updated);
    onLogAction(
      'Theme Management',
      'Saved Theme Configuration Draft',
      `Saved draft "${updated.presetName}" (Primary: ${updated.primaryBrandColor}, Mode: ${updated.themeMode})`,
      'draft_saved'
    );
    onNotify('📝 Theme configuration saved as Draft to database!');
  };

  const handlePublishThemeToApp = () => {
    if (!isAuthorizedForTheme) return;
    const now = new Date();
    const published: AdminThemeSettings = {
      ...draftTheme,
      updatedBy: `Narendra (${activeEditorRole.toUpperCase()})`,
      updatedAt: `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`,
      publishState: 'published',
    };
    setDraftTheme(published);
    setIsLiveAppPreviewActive(false);
    onUpdateSavedTheme(published);
    saveAdminThemeSettings(published);
    applyThemeSettingsToDocument(published);
    onLogAction(
      'Theme Management',
      'Published Brand Theme, Logo & Mode',
      `Published "${published.presetName}" — Primary ${published.primaryBrandColor}, Accent ${published.accentColor}, Mode: ${published.themeMode.toUpperCase()}`,
      'published'
    );
    onNotify(
      `✅ Published Theme (${published.themeMode.toUpperCase()} mode, ${published.primaryBrandColor}) live across the app!`
    );
  };

  const handleResetToDefaultTheme = () => {
    onRequestConfirmation(
      'Reset Brand Theme & Logo to Default?',
      'This will restore the default BookOurSpace Signature Indigo & Saffron palette, official globe emblem, and Light theme across the application.',
      'Yes, Reset to Default Theme',
      () => {
        const resetObj: AdminThemeSettings = {
          ...DEFAULT_THEME_SETTINGS,
          updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          publishState: 'published',
        };
        setDraftTheme(resetObj);
        setIsLiveAppPreviewActive(false);
        onUpdateSavedTheme(resetObj);
        saveAdminThemeSettings(resetObj);
        applyThemeSettingsToDocument(resetObj);
        onLogAction(
          'Theme Management',
          'Reset Theme to Factory Default',
          'Restored default Indigo & Saffron palette and official BOS globe emblem',
          'sensitive_confirmed'
        );
        onNotify('🔄 Theme & Brand Logo reset to default and published!');
      },
      false
    );
  };

  const previewIsDark = draftTheme.themeMode === 'dark';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-6">
      {/* Header & Role Protection Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Dedicated Section • Brand Identity, Color Tokens, Logo & Light/Dark Theme
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${
                savedTheme.publishState === 'published'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>DB Status: {savedTheme.publishState.toUpperCase()}</span>
            </span>
            {hasUnsavedChanges && (
              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
                Unsaved Preview Changes
              </span>
            )}
          </div>

          <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 mt-1">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <span>
              Theme Management (Colors, Brand Logo, Light/Dark Mode & Live Preview)
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            Customize brand colors, upload or switch the rotating globe logo, toggle Light/Dark mode, preview changes live, and publish to the database.
          </p>
        </div>

        {/* Action Bar: Live Preview Toggle, Save Draft, Publish, Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!isAuthorizedForTheme}
            onClick={handleToggleLiveDomPreview}
            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border cursor-pointer transition ${
              isLiveAppPreviewActive
                ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {isLiveAppPreviewActive
                ? 'Stop Full-App Preview'
                : 'Preview Live Across App'}
            </span>
          </button>

          <button
            type="button"
            disabled={!isAuthorizedForTheme}
            onClick={handleSaveThemeDraft}
            className="px-3.5 py-2 rounded-xl border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 text-xs font-black cursor-pointer hover:bg-teal-50 dark:hover:bg-indigo-950/50"
          >
            Save Draft
          </button>

          <button
            type="button"
            disabled={!isAuthorizedForTheme}
            onClick={handlePublishThemeToApp}
            className="px-4 py-2 rounded-xl bg-[#0B8F76] hover:bg-indigo-800 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Publish Theme to App</span>
          </button>

          <button
            type="button"
            disabled={!isAuthorizedForTheme}
            onClick={handleResetToDefaultTheme}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 cursor-pointer"
            title="Reset to Factory Default Theme"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Role-Protection Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-700" />
          <span className="font-bold text-slate-600 dark:text-slate-300">
            Last Published By: <strong>{savedTheme.updatedBy}</strong> at{' '}
            <span className="font-mono">{savedTheme.updatedAt}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-bold text-[11px] text-slate-500">
            Role Access Check:
          </span>
          <select
            value={activeEditorRole}
            onChange={(e) => setActiveEditorRole(e.target.value as any)}
            className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-black text-[11px] cursor-pointer"
          >
            <option value="admin">Super Admin (Authorized)</option>
            <option value="provider">Provider / Owner</option>
            <option value="customer">Customer</option>
          </select>
          <label className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isAuthorizedForTheme}
              onChange={() => onToggleRoleManageThemePermission(activeEditorRole)}
              className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
            />
            <span>Allow {activeEditorRole}</span>
          </label>
        </div>
      </div>

      {!isAuthorizedForTheme ? (
        <div className="p-8 rounded-3xl bg-rose-50/70 dark:bg-rose-950/30 border-2 border-dashed border-rose-300 dark:border-rose-800 text-center space-y-3">
          <Lock className="w-8 h-8 text-rose-600 mx-auto" />
          <h4 className="text-base font-black">
            Theme Management Restricted for Role "{activeEditorRole.toUpperCase()}"
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Only authorized roles with <code>canManageTheme</code> permission can modify or publish global brand colors, logos, and light/dark theme settings.
          </p>
          <button
            type="button"
            onClick={() => setActiveEditorRole('admin')}
            className="px-4 py-2 rounded-xl bg-[#0B8F76] text-white text-xs font-black cursor-pointer"
          >
            Switch to Super Admin
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT 7 COLUMNS: THEME CONTROLS (PRESETS, COLORS, LOGO, LIGHT/DARK MODE) */}
          <div className="lg:col-span-7 space-y-5 text-xs">
            {/* 1. Curated 1-Click Theme Presets */}
            <div className="space-y-2">
              <label className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] block">
                1. Curated Enterprise Theme Presets (1-Click Apply to Preview)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ENTERPRISE_THEME_PRESETS.map((preset) => {
                  const isSelected = draftTheme.presetName === preset.name;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        const updated: AdminThemeSettings = {
                          ...draftTheme,
                          presetName: preset.name,
                          primaryBrandColor: preset.primaryBrandColor,
                          accentColor: preset.accentColor,
                          surfaceBackgroundLight: preset.surfaceBackgroundLight,
                          surfaceBackgroundDark: preset.surfaceBackgroundDark,
                          themeMode: preset.themeMode,
                          borderRadiusStyle: preset.borderRadiusStyle,
                        };
                        setDraftTheme(updated);
                        if (isLiveAppPreviewActive) {
                          applyThemeSettingsToDocument(updated);
                        }
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-teal-50/70 dark:bg-indigo-950/40 ring-2 ring-teal-500/40'
                          : 'border-slate-200 dark:border-slate-800 hover:border-teal-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-black text-slate-900 dark:text-white truncate">
                          {preset.name}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">
                          Mode: {preset.themeMode} • {preset.borderRadiusStyle}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className="w-5 h-5 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: preset.primaryBrandColor }}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-white shadow-xs"
                          style={{ backgroundColor: preset.accentColor }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Light / Dark / System Theme Mode Selector */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <label className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] block">
                2. Application Light / Dark Appearance Mode
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: 'light', label: 'Light Mode', icon: Sun },
                    { id: 'dark', label: 'Dark Mode', icon: Moon },
                    { id: 'system', label: 'System Auto', icon: Monitor },
                  ] as const
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = draftTheme.themeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        const updated = { ...draftTheme, themeMode: mode.id };
                        setDraftTheme(updated);
                        if (isLiveAppPreviewActive) {
                          applyThemeSettingsToDocument(updated);
                        }
                      }}
                      className={`p-3 rounded-xl border font-black flex flex-col items-center gap-1.5 cursor-pointer transition ${
                        active
                          ? 'bg-[#0B8F76] text-white border-[#0B8F76] shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Custom Brand Colors & Surface Backgrounds */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <label className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] block">
                3. Brand Color Tokens & Surface Palette
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Primary Brand Color (Buttons, Tabs, Headers)
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700">
                    <input
                      type="color"
                      value={draftTheme.primaryBrandColor}
                      onChange={(e) => {
                        const updated = {
                          ...draftTheme,
                          primaryBrandColor: e.target.value,
                          presetName: 'Custom Enterprise Palette',
                        };
                        setDraftTheme(updated);
                        if (isLiveAppPreviewActive) {
                          applyThemeSettingsToDocument(updated);
                        }
                      }}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={draftTheme.primaryBrandColor}
                      onChange={(e) =>
                        setDraftTheme({
                          ...draftTheme,
                          primaryBrandColor: e.target.value,
                        })
                      }
                      className="w-full font-mono font-black text-xs bg-transparent outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Accent & Globe Highlight Color
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700">
                    <input
                      type="color"
                      value={draftTheme.accentColor}
                      onChange={(e) => {
                        const updated = {
                          ...draftTheme,
                          accentColor: e.target.value,
                          presetName: 'Custom Enterprise Palette',
                        };
                        setDraftTheme(updated);
                        if (isLiveAppPreviewActive) {
                          applyThemeSettingsToDocument(updated);
                        }
                      }}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={draftTheme.accentColor}
                      onChange={(e) =>
                        setDraftTheme({
                          ...draftTheme,
                          accentColor: e.target.value,
                        })
                      }
                      className="w-full font-mono font-black text-xs bg-transparent outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Light Mode Page Background
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700">
                    <input
                      type="color"
                      value={draftTheme.surfaceBackgroundLight}
                      onChange={(e) =>
                        setDraftTheme({
                          ...draftTheme,
                          surfaceBackgroundLight: e.target.value,
                        })
                      }
                      className="w-7 h-7 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={draftTheme.surfaceBackgroundLight}
                      onChange={(e) =>
                        setDraftTheme({
                          ...draftTheme,
                          surfaceBackgroundLight: e.target.value,
                        })
                      }
                      className="w-full font-mono font-bold text-xs bg-transparent outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Dark Mode Page Background
                  </label>
                  <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700">
                    <input
                      type="color"
                      value={draftTheme.surfaceBackgroundDark}
                      onChange={(e) =>
                        setDraftTheme({
                          ...draftTheme,
                          surfaceBackgroundDark: e.target.value,
                        })
                      }
                      className="w-7 h-7 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={draftTheme.surfaceBackgroundDark}
                      onChange={(e) =>
                        setDraftTheme({
                          ...draftTheme,
                          surfaceBackgroundDark: e.target.value,
                        })
                      }
                      className="w-full font-mono font-bold text-xs bg-transparent outline-hidden"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Brand Logo Emblem, Tagline & 360° Globe Animation */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-teal-700" />
                  <span>4. Brand Logo Emblem, Tagline & 360° Globe Spin</span>
                </label>

              </div>

              <UniversalMediaManager moduleKey="branding" parentType="brand_logo" maxFiles={1} title="Preview a brand mark" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Logo Emblem HTTPS URL
                  </label>
                  <input
                    type="text"
                    value={draftTheme.brandLogoEmblemUrl}
                    onChange={(e) =>
                      setDraftTheme({
                        ...draftTheme,
                        brandLogoEmblemUrl: e.target.value,
                      })
                    }
                    placeholder="/assets/optimized/brand-emblem-512.webp"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-medium text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Brand Subtitle / Tagline
                  </label>
                  <input
                    type="text"
                    value={draftTheme.brandTagline}
                    onChange={(e) =>
                      setDraftTheme({
                        ...draftTheme,
                        brandTagline: e.target.value,
                      })
                    }
                    placeholder="FIND • BOOK • ENJOY"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold text-xs"
                  />
                </div>
              </div>

              {/* Built-in Emblem Quick Selectors & 360° Globe Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {BUILTIN_LOGO_EMBLEMS.map((emb) => (
                    <button
                      key={emb.url}
                      type="button"
                      onClick={() =>
                        setDraftTheme({
                          ...draftTheme,
                          brandLogoEmblemUrl: emb.url,
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${
                        draftTheme.brandLogoEmblemUrl === emb.url
                          ? 'bg-teal-100 dark:bg-indigo-950 border-teal-500 text-teal-900 dark:text-teal-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <SafeImage category="general"
                        src={emb.url}
                        alt=""
                        className="w-4 h-4 rounded-full object-contain"
                      />
                      <span>{emb.label}</span>
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 font-black text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftTheme.showGlobeAnimation}
                    onChange={(e) =>
                      setDraftTheme({
                        ...draftTheme,
                        showGlobeAnimation: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  <span>360° Rotating Globe 'O'</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="font-bold text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider">
                  Header lockup
                </span>
                {(
                  [
                    { id: 'official' as const, label: 'Official BookOurSpace logo' },
                    { id: 'classic_bos_letters' as const, label: 'Classic BOS letter globe' },
                  ]
                ).map((lockup) => (
                  <button
                    key={lockup.id}
                    type="button"
                    onClick={() =>
                      setDraftTheme({
                        ...draftTheme,
                        brandLockupStyle: lockup.id,
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      (draftTheme.brandLockupStyle || 'official') === lockup.id
                        ? 'bg-teal-100 dark:bg-indigo-950 border-teal-500 text-teal-900 dark:text-teal-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {lockup.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Corner Radius & Layout Density */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-600" />
                <span className="font-black text-slate-800 dark:text-slate-200">
                  5. Corner Geometry:
                </span>
                {(['rounded', 'sharp', 'pill'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() =>
                      setDraftTheme({ ...draftTheme, borderRadiusStyle: style })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase cursor-pointer ${
                      draftTheme.borderRadiusStyle === style
                        ? 'bg-teal-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftTheme.compactDensity}
                  onChange={(e) =>
                    setDraftTheme({
                      ...draftTheme,
                      compactDensity: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-purple-600 cursor-pointer"
                />
                <span>Compact UI Spacing</span>
              </label>
            </div>
          </div>

          {/* RIGHT 5 COLUMNS: LIVE INTERACTIVE SANDBOX PREVIEW */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                Interactive Live Theme Preview Sandbox
              </span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                {draftTheme.themeMode.toUpperCase()} PREVIEW
              </span>
            </div>

            <div
              style={{
                backgroundColor: previewIsDark
                  ? draftTheme.surfaceBackgroundDark
                  : draftTheme.surfaceBackgroundLight,
                color: previewIsDark ? '#F8FAFC' : '#0F172A',
              }}
              className="rounded-3xl border-2 border-slate-300 dark:border-slate-700 p-4 shadow-xl space-y-4 transition-all"
            >
              {/* Simulated App Top Bar with Live BOSBrandLogo */}
              <div
                style={{
                  backgroundColor: previewIsDark ? '#0F172A' : '#FFFFFF',
                  borderColor: previewIsDark ? '#1E293B' : '#E2E8F0',
                }}
                className="p-3 rounded-2xl border flex items-center justify-between gap-2 shadow-2xs"
              >
                <BOSBrandLogo
                  overrideTheme={draftTheme}
                  compact
                  verifiedLabel="VERIFIED"
                />
                <span
                  style={{ backgroundColor: draftTheme.primaryBrandColor }}
                  className="px-3 py-1.5 rounded-full text-white text-[10px] font-black shadow-xs shrink-0"
                >
                  + Post Free
                </span>
              </div>

              {/* Simulated Section Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {['🏠 PGs', '🎓 Classes', '🏢 Venues', '🛠️ Services'].map(
                  (label, i) => (
                    <span
                      key={label}
                      style={
                        i === 0
                          ? {
                              backgroundColor: draftTheme.primaryBrandColor,
                              color: '#FFFFFF',
                            }
                          : {
                              backgroundColor: previewIsDark
                                ? '#1E293B'
                                : '#FFFFFF',
                              color: previewIsDark ? '#E2E8F0' : '#334155',
                            }
                      }
                      className="px-3 py-1 rounded-full text-[10px] font-black border border-slate-200/40 shrink-0"
                    >
                      {label}
                    </span>
                  )
                )}
              </div>

              {/* Simulated Marketplace Listing Card */}
              <div
                style={{
                  backgroundColor: previewIsDark ? '#0F172A' : '#FFFFFF',
                  borderColor: previewIsDark ? '#1E293B' : '#E2E8F0',
                }}
                className="p-3.5 rounded-2xl border space-y-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      backgroundColor: `${draftTheme.accentColor}20`,
                      color: draftTheme.accentColor,
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
                  >
                    ★ Featured Preview Card
                  </span>
                  <span className="text-xs font-black">₹7,500/mo</span>
                </div>
                <div className="font-black text-sm">
                  Sri Sai Executive AC PG & Coaching Hub
                </div>
                <p className="text-[11px] opacity-75">
                  Live preview of how cards, primary buttons, and accent badges look with your selected theme settings.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    style={{ backgroundColor: draftTheme.primaryBrandColor }}
                    className="flex-1 py-2 rounded-xl text-white text-xs font-black"
                  >
                    Book Visit Now
                  </button>
                  <button
                    type="button"
                    style={{
                      borderColor: draftTheme.accentColor,
                      color: draftTheme.accentColor,
                    }}
                    className="px-3 py-2 rounded-xl border-2 text-xs font-black"
                  >
                    Enquire
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
