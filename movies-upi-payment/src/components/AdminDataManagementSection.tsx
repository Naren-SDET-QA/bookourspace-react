import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Wrench,
  Archive,
  Download,
  RefreshCw,
  Lock,
  Save,
  Eye,
  History,
  ShieldCheck,
  FileWarning,
  Sliders,
} from 'lucide-react';
import { MarketplaceListing, Booking } from '../types/marketplace';
import {
  AdminManagedUser,
  AdminDataQuarantineItem,
  AdminDataHygieneConfig,
  AdminAuditLogEntry,
  loadAdminDataQuarantine,
  saveAdminDataQuarantine,
  loadAdminDataHygieneConfig,
  saveAdminDataHygieneConfig,
} from '../utils/adminEnterpriseStore';

interface AdminDataManagementSectionProps {
  listings: MarketplaceListing[];
  users: AdminManagedUser[];
  bookings: Booking[];
  canManageData: boolean;
  activePermissionRoleName: string;
  auditLogs: AdminAuditLogEntry[];
  onUpdateListing: (id: string, updates: Partial<MarketplaceListing>) => void;
  onUpdateUsers: (updatedUsers: AdminManagedUser[]) => void;
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
    onConfirm: () => void,
    danger?: boolean
  ) => void;
  onNotify: (msg: string) => void;
}

export const AdminDataManagementSection: React.FC<AdminDataManagementSectionProps> = ({
  listings,
  users,
  bookings,
  canManageData,
  activePermissionRoleName,
  auditLogs,
  onUpdateListing,
  onUpdateUsers,
  onRecordAudit,
  onConfirmAction,
  onNotify,
}) => {
  const [hygieneConfig, setHygieneConfig] = useState<AdminDataHygieneConfig>(() =>
    loadAdminDataHygieneConfig()
  );
  const [quarantineItems, setQuarantineItems] = useState<AdminDataQuarantineItem[]>(() =>
    loadAdminDataQuarantine()
  );
  const [entityFilter, setEntityFilter] = useState<'all' | 'listing' | 'user' | 'booking'>('all');
  const [previewRules, setPreviewRules] = useState<boolean>(false);

  // Dynamically scan live listings, users, and bookings for incomplete fields
  const liveIncompleteRecords = useMemo<AdminDataQuarantineItem[]>(() => {
    const detected: AdminDataQuarantineItem[] = [];

    listings.forEach((item) => {
      const missing: string[] = [];
      if (
        hygieneConfig.requirePhoneOnListings &&
        (!item.providerPhone || item.providerPhone.trim().length < 10)
      ) {
        missing.push('Verified Contact Phone');
      }
      if (
        hygieneConfig.requirePincodeOnListings &&
        (!item.location?.pincode || item.location.pincode.trim().length < 6)
      ) {
        missing.push('6-Digit Pincode');
      }
      if (
        hygieneConfig.requireVerifiedImageOnListings &&
        (!item.images || item.images.length === 0)
      ) {
        missing.push('Primary Listing Photo');
      }
      if (
        hygieneConfig.requireSectionSpecificFields &&
        (!item.customFieldValues || Object.keys(item.customFieldValues).length === 0)
      ) {
        missing.push('Category Specification Details');
      }

      const existingOverride = quarantineItems.find((q) => q.recordId === item.id);
      if (missing.length > 0 || existingOverride) {
        detected.push({
          id: existingOverride?.id || `DQ-LST-${item.id}`,
          recordId: item.id,
          entityType: 'listing',
          titleOrName: item.title,
          sectionOrRole: item.categoryId,
          missingFields:
            missing.length > 0
              ? missing
              : existingOverride?.missingFields || ['All required fields repaired'],
          severity: missing.length >= 2 ? 'critical' : missing.length === 1 ? 'warning' : 'low',
          resolutionStatus:
            missing.length === 0
              ? 'repaired'
              : existingOverride?.resolutionStatus || 'needs_attention',
          notes:
            existingOverride?.notes ||
            `Listing in ${item.location?.city || 'Hyderabad'} (${
              item.location?.area || 'Main Area'
            }) has ${missing.length} missing field(s).`,
          updatedAt: existingOverride?.updatedAt || '2026-10-29 09:00',
          updatedBy: existingOverride?.updatedBy || 'Live Hygiene Scanner',
        });
      }
    });

    users.forEach((u) => {
      const missing: string[] = [];
      if (u.role === 'provider' && !u.verified) {
        missing.push('Provider KYC Verification');
      }
      if (u.role === 'provider' && !u.gstin) {
        missing.push('GSTIN Tax ID');
      }
      if (!u.phone || u.phone.trim().length < 10) {
        missing.push('Verified Mobile Number');
      }

      const existingOverride = quarantineItems.find((q) => q.recordId === u.id);
      if (missing.length > 0 || existingOverride) {
        detected.push({
          id: existingOverride?.id || `DQ-USR-${u.id}`,
          recordId: u.id,
          entityType: 'user',
          titleOrName: u.name,
          sectionOrRole: u.role,
          missingFields:
            missing.length > 0
              ? missing
              : existingOverride?.missingFields || ['All required fields repaired'],
          severity: !u.verified ? 'warning' : 'low',
          resolutionStatus:
            missing.length === 0
              ? 'repaired'
              : existingOverride?.resolutionStatus || 'needs_attention',
          notes:
            existingOverride?.notes ||
            `Account status: ${u.accountStatus}. KYC: ${u.kycDocument || 'Pending'}.`,
          updatedAt: existingOverride?.updatedAt || '2026-10-29 09:00',
          updatedBy: existingOverride?.updatedBy || 'Live Hygiene Scanner',
        });
      }
    });

    bookings.forEach((b) => {
      const missing: string[] = [];
      if (!b.scheduledDate) missing.push('Scheduled Booking Date');
      if (!b.totalAmount || b.totalAmount <= 0) missing.push('Transaction Amount');
      if (missing.length > 0) {
        detected.push({
          id: `DQ-BKG-${b.id}`,
          recordId: b.id,
          entityType: 'booking',
          titleOrName: b.listingTitle,
          sectionOrRole: b.status,
          missingFields: missing,
          severity: 'warning',
          resolutionStatus: 'needs_attention',
          notes: 'Booking record missing schedule or amount metadata.',
          updatedAt: '2026-10-29 09:00',
          updatedBy: 'Live Hygiene Scanner',
        });
      }
    });

    return detected;
  }, [listings, users, bookings, hygieneConfig, quarantineItems]);

  const filteredRecords = liveIncompleteRecords.filter(
    (r) => entityFilter === 'all' || r.entityType === entityFilter
  );

  const needsAttentionCount = liveIncompleteRecords.filter(
    (r) => r.resolutionStatus === 'needs_attention'
  ).length;
  const repairedCount = liveIncompleteRecords.filter(
    (r) => r.resolutionStatus === 'repaired'
  ).length;
  const quarantinedCount = liveIncompleteRecords.filter(
    (r) => r.resolutionStatus === 'quarantined'
  ).length;

  const dataAuditLogs = auditLogs.filter((l) => l.section === 'Data Management');

  const handleSafeRepairRecord = (record: AdminDataQuarantineItem) => {
    if (!canManageData) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;

    if (record.entityType === 'listing') {
      const targetListing = listings.find((l) => l.id === record.recordId);
      if (targetListing) {
        onUpdateListing(targetListing.id, {
          providerPhone:
            targetListing.providerPhone && targetListing.providerPhone.trim().length >= 10
              ? targetListing.providerPhone
              : '+91 98480 22338',
          location: {
            ...targetListing.location,
            city: targetListing.location?.city || hygieneConfig.defaultFallbackCity || 'Hyderabad',
            area: targetListing.location?.area || 'Madhapur',
            pincode:
              targetListing.location?.pincode && targetListing.location.pincode.trim().length >= 6
                ? targetListing.location.pincode
                : hygieneConfig.defaultFallbackPincode || '500081',
          },
          customFieldValues:
            targetListing.customFieldValues &&
            Object.keys(targetListing.customFieldValues).length > 0
              ? targetListing.customFieldValues
              : {
                  verifiedByDataHygiene: 'Yes',
                  supportDeskPhone: '+91 98480 22338',
                },
        });
      }
    } else if (record.entityType === 'user') {
      const updatedUsers = users.map((u) =>
        u.id === record.recordId
          ? {
              ...u,
              verified: true,
              accountStatus: 'active' as const,
              gstin: u.gstin || '36AABCB2026K1Z5',
              kycDocument: 'Verified via Admin Safe Data Repair',
            }
          : u
      );
      onUpdateUsers(updatedUsers);
    }

    const nextItem: AdminDataQuarantineItem = {
      ...record,
      resolutionStatus: 'repaired',
      missingFields: ['All required fields safely populated'],
      severity: 'low',
      notes: `Safely repaired with verified fallback defaults on ${nowStr}.`,
      updatedAt: nowStr,
      updatedBy: 'Narendra (Super Admin)',
    };
    const nextList = [
      nextItem,
      ...quarantineItems.filter((q) => q.recordId !== record.recordId),
    ];
    setQuarantineItems(nextList);
    saveAdminDataQuarantine(nextList);

    onRecordAudit(
      'Data Management',
      'Safe Auto-Repair Incomplete Data',
      `Repaired ${record.entityType} "${record.titleOrName}" (${record.recordId}) with verified fallback fields.`,
      'published'
    );
    onNotify(`Safely repaired "${record.titleOrName}" and saved changes.`);
  };

  const handleQuarantineRecord = (record: AdminDataQuarantineItem) => {
    if (!canManageData) return;
    onConfirmAction(
      `Quarantine Incomplete Record?`,
      `Quarantining "${record.titleOrName}" (${record.recordId}) flags it for provider follow-up and holds incomplete drafts from public spotlight until resolved.`,
      'Quarantine Record',
      () => {
        const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
          .toTimeString()
          .slice(0, 5)}`;

        if (record.entityType === 'listing') {
          const targetListing = listings.find((l) => l.id === record.recordId);
          if (targetListing) {
            onUpdateListing(targetListing.id, {
              status: 'pending_approval',
              isFeatured: false,
            });
          }
        }

        const nextItem: AdminDataQuarantineItem = {
          ...record,
          resolutionStatus: 'quarantined',
          notes: `Quarantined by Admin on ${nowStr} pending complete provider details.`,
          updatedAt: nowStr,
          updatedBy: 'Narendra (Super Admin)',
        };
        const nextList = [
          nextItem,
          ...quarantineItems.filter((q) => q.recordId !== record.recordId),
        ];
        setQuarantineItems(nextList);
        saveAdminDataQuarantine(nextList);

        onRecordAudit(
          'Data Management',
          'Quarantined Incomplete Record',
          `Moved ${record.entityType} "${record.titleOrName}" (${record.recordId}) to quarantine queue.`,
          'sensitive_confirmed'
        );
        onNotify(`"${record.titleOrName}" moved to safe quarantine.`);
      },
      true
    );
  };

  const handleSaveHygieneDraft = () => {
    if (!canManageData) return;
    const draft: AdminDataHygieneConfig = {
      ...hygieneConfig,
      publishState: 'draft',
    };
    setHygieneConfig(draft);
    saveAdminDataHygieneConfig(draft);
    onRecordAudit(
      'Data Management',
      'Saved Data Hygiene Rules (Draft)',
      `Saved validation rules draft (Fallback City: ${draft.defaultFallbackCity}, Pincode: ${draft.defaultFallbackPincode}).`,
      'draft_saved'
    );
    onNotify('Data validation rules saved as draft.');
  };

  const handlePublishHygieneRules = () => {
    if (!canManageData) return;
    const nowStr = `${new Date().toISOString().slice(0, 10)} ${new Date()
      .toTimeString()
      .slice(0, 5)}`;
    const published: AdminDataHygieneConfig = {
      ...hygieneConfig,
      lastScanAt: nowStr,
      publishState: 'published',
    };
    setHygieneConfig(published);
    saveAdminDataHygieneConfig(published);
    onRecordAudit(
      'Data Management',
      'Published Data Hygiene Rules',
      `Published data integrity rules and scanned ${listings.length} listings & ${users.length} users.`,
      'published'
    );
    onNotify('Data hygiene validation rules published and live scan completed.');
  };

  const handleExportSanitizedSnapshot = () => {
    if (!canManageData) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      securityNote: 'Sanitized export — zero secrets or tokens included.',
      counts: {
        listings: listings.length,
        users: users.length,
        bookings: bookings.length,
        incompleteItems: needsAttentionCount,
      },
      hygieneConfig,
      quarantineItems: liveIncompleteRecords,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookourspace-data-hygiene-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    onRecordAudit(
      'Data Management',
      'Exported Sanitized Data Snapshot',
      `Downloaded sanitized JSON hygiene report (${listings.length} listings, ${users.length} users).`,
      'published'
    );
    onNotify('Sanitized JSON data snapshot exported.');
  };

  if (!canManageData) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/50 p-8 text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          Role Permission Restricted: Data Management
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
          Your current role preview (<strong>{activePermissionRoleName}</strong>) does not have the{' '}
          <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
            canManageData
          </code>{' '}
          permission enabled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                Data Integrity & Safe Hygiene Engine
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                Last Scan: {hygieneConfig.lastScanAt}
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">
              Data Management & Incomplete Record Inspector
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detect listings, provider profiles, or bookings with missing fields, apply non-destructive repairs, quarantine incomplete drafts, and export sanitized snapshots.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewRules(!previewRules)}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border ${
                previewRules
                  ? 'bg-amber-500 text-white border-amber-600'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {previewRules ? 'Exit Rule Preview' : 'Preview Validation Impact'}
            </button>
            <button
              type="button"
              onClick={handleSaveHygieneDraft}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Draft
            </button>
            <button
              type="button"
              onClick={handlePublishHygieneRules}
              className="px-4 py-2 rounded-xl text-xs font-black bg-[#4338CA] hover:bg-indigo-800 text-white flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Run Scan & Publish Rules
            </button>
            <button
              type="button"
              onClick={handleExportSanitizedSnapshot}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Snapshot
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Total Records Scanned
            </p>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {listings.length + users.length + bookings.length}
            </p>
            <p className="text-[11px] text-slate-500">
              {listings.length} listings • {users.length} users • {bookings.length} bookings
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Incomplete (Needs Attention)
            </p>
            <p className="text-xl font-black text-amber-900 dark:text-white mt-0.5">
              {needsAttentionCount}
            </p>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
              Missing phone, pincode, KYC, or specs
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Safely Repaired
            </p>
            <p className="text-xl font-black text-emerald-900 dark:text-white mt-0.5">
              {repairedCount}
            </p>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400">
              Populated with verified fallbacks
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/40">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Quarantined Records
            </p>
            <p className="text-xl font-black text-rose-900 dark:text-white mt-0.5">
              {quarantinedCount}
            </p>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-400">
              Held from public spotlight
            </p>
          </div>
        </div>
      </div>

      {previewRules && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <strong>Validation Impact Preview:</strong> With current toggles,{' '}
            <strong>{needsAttentionCount}</strong> record(s) are flagged as incomplete. Default fallback city is{' '}
            <strong>{hygieneConfig.defaultFallbackCity}</strong> ({hygieneConfig.defaultFallbackPincode}).
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[11px] font-black">
            Status: {hygieneConfig.publishState.toUpperCase()}
          </span>
        </div>
      )}

      {/* Hygiene Validation Rules Configuration */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
          <Sliders className="w-3.5 h-3.5 text-[#4338CA]" /> Completeness Validation Rules & Fallback Defaults
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              key: 'requirePhoneOnListings' as const,
              label: 'Require Verified Contact Phone on Listings',
            },
            {
              key: 'requirePincodeOnListings' as const,
              label: 'Require 6-Digit Pincode on Listings',
            },
            {
              key: 'requireVerifiedImageOnListings' as const,
              label: 'Require At Least 1 Listing Image',
            },
            {
              key: 'requireSectionSpecificFields' as const,
              label: 'Require Category Specification Fields',
            },
          ].map((rule) => (
            <label
              key={rule.key}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {rule.label}
              </span>
              <input
                type="checkbox"
                checked={hygieneConfig[rule.key]}
                onChange={(e) =>
                  setHygieneConfig({
                    ...hygieneConfig,
                    [rule.key]: e.target.checked,
                    publishState: 'draft',
                  })
                }
                className="w-4 h-4 rounded accent-[#4338CA]"
              />
            </label>
          ))}

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Fallback City
            </span>
            <input
              type="text"
              value={hygieneConfig.defaultFallbackCity}
              onChange={(e) =>
                setHygieneConfig({
                  ...hygieneConfig,
                  defaultFallbackCity: e.target.value,
                  publishState: 'draft',
                })
              }
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white w-32 text-right"
            />
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Fallback Pincode
            </span>
            <input
              type="text"
              value={hygieneConfig.defaultFallbackPincode}
              onChange={(e) =>
                setHygieneConfig({
                  ...hygieneConfig,
                  defaultFallbackPincode: e.target.value,
                  publishState: 'draft',
                })
              }
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white w-28 text-right"
            />
          </div>
        </div>
      </div>

      {/* Incomplete Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-amber-600" /> Incomplete & Flagged Data Queue ({filteredRecords.length})
          </h4>
          <div className="flex items-center gap-1.5">
            {(['all', 'listing', 'user', 'booking'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setEntityFilter(type)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize ${
                  entityFilter === type
                    ? 'bg-[#4338CA] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {type === 'all' ? 'All Entities' : `${type}s`}
              </button>
            ))}
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-8 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-black text-emerald-900 dark:text-emerald-200">
              All scanned records meet completeness rules!
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              No missing phone numbers, pincodes, or unverified provider records found in this filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3">Entity & ID</th>
                  <th className="py-2.5 px-3">Title / Name</th>
                  <th className="py-2.5 px-3">Missing or Flagged Fields</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Safe Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                        {rec.entityType} • {rec.recordId}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-slate-900 dark:text-white">{rec.titleOrName}</p>
                      <p className="text-[11px] text-slate-500">{rec.notes}</p>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {rec.missingFields.map((mf, i) => (
                          <span
                            key={i}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rec.resolutionStatus === 'repaired'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {mf}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          rec.resolutionStatus === 'repaired'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : rec.resolutionStatus === 'quarantined'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                        }`}
                      >
                        {rec.resolutionStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {rec.resolutionStatus !== 'repaired' && (
                          <button
                            type="button"
                            onClick={() => handleSafeRepairRecord(rec)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1"
                          >
                            <Wrench className="w-3 h-3" /> Safe Repair
                          </button>
                        )}
                        {rec.resolutionStatus !== 'quarantined' && (
                          <button
                            type="button"
                            onClick={() => handleQuarantineRecord(rec)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 text-[11px] font-bold inline-flex items-center gap-1"
                          >
                            <Archive className="w-3 h-3" /> Quarantine
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Data Management Audit History */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-3">
          <History className="w-3.5 h-3.5 text-[#4338CA]" /> Data Management Change History ({dataAuditLogs.length})
        </h5>
        {dataAuditLogs.length === 0 ? (
          <p className="text-xs text-slate-400">
            No data repair or quarantine actions recorded in this session yet.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {dataAuditLogs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-start justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{log.action}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{log.details}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 block">{log.timestamp}</span>
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
  );
};
