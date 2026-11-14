import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Plus,
  Calendar,
  Globe,
  Users,
  Layout,
  Eye,
  Save,
  CheckCircle2,
  XCircle,
  Trash2,
  Lock,
  History,
  Sparkles,
  AlertTriangle,
  Info,
  Wrench,
  X,
} from 'lucide-react';
import {
  AdminAnnouncementNotice,
  AnnouncementPlacement,
  AdminAuditLogEntry,
  loadAdminAnnouncements,
  saveAdminAnnouncements,
} from '../utils/adminEnterpriseStore';

interface AdminAnnouncementsSectionProps {
  canManageAnnouncements: boolean;
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

const PRESET_TEMPLATES = [
  {
    label: 'Under Development Notice',
    title: 'Feature Under Development',
    message: 'Under development—we’ll update you soon.',
    messageTe: 'అభివృద్ధిలో ఉంది—మేము త్వరలోనే అప్‌డేట్ చేస్తాము.',
    messageHi: 'विकास के अधीन है—हम आपको जल्द ही अपडेट करेंगे।',
    severity: 'development' as const,
  },
  {
    label: 'Scheduled Maintenance Window',
    title: 'Scheduled Platform Upgrade',
    message: 'Scheduled maintenance is in progress—booking & enquiries remain safe and active.',
    messageTe: 'షెడ్యూల్డ్ మెయింటెనెన్స్ జరుగుతోంది—బుకింగ్ సేవలు యథావిధిగా పనిచేస్తాయి.',
    messageHi: 'निर्धारित रखरखाव जारी है—बुकिंग और पूछताछ सेवाएं सुरक्षित रूप से चालू हैं।',
    severity: 'maintenance' as const,
  },
  {
    label: 'Provider Category Details Reminder',
    title: 'Provider Listing Specification Notice',
    message: 'Providers: Complete all category-specific fields to appear in the verified Spotlight carousel.',
    messageTe: 'ప్రొవైడర్లకు గమనిక: వెరిఫైడ్ స్పాట్‌లైట్‌లో కనిపించడానికి మీ కేటగిరీ వివరాలను పూర్తి చేయండి.',
    messageHi: 'प्रदाताओं के लिए सूचना: स्पॉटलाइट में दिखने के लिए अपनी श्रेणी के सभी विवरण पूरे करें।',
    severity: 'info' as const,
  },
];

export const PLACEMENT_LABELS: Record<AnnouncementPlacement, string> = {
  top_banner: 'Top Global Ribbon (Above Header)',
  below_header: 'Below Header & Navigation Bar',
  spotlight_strip: 'Above Spotlight Carousel Strip',
  section_card: 'Inside Active Category Section Feed',
  footer_notice: 'Bottom Footer Status Strip',
};

export const isNoticeTimeActive = (notice: AdminAnnouncementNotice, now = new Date()): boolean => {
  const start = notice.startTime ? new Date(notice.startTime).getTime() : 0;
  const end = notice.endTime ? new Date(notice.endTime).getTime() : Number.MAX_SAFE_INTEGER;
  const current = now.getTime();
  if (!Number.isNaN(start) && current < start) return false;
  if (!Number.isNaN(end) && current > end) return false;
  return true;
};

export const AdminAnnouncementsSection: React.FC<AdminAnnouncementsSectionProps> = ({
  canManageAnnouncements,
  activePermissionRoleName,
  auditLogs,
  onRecordAudit,
  onConfirmAction,
  onNotify,
}) => {
  const [notices, setNotices] = useState<AdminAnnouncementNotice[]>(() => loadAdminAnnouncements());
  const [selectedNoticeId, setSelectedNoticeId] = useState<string>(notices[0]?.id || 'ANN-101');
  const [previewLang, setPreviewLang] = useState<'en' | 'te' | 'hi'>('en');

  const selectedNotice = useMemo(
    () => notices.find((n) => n.id === selectedNoticeId) || notices[0],
    [notices, selectedNoticeId]
  );

  const announcementLogs = auditLogs.filter(
    (l) => l.section === 'Announcements & Status Board'
  );

  const publishedActiveCount = notices.filter(
    (n) => n.publishState === 'published' && isNoticeTimeActive(n)
  ).length;
  const draftCount = notices.filter((n) => n.publishState === 'draft').length;

  const updateSelectedNotice = (patch: Partial<AdminAnnouncementNotice>) => {
    if (!canManageAnnouncements || !selectedNotice) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;
    const updated = notices.map((item) =>
      item.id === selectedNotice.id
        ? {
            ...item,
            ...patch,
            updatedAt: nowStr,
          }
        : item
    );
    setNotices(updated);
  };

  const handleCreateNewNotice = () => {
    if (!canManageAnnouncements) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;
    const newNotice: AdminAnnouncementNotice = {
      id: `ANN-${Date.now().toString().slice(-4)}`,
      title: 'Under Development Status Update',
      message: 'Under development—we’ll update you soon.',
      messageTe: 'అభివృద్ధిలో ఉంది—మేము త్వరలోనే అప్‌డేట్ చేస్తాము.',
      messageHi: 'विकास के अधीन है—हम आपको जल्द ही अपडेट करेंगे।',
      severity: 'development',
      placement: 'below_header',
      targetAudience: 'all',
      targetSection: 'all',
      language: 'all',
      startTime: '2025-01-01T00:00',
      endTime: '2027-12-31T23:59',
      dismissible: true,
      ctaLabel: '',
      ctaActionSection: 'none',
      publishState: 'draft',
      createdBy: 'Narendra (Super Admin)',
      updatedAt: nowStr,
    };
    const next = [newNotice, ...notices];
    setNotices(next);
    saveAdminAnnouncements(next);
    setSelectedNoticeId(newNotice.id);
    onRecordAudit(
      'Announcements & Status Board',
      'Created Draft Scheduled Notice',
      `Created draft notice "${newNotice.title}" (${newNotice.id}).`,
      'draft_saved'
    );
    onNotify('Created new draft announcement. Configure and click Publish to display in app.');
  };

  const handleApplyPreset = (preset: (typeof PRESET_TEMPLATES)[number]) => {
    if (!selectedNotice) return;
    updateSelectedNotice({
      title: preset.title,
      message: preset.message,
      messageTe: preset.messageTe,
      messageHi: preset.messageHi,
      severity: preset.severity,
    });
    onNotify(`Applied "${preset.label}" template to editor.`);
  };

  const handleSaveDraft = () => {
    if (!canManageAnnouncements || !selectedNotice) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;
    const next = notices.map((n) =>
      n.id === selectedNotice.id
        ? { ...n, publishState: 'draft' as const, updatedAt: nowStr }
        : n
    );
    setNotices(next);
    saveAdminAnnouncements(next);
    onRecordAudit(
      'Announcements & Status Board',
      'Saved Announcement Draft',
      `Saved draft "${selectedNotice.title}" at placement ${selectedNotice.placement}.`,
      'draft_saved'
    );
    onNotify(`Saved "${selectedNotice.title}" as draft.`);
  };

  const handleTogglePublish = (target: AdminAnnouncementNotice) => {
    if (!canManageAnnouncements) return;
    const nextState = target.publishState === 'published' ? 'draft' : 'published';
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;

    const applyChange = () => {
      const next = notices.map((n) =>
        n.id === target.id ? { ...n, publishState: nextState as 'draft' | 'published', updatedAt: nowStr } : n
      );
      setNotices(next);
      saveAdminAnnouncements(next);
      onRecordAudit(
        'Announcements & Status Board',
        nextState === 'published' ? 'Published Scheduled Notice' : 'Unpublished Notice',
        `${nextState === 'published' ? 'Published' : 'Unpublished'} "${target.title}" (${
          PLACEMENT_LABELS[target.placement]
        }, Audience: ${target.targetAudience}).`,
        nextState === 'published' ? 'published' : 'sensitive_confirmed'
      );
      onNotify(
        nextState === 'published'
          ? `Published "${target.title}" live to ${PLACEMENT_LABELS[target.placement]}!`
          : `Unpublished "${target.title}" (reverted to draft).`
      );
    };

    if (nextState === 'draft') {
      onConfirmAction(
        `Unpublish "${target.title}"?`,
        `This will immediately remove "${target.title}" from ${PLACEMENT_LABELS[target.placement]} for all users.`,
        'Unpublish Notice',
        applyChange
      );
    } else {
      applyChange();
    }
  };

  const handleDeleteNotice = (target: AdminAnnouncementNotice) => {
    if (!canManageAnnouncements) return;
    onConfirmAction(
      `Delete Notice "${target.title}"?`,
      `Are you sure you want to permanently delete "${target.title}" (${target.id})?`,
      'Delete Notice',
      () => {
        const next = notices.filter((n) => n.id !== target.id);
        setNotices(next);
        saveAdminAnnouncements(next);
        if (selectedNoticeId === target.id && next[0]) {
          setSelectedNoticeId(next[0].id);
        }
        onRecordAudit(
          'Announcements & Status Board',
          'Deleted Announcement Notice',
          `Deleted notice "${target.title}" (${target.id}).`,
          'sensitive_confirmed'
        );
        onNotify(`Deleted notice "${target.title}".`);
      }
    );
  };

  const [bgServiceStates, setBgServiceStates] = useState<
    {
      id: string;
      name: string;
      status: 'operational' | 'degraded' | 'sync_error';
      latency: string;
      lastSync: string;
      tooltip: string;
    }[]
  >([
    {
      id: 'srv-db-sync',
      name: 'Marketplace Store & Cache Sync',
      status: 'operational',
      latency: '14ms',
      lastSync: 'Just now',
      tooltip:
        'Real-time localStorage & state replication healthy across all 6 marketplace sections (100% uptime).',
    },
    {
      id: 'srv-booking-scheduler',
      name: '1-Hr Booking Schedule Notifier',
      status: 'operational',
      latency: '22ms',
      lastSync: 'Active (60s poll)',
      tooltip:
        'Background scheduler checks upcoming customer visits & triggers browser/UI alerts 1 hour prior.',
    },
    {
      id: 'srv-gst-qr',
      name: 'GST Invoice & QR Validator',
      status: 'operational',
      latency: '9ms',
      lastSync: 'Just now',
      tooltip:
        'CGST/SGST (9%+9%) calculation engine & 2D QR validation matrix operating normally.',
    },
    {
      id: 'srv-webhook-bridge',
      name: 'External Webhook / SMS Gateway',
      status: 'sync_error',
      latency: 'Timeout (480ms)',
      lastSync: 'Retry queued (3m ago)',
      tooltip:
        'Secondary SMS relay reported a transient sync error (HTTP 504). Automatic self-healing fallback to WhatsApp & In-App Push is active.',
    },
  ]);

  const cycleServiceStatus = (id: string) => {
    setBgServiceStates((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const nextStatus =
          s.status === 'operational'
            ? 'degraded'
            : s.status === 'degraded'
            ? 'sync_error'
            : 'operational';
        return {
          ...s,
          status: nextStatus,
          latency:
            nextStatus === 'operational'
              ? '12ms'
              : nextStatus === 'degraded'
              ? '195ms (High Load)'
              : 'Sync Error (503)',
          lastSync: 'Updated just now',
          tooltip:
            nextStatus === 'operational'
              ? `${s.name} is 100% operational with zero packet loss.`
              : nextStatus === 'degraded'
              ? `${s.name} is experiencing elevated queue latency; auto-scaling workers.`
              : `${s.name} encountered a sync error; self-healing retry in progress.`,
        };
      })
    );
  };

  if (!canManageAnnouncements) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 p-8 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          Role Permission Restricted: Announcements & Status Board
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
          Your current role preview (<strong>{activePermissionRoleName}</strong>) does not have the{' '}
          <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
            canManageAnnouncements
          </code>{' '}
          permission enabled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Summary Header + Visual Background Services Health Status Indicator */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-teal-100 dark:bg-indigo-950/80 text-teal-700 dark:text-teal-300 text-[10px] font-black uppercase tracking-wider">
                Scheduled App Notices & Status Board
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                {publishedActiveCount} Live in App Now
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
              Announcements & Scheduled Status Board
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create scheduled notices such as &ldquo;Under development—we’ll update you soon.&rdquo;, target specific placements, roles, sections, languages, and monitor background service health.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNewNotice}
              className="px-4 py-2 rounded-xl text-xs font-black bg-[#0B8F76] hover:bg-indigo-800 text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Scheduled Notice
            </button>
          </div>
        </div>

        {/* Visual Background Services Health Status Indicator Bar with Hover Tooltips */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Background Services Health Status Indicator (Hover badge for diagnostic tooltip • Click to test state)</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {bgServiceStates.filter((s) => s.status === 'operational').length}/{bgServiceStates.length} Operational
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {bgServiceStates.map((srv) => {
              const isGreen = srv.status === 'operational';
              const isAmber = srv.status === 'degraded';
              return (
                <div
                  key={srv.id}
                  onClick={() => cycleServiceStatus(srv.id)}
                  className={`group relative rounded-xl border p-2.5 transition-all cursor-pointer select-none ${
                    isGreen
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/80 hover:border-emerald-500'
                      : isAmber
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80 hover:border-amber-500'
                      : 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 hover:border-rose-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {srv.name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                        isGreen
                          ? 'bg-emerald-600 text-white'
                          : isAmber
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isGreen ? 'bg-white' : isAmber ? 'bg-slate-950' : 'bg-amber-200 animate-ping'
                        }`}
                      />
                      {isGreen ? 'Operational' : isAmber ? 'High Load' : 'Sync Error'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                    <span>Latency: {srv.latency}</span>
                    <span>{srv.lastSync}</span>
                  </div>

                  {/* Rich Hover Tooltip for Details */}
                  <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-0 right-0 bottom-full mb-2 z-30 bg-slate-950 text-white p-2.5 rounded-xl shadow-xl border border-slate-700 text-[10px] leading-relaxed">
                    <div className="font-black text-amber-300 flex items-center justify-between mb-0.5">
                      <span>{srv.name}</span>
                      <span className="uppercase">{srv.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-slate-200">{srv.tooltip}</p>
                    <div className="text-[9px] text-slate-400 mt-1 pt-1 border-t border-slate-800">
                      Click badge to simulate status transition (Operational → High Load → Sync Error)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Split View: Left Notice Queue, Right Message Editor & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">
              All Notices ({notices.length}) • {draftCount} Drafts
            </span>
          </div>

          {notices.map((item) => {
            const isSelected = item.id === selectedNotice?.id;
            const timeActive = isNoticeTimeActive(item);
            return (
              <div
                key={item.id}
                onClick={() => setSelectedNoticeId(item.id)}
                className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'bg-teal-50/70 dark:bg-indigo-950/30 border-[#0B8F76] shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {item.id} • {item.severity.toUpperCase()}
                    </span>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white mt-0.5">
                      {item.title}
                    </h4>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase shrink-0 ${
                      item.publishState === 'published' && timeActive
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : item.publishState === 'published'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                    }`}
                  >
                    {item.publishState === 'published'
                      ? timeActive
                        ? 'Published • Live'
                        : 'Scheduled'
                      : 'Draft'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                  {item.message}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-500">
                  <span>{PLACEMENT_LABELS[item.placement]}</span>
                  <span>
                    Audience: <strong className="uppercase">{item.targetAudience}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Message Editor & Live Preview */}
        {selectedNotice && (
          <div className="lg:col-span-8 space-y-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-5">
              {/* Editor Top Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-500">
                    Editing Notice {selectedNotice.id}
                  </span>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    {selectedNotice.title || 'Untitled Notice'}
                  </h4>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(selectedNotice)}
                    className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm ${
                      selectedNotice.publishState === 'published'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {selectedNotice.publishState === 'published' ? (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> Unpublish Notice
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Publish Notice
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotice(selectedNotice)}
                    className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/50"
                    title="Delete Notice"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Templates */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-teal-600" /> Quick Status Presets
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_TEMPLATES.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-indigo-950/50 hover:bg-teal-100 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/60 text-xs font-bold transition-all"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Content Fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Notice Headline / Title
                    </label>
                    <input
                      type="text"
                      value={selectedNotice.title}
                      onChange={(e) => updateSelectedNotice({ title: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      placeholder="e.g., Module Status Notice"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Banner Severity / Style
                    </label>
                    <select
                      value={selectedNotice.severity}
                      onChange={(e) =>
                        updateSelectedNotice({
                          severity: e.target.value as AdminAnnouncementNotice['severity'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                    >
                      <option value="development">Under Development (Indigo/Amber)</option>
                      <option value="maintenance">Maintenance Window (Amber)</option>
                      <option value="info">Information Update (Blue)</option>
                      <option value="warning">Important Alert (Rose)</option>
                      <option value="success">Release / Live Feature (Emerald)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Primary Message (English) *
                  </label>
                  <textarea
                    rows={2}
                    value={selectedNotice.message}
                    onChange={(e) => updateSelectedNotice({ message: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                    placeholder="Under development—we’ll update you soon."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Telugu Message (తెలుగు - Optional)
                    </label>
                    <input
                      type="text"
                      value={selectedNotice.messageTe || ''}
                      onChange={(e) => updateSelectedNotice({ messageTe: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      placeholder="అభివృద్ధిలో ఉంది—మేము త్వరలోనే అప్‌డేట్ చేస్తాము."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Hindi Message (हिंदी - Optional)
                    </label>
                    <input
                      type="text"
                      value={selectedNotice.messageHi || ''}
                      onChange={(e) => updateSelectedNotice({ messageHi: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                      placeholder="विकास के अधीन है—हम आपको जल्द ही अपडेट करेंगे।"
                    />
                  </div>
                </div>
              </div>

              {/* Targeting & Schedule Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Layout className="w-3 h-3 text-teal-700" /> App Placement
                  </label>
                  <select
                    value={selectedNotice.placement}
                    onChange={(e) =>
                      updateSelectedNotice({
                        placement: e.target.value as AnnouncementPlacement,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    {Object.entries(PLACEMENT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Users className="w-3 h-3 text-teal-700" /> Target Audience
                  </label>
                  <select
                    value={selectedNotice.targetAudience}
                    onChange={(e) =>
                      updateSelectedNotice({
                        targetAudience: e.target.value as AdminAnnouncementNotice['targetAudience'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="all">All Users (Customers, Providers, Admins)</option>
                    <option value="customer">Customers Only</option>
                    <option value="provider">Owners / Providers Only</option>
                    <option value="admin">Admins Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-teal-700" /> Target Language
                  </label>
                  <select
                    value={selectedNotice.language}
                    onChange={(e) =>
                      updateSelectedNotice({
                        language: e.target.value as AdminAnnouncementNotice['language'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="all">All Languages (Auto-match user selection)</option>
                    <option value="en">English Only</option>
                    <option value="te">Telugu (తెలుగు) Only</option>
                    <option value="hi">Hindi (हिंदी) Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Target Marketplace Section
                  </label>
                  <select
                    value={selectedNotice.targetSection}
                    onChange={(e) =>
                      updateSelectedNotice({
                        targetSection: e.target.value as AdminAnnouncementNotice['targetSection'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="all">All Marketplace Sections</option>
                    <option value="pg_hostels">PG & Hostels Only</option>
                    <option value="classes">Coaching & Training Classes Only</option>
                    <option value="venues">Function Halls & Venues Only</option>
                    <option value="services">Home & Repair Services Only</option>
                    <option value="hotel_stay">Hotel Stay & Room Booking Only</option>
                    <option value="movies">Movies & Events Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-teal-700" /> Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={selectedNotice.startTime}
                    onChange={(e) => updateSelectedNotice({ startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-teal-700" /> End Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={selectedNotice.endTime}
                    onChange={(e) => updateSelectedNotice({ endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Dismissible Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                <div>
                  <p className="text-xs font-black text-slate-800 dark:text-white">
                    Allow Users to Dismiss Notice
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    When enabled, users see a close (×) button to dismiss the notice for their current session.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedNotice.dismissible}
                    onChange={(e) => updateSelectedNotice({ dismissible: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#0B8F76]"
                  />
                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                    {selectedNotice.dismissible ? 'Dismissible (Yes)' : 'Pinned / Non-Dismissible'}
                  </span>
                </label>
              </div>

              {/* Live Interactive Preview Box */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-[#0B8F76]" /> Live App Placement Preview ({PLACEMENT_LABELS[selectedNotice.placement]})
                  </span>
                  <div className="flex items-center gap-1">
                    {(['en', 'te', 'hi'] as const).map((lng) => (
                      <button
                        key={lng}
                        type="button"
                        onClick={() => setPreviewLang(lng)}
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          previewLang === lng
                            ? 'bg-[#0B8F76] text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {lng}
                      </button>
                    ))}
                  </div>
                </div>

                <NoticeBannerVisual
                  notice={selectedNotice}
                  language={previewLang}
                  isPreview
                />
              </div>
            </div>

            {/* Change History */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
              <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
                <History className="w-3.5 h-3.5 text-[#0B8F76]" /> Announcements Change History ({announcementLogs.length})
              </h5>
              {announcementLogs.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No announcement edits recorded in this session yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {announcementLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-start justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{log.action}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {log.details}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 block">
                          {log.timestamp}
                        </span>
                        <span className="text-[10px] font-black text-teal-700 dark:text-teal-500">
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

interface NoticeBannerVisualProps {
  notice: AdminAnnouncementNotice;
  language: string;
  onDismiss?: () => void;
  isPreview?: boolean;
}

const NoticeBannerVisual: React.FC<NoticeBannerVisualProps> = ({
  notice,
  language,
  onDismiss,
  isPreview = false,
}) => {
  const localizedMessage =
    language === 'te' && notice.messageTe
      ? notice.messageTe
      : language === 'hi' && notice.messageHi
      ? notice.messageHi
      : notice.message;

  const styleMap: Record<
    AdminAnnouncementNotice['severity'],
    { wrap: string; badge: string; icon: React.ReactNode }
  > = {
    development: {
      wrap: 'bg-gradient-to-r from-indigo-900 via-[#0B8F76] to-amber-700 text-white border-teal-500/40',
      badge: 'bg-amber-400 text-slate-950',
      icon: <Wrench className="w-4 h-4 text-amber-300 shrink-0" />,
    },
    maintenance: {
      wrap: 'bg-amber-50 dark:bg-amber-950/80 text-amber-950 dark:text-amber-100 border-amber-300 dark:border-amber-700',
      badge: 'bg-amber-600 text-white',
      icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
    },
    info: {
      wrap: 'bg-teal-50 dark:bg-indigo-950/80 text-indigo-950 dark:text-indigo-100 border-teal-200 dark:border-teal-800',
      badge: 'bg-[#0B8F76] text-white',
      icon: <Info className="w-4 h-4 text-teal-700 dark:text-teal-500 shrink-0" />,
    },
    warning: {
      wrap: 'bg-rose-50 dark:bg-rose-950/80 text-rose-950 dark:text-rose-100 border-rose-300 dark:border-rose-800',
      badge: 'bg-rose-600 text-white',
      icon: <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />,
    },
    success: {
      wrap: 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-100 border-emerald-300 dark:border-emerald-800',
      badge: 'bg-emerald-600 text-white',
      icon: <Megaphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    },
  };

  const currentStyle = styleMap[notice.severity] || styleMap.development;

  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 shadow-sm flex items-center justify-between gap-3 ${currentStyle.wrap}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {currentStyle.icon}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${currentStyle.badge}`}
            >
              {notice.title}
            </span>
            {isPreview && (
              <span className="px-1.5 py-0.5 rounded bg-black/20 text-[9px] font-bold uppercase">
                Preview ({notice.publishState})
              </span>
            )}
            <p className="text-xs font-bold leading-snug break-words">{localizedMessage}</p>
          </div>
        </div>
      </div>

      {notice.dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
          title="Dismiss notice"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

interface LiveScheduledAnnouncementsBannerProps {
  placement: AnnouncementPlacement;
  userRole: 'customer' | 'provider' | 'admin';
  activeSection: string;
  language?: string;
  currentLang?: string;
}

export const LiveScheduledAnnouncementsBanner: React.FC<
  LiveScheduledAnnouncementsBannerProps
> = ({ placement, userRole, activeSection, language: langProp, currentLang }) => {
  const language = currentLang || langProp || 'te';
  const [notices, setNotices] = useState<AdminAnnouncementNotice[]>(() => loadAdminAnnouncements());
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem('bos_dismissed_announcements');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const syncNotices = () => setNotices(loadAdminAnnouncements());
    window.addEventListener('bos-announcements-updated', syncNotices);
    window.addEventListener('bos-admin-enterprise-updated', syncNotices);
    return () => {
      window.removeEventListener('bos-announcements-updated', syncNotices);
      window.removeEventListener('bos-admin-enterprise-updated', syncNotices);
    };
  }, []);

  const matchingNotices = useMemo(() => {
    const now = new Date();
    return notices.filter((n) => {
      if (n.publishState !== 'published') return false;
      if (n.placement !== placement) return false;
      if (n.dismissible && dismissedIds.includes(n.id)) return false;
      if (!isNoticeTimeActive(n, now)) return false;
      if (n.targetAudience !== 'all' && n.targetAudience !== userRole) return false;
      if (n.targetSection !== 'all' && n.targetSection !== activeSection) return false;
      if (n.language !== 'all' && n.language !== language) return false;
      return true;
    });
  }, [notices, placement, dismissedIds, userRole, activeSection, language]);

  const handleDismiss = (id: string) => {
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    try {
      sessionStorage.setItem('bos_dismissed_announcements', JSON.stringify(next));
    } catch {}
  };

  if (matchingNotices.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 my-2 space-y-2">
      {matchingNotices.map((notice) => (
        <NoticeBannerVisual
          key={notice.id}
          notice={notice}
          language={language}
          onDismiss={() => handleDismiss(notice.id)}
        />
      ))}
    </div>
  );
};
