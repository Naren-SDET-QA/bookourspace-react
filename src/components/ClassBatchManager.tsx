import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, Check, Clock, Loader2, Plus, RefreshCw, Users } from 'lucide-react';
import {
  createClassBatch,
  fetchProviderClassBatches,
  fetchProviderCourses,
  updateClassBatchStatus,
  type ClassBatch,
  type ProviderCourseOption,
} from '../lib/classesApi';

const formatINR = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-slate-100 text-slate-700',
  rejected: 'bg-rose-100 text-rose-700',
  archived: 'bg-slate-100 text-slate-600',
};

const ERROR_TEXT: Record<string, string> = {
  UNAUTHORIZED_SESSION: 'Sign in with Google to manage batches.',
  FORBIDDEN_ROLE: 'Only a provider account can create batches.',
  POSTGRES_IDENTITY_UNMAPPED: 'This session has no verified Google identity. Sign in again.',
  COURSE_LISTING_REQUIRED: 'That listing is not a course. Classes batches need a course listing.',
  LISTING_NOT_FOUND: 'That course was not found for this account.',
  LISTING_NOT_OPEN_FOR_BATCHES: 'This course is archived; batches cannot be added.',
  INVALID_BATCH_TIMING: 'End time must be after the start time.',
  INVALID_BATCH_CAPACITY: 'Capacity must be a whole number of at least 1.',
  INVALID_WAITLIST_CAPACITY: 'Waitlist capacity must be zero or more.',
  INVALID_BATCH_FEE: 'Fees must be zero or a positive amount.',
  INVALID_DATE_RANGE: 'End date cannot be before the start date.',
  NETWORK_ERROR: 'The server could not be reached. Nothing was saved.',
};

interface BatchFormState {
  listingId: string;
  title: string;
  deliveryMode: string;
  feeUnit: string;
  onlineFee: string;
  offlineFee: string;
  capacity: string;
  waitlistCapacity: string;
  startDate: string;
  endDate: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  durationLabel: string;
  area: string;
  facultyName: string;
  facultyExperience: string;
  holidayDates: string;
  examDates: string;
}

const EMPTY_FORM: BatchFormState = {
  listingId: '',
  title: 'Weekend Algebra Batch',
  deliveryMode: 'offline',
  feeUnit: 'month',
  onlineFee: '4000',
  offlineFee: '5000',
  capacity: '4',
  waitlistCapacity: '1',
  startDate: '',
  endDate: '',
  daysOfWeek: 'Sat-Sun',
  startTime: '10:00',
  endTime: '12:00',
  durationLabel: '8 weeks',
  area: 'Test Area',
  facultyName: 'Test Faculty',
  facultyExperience: '10 years experience',
  holidayDates: '',
  examDates: '',
};

const inputClass =
  'w-full rounded-lg border border-[#ece8fb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1e1b4b] outline-none focus:border-[#7c3aed]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-[#94a3b8]">{label}</span>
      {children}
    </label>
  );
}

/**
 * Trainer console for the Classes calendar. A batch created here is always
 * `pending_approval`: publication happens only in the Admin review surface.
 */
export function ClassBatchManager() {
  const [courses, setCourses] = useState<ProviderCourseOption[]>([]);
  const [batches, setBatches] = useState<Array<ClassBatch & { courseTitle?: string }>>([]);
  const [form, setForm] = useState<BatchFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    const [courseResult, batchResult] = await Promise.all([
      fetchProviderCourses(),
      fetchProviderClassBatches(),
    ]);
    if (courseResult.ok && courseResult.data) {
      const courseListings = courseResult.data.courses;
      setCourses(courseListings);
      setForm((current) => ({
        ...current,
        listingId: current.listingId || courseListings[0]?.id || '',
      }));
    } else {
      setError(ERROR_TEXT[courseResult.error || ''] || 'Your courses could not be loaded.');
    }
    if (batchResult.ok && batchResult.data) {
      setBatches(batchResult.data.batches);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (key: keyof BatchFormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.listingId) {
      setError('Create or select a course listing first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const result = await createClassBatch(form.listingId, {
      title: form.title,
      deliveryMode: form.deliveryMode,
      feeUnit: form.feeUnit,
      onlineFee: Number(form.onlineFee),
      offlineFee: Number(form.offlineFee),
      capacity: Number(form.capacity),
      waitlistCapacity: Number(form.waitlistCapacity),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
      timezone: 'Asia/Kolkata',
      durationLabel: form.durationLabel,
      area: form.area,
      facultyName: form.facultyName,
      facultyExperience: form.facultyExperience,
      holidays: form.holidayDates
        .split(',')
        .map((date) => date.trim())
        .filter(Boolean)
        .map((date) => ({ date })),
      exams: form.examDates
        .split(',')
        .map((date) => date.trim())
        .filter(Boolean)
        .map((date) => ({ date })),
      requestId: `${form.listingId}-${Date.now()}`,
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(ERROR_TEXT[result.error || ''] || `Batch was not created (${result.error || 'unknown error'}).`);
      return;
    }
    setNotice('Batch submitted. It becomes publicly enrollable only after Admin approval.');
    await load();
  };

  const changeStatus = async (batchId: string, status: 'paused' | 'archived' | 'pending_approval') => {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await updateClassBatchStatus(batchId, status);
    setBusy(false);
    if (!result.ok) {
      setError(ERROR_TEXT[result.error || ''] || `Status change failed (${result.error}).`);
      return;
    }
    setNotice(`Batch ${status === 'paused' ? 'paused' : status === 'archived' ? 'archived' : 're-submitted for review'}.`);
    await load();
  };

  const activeCourses = useMemo(() => courses.filter((course) => course.status !== 'archived'), [courses]);

  return (
    <section
      data-testid="class-batch-manager"
      className="rounded-2xl border border-[#ece8fb] bg-white p-3.5 shadow-sm"
      aria-labelledby="class-batch-manager-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="class-batch-manager-title" className="text-[14px] font-black text-[#1e1b4b]">Course batches & calendar</h2>
          <p className="text-[10.5px] text-[#64748b]">
            Publish timings, fees, seats and faculty. Admin approval is required before students can enroll.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ece8fb] px-2.5 text-[11px] font-bold text-[#4c1d95]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[#4c1d95]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your course batches…
        </p>
      ) : (
        <>
          {activeCourses.length === 0 ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
              No course listing is available for this account. Create a Classes & Training course listing first; then its batches can be scheduled here.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="col-span-2">
                <Field label="Course">
                  <select aria-label="Course" value={form.listingId} onChange={update('listingId')} className={inputClass}>
                    {activeCourses.map((course) => (
                      <option key={course.id} value={course.id}>{course.title}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Batch title">
                  <input aria-label="Batch title" value={form.title} onChange={update('title')} className={inputClass} required />
                </Field>
              </div>
              <Field label="Delivery mode">
                <select aria-label="Delivery mode" value={form.deliveryMode} onChange={update('deliveryMode')} className={inputClass}>
                  <option value="offline">Offline</option>
                  <option value="online">Online</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="recorded">Recorded</option>
                </select>
              </Field>
              <Field label="Fee unit">
                <select aria-label="Fee unit" value={form.feeUnit} onChange={update('feeUnit')} className={inputClass}>
                  <option value="hour">Per hour</option>
                  <option value="session">Per session</option>
                  <option value="month">Per month</option>
                  <option value="subject">Per subject</option>
                  <option value="batch">Per batch</option>
                  <option value="course">Per course</option>
                  <option value="installment">Installment</option>
                </select>
              </Field>
              <Field label="Offline fee">
                <input aria-label="Offline fee" type="number" min="0" step="1" value={form.offlineFee} onChange={update('offlineFee')} className={inputClass} />
              </Field>
              <Field label="Online fee">
                <input aria-label="Online fee" type="number" min="0" step="1" value={form.onlineFee} onChange={update('onlineFee')} className={inputClass} />
              </Field>
              <Field label="Capacity">
                <input aria-label="Capacity" type="number" min="1" step="1" value={form.capacity} onChange={update('capacity')} className={inputClass} />
              </Field>
              <Field label="Waitlist">
                <input aria-label="Waitlist capacity" type="number" min="0" step="1" value={form.waitlistCapacity} onChange={update('waitlistCapacity')} className={inputClass} />
              </Field>
              <Field label="Days">
                <input aria-label="Days of week" value={form.daysOfWeek} onChange={update('daysOfWeek')} className={inputClass} />
              </Field>
              <Field label="Start time">
                <input aria-label="Start time" type="time" value={form.startTime} onChange={update('startTime')} className={inputClass} />
              </Field>
              <Field label="End time">
                <input aria-label="End time" type="time" value={form.endTime} onChange={update('endTime')} className={inputClass} />
              </Field>
              <Field label="Start date">
                <input aria-label="Start date" type="date" value={form.startDate} onChange={update('startDate')} className={inputClass} />
              </Field>
              <Field label="End date">
                <input aria-label="End date" type="date" value={form.endDate} onChange={update('endDate')} className={inputClass} />
              </Field>
              <Field label="Duration">
                <input aria-label="Duration" value={form.durationLabel} onChange={update('durationLabel')} className={inputClass} placeholder="8 weeks" />
              </Field>
              <Field label="Holiday dates">
                <input aria-label="Holiday dates" value={form.holidayDates} onChange={update('holidayDates')} className={inputClass} placeholder="YYYY-MM-DD, YYYY-MM-DD" />
              </Field>
              <Field label="Exam dates">
                <input aria-label="Exam dates" value={form.examDates} onChange={update('examDates')} className={inputClass} placeholder="YYYY-MM-DD, YYYY-MM-DD" />
              </Field>
              <Field label="Area">
                <input aria-label="Area" value={form.area} onChange={update('area')} className={inputClass} />
              </Field>
              <div className="col-span-2">
                <Field label="Faculty name">
                  <input aria-label="Faculty name" value={form.facultyName} onChange={update('facultyName')} className={inputClass} />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Faculty experience">
                  <input aria-label="Faculty experience" value={form.facultyExperience} onChange={update('facultyExperience')} className={inputClass} />
                </Field>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#7c3aed] text-[12px] font-bold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Submit batch for admin approval
                </button>
              </div>
            </form>
          )}

          {notice && (
            <p data-testid="batch-notice" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-2 text-[11.5px] font-semibold text-emerald-800" role="status">
              <Check className="h-3.5 w-3.5" /> {notice}
            </p>
          )}
          {error && (
            <p data-testid="batch-error" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-2 text-[11.5px] font-semibold text-rose-700" role="alert">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </p>
          )}

          <div className="mt-3">
            <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Your batches ({batches.length})</h3>
            {batches.length === 0 ? (
              <p className="mt-1 text-[11.5px] text-[#64748b]">No batch scheduled yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {batches.map((batch) => (
                  <li key={batch.id} data-testid="batch-row" className="rounded-xl border border-[#ece8fb] px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-extrabold text-[#1e1b4b]">{batch.title}</p>
                        <p className="truncate text-[10.5px] text-[#64748b]">
                          {batch.courseTitle || 'Course'} · {batch.deliveryMode} · {batch.feeUnit}
                        </p>
                      </div>
                      <span
                        data-testid="batch-status"
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold ${STATUS_STYLE[batch.status] || 'bg-slate-100 text-slate-700'}`}
                      >
                        {batch.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] font-semibold text-[#475569]">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {batch.startTime}–{batch.endTime} {batch.daysOfWeek}</span>
                      {batch.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {batch.startDate}{batch.endDate ? ` → ${batch.endDate}` : ''}</span>}
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {batch.seatsLeft}/{batch.capacity} left · {batch.waitlistLeft} waitlist</span>
                      <span>{formatINR(batch.offlineFee)} offline · {formatINR(batch.onlineFee)} online</span>
                      <span>{batch.holidays.length} holidays · {batch.exams.length} exams</span>
                    </div>
                    {['pending_approval', 'active', 'paused'].includes(batch.status) && (
                      <button
                        type="button"
                        onClick={() => void changeStatus(batch.id, batch.status === 'paused' ? 'pending_approval' : 'paused')}
                        disabled={busy}
                        className="mt-1.5 h-7 rounded-lg border border-[#ece8fb] px-2 text-[10.5px] font-bold text-[#4c1d95] disabled:opacity-50"
                      >
                        {batch.status === 'paused' ? 'Resubmit for review' : 'Pause batch'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
