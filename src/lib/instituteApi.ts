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
