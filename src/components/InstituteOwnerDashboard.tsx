import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Bell, BookOpen, Building2, CalendarDays, CalendarOff, Check, ChevronRight, ClipboardCheck,
  DoorOpen, DollarSign, Download, FileText, GraduationCap, History, LayoutDashboard, Megaphone,
  MessageSquare, Plus, RefreshCw, Settings, ShieldCheck, UserCog, Users, X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  adminInstituteEntitlement, adminInstituteStatus, adminInstituteVerification, createInstitute, createInstituteFee,
  deleteInstituteHoliday, enrollInstituteApplicant, fetchInstituteAdminDirectory, fetchInstituteWorkspace,
  gradeInstituteSubmission, issueInstituteCertificate, markInstituteAttendance, publishInstituteCourse, publishInstituteExam,
  recordInstituteFeePayment, recordInstituteExamResults, refundInstituteFee, reviewInstituteLeave, revokeInstituteMember,
  saveInstituteAdmission, saveInstituteAnnouncement, saveInstituteAssignment, saveInstituteBatch, saveInstituteBranch,
  saveInstituteClassroom, saveInstituteCourse, saveInstituteExam, saveInstituteFaculty, saveInstituteHoliday, saveInstituteMember,
  transferInstituteStudent, updateInstitute, updateInstituteEnquiry,
  type InstituteWorkspaceData,
} from '../lib/instituteApi';
import { instituteErrorMessage, validateInstituteForm, type InstituteFormErrors } from '../lib/instituteValidation';

type Section = 'overview' | 'profile' | 'branches' | 'classrooms' | 'courses' | 'batches' | 'calendar' | 'faculty' | 'admissions' | 'students' | 'leave' | 'attendance' | 'fees' | 'exams' | 'certificates' | 'announcements' | 'enquiries' | 'reviews' | 'analytics' | 'notifications' | 'staff' | 'audit' | 'admin' | 'reports' | 'settings';
type FormKind = 'branch' | 'classroom' | 'course' | 'batch' | 'faculty' | 'admission' | 'holiday' | 'exam' | 'announcement' | 'member' | null;

interface Props { onSwitchToMarketplace?: () => void; }

const emptyWorkspace: InstituteWorkspaceData = {
  institute: null, institutes: [], role: null, permissions: [], branches: [], members: [], faculty: [], courses: [], batches: [], enrollments: [], admissions: [], attendance: [], fees: [], enquiries: [], reviews: [], notifications: [],
  classrooms: [], holidays: [], leaveRequests: [], transfers: [], exams: [], results: [], assignments: [], submissions: [], certificates: [], announcements: [], audit: [], entitlements: [], progress: [],
  analytics: { branches: 0, courses: 0, activeBatches: 0, enrolledStudents: 0, feeDue: 0, feeCollected: 0, enquiries: 0, reviews: 0, averageRating: null, attendanceRate: null, occupancy: null, facultyWorkload: 0, pendingAdmissions: 0, waitlistedStudents: 0, refunded: 0, pendingLeaves: 0 },
};

const nav: Array<{ id: Section; label: string; icon: React.ElementType; group: string }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Home' },
  { id: 'profile', label: 'Institute profile', icon: Building2, group: 'Institute' },
  { id: 'branches', label: 'Branches', icon: Building2, group: 'Institute' },
  { id: 'classrooms', label: 'Classrooms & facilities', icon: DoorOpen, group: 'Institute' },
  { id: 'courses', label: 'Classes / courses', icon: BookOpen, group: 'Institute' },
  { id: 'batches', label: 'Batches & timings', icon: CalendarDays, group: 'Institute' },
  { id: 'calendar', label: 'Calendar & holidays', icon: CalendarOff, group: 'Institute' },
  { id: 'faculty', label: 'Faculty', icon: GraduationCap, group: 'Institute' },
  { id: 'admissions', label: 'Admissions', icon: ClipboardCheck, group: 'Students' },
  { id: 'students', label: 'Enrolled students', icon: Users, group: 'Students' },
  { id: 'leave', label: 'Leave requests', icon: CalendarOff, group: 'Students' },
  { id: 'attendance', label: 'Attendance', icon: Check, group: 'Students' },
  { id: 'fees', label: 'Fees & collection', icon: DollarSign, group: 'Finance' },
  { id: 'exams', label: 'Exams, results & certificates', icon: FileText, group: 'Academics' },
  { id: 'certificates', label: 'Certificates', icon: FileText, group: 'Academics' },
  { id: 'announcements', label: 'Announcements', icon: Megaphone, group: 'Communication' },
  { id: 'enquiries', label: 'Enquiries', icon: MessageSquare, group: 'Growth' },
  { id: 'reviews', label: 'Reviews', icon: ShieldCheck, group: 'Growth' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Growth' },
  { id: 'notifications', label: 'Notifications', icon: Bell, group: 'Workspace' },
  { id: 'staff', label: 'Staff & roles', icon: UserCog, group: 'Workspace' },
  { id: 'audit', label: 'Audit history', icon: History, group: 'Workspace' },
  { id: 'reports', label: 'Reports', icon: Download, group: 'Workspace' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Workspace' },
];

function money(value: unknown): string { return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }
function date(value: unknown): string { return value ? new Date(String(value)).toLocaleDateString('en-IN') : 'Not configured'; }
function statusClass(value: unknown): string { const v = String(value || '').toLowerCase(); return v === 'active' || v === 'paid' || v === 'verified' || v === 'published' || v === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : v === 'rejected' || v === 'overdue' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'; }
function listColumnLabel(column: string): string { return column.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim(); }
function listValue(column: string, row: Record<string, any>): React.ReactNode {
  if (column.toLowerCase().includes('status')) return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row[column])}`}>{String(row[column] ?? 'Not configured')}</span>;
  if (column.toLowerCase().includes('amount') || column.toLowerCase().includes('price')) return money(row[column]);
  if (column.toLowerCase().includes('date') || column.toLowerCase().endsWith('at')) return date(row[column]);
  return String(row[column] ?? 'Not configured');
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#ff385c] focus:ring-2 focus:ring-[#ff385c]/15';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';

export default function InstituteOwnerDashboard({ onSwitchToMarketplace }: Props) {
  const [section, setSection] = useState<Section>('overview');
  const [workspace, setWorkspace] = useState<InstituteWorkspaceData>(emptyWorkspace);
  const [selectedInstituteId, setSelectedInstituteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeKind, setNoticeKind] = useState<'success' | 'error'>('success');
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [editId, setEditId] = useState<string | undefined>();
  const [form, setForm] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<InstituteFormErrors>({});
  const [profileForm, setProfileForm] = useState<Record<string, any>>({});
  const [profileError, setProfileError] = useState('');
  const [attendanceBatchId, setAttendanceBatchId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceStatus, setAttendanceStatus] = useState<Record<string, string>>({});
  const [adminInstitutes, setAdminInstitutes] = useState<Record<string, any>[]>([]);
  const [adminError, setAdminError] = useState('');

  const instituteId = String(workspace.institute?.id || selectedInstituteId || '');
  const load = async (id = selectedInstituteId) => {
    setLoading(true); setError('');
    const result = await fetchInstituteWorkspace(id || undefined);
    if (!result.ok || !result.data) {
      const missingDatabase = result.status === 503 || result.error === 'DATABASE_REQUIRED_FOR_INSTITUTE_WORKSPACE' || result.error === 'INSTITUTE_WORKSPACE_REPOSITORY_ERROR';
      setDatabaseUnavailable(missingDatabase);
      setWorkspace(emptyWorkspace);
      setSelectedInstituteId('');
      setProfileForm({});
      setError(missingDatabase ? 'Connect the local PostgreSQL/Supabase database and apply the institute workspace migration before creating records. Nothing is fabricated while the database is unavailable.' : 'Unable to load the authorized institute workspace.');
      setLoading(false);
      return;
    }
    setDatabaseUnavailable(false);
    const raw = result.data.workspace || {} as InstituteWorkspaceData;
    const arrayKeys: Array<keyof InstituteWorkspaceData> = [
      'institutes', 'permissions', 'branches', 'members', 'faculty', 'courses', 'batches', 'enrollments', 'admissions',
      'attendance', 'fees', 'enquiries', 'reviews', 'notifications', 'classrooms', 'holidays', 'leaveRequests', 'transfers',
      'exams', 'results', 'assignments', 'submissions', 'certificates', 'announcements', 'audit', 'entitlements', 'progress',
    ];
    const next = { ...emptyWorkspace, ...raw, analytics: { ...emptyWorkspace.analytics, ...(raw.analytics || {}) } } as InstituteWorkspaceData;
    for (const key of arrayKeys) next[key] = (Array.isArray(raw[key]) ? raw[key] : []) as never;
    setWorkspace(next); setSelectedInstituteId(String(next.institute?.id || id || '')); setProfileForm(next.institute || {}); setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (section === 'admin' && workspace.role === 'admin') void loadAdminDirectory(); }, [section, workspace.role]);
  useEffect(() => { if (notice) { const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer); } }, [notice]);

  const action = async (result: { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>, success = 'Saved') => { const resolved = await result; if (!resolved.ok) { setNoticeKind('error'); setNotice(`Error: ${instituteErrorMessage(resolved.error)}`); return false; } setNoticeKind('success'); setNotice(success); await load(); return true; };
  const openForm = (kind: FormKind, row?: Record<string, any>) => {
    setFormKind(kind);
    setEditId(row?.id ? String(row.id) : undefined);
    const defaults = kind === 'batch'
      ? { deliveryMode: 'offline', feeUnit: 'course', capacity: 30, waitlistCapacity: 0, timezone: 'Asia/Kolkata' }
      : kind === 'classroom' ? { capacity: 30, facilities: '' }
      : kind === 'exam' ? { maxMarks: 100, status: 'scheduled' }
      : kind === 'announcement' ? { audience: 'students' }
      : kind === 'member' ? { role: 'receptionist' }
      : {};
    setForm(row ? { ...row, payload: row.payload || {} } : defaults);
    setFormErrors({});
  };
  const setField = (key: string, value: unknown) => setForm((current) => ({ ...current, [key]: value }));

  const loadAdminDirectory = async () => {
    const result = await fetchInstituteAdminDirectory();
    if (result.ok && result.data) { setAdminInstitutes(result.data.institutes); setAdminError(''); }
    else setAdminError(result.error || 'Admin directory unavailable');
  };

  const submitForm = async () => {
    if (!instituteId) return;
    if (!formKind) return;
    const validation = validateInstituteForm(formKind, form);
    if (Object.keys(validation).length) { setFormErrors(validation); setNoticeKind('error'); setNotice('Please correct the highlighted fields.'); return; }
    setFormErrors({});
    let result: any;
    if (formKind === 'branch') result = await saveInstituteBranch(instituteId, editId, form);
    if (formKind === 'course') result = await saveInstituteCourse(instituteId, editId, { ...form, payload: { description: form.description || '', outcomes: form.outcomes || '' } });
    if (formKind === 'batch') result = await saveInstituteBatch(instituteId, editId, form);
    if (formKind === 'faculty') result = await saveInstituteFaculty(instituteId, editId, form);
    if (formKind === 'admission') result = await saveInstituteAdmission(instituteId, editId, form);
    if (formKind === 'classroom') result = await saveInstituteClassroom(instituteId, editId, { ...form, facilities: String(form.facilities || '').split(',').map((item: string) => item.trim()).filter(Boolean) });
    if (formKind === 'holiday') result = await saveInstituteHoliday(instituteId, form);
    if (formKind === 'exam') result = await saveInstituteExam(instituteId, editId, form);
    if (formKind === 'announcement') result = await saveInstituteAnnouncement(instituteId, form);
    if (formKind === 'member') result = await saveInstituteMember(instituteId, form);
    if (result && await action(result, editId ? 'Updated' : 'Created')) setFormKind(null);
  };

  const exportReport = () => {
    const rows = [
      ['section', 'id', 'name', 'status', 'amount'],
      ...workspace.courses.map((row) => ['course', row.id, row.title, row.status, row.price ?? '']),
      ...workspace.batches.map((row) => ['batch', row.id, row.title, row.status, row.capacity ?? '']),
      ...workspace.fees.map((row) => ['fee', row.id, row.description, row.status, row.amount ?? '']),
      ...workspace.admissions.map((row) => ['admission', row.id, row.name, row.status, '']),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bookourspace-institute-report.csv'; anchor.click(); URL.revokeObjectURL(url); setNotice('Report exported');
  };

  const exportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 48;
    doc.setFontSize(16); doc.text(`Institute report — ${workspace.institute?.name || 'Institute'}`, 40, y); y += 20;
    doc.setFontSize(9); doc.text(`Generated ${new Date().toLocaleString('en-IN')} · authorized records only`, 40, y); y += 22;
    const line = (label: string, value: string) => { doc.setFontSize(10); doc.text(`${label}: ${value}`, 40, y); y += 16; if (y > 780) { doc.addPage(); y = 48; } };
    line('Branches', String(workspace.analytics.branches || 0));
    line('Courses', String(workspace.analytics.courses || 0));
    line('Active batches', String(workspace.analytics.activeBatches || 0));
    line('Enrolled students', String(workspace.analytics.enrolledStudents || 0));
    line('Occupancy', workspace.analytics.occupancy == null ? 'Not configured' : `${workspace.analytics.occupancy}%`);
    line('Fees collected', money(workspace.analytics.feeCollected));
    line('Fees due', money(workspace.analytics.feeDue));
    line('Refunded', money(workspace.analytics.refunded));
    line('Attendance', workspace.analytics.attendanceRate == null ? 'Not configured' : `${workspace.analytics.attendanceRate.toFixed(1)}%`);
    y += 8;
    doc.setFontSize(11); doc.text('Fees', 40, y); y += 16;
    if (!workspace.fees.length) { doc.setFontSize(9); doc.text('No fee records.', 40, y); y += 16; }
    for (const fee of workspace.fees.slice(0, 40)) line(String(fee.studentName || fee.description || 'Fee'), `${money(fee.amount)} · ${fee.status || ''} · ${fee.receiptNo || 'no receipt'}`);
    doc.save('bookourspace-institute-report.pdf');
    setNotice('PDF exported');
  };

  const sections = Array.from(new Set(nav.map((item) => item.group)));
  const selectedBatch = workspace.batches.find((row) => String(row.id) === attendanceBatchId);
  const batchEnrollments = workspace.enrollments.filter((row) => String(row.batchId || row.batch_id) === attendanceBatchId && row.status === 'confirmed');
  const rating = workspace.analytics.averageRating == null ? 'Not configured' : `${Number(workspace.analytics.averageRating).toFixed(1)} / 5`;

  const stat = (label: string, value: string | number, helper: string, accent = 'text-slate-900') => <div className={cardClass}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{helper}</div></div>;
  const empty = (title: string, message: string, button?: React.ReactNode) => <div className={`${cardClass} border-dashed text-center`}><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Building2 className="h-5 w-5" /></div><h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{message}</p>{button && <div className="mt-4">{button}</div>}</div>;
  const primary = (label: string, onClick: () => void) => <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl bg-[#ff385c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#e31c5f] focus:outline-none focus:ring-2 focus:ring-[#ff385c]/30"><Plus className="h-4 w-4" />{label}</button>;

  const content = () => {
    if (!workspace.institute && section !== 'profile') return empty('Set up your institute workspace', 'Create an institute profile first. Nothing is counted until records are saved in Supabase.', primary('Create institute', () => { setFormKind(null); setProfileForm({ name: '', city: '' }); setSection('profile'); }));
    if (section === 'overview' && workspace.institute) return <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stat('Branches', workspace.analytics.branches || 0, 'Authorized branch records')}{stat('Courses', workspace.analytics.courses || 0, 'Course listings in this institute')}{stat('Active batches', workspace.analytics.activeBatches || 0, 'Admin-approved batches')}{stat('Enrolled students', workspace.analytics.enrolledStudents || 0, 'Confirmed enrollments')}</div>
      <div className="grid gap-4 lg:grid-cols-3"><div className={`${cardClass} lg:col-span-2`}><div className="flex items-center justify-between"><div><h3 className="font-semibold">Needs attention</h3><p className="text-sm text-slate-500">Live records that may need a next step.</p></div><button type="button" onClick={() => void load()} aria-label="Refresh workspace" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => setSection('admissions')} className="rounded-xl border border-slate-200 p-3 text-left hover:border-[#ff385c]"><div className="text-2xl font-bold">{workspace.admissions.filter((row) => row.status === 'new').length}</div><div className="text-xs text-slate-500">New admissions</div></button><button type="button" onClick={() => setSection('fees')} className="rounded-xl border border-slate-200 p-3 text-left hover:border-[#ff385c]"><div className="text-2xl font-bold">{money(workspace.analytics.feeDue)}</div><div className="text-xs text-slate-500">Fees due</div></button><button type="button" onClick={() => setSection('enquiries')} className="rounded-xl border border-slate-200 p-3 text-left hover:border-[#ff385c]"><div className="text-2xl font-bold">{workspace.enquiries.filter((row) => String(row.status) !== 'closed').length}</div><div className="text-xs text-slate-500">Open enquiries</div></button></div></div><div className={cardClass}><h3 className="font-semibold">Institute status</h3><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Profile</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(workspace.institute.status)}`}>{workspace.institute.status}</span></div><div className="flex justify-between"><span className="text-slate-500">Verification</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(workspace.institute.verificationStatus)}`}>{workspace.institute.verificationStatus}</span></div><div className="flex justify-between"><span className="text-slate-500">Fee collected</span><span className="font-semibold">{money(workspace.analytics.feeCollected)}</span></div><div className="flex justify-between"><span className="text-slate-500">Attendance</span><span className="font-semibold">{workspace.analytics.attendanceRate == null ? 'Not configured' : `${workspace.analytics.attendanceRate.toFixed(1)}%`}</span></div></div></div></div>
    </>;
    if (section === 'profile') return <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]"><div className={cardClass}><h3 className="font-semibold">{workspace.institute ? 'Institute profile' : 'Create institute profile'}</h3><p className="mt-1 text-sm text-slate-500">Only saved profile fields are shown to customers.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{['name','city','email','phone','website'].map((key) => <label key={key} className="text-sm font-medium text-slate-700 sm:last:col-span-2">{key[0].toUpperCase()+key.slice(1)}<input className={`${inputClass} mt-1`} value={profileForm[key] || ''} onChange={(event) => setProfileForm({ ...profileForm, [key]: event.target.value })} /></label>)}<label className="text-sm font-medium text-slate-700 sm:col-span-2">Description<textarea className={`${inputClass} mt-1 min-h-24`} value={profileForm.description || ''} onChange={(event) => setProfileForm({ ...profileForm, description: event.target.value })} /></label></div><div className="mt-4 flex justify-end">{primary(workspace.institute ? 'Save profile' : 'Create institute', async () => { if (!instituteId) { const result = await createInstitute(profileForm); if (await action(result, 'Institute created')) await load(); } else await action(await updateInstitute(instituteId, profileForm), 'Profile saved'); })}</div></div>{workspace.institute ? <div className={cardClass}><h3 className="font-semibold">Publishing and verification</h3><p className="mt-2 text-sm text-slate-500">Publishing makes the profile eligible for marketplace review. Verification is controlled by authorized admin review and is never inferred from form completion.</p><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span>Status</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(workspace.institute?.status)}`}>{workspace.institute?.status}</span></div><div className="flex justify-between"><span>Verification</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(workspace.institute?.verificationStatus)}`}>{workspace.institute?.verificationStatus}</span></div></div></div> : <div className={cardClass}><h3 className="font-semibold">Not published yet</h3><p className="mt-2 text-sm text-slate-500">Your institute is created as a draft. Verification and public publishing remain separate authorized steps.</p></div>}</div>;
    if (section === 'branches') return <ListSection title="Branches" description="Keep each branch’s schedule, staff and students scoped independently." action={primary('Add branch', () => openForm('branch'))} rows={workspace.branches} emptyText="No branches configured yet." columns={['name','city','status']} onEdit={(row) => openForm('branch', row)} />;
    if (section === 'faculty') return <ListSection title="Faculty" description="Store only qualifications and experience provided by the institute." action={primary('Add faculty', () => openForm('faculty'))} rows={workspace.faculty} emptyText="No faculty records configured yet." columns={['name','qualification','experience','verificationStatus']} onEdit={(row) => openForm('faculty', row)} />;
    if (section === 'courses') return <ListSection title="Courses" description="Course listings are submitted for admin approval before they become public." action={primary('Add course', () => openForm('course'))} rows={workspace.courses} emptyText="No course listings yet." columns={['title','price','priceUnit','status']} onEdit={(row) => openForm('course', row)} onAction={(row) => void action(publishInstituteCourse(instituteId, String(row.id)), 'Course submitted for review')} actionLabel="Publish / submit" />;
    if (section === 'batches') return <ListSection title="Batches & timings" description="Capacity and availability are derived from server-side enrollment records." action={primary('Add batch', () => openForm('batch'))} rows={workspace.batches} emptyText="No batches configured yet." columns={['title','courseTitle','daysOfWeek','startTime','endTime','capacity','seatsLeft','status']} onEdit={(row) => openForm('batch', row)} />;
    if (section === 'admissions') return <ListSection title="Admissions" description="Track prospects and follow-ups, then approve an applicant into a batch. Seat allocation is transactional." action={primary('Add admission', () => openForm('admission'))} rows={workspace.admissions} emptyText="No admission enquiries yet." columns={['name','courseTitle','source','status','followUpAt']} onEdit={(row) => openForm('admission', row)} onAction={(row) => { const batchId = window.prompt('Batch id to enroll into', String(workspace.batches.find((batch) => String(batch.status) === 'active')?.id || '')); if (batchId) void action(enrollInstituteApplicant(instituteId, String(row.id), { batchId, deliveryMode: 'offline', paymentMode: 'pay_at_institute' }), 'Applicant enrolled'); }} actionLabel="Approve & enroll" />;
    if (section === 'students') return <div className="space-y-4"><ListSection title="Enrolled students" description="Derived from confirmed class enrollments. Seat numbers come from the server." rows={workspace.enrollments} emptyText="No confirmed enrollments yet." columns={['studentName','courseTitle','batchTitle','feeAmount','paymentStatus','seatSequence','status']} onAction={(row) => { const toBatchId = window.prompt('Move student to batch id', String(workspace.batches.find((batch) => String(batch.id) !== String(row.batchId) && String(batch.status) === 'active')?.id || '')); if (toBatchId) void action(transferInstituteStudent(instituteId, { enrollmentId: String(row.id), toBatchId, reason: 'Batch transfer from console' }), 'Student transferred'); }} actionLabel="Transfer" /><ListSection title="Progress reports" description="Attendance, exam average, outstanding fees and certificate state per confirmed enrollment." rows={workspace.progress} emptyText="No confirmed students yet." columns={['studentName','batchTitle','markedSessions','presentSessions','examAverage','feeDue','certificateNo']} /><ListSection title="Transfer history" description="Every batch transfer is recorded with the actor." rows={workspace.transfers} emptyText="No transfers yet." columns={['studentName','fromBatchTitle','toBatchTitle','reason','createdAt']} /></div>;
    if (section === 'fees') return <div className="space-y-4"><ListSection title="Fees & collection" description="Amounts are stored server side; a verified payment mints one receipt number per institute." action={primary('Add fee', () => { const description = window.prompt('Fee description'); const amount = window.prompt('Amount'); const installments = window.prompt('Number of installments (1-12)', '1'); if (description && amount) void action(createInstituteFee(instituteId, { description, amount, installments: Number(installments || 1), kind: Number(installments || 1) > 1 ? 'installment' : 'tuition' }), 'Fee added'); })} rows={workspace.fees} emptyText="No fee ledger records yet." columns={['studentName','description','amount','discountAmount','dueDate','status','receiptNo']} onAction={(row) => { const choice = window.prompt('Type "pay" to verify a payment or "refund" to refund it', 'pay'); if (String(choice).toLowerCase() === 'refund') { const amount = window.prompt('Refund amount (blank = full)', ''); void action(refundInstituteFee(String(row.id), { amount: amount || undefined, reason: window.prompt('Refund reason') || '' }), 'Refund recorded'); return; } const method = window.prompt('Payment method (UPI, cash, bank transfer)'); if (method) void action(recordInstituteFeePayment(String(row.id), method, window.prompt('Payment reference (optional)') || ''), 'Payment verified'); }} actionLabel="Pay / refund" /><ListSection title="Outstanding balances" description="Open dues grouped by student, computed from the ledger." rows={workspace.fees.filter((fee) => String(fee.status) === 'due')} emptyText="No outstanding dues." columns={['studentName','description','amount','dueDate','kind']} /></div>;
    if (section === 'enquiries') return <ListSection title="Enquiries" description="Customer enquiries remain tied to the underlying course listing and can be followed up here." rows={workspace.enquiries} emptyText="No enquiries received yet." columns={['customerName','courseTitle','message','status','createdAt']} onAction={(row) => void action(updateInstituteEnquiry(instituteId, String(row.id), String(row.status) === 'closed' ? 'contacted' : 'closed'), 'Enquiry updated')} actionLabel="Toggle closed" />;
    if (section === 'reviews') return <ListSection title="Reviews" description="Reviews are read from the marketplace records. They are not marked verified unless the source record says so." rows={workspace.reviews} emptyText="No reviews yet." columns={['courseTitle','customerName','rating','comment','createdAt']} />;
    if (section === 'notifications') return <ListSection title="Notifications" description="Only notifications authorized for the signed-in account are shown." rows={workspace.notifications} emptyText="No notifications yet." columns={['title','message','notifType','isRead','createdAt']} />;
    if (section === 'analytics') return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stat('Average rating', rating, `${workspace.analytics.reviews || 0} review records`)}{stat('Attendance rate', workspace.analytics.attendanceRate == null ? 'Not configured' : `${workspace.analytics.attendanceRate.toFixed(1)}%`, 'From marked attendance records')}{stat('Fees collected', money(workspace.analytics.feeCollected), 'Paid fee ledger records', 'text-emerald-600')}{stat('Fees due', money(workspace.analytics.feeDue), 'Open fee ledger records', 'text-amber-600')}<div className={`${cardClass} sm:col-span-2 xl:col-span-4`}><h3 className="font-semibold">Operational counts</h3><div className="mt-4 grid gap-3 sm:grid-cols-4">{[['Courses',workspace.analytics.courses],['Batches',workspace.analytics.activeBatches],['Students',workspace.analytics.enrolledStudents],['Enquiries',workspace.analytics.enquiries]].map(([label,value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{value || 0}</div></div>)}</div></div></div>;
    if (section === 'reports') return <div className={cardClass}><h3 className="font-semibold">Reports</h3><p className="mt-1 text-sm text-slate-500">Export the live authorized workspace snapshot. Empty datasets export headers and no fabricated rows.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:border-[#ff385c]"><Download className="h-4 w-4" />Export CSV</button><button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:border-[#ff385c]"><FileText className="h-4 w-4" />Export PDF</button></div></div>;
    if (section === 'settings') return <div className="grid gap-4 lg:grid-cols-2"><div className={cardClass}><h3 className="font-semibold">Your institute role</h3><div className="mt-3 text-2xl font-bold">{workspace.role || 'Not configured'}</div><p className="mt-1 text-sm text-slate-500">Permissions are enforced by institute membership and database RLS.</p></div><div className={cardClass}><h3 className="font-semibold">Authorized permissions</h3>{workspace.permissions.length ? <div className="mt-3 flex flex-wrap gap-2">{workspace.permissions.map((permission) => <span key={permission} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{permission}</span>)}</div> : <p className="mt-3 text-sm text-slate-500">Owner and branch-admin access is governed by the membership role. No extra staff permissions are configured.</p>}</div></div>;
    if (section === 'classrooms') return <ListSection title="Classrooms & facilities" description="Room capacity and facilities belong to a branch and are enforced server side." action={primary('Add classroom', () => openForm('classroom'))} rows={workspace.classrooms} emptyText="No classrooms recorded yet." columns={['name','branchName','capacity','status']} onEdit={(row) => openForm('classroom', row)} />;
    if (section === 'calendar') return <div className="space-y-4"><ListSection title="Calendar & holidays" description="Holidays are stored per batch. Batch timings come from server records and conflicts are rejected when saved." action={primary('Add holiday', () => openForm('holiday'))} rows={workspace.holidays} emptyText="No holidays recorded yet." columns={['batchTitle','holidayDate','reason']} onAction={(row) => void action(deleteInstituteHoliday(instituteId, String(row.id)), 'Holiday removed')} actionLabel="Remove" /><ListSection title="Batch schedule" description="Recurring weekly timings, faculty and room assignment." rows={workspace.batches} emptyText="No batches configured yet." columns={['title','daysOfWeek','startTime','endTime','facultyDisplayName','classroomId','status']} /></div>;
    if (section === 'leave') return <ListSection title="Leave requests" description="Students request leave against their own enrollment; staff decisions are audited." rows={workspace.leaveRequests} emptyText="No leave requests yet." columns={['studentName','batchTitle','fromDate','toDate','status']} onAction={(row) => void action(reviewInstituteLeave(instituteId, String(row.id), 'approved', 'Approved from institute console'), 'Leave approved')} actionLabel="Approve" />;
    if (section === 'exams') return <div className="space-y-4"><ListSection title="Exams" description="Results stay hidden from students until the exam is published." action={primary('Add exam', () => openForm('exam'))} rows={workspace.exams} emptyText="No exams yet." columns={['title','batchTitle','examDate','maxMarks','status','resultsCount']} onEdit={(row) => openForm('exam', row)} onAction={(row) => void action(publishInstituteExam(instituteId, String(row.id)), 'Exam results published')} actionLabel="Publish results" /><ListSection title="Results" description="Server-computed marks, grades and publication state." rows={workspace.results} emptyText="No results recorded yet." columns={['examTitle','studentName','marks','maxMarks','grade','publishedAt']} /><ListSection title="Certificates" description="Issued certificates are readable by the owning student only." action={primary('Issue certificate', async () => { if (!instituteId) return; const enrollmentId = window.prompt('Enrollment id (from Enrolled students)'); if (!enrollmentId) return; const title = window.prompt('Certificate title', 'Course completion') || 'Course completion'; await action(issueInstituteCertificate(instituteId, { enrollmentId, title }), 'Certificate issued'); })} rows={workspace.certificates} emptyText="No certificates issued yet." columns={['studentName','title','certificateNo','issuedOn','status']} /></div>;
    if (section === 'certificates') return <ListSection title="Certificates" description="Issue and review certificates backed by confirmed enrollments and server records." action={primary('Issue certificate', async () => { if (!instituteId) return; const enrollmentId = window.prompt('Enrollment id (from Enrolled students)'); if (!enrollmentId) return; const title = window.prompt('Certificate title', 'Course completion') || 'Course completion'; await action(issueInstituteCertificate(instituteId, { enrollmentId, title }), 'Certificate issued'); })} rows={workspace.certificates} emptyText="No certificates issued yet." columns={['studentName','title','certificateNo','issuedOn','status']} />;
    if (section === 'announcements') return <ListSection title="Announcements" description="Announcements are limited to the chosen branch or batch audience." action={primary('New announcement', () => openForm('announcement'))} rows={workspace.announcements} emptyText="No announcements yet." columns={['title','audience','branchName','batchTitle','publishedAt']} />;
    if (section === 'staff') return <ListSection title="Staff & roles" description="Owner, Manager, Faculty, Accountant and Receptionist are scoped by membership and branch in the database." action={primary('Add staff', () => openForm('member'))} rows={workspace.members} emptyText="No staff records yet." columns={['fullName','role','branchId','email','status']} onAction={(row) => String(row.role) === 'institute_owner' ? undefined : void action(revokeInstituteMember(instituteId, String(row.id)), 'Access revoked')} actionLabel="Revoke" />;
    if (section === 'audit') return <ListSection title="Audit history" description="Append-only record of admissions, fees, transfers, leave and admin actions." rows={workspace.audit} emptyText="No audit events yet." columns={['action','entity','actorRole','createdAt']} />;
    if (section === 'admin') {
      if (workspace.role !== 'admin') return empty('Super admin only', 'Institute verification, suspension and module entitlements are restricted to platform admins.');
      return <div className="space-y-4">{[adminError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{adminError}</p>]}<ListSection title="Institute directory" description="All institutes with live branch and batch counts. Actions are enforced by database admin checks." rows={adminInstitutes} emptyText="No institutes registered yet." columns={['name','city','status','verificationStatus','branchCount','batchCount']} onAction={(row) => void action(adminInstituteVerification(String(row.id), { verificationStatus: 'verified', note: 'Reviewed from admin console' }), 'Institute verified')} actionLabel="Verify" /><ListSection title="Suspension" description="Suspending an institute keeps records and stops new public activity with an audit reason." rows={adminInstitutes} emptyText="No institutes to suspend." columns={['name','status','suspensionReason']} onAction={(row) => void action(adminInstituteStatus(String(row.id), { status: 'suspended', reason: window.prompt('Suspension reason') || 'Policy review' }), 'Institute suspended')} actionLabel="Suspend" /></div>;
    }
    if (section === 'attendance') return <div className="space-y-4"><div className={cardClass}><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-semibold">Attendance</h3><p className="text-sm text-slate-500">Mark a dated session against confirmed enrollments. The server records who marked it and prevents duplicate rows.</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><select className={inputClass} value={attendanceBatchId} onChange={(event) => setAttendanceBatchId(event.target.value)}><option value="">Choose batch</option>{workspace.batches.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select><input className={inputClass} type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /><input className={inputClass} placeholder="Topic (optional)" id="attendance-topic" /></div>{selectedBatch && <div className="mt-4 space-y-2">{batchEnrollments.length ? batchEnrollments.map((row) => <div key={row.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">{row.studentName || 'Student record'}</div><div className="text-xs text-slate-500">{row.studentPhone || 'Phone not available'}</div></div><select className={`${inputClass} sm:w-40`} value={attendanceStatus[String(row.studentId)] || 'present'} onChange={(event) => setAttendanceStatus({ ...attendanceStatus, [String(row.studentId)]: event.target.value })}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></div>) : <p className="py-4 text-sm text-slate-500">No confirmed enrollments for this batch.</p>}</div>}<div className="mt-4 flex justify-end">{primary('Save attendance', async () => { const topic = (document.getElementById('attendance-topic') as HTMLInputElement)?.value || ''; const result = await markInstituteAttendance(instituteId, { batchId: attendanceBatchId, sessionDate: attendanceDate, topic, records: batchEnrollments.map((row) => ({ enrollmentId: row.id, studentId: row.studentId, status: attendanceStatus[String(row.studentId)] || 'present' })) }); await action(result, 'Attendance saved'); })}</div></div></div>;
    return null;
  };

  return <div className="pg-owner-airbnb -mx-3 min-h-[720px] overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f7f7] sm:-mx-5 lg:-mx-8"><div className="flex min-h-[720px]"><aside className="hidden w-64 shrink-0 bg-[#222222] text-white lg:block"><div className="border-b border-white/10 p-5"><div className="text-sm font-black tracking-[0.24em] text-white">BOOKOURSPACE</div><div className="mt-1 text-xs text-white/60">Institute workspace</div></div><nav className="h-[calc(100%-78px)] overflow-y-auto p-3">{sections.map((group) => <div key={group} className="mb-5"><div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{group}</div>{nav.filter((item) => item.group === group).map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${section === item.id ? 'bg-[#ff385c] text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>)}<button type="button" onClick={onSwitchToMarketplace} className="mt-2 flex w-full items-center justify-between rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10">Marketplace<ChevronRight className="h-4 w-4" /></button></nav></aside><div className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff385c] text-white"><Building2 className="h-5 w-5" /></div><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{workspace.institute?.name || 'Institute workspace'}</div><div className="text-xs text-slate-500">{workspace.role || 'Not configured'} · {workspace.institute?.verificationStatus || 'Not configured'}</div></div></div><div className="flex items-center gap-2"><select className="max-w-[190px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold" value={selectedInstituteId} onChange={(event) => { setSelectedInstituteId(event.target.value); void load(event.target.value); }}><option value="">All institutes</option>{workspace.institutes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:border-[#ff385c]" aria-label="Refresh institute workspace"><RefreshCw className="h-4 w-4" /></button></div><div className="lg:hidden"><select className={inputClass} value={section} onChange={(event) => setSection(event.target.value as Section)}>{nav.map((item) => <option key={item.id} value={item.id}>{item.group} · {item.label}</option>)}</select></div></header><main className="p-4 sm:p-6"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff385c]">BookOurSpace Institute</div><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{nav.find((item) => item.id === section)?.label}</h1><p className="mt-1 text-sm text-slate-500">Real records only · authorized Supabase data</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setSection('reports')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:border-[#ff385c]"><Download className="h-4 w-4" />Reports</button>{workspace.institute && section !== 'profile' && primary('Edit profile', () => setSection('profile'))}</div></div>{notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}{loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div> : error ? empty(databaseUnavailable ? 'Institute workspace needs its local database' : 'Workspace not available', error, <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Retry connection</button>) : content()}</main></div></div>{formKind && <FormModal kind={formKind} form={form} setField={setField} onClose={() => setFormKind(null)} onSubmit={() => void submitForm()} workspace={workspace} />}</div>;
}

interface ListSectionProps { title: string; description: string; action?: React.ReactNode; rows: Record<string, any>[]; columns: string[]; emptyText: string; onEdit?: (row: Record<string, any>) => void; onAction?: (row: Record<string, any>) => void; actionLabel?: string }

// Search + pagination wrapper: every list in the workspace gets the same
// accessible filtering and page controls without duplicating table markup.
function ListSection(props: ListSectionProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => props.columns.some((column) => String(row[column] ?? '').toLowerCase().includes(needle))
      || JSON.stringify(row).toLowerCase().includes(needle));
  }, [rows, props.columns, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <label className="text-xs font-semibold text-slate-500">Search {props.title}
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Filter records" aria-label={`Search ${props.title}`} className={`${inputClass} mt-1 sm:w-64`} />
      </label>
      <span className="text-xs text-slate-500">{filtered.length} record{filtered.length === 1 ? '' : 's'}{pageCount > 1 ? ` · page ${safePage + 1} of ${pageCount}` : ''}</span>
    </div>
    <ListSectionBase {...props} rows={visible} emptyText={filtered.length ? 'No records on this page.' : props.emptyText} />
    {pageCount > 1 && <div className="flex items-center justify-end gap-2"><button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage >= pageCount - 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-40">Next</button></div>}
  </div>;
}

function ListSectionBase({ title, description, action, rows, columns, emptyText, onEdit, onAction, actionLabel }: ListSectionProps) {
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="text-sm text-slate-500">{description}</p></div>{action}</div>{rows.length ? <>
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3">{listColumnLabel(column)}</th>)}{(onEdit || onAction) && <th className="px-4 py-3">Actions</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id || index)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{columns.map((column) => <td key={column} className="max-w-[240px] break-words px-4 py-3 align-top text-slate-700">{listValue(column, row)}</td>)}{(onEdit || onAction) && <td className="whitespace-nowrap px-4 py-3 align-top"><div className="flex gap-2">{onEdit && <button type="button" onClick={() => onEdit(row)} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:border-[#ff385c]">Edit</button>}{onAction && <button type="button" onClick={() => onAction(row)} className="min-h-10 rounded-lg bg-[#ff385c] px-3 py-2 text-xs font-semibold text-white">{actionLabel || 'Action'}</button>}</div></td>}</tr>)}</tbody></table></div>
    <div className="space-y-3 sm:hidden">{rows.map((row, index) => <article key={String(row.id || index)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><dl className="grid gap-3">{columns.map((column) => <div key={column} className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{listColumnLabel(column)}</dt><dd className="mt-1 break-words text-sm text-slate-800">{listValue(column, row)}</dd></div>)}</dl>{(onEdit || onAction) && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{onEdit && <button type="button" onClick={() => onEdit(row)} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:border-[#ff385c]">Edit</button>}{onAction && <button type="button" onClick={() => onAction(row)} className="min-h-10 rounded-lg bg-[#ff385c] px-3 py-2 text-xs font-semibold text-white">{actionLabel || 'Action'}</button>}</div>}</article>)}</div>
  </> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{emptyText}</div>}</div>;
}

function FormModal({ kind, form, setField, onClose, onSubmit, workspace }: { kind: Exclude<FormKind, null>; form: Record<string, any>; setField: (key: string, value: unknown) => void; onClose: () => void; onSubmit: () => void; workspace: InstituteWorkspaceData }) {
  const title = kind === 'branch' ? 'Branch' : kind === 'classroom' ? 'Classroom' : kind === 'course' ? 'Course listing' : kind === 'batch' ? 'Batch' : kind === 'faculty' ? 'Faculty' : kind === 'admission' ? 'Admission' : kind === 'holiday' ? 'Holiday' : kind === 'exam' ? 'Exam' : kind === 'announcement' ? 'Announcement' : 'Staff member';
  const field = (key: string, label: string, type = 'text', placeholder = '') => <label className="text-sm font-medium text-slate-700">{label}<input className={`${inputClass} mt-1`} type={type} value={form[key] ?? ''} placeholder={placeholder} onChange={(event) => setField(key, event.target.value)} /></label>;
  const select = (key: string, label: string, options: Array<{ id: string; label: string }>, emptyLabel: string) => <label className="text-sm font-medium text-slate-700">{label}<select className={`${inputClass} mt-1`} value={form[key] || ''} onChange={(event) => setField(key, event.target.value)}><option value="">{emptyLabel}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"><div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-slate-500">Saved changes are authorized server-side.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{kind === 'branch' && <>{field('name','Name')}{field('city','City')}{field('address','Address')}{field('timezone','Timezone')}</>}{kind === 'classroom' && <>{field('name','Room name')}{select('branchId','Branch',workspace.branches.map((row) => ({ id: String(row.id), label: String(row.name) })), 'Choose branch')}{field('capacity','Capacity','number')}{field('facilities','Facilities (comma separated)')}</>}{kind === 'faculty' && <>{field('name','Name')}{field('email','Email','email')}{field('phone','Phone')}{field('qualification','Qualification')}{field('experience','Experience')}{field('photoUrl','Photo URL')}{field('subjects','Subjects (comma separated)')}{select('branchId','Branch',workspace.branches.map((row) => ({ id: String(row.id), label: String(row.name) })), 'All branches')}</>}{kind === 'course' && <>{field('title','Course title')}{field('subcategory','Category')}{field('price','Fee','number')}{field('priceUnit','Fee unit')}{field('duration','Duration')}{field('syllabus','Syllabus summary')}{field('modes','Modes (online, offline, hybrid)')}{field('description','Description')}</>}{kind === 'batch' && <>{field('title','Batch title')}{select('listingId','Course',workspace.courses.map((row) => ({ id: String(row.id), label: String(row.title) })), 'Choose course')}{select('branchId','Branch',workspace.branches.map((row) => ({ id: String(row.id), label: String(row.name) })), 'All branches')}{select('classroomId','Classroom',workspace.classrooms.map((row) => ({ id: String(row.id), label: String(row.name) })), 'Unassigned')}{select('facultyId','Faculty',workspace.faculty.map((row) => ({ id: String(row.id), label: String(row.name) })), 'Unassigned')}{field('daysOfWeek','Days of week (Mon, Wed)')}{field('startTime','Start time','time')}{field('endTime','End time','time')}{field('startDate','Start date','date')}{field('endDate','End date','date')}{field('capacity','Seat capacity','number')}{field('waitlistCapacity','Waitlist capacity','number')}{field('onlineFee','Online fee','number')}{field('offlineFee','Offline fee','number')}</>}{kind === 'admission' && <>{field('name','Student / applicant name')}{field('phone','Phone')}{field('email','Email','email')}{field('studentProfileId','Student profile id (existing account)')}{field('source','Source')}{field('followUpAt','Follow-up at','datetime-local')}{field('notes','Notes')}</>}{kind === 'holiday' && <>{select('batchId','Batch',workspace.batches.map((row) => ({ id: String(row.id), label: String(row.title) })), 'Choose batch')}{field('holidayDate','Holiday date','date')}{field('reason','Reason')}</>}{kind === 'exam' && <>{field('title','Exam title')}{select('batchId','Batch',workspace.batches.map((row) => ({ id: String(row.id), label: String(row.title) })), 'Choose batch')}{field('examDate','Exam date','date')}{field('maxMarks','Maximum marks','number')}{field('status','Status (scheduled, completed)')}</>}{kind === 'announcement' && <>{field('title','Title')}{field('message','Message')}{select('branchId','Branch',workspace.branches.map((row) => ({ id: String(row.id), label: String(row.name) })), 'All branches')}{select('batchId','Batch',workspace.batches.map((row) => ({ id: String(row.id), label: String(row.title) })), 'All batches')}{field('audience','Audience (students, faculty, staff, all)')}</>}{kind === 'member' && <>{field('email','Account email (existing BookOurSpace account)','email')}{field('role','Role (manager, faculty, accountant, receptionist)')}{select('branchId','Branch',workspace.branches.map((row) => ({ id: String(row.id), label: String(row.name) })), 'All branches')}</>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button type="button" onClick={onSubmit} className="rounded-xl bg-[#ff385c] px-4 py-2.5 text-sm font-semibold text-white">Save {title}</button></div></div></div>;
}
