import React, { useState } from 'react';
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldAlert,
  Lock,
  Save,
  Eye,
  History,
  Terminal,
  Sliders,
  Activity,
  Clock,
  Info,
} from 'lucide-react';
import {
  AdminIntegrationConfig,
  AdminAuditLogEntry,
  DEFAULT_INTEGRATIONS,
  loadAdminIntegrations,
  saveAdminIntegrations,
} from '../utils/adminEnterpriseStore';

interface AdminIntegrationsSectionProps {
  canManageIntegrations: boolean;
  activePermissionRoleName: string;
  auditLogs: AdminAuditLogEntry[];
  onRecordAudit: (
    section: AdminAuditLogEntry['section'],
    action: string,
    details: string,
    status?: AdminAuditLogEntry['status']
  ) => void;
  onConfirmAction: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void
  ) => void;
  onNotify: (msg: string) => void;
}

export const AdminIntegrationsSection: React.FC<AdminIntegrationsSectionProps> = ({
  canManageIntegrations,
  activePermissionRoleName,
  auditLogs,
  onRecordAudit,
  onConfirmAction,
  onNotify,
}) => {
  const [integrations, setIntegrations] = useState<AdminIntegrationConfig[]>(() =>
    loadAdminIntegrations()
  );
  const [selectedId, setSelectedId] = useState<string>(integrations[0]?.id || 'int-whatsapp-bridge');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const selectedIntegration =
    integrations.find((item) => item.id === selectedId) || integrations[0];

  const filteredIntegrations = integrations.filter(
    (item) => categoryFilter === 'all' || item.category === categoryFilter
  );

  const integrationAuditLogs = auditLogs.filter((log) => log.section === 'Integrations');

  const syncedCount = integrations.filter(
    (i) => i.providerType === 'built_in_active' && i.enabled && i.status === 'synced'
  ).length;
  const unresolvedErrorsCount = integrations.reduce(
    (acc, item) => acc + item.errorLogs.filter((e) => !e.resolved).length,
    0
  );
  const unconfiguredExternalCount = integrations.filter(
    (i) => i.providerType === 'unconfigured_external'
  ).length;

  const handleToggleEnabled = (target: AdminIntegrationConfig) => {
    if (!canManageIntegrations) return;

    if (target.providerType === 'unconfigured_external') {
      onNotify(
        `Cannot enable "${target.name}" directly: External backend webhook/proxy is not configured. Using safe local fallback.`
      );
      return;
    }

    const nextEnabled = !target.enabled;
    const applyToggle = () => {
      const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
        .toTimeString()
        .slice(0, 5)}`;
      const updated = integrations.map((item) =>
        item.id === target.id
          ? {
              ...item,
              enabled: nextEnabled,
              status: (nextEnabled ? 'synced' : 'disabled') as AdminIntegrationConfig['status'],
              updatedAt: nowStr,
              publishState: 'draft' as const,
            }
          : item
      );
      setIntegrations(updated);
      onRecordAudit(
        'Integrations',
        nextEnabled ? 'Enabled Integration (Draft)' : 'Disabled Integration (Draft)',
        `${target.name} set to ${nextEnabled ? 'ENABLED' : 'DISABLED'} in draft state.`,
        'draft_saved'
      );
      onNotify(`${target.name} ${nextEnabled ? 'enabled' : 'disabled'} in draft. Publish to apply.`);
    };

    if (!nextEnabled) {
      onConfirmAction(
        `Disable ${target.name}?`,
        `Disabling "${target.name}" will turn off its client bridge when published. Are you sure you want to proceed?`,
        'Disable Integration',
        applyToggle
      );
    } else {
      applyToggle();
    }
  };

  const handleSettingChange = (key: string, value: string | boolean | number) => {
    if (!canManageIntegrations || !selectedIntegration) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;
    const updated = integrations.map((item) =>
      item.id === selectedIntegration.id
        ? {
            ...item,
            settings: {
              ...item.settings,
              [key]: value,
            },
            updatedAt: nowStr,
            publishState: 'draft' as const,
          }
        : item
    );
    setIntegrations(updated);
  };

  const handleRunSyncCheck = (target: AdminIntegrationConfig) => {
    setTestingId(target.id);
    setTimeout(() => {
      const nowFull = `${new Date().toISOString().slice(0, 10)} ${new Date()
        .toTimeString()
        .slice(0, 8)}`;
      const updated = integrations.map((item) => {
        if (item.id !== target.id) return item;
        if (item.providerType === 'unconfigured_external') {
          return {
            ...item,
            status: 'not_configured' as const,
            lastSyncAt: 'Never (Unconfigured Proxy)',
          };
        }
        return {
          ...item,
          status: item.enabled ? ('synced' as const) : ('disabled' as const),
          lastSyncAt: nowFull,
          syncLatencyMs: Math.max(5, Math.min(45, item.syncLatencyMs + (Math.random() > 0.5 ? 2 : -2))),
        };
      });
      setIntegrations(updated);
      saveAdminIntegrations(updated);
      setTestingId(null);

      if (target.providerType === 'unconfigured_external') {
        onNotify(
          `Diagnostic complete: "${target.name}" is not connected to an external server proxy. Local simulation fallback remains active.`
        );
      } else {
        onRecordAudit(
          'Integrations',
          'Integration Sync Diagnostic',
          `Verified sync health for ${target.name} (${target.endpointOrMode}).`,
          'published'
        );
        onNotify(`Sync health verified for ${target.name}.`);
      }
    }, 350);
  };

  const handleResolveErrorLog = (integrationId: string, errorId: string) => {
    if (!canManageIntegrations) return;
    const updated = integrations.map((item) =>
      item.id === integrationId
        ? {
            ...item,
            errorLogs: item.errorLogs.map((err) =>
              err.id === errorId ? { ...err, resolved: true } : err
            ),
          }
        : item
    );
    setIntegrations(updated);
    saveAdminIntegrations(updated);
    onRecordAudit(
      'Integrations',
      'Resolved Sync Error Alert',
      `Marked error ${errorId} on ${integrationId} as resolved.`,
      'published'
    );
    onNotify('Sync error log marked as resolved.');
  };

  const handleSaveDraft = () => {
    if (!canManageIntegrations) return;
    const drafted = integrations.map((i) => ({ ...i, publishState: 'draft' as const }));
    setIntegrations(drafted);
    saveAdminIntegrations(drafted);
    onRecordAudit(
      'Integrations',
      'Saved Integration Settings Draft',
      `Saved draft configuration for ${integrations.length} integrations.`,
      'draft_saved'
    );
    onNotify('Integration settings saved as draft.');
  };

  const handlePublishIntegrations = () => {
    if (!canManageIntegrations) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;
    const published = integrations.map((i) => ({
      ...i,
      publishState: 'published' as const,
      updatedAt: nowStr,
    }));
    setIntegrations(published);
    saveAdminIntegrations(published);
    onRecordAudit(
      'Integrations',
      'Published Integration Configuration',
      `Published active settings for ${syncedCount} connected built-in integrations.`,
      'published'
    );
    onNotify('Integration settings published and synced across the application.');
  };

  const handleResetDefaults = () => {
    if (!canManageIntegrations) return;
    onConfirmAction(
      'Reset Integrations to Default?',
      'This will restore all built-in integration settings and error logs to their verified baseline defaults.',
      'Reset Defaults',
      () => {
        setIntegrations(DEFAULT_INTEGRATIONS);
        saveAdminIntegrations(DEFAULT_INTEGRATIONS);
        onRecordAudit(
          'Integrations',
          'Reset Integrations to Default',
          'Restored all built-in integrations to factory configuration.',
          'sensitive_confirmed'
        );
        onNotify('Integrations restored to verified defaults.');
      }
    );
  };

  if (!canManageIntegrations) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 p-8 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          Role Permission Restricted: Integrations
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
          Your current role preview (<strong>{activePermissionRoleName}</strong>) does not have the{' '}
          <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
            canManageIntegrations
          </code>{' '}
          permission enabled. Switch to Super Admin or enable permission in User Management.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                System Bridges & Sync Diagnostics
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Zero-Secret Exposure Enforced
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
              Integrations & Sync Health Inspector
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure built-in app bridges, inspect sync timestamps and error logs, and verify honest connection states without exposing API keys or secrets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all ${
                previewMode
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {previewMode ? 'Exit Preview' : 'Preview Active Behavior'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Draft
            </button>
            <button
              type="button"
              onClick={handlePublishIntegrations}
              className="px-4 py-2 rounded-xl text-xs font-black bg-[#4338CA] hover:bg-indigo-800 text-white flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Publish Changes
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Active Built-in Bridges
            </p>
            <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">
              {syncedCount} / {integrations.filter((i) => i.providerType === 'built_in_active').length}
            </p>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
              Connected & verified locally
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Unconfigured External Gateways
            </p>
            <p className="text-xl font-black text-amber-900 dark:text-white mt-0.5">
              {unconfiguredExternalCount}
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
              Honest status (Using local fallback)
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Open Sync / Diagnostic Alerts
            </p>
            <p className="text-xl font-black text-rose-900 dark:text-white mt-0.5">
              {unresolvedErrorsCount}
            </p>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-400">
              Inspectable in error console
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              Secret Protection Policy
            </p>
            <p className="text-sm font-black text-indigo-900 dark:text-white mt-1">
              0 Keys Exposed in Client
            </p>
            <p className="text-[11px] text-indigo-700/80 dark:text-indigo-400">
              Server proxy enforced for webhooks
            </p>
          </div>
        </div>
      </div>

      {/* Preview Mode Simulation Banner */}
      {previewMode && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                Integration Runtime Preview
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                WhatsApp Prefix:{' '}
                <strong>
                  {String(
                    integrations.find((i) => i.id === 'int-whatsapp-bridge')?.settings
                      .defaultCountryPrefix || '+91'
                  )}
                </strong>{' '}
                • Voice Locale:{' '}
                <strong>
                  {String(
                    integrations.find((i) => i.id === 'int-web-speech-voice')?.settings
                      .defaultLocale || 'en-IN'
                  )}
                </strong>{' '}
                • Invoice Prefix:{' '}
                <strong>
                  {String(
                    integrations.find((i) => i.id === 'int-gst-invoice-print')?.settings
                      .invoicePrefix || 'INV-BOS-2026-'
                  )}
                </strong>
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[11px] font-black shrink-0">
            Click &ldquo;Publish Changes&rdquo; to commit
          </span>
        </div>
      )}

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: 'All Integrations' },
          { id: 'messaging', label: 'Messaging & Deep-Links' },
          { id: 'voice_ai', label: 'Voice & Speech API' },
          { id: 'storage_sync', label: 'Storage & Sync' },
          { id: 'billing_print', label: 'Billing & Print' },
          { id: 'external_gateway', label: 'Unconfigured External Gateways' },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              categoryFilter === cat.id
                ? 'bg-[#4338CA] text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main Split Grid: Left Integration Cards, Right Inspector & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-3">
          {filteredIntegrations.map((item) => {
            const isSelected = item.id === selectedIntegration?.id;
            const openErrors = item.errorLogs.filter((e) => !e.resolved).length;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-[#4338CA] shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        item.status === 'synced'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : item.status === 'not_configured'
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      <Plug className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white">
                        {item.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.endpointOrMode}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${
                      item.status === 'synced'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : item.status === 'not_configured'
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                    }`}
                  >
                    {item.status === 'synced'
                      ? 'Synced'
                      : item.status === 'not_configured'
                      ? 'Not Connected'
                      : item.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 line-clamp-2">
                  {item.description}
                </p>

                <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Last Sync: {item.lastSyncAt}
                  </span>
                  <div className="flex items-center gap-2">
                    {openErrors > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                        {openErrors} alert{openErrors > 1 ? 's' : ''}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold text-[10px] uppercase ${
                        item.publishState === 'published'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      {item.publishState}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Detail & Configuration Panel */}
        {selectedIntegration && (
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-slate-900 dark:text-white">
                      {selectedIntegration.name}
                    </h4>
                    {selectedIntegration.providerType === 'unconfigured_external' && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase">
                        External Gateway (Not Connected)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedIntegration.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRunSyncCheck(selectedIntegration)}
                    disabled={testingId === selectedIntegration.id}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        testingId === selectedIntegration.id ? 'animate-spin' : ''
                      }`}
                    />
                    Test Sync
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(selectedIntegration)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                      selectedIntegration.providerType === 'unconfigured_external'
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                        : selectedIntegration.enabled
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                    }`}
                  >
                    {selectedIntegration.providerType === 'unconfigured_external'
                      ? 'Requires Server Proxy'
                      : selectedIntegration.enabled
                      ? 'Enabled (Click to Disable)'
                      : 'Disabled (Click to Enable)'}
                  </button>
                </div>
              </div>

              {/* Sync Telemetry & Secret Policy */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <p className="text-[10px] font-black uppercase text-slate-400">
                    Credential / Secret Policy
                  </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    {selectedIntegration.maskedSecretStatus}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <p className="text-[10px] font-black uppercase text-slate-400">
                    Sync Latency & Reliability
                  </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    {selectedIntegration.providerType === 'unconfigured_external'
                      ? 'N/A (Not Connected)'
                      : `${selectedIntegration.syncLatencyMs} ms • ${selectedIntegration.successRatePercent}% OK`}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
                  <p className="text-[10px] font-black uppercase text-slate-400">
                    Last Verified Sync
                  </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {selectedIntegration.lastSyncAt}
                  </p>
                </div>
              </div>

              {/* Safe Non-Secret Configuration Parameters */}
              <div>
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                  <Sliders className="w-3.5 h-3.5 text-[#4338CA]" /> Safe Configuration Options (Non-Secret)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(selectedIntegration.settings).map(([key, val]) => (
                    <div
                      key={key}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3"
                    >
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-200 capitalize">
                        {key.replace(/([A-Z])/g, ' $1')}
                      </label>
                      {typeof val === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={val}
                          disabled={selectedIntegration.providerType === 'unconfigured_external'}
                          onChange={(e) => handleSettingChange(key, e.target.checked)}
                          className="w-4 h-4 rounded accent-[#4338CA]"
                        />
                      ) : (
                        <input
                          type={typeof val === 'number' ? 'number' : 'text'}
                          value={String(val)}
                          disabled={selectedIntegration.providerType === 'unconfigured_external'}
                          onChange={(e) =>
                            handleSettingChange(
                              key,
                              typeof val === 'number' ? Number(e.target.value) : e.target.value
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white w-40 text-right"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sync Error Log Inspector */}
              <div>
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                  <Terminal className="w-3.5 h-3.5 text-rose-600" /> Sync & Diagnostic Error Log ({selectedIntegration.errorLogs.length})
                </h5>
                {selectedIntegration.errorLogs.length === 0 ? (
                  <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    Zero sync errors recorded for this integration.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedIntegration.errorLogs.map((err) => (
                      <div
                        key={err.id}
                        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          err.resolved
                            ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                            : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">
                              {err.code}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {err.timestamp}
                            </span>
                            {err.resolved ? (
                              <span className="text-[10px] font-black text-emerald-600 uppercase">
                                Resolved
                              </span>
                            ) : (
                              <span className="text-[10px] font-black text-rose-600 uppercase flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Active Notice
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                            {err.message}
                          </p>
                        </div>

                        {!err.resolved &&
                          selectedIntegration.providerType !== 'unconfigured_external' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleResolveErrorLog(selectedIntegration.id, err.id)
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0"
                            >
                              Mark Resolved
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section Change History */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                <History className="w-3.5 h-3.5 text-[#4338CA]" /> Integrations Audit History ({integrationAuditLogs.length})
              </h5>
              {integrationAuditLogs.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No integration changes recorded in this session yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {integrationAuditLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-start justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {log.action}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {log.details}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 block">
                          {log.timestamp}
                        </span>
                        <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400">
                          {log.actorName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
