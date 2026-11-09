export interface AdminAuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  section: 'Dashboard' | 'User Management' | 'Payment Management' | 'Ad Management' | 'Content Management' |
    'Listings & Venues' | 'Bookings & Events' | 'Reports & Analytics' | 'Theme Management' |
    'Feature Management' | 'Integrations' | 'Data Management' | 'Announcements & Status Board' | 'App Settings';
  action: string;
  details: string;
  status: 'published' | 'draft_saved' | 'sensitive_confirmed';
}

const AUDIT_LOGS_KEY = 'bos_admin_audit_logs_v2';

export const DEFAULT_AUDIT_LOGS: AdminAuditLogEntry[] = [
  { id: 'AUD-1001', timestamp: '2026-10-28 09:10:12', actorName: 'Narendra (Super Admin)', actorRole: 'admin', section: 'Ad Management', action: 'Published Ad Campaign', details: 'Published "Hyderabad Premium AC PG & Co-Living Fest" (AD-301) to Top Spotlight.', status: 'published' },
  { id: 'AUD-1002', timestamp: '2026-10-28 08:45:30', actorName: 'Narendra (Super Admin)', actorRole: 'admin', section: 'Payment Management', action: 'Updated Commission & GST Config', details: 'Verified 10% Platform Commission and 18% GST auto-invoice rules.', status: 'published' },
  { id: 'AUD-1003', timestamp: '2026-10-28 08:20:05', actorName: 'Narendra (Super Admin)', actorRole: 'admin', section: 'User Management', action: 'Verified Provider KYC', details: 'Approved GSTIN & KYC for Ramesh Kumar (Sri Sai Executive PG).', status: 'sensitive_confirmed' },
];

export const loadAdminAuditLogs = (): AdminAuditLogEntry[] => {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_KEY);
    if (raw) return JSON.parse(raw) as AdminAuditLogEntry[];
  } catch { /* inaccessible or invalid browser storage uses the documented defaults */ }
  return DEFAULT_AUDIT_LOGS;
};

export const appendAdminAuditLog = (
  section: AdminAuditLogEntry['section'],
  action: string,
  details: string,
  status: AdminAuditLogEntry['status'] = 'published',
  actorName = 'Narendra (Super Admin)',
  actorRole = 'admin',
): AdminAuditLogEntry[] => {
  const now = new Date();
  const entry: AdminAuditLogEntry = {
    id: `AUD-${Date.now().toString().slice(-5)}`,
    timestamp: `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 8)}`,
    actorName,
    actorRole,
    section,
    action,
    details,
    status,
  };
  const next = [entry, ...loadAdminAuditLogs()].slice(0, 200);
  try { localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(next)); } catch { /* quota/private-mode */ }
  return next;
};
