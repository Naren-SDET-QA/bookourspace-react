import { buildAuthHeaders } from './supabaseClient';

export interface InstituteApiResult<T> { ok: boolean; status: number; data: T | null; error?: string; }

async function request<T>(path: string, init: RequestInit = {}): Promise<InstituteApiResult<T>> {
  try {
    const response = await fetch(path, { ...init, headers: buildAuthHeaders(init.headers as Record<string, string> | undefined) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) return { ok: false, status: response.status, data: null, error: payload?.error || `HTTP_${response.status}` };
    return { ok: true, status: response.status, data: payload as T };
  } catch { return { ok: false, status: 0, data: null, error: 'NETWORK_ERROR' }; }
}

export interface InstituteWorkspaceData {
  institute: Record<string, any> | null;
  institutes: Record<string, any>[];
  role: string | null;
  permissions: string[];
  branches: Record<string, any>[];
  members: Record<string, any>[];
  faculty: Record<string, any>[];
  courses: Record<string, any>[];
  batches: Record<string, any>[];
  enrollments: Record<string, any>[];
  admissions: Record<string, any>[];
  attendance: Record<string, any>[];
  fees: Record<string, any>[];
  enquiries: Record<string, any>[];
  reviews: Record<string, any>[];
  notifications: Record<string, any>[];
  classrooms: Record<string, any>[];
  holidays: Record<string, any>[];
  leaveRequests: Record<string, any>[];
  transfers: Record<string, any>[];
  exams: Record<string, any>[];
  results: Record<string, any>[];
  assignments: Record<string, any>[];
  submissions: Record<string, any>[];
  certificates: Record<string, any>[];
  announcements: Record<string, any>[];
  audit: Record<string, any>[];
  entitlements: Record<string, any>[];
  progress: Record<string, any>[];
  analytics: Record<string, number | null>;
}

export function fetchInstituteMemberships() { return request<{ memberships: Record<string, any>[] }>('/api/institute/memberships'); }
export function fetchInstituteWorkspace(instituteId?: string) { return request<{ workspace: InstituteWorkspaceData }>(`/api/institute/workspace${instituteId ? `?instituteId=${encodeURIComponent(instituteId)}` : ''}`); }
export function createInstitute(body: Record<string, unknown>) { return request<{ institute: Record<string, any> }>('/api/institute', { method: 'POST', body: JSON.stringify(body) }); }
export function updateInstitute(id: string, body: Record<string, unknown>) { return request<{ institute: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); }
export function saveInstituteBranch(id: string, branchId: string | undefined, body: Record<string, unknown>) { return request<{ branch: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/branches${branchId ? `/${encodeURIComponent(branchId)}` : ''}`, { method: branchId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function saveInstituteFaculty(id: string, facultyId: string | undefined, body: Record<string, unknown>) { return request<{ faculty: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/faculty${facultyId ? `/${encodeURIComponent(facultyId)}` : ''}`, { method: facultyId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function saveInstituteCourse(id: string, courseId: string | undefined, body: Record<string, unknown>) { return request<{ course: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/courses${courseId ? `/${encodeURIComponent(courseId)}` : ''}`, { method: courseId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function publishInstituteCourse(id: string, courseId: string) { return request<{ course: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/courses/${encodeURIComponent(courseId)}/publish`, { method: 'POST', body: '{}' }); }
export function saveInstituteBatch(id: string, batchId: string | undefined, body: Record<string, unknown>) { return request<{ batch: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/batches${batchId ? `/${encodeURIComponent(batchId)}` : ''}`, { method: batchId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function updateInstituteBatchStatus(id: string, batchId: string, status: string) { return request<{ batch: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/batches/${encodeURIComponent(batchId)}/status`, { method: 'POST', body: JSON.stringify({ status }) }); }
export function saveInstituteAdmission(id: string, admissionId: string | undefined, body: Record<string, unknown>) { return request<{ admission: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/admissions${admissionId ? `/${encodeURIComponent(admissionId)}` : ''}`, { method: admissionId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function updateInstituteEnquiry(id: string, enquiryId: string, status: string) { return request<{ enquiry: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/enquiries/${encodeURIComponent(enquiryId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
export function markInstituteAttendance(id: string, body: Record<string, unknown>) { return request<{ session: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/attendance`, { method: 'POST', body: JSON.stringify(body) }); }
export function recordInstituteFeePayment(ledgerId: string, paymentMethod: string, paymentReference: string) { return request<{ fee: Record<string, any> }>(`/api/institute/fees/${encodeURIComponent(ledgerId)}/pay`, { method: 'POST', body: JSON.stringify({ paymentMethod, paymentReference }) }); }
export function createInstituteFee(id: string, body: Record<string, unknown>) { return request<{ fee: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/fees`, { method: 'POST', body: JSON.stringify(body) }); }

export function saveInstituteClassroom(id: string, classroomId: string | undefined, body: Record<string, unknown>) { return request<{ classroom: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/classrooms${classroomId ? `/${encodeURIComponent(classroomId)}` : ''}`, { method: classroomId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function saveInstituteHoliday(id: string, body: Record<string, unknown>) { return request<{ holiday: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/holidays`, { method: 'POST', body: JSON.stringify(body) }); }
export function deleteInstituteHoliday(id: string, holidayId: string) { return request<{ deleted: boolean }>(`/api/institute/${encodeURIComponent(id)}/holidays/${encodeURIComponent(holidayId)}`, { method: 'DELETE' }); }
export function enrollInstituteApplicant(id: string, admissionId: string, body: Record<string, unknown>) { return request<{ enrollment: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/admissions/${encodeURIComponent(admissionId)}/enroll`, { method: 'POST', body: JSON.stringify(body) }); }
export function transferInstituteStudent(id: string, body: Record<string, unknown>) { return request<{ transfer: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/transfers`, { method: 'POST', body: JSON.stringify(body) }); }
export function reviewInstituteLeave(id: string, leaveId: string, decision: string, note = '') { return request<{ leave: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/leaves/${encodeURIComponent(leaveId)}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) }); }
export function saveInstituteExam(id: string, examId: string | undefined, body: Record<string, unknown>) { return request<{ exam: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/exams${examId ? `/${encodeURIComponent(examId)}` : ''}`, { method: examId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function recordInstituteExamResults(id: string, examId: string, results: Record<string, unknown>[]) { return request<{ saved: number }>(`/api/institute/${encodeURIComponent(id)}/exams/${encodeURIComponent(examId)}/results`, { method: 'POST', body: JSON.stringify({ results }) }); }
export function publishInstituteExam(id: string, examId: string) { return request<{ exam: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/exams/${encodeURIComponent(examId)}/publish`, { method: 'POST', body: '{}' }); }
export function saveInstituteAssignment(id: string, assignmentId: string | undefined, body: Record<string, unknown>) { return request<{ assignment: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/assignments${assignmentId ? `/${encodeURIComponent(assignmentId)}` : ''}`, { method: assignmentId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); }
export function gradeInstituteSubmission(id: string, submissionId: string, body: Record<string, unknown>) { return request<{ submission: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/submissions/${encodeURIComponent(submissionId)}/grade`, { method: 'POST', body: JSON.stringify(body) }); }
export function issueInstituteCertificate(id: string, body: Record<string, unknown>) { return request<{ certificate: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/certificates`, { method: 'POST', body: JSON.stringify(body) }); }
export function refundInstituteFee(ledgerId: string, body: Record<string, unknown>) { return request<{ fee: Record<string, any> }>(`/api/institute/fees/${encodeURIComponent(ledgerId)}/refund`, { method: 'POST', body: JSON.stringify(body) }); }
export function saveInstituteAnnouncement(id: string, body: Record<string, unknown>) { return request<{ announcement: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/announcements`, { method: 'POST', body: JSON.stringify(body) }); }
export function saveInstituteMember(id: string, body: Record<string, unknown>) { return request<{ member: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/members`, { method: 'POST', body: JSON.stringify(body) }); }
export function revokeInstituteMember(id: string, memberId: string) { return request<{ member: Record<string, any> }>(`/api/institute/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }); }
export function fetchInstituteAdminDirectory() { return request<{ institutes: Record<string, any>[] }>('/api/institute/admin/directory'); }
export function adminInstituteVerification(id: string, body: Record<string, unknown>) { return request<{ institute: Record<string, any> }>(`/api/institute/admin/${encodeURIComponent(id)}/verification`, { method: 'POST', body: JSON.stringify(body) }); }
export function adminInstituteStatus(id: string, body: Record<string, unknown>) { return request<{ institute: Record<string, any> }>(`/api/institute/admin/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(body) }); }
export function adminInstituteEntitlement(id: string, body: Record<string, unknown>) { return request<{ entitlement: Record<string, any> }>(`/api/institute/admin/${encodeURIComponent(id)}/entitlement`, { method: 'POST', body: JSON.stringify(body) }); }
export function fetchInstituteStudentOverview() { return request<{ enrollments: Record<string, any>[]; progress: Record<string, any>[]; leaves: Record<string, any>[]; results: Record<string, any>[]; certificates: Record<string, any>[]; announcements: Record<string, any>[]; fees: Record<string, any>[] }>('/api/institute/student/overview'); }
