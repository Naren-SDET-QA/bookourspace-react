import { buildAuthHeaders } from './supabaseClient';

/**
 * Browser client for the Classes & Training batch / enrollment API.
 *
 * These calls never send a price, a seat number or a paid flag: the server
 * derives the fee from the batch row and decides the seat under a row lock.
 */

export interface ProviderCourseOption {
  id: string;
  title: string;
  status: string;
}

export interface ClassBatch {
  id: string;
  listingId: string;
  title: string;
  deliveryMode: 'online' | 'offline' | 'hybrid' | 'recorded' | string;
  feeUnit: string;
  onlineFee: number;
  offlineFee: number;
  capacity: number;
  waitlistCapacity: number;
  confirmedCount: number;
  waitlistCount: number;
  seatsLeft: number;
  waitlistLeft: number;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  timezone: string;
  durationLabel: string;
  area: string;
  facultyName: string;
  facultyExperience: string;
  holidays: unknown[];
  exams: unknown[];
  status: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderClassBatch extends ClassBatch {
  courseTitle?: string;
}

export interface ClassEnrollment {
  id: string;
  batchId: string;
  listingId: string;
  studentId: string;
  deliveryMode: string;
  feeUnit: string;
  feeAmount: number;
  paymentMode: string;
  paymentStatus: string;
  paymentReference: string | null;
  status: 'confirmed' | 'waitlisted' | 'cancelled' | string;
  seatSequence: number | null;
  waitlistPosition: number | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  refundPercent: number;
  refundAmount: number;
  refundPolicy: string | null;
  createdAt: string;
  courseTitle?: string;
  batchTitle?: string;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  studentName?: string;
  studentPhone?: string;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  message?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: buildAuthHeaders(init.headers as Record<string, string> | undefined),
    });
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: payload?.error || `HTTP_${response.status}`,
        message: payload?.message,
      };
    }
    return { ok: true, status: response.status, data: payload as T };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'NETWORK_ERROR',
      message: 'The server could not be reached. Nothing was submitted.',
    };
  }
}

export function fetchClassBatches(listingId: string) {
  return request<{ batches: ClassBatch[]; count: number }>(
    `/api/classes/listings/${encodeURIComponent(listingId)}/batches`,
  );
}

export function enrollInClass(params: {
  batchId: string;
  deliveryMode: 'online' | 'offline';
  paymentMode: 'online' | 'pay_at_institute' | 'free';
  requestId: string;
}) {
  return request<{
    enrollment: ClassEnrollment;
    availability: { seats_left?: number; waitlist_left?: number } | null;
    idempotent: boolean;
    paymentNotice?: string | null;
  }>('/api/classes/enrollments', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function fetchMyClassEnrollments() {
  return request<{ enrollments: ClassEnrollment[]; count: number }>('/api/classes/enrollments', {
    method: 'GET',
  });
}

export function cancelClassEnrollment(enrollmentId: string, reason: string) {
  return request<{
    enrollment: ClassEnrollment;
    alreadyCancelled: boolean;
    hoursUntilStart: number | null;
    refundPercent: number;
    refundAmount: number;
    refundPolicy: string | null;
    paymentSettled: boolean;
    note: string | null;
  }>(`/api/classes/enrollments/${encodeURIComponent(enrollmentId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function fetchProviderClassBatches(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ batches: ProviderClassBatch[]; count: number }>(
    `/api/provider/classes/batches${query}`,
    { method: 'GET' },
  );
}

export function fetchAdminClassBatches(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ batches: ProviderClassBatch[]; count: number }>(
    `/api/admin/classes/batches${query}`,
    { method: 'GET' },
  );
}

/** Trainer-owned course listings that can receive a batch calendar. */
export async function fetchProviderCourses(): Promise<ApiResult<{ courses: ProviderCourseOption[] }>> {
  const result = await request<{ listings?: Array<Record<string, unknown>> }>('/api/provider/listings');
  if (!result.ok || !result.data) {
    return { ok: false, status: result.status, data: null, error: result.error, message: result.message };
  }
  const courses = (result.data.listings || [])
    .filter((row) => {
      const entityType = String(row.entityType || row.entity_type || '').toLowerCase();
      const categoryId = String(row.categoryId || row.category_id || '').toLowerCase();
      return entityType === 'course' || categoryId === 'classes' || categoryId.startsWith('class-');
    })
    .map((row) => ({
      id: String(row.id || ''),
      title: String(row.title || 'Untitled course'),
      status: String(row.status || ''),
    }))
    .filter((course) => course.id);
  return { ok: true, status: result.status, data: { courses } };
}

export function createClassBatch(listingId: string, body: Record<string, unknown>) {
  return request<{ batch: ClassBatch; reviewState: string; message?: string }>(
    `/api/provider/classes/listings/${encodeURIComponent(listingId)}/batches`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function updateClassBatchStatus(batchId: string, status: 'paused' | 'archived' | 'pending_approval') {
  return request<{ batch: ClassBatch }>(`/api/provider/classes/batches/${encodeURIComponent(batchId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchProviderClassEnrollments() {
  return request<{ enrollments: ClassEnrollment[]; count: number }>('/api/provider/classes/enrollments', {
    method: 'GET',
  });
}

export function reviewClassBatch(batchId: string, decision: 'active' | 'rejected', reason: string) {
  return request<{ batch: ClassBatch; idempotent: boolean }>(
    `/api/admin/classes/batches/${encodeURIComponent(batchId)}/review`,
    { method: 'PATCH', body: JSON.stringify({ decision, reason }) },
  );
}

export function newEnrollmentRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Non-cryptographic fallback for very old webviews; the server validates the
  // UUID shape and uses it only for idempotency.
  const hex = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
  return hex;
}
