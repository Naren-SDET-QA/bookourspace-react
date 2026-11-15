import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  GraduationCap,
  Loader2,
  MapPin,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import {
  cancelClassEnrollment,
  enrollInClass,
  fetchClassBatches,
  fetchMyClassEnrollments,
  newEnrollmentRequestId,
  type ClassBatch,
  type ClassEnrollment,
} from '../lib/classesApi';

const formatINR = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const unitSuffix = (unit: string) => (unit && unit !== 'course' ? ` / ${unit}` : '');

function clockLabel(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return value || '';
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${match[2]} ${suffix}`;
}

function batchWindow(batch: ClassBatch): string {
  const days = batch.daysOfWeek || 'Days not provided';
  return `${days} · ${clockLabel(batch.startTime)} – ${clockLabel(batch.endTime)}`;
}

function paymentLabel(status: string): string {
  switch (status) {
    case 'obligation_recorded':
      return 'Pay at institute · obligation recorded';
    case 'not_required':
      return 'Free batch · no payment due';
    case 'pending_verification':
      return 'Payment pending server verification';
    case 'verified':
      return 'Payment verified';
    default:
      return status;
  }
}

function deliveryModesFor(batch: ClassBatch): Array<'online' | 'offline'> {
  if (batch.deliveryMode === 'hybrid') return ['offline', 'online'];
  if (batch.deliveryMode === 'online' || batch.deliveryMode === 'recorded') return ['online'];
  return ['offline'];
}

function feeFor(batch: ClassBatch, mode: 'online' | 'offline'): number {
  return mode === 'online' ? batch.onlineFee : batch.offlineFee;
}

interface ClassEnrollmentModalProps {
  courseId: string;
  courseTitle: string;
  onClose: () => void;
  onEnrolled?: () => void;
}

/**
 * Batch selection + enrollment. The browser sends only a batch id, a delivery
 * mode and a payment intent. Seat availability, fee and payment status are
 * decided by the server transaction.
 */
export function ClassEnrollmentModal({ courseId, courseTitle, onClose, onEnrolled }: ClassEnrollmentModalProps) {
  const [batches, setBatches] = useState<ClassBatch[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<'online' | 'offline'>('offline');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>('');
  const [confirmed, setConfirmed] = useState<{
    enrollment: ClassEnrollment;
    notice?: string | null;
  } | null>(null);

  const load = async () => {
    setStatus('loading');
    setLoadError('');
    const result = await fetchClassBatches(courseId);
    if (!result.ok || !result.data) {
      setStatus('unavailable');
      setLoadError(result.error === 'LISTING_REPOSITORY_UNAVAILABLE' || result.status === 503
        ? 'The class calendar is temporarily unavailable. No seat can be reserved right now.'
        : result.error === 'NETWORK_ERROR'
          ? 'The server could not be reached. No seat was reserved.'
          : 'No approved batch calendar is available for this course yet.');
      setBatches([]);
      return;
    }
    setBatches(result.data.batches);
    setStatus('ready');
    const first = result.data.batches[0];
    if (first) {
      setSelectedBatchId(first.id);
      setDeliveryMode(deliveryModesFor(first)[0]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const batch = batches.find((entry) => entry.id === selectedBatchId) || null;
  const modes = batch ? deliveryModesFor(batch) : [];
  const fee = batch ? feeFor(batch, deliveryMode) : 0;
  const paymentMode: 'pay_at_institute' | 'free' = fee === 0 ? 'free' : 'pay_at_institute';

  const selectBatch = (entry: ClassBatch) => {
    setSelectedBatchId(entry.id);
    setDeliveryMode(deliveryModesFor(entry)[0]);
    setFormError('');
  };

  const submit = async () => {
    if (!batch || submitting) return;
    if (batch.seatsLeft <= 0 && batch.waitlistLeft <= 0) {
      setFormError('This batch is full and has no waitlist. Choose another batch.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    const result = await enrollInClass({
      batchId: batch.id,
      deliveryMode,
      paymentMode,
      requestId: newEnrollmentRequestId(),
    });
    setSubmitting(false);
    if (!result.ok || !result.data) {
      const code = result.error || 'ENROLLMENT_FAILED';
      setFormError(
        code === 'UNAUTHORIZED_SESSION' || code === 'POSTGRES_IDENTITY_UNMAPPED'
          ? 'Sign in with Google to enroll.'
          : code === 'BATCH_FULL'
            ? 'The last seats were just taken. Pick another batch.'
            : code === 'DUPLICATE_ENROLLMENT'
              ? 'You are already enrolled in this batch.'
              : code === 'ONLINE_PAYMENT_PROVIDER_NOT_CONFIGURED'
                ? 'Online payment is not configured on this server. You can still reserve a seat with pay at institute.'
                : code === 'CUSTOMER_ROLE_REQUIRED'
                  ? 'Only student accounts can enroll. Provider accounts cannot enroll in their own courses.'
                  : code === 'NETWORK_ERROR'
                    ? 'The server could not be reached. No enrollment was created.'
                    : 'Enrollment was not created. Please try another batch.',
      );
      void load();
      return;
    }
    setConfirmed({ enrollment: result.data.enrollment, notice: result.data.paymentNotice ?? null });
    onEnrolled?.();
  };

  return (
    <div
      data-testid="class-enrollment-modal"
      className="fixed inset-0 z-[105] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-enroll-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#ece8fb] p-4">
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#94a3b8]">Enrollment</p>
            <h2 id="class-enroll-title" className="truncate text-[15px] font-black text-[#1e1b4b]">{courseTitle}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close enrollment" className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f5f3ff]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {confirmed ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-5 w-5" />
              </span>
              <h3 className="mt-2 text-[14px] font-extrabold text-emerald-900">
                {confirmed.enrollment.status === 'waitlisted' ? 'Added to the waitlist' : 'Seat confirmed'}
              </h3>
              <dl className="mt-2 space-y-1 text-[11.5px] text-emerald-900">
                <div className="flex justify-between gap-2"><dt>Enrollment</dt><dd className="font-mono text-[10.5px]">{confirmed.enrollment.id.slice(0, 8)}</dd></div>
                <div className="flex justify-between gap-2"><dt>Mode</dt><dd className="font-bold capitalize">{confirmed.enrollment.deliveryMode}</dd></div>
                {confirmed.enrollment.seatSequence !== null && (
                  <div className="flex justify-between gap-2"><dt>Seat</dt><dd className="font-bold">#{confirmed.enrollment.seatSequence}</dd></div>
                )}
                {confirmed.enrollment.waitlistPosition !== null && (
                  <div className="flex justify-between gap-2"><dt>Waitlist position</dt><dd className="font-bold">#{confirmed.enrollment.waitlistPosition}</dd></div>
                )}
                <div className="flex justify-between gap-2">
                  <dt>Amount</dt>
                  <dd className="font-bold">
                    {confirmed.enrollment.feeAmount === 0
                      ? 'Free'
                      : `${formatINR(confirmed.enrollment.feeAmount)}${unitSuffix(confirmed.enrollment.feeUnit)}`}
                  </dd>
                </div>
                <div className="flex justify-between gap-2"><dt>Payment</dt><dd className="text-right font-bold">{paymentLabel(confirmed.enrollment.paymentStatus)}</dd></div>
              </dl>
              {confirmed.notice && <p className="mt-2 rounded-xl bg-white/70 px-2.5 py-2 text-[11px] text-emerald-800">{confirmed.notice}</p>}
              <button type="button" onClick={onClose} className="mt-3 h-10 w-full rounded-xl bg-[#7c3aed] text-[12.5px] font-bold text-white">Done</button>
            </div>
          ) : (
            <>
              {status === 'loading' && (
                <div className="flex items-center gap-2 rounded-xl bg-[#f5f3ff] px-3 py-3 text-[12px] font-semibold text-[#4c1d95]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading the approved batch calendar…
                </div>
              )}

              {status === 'unavailable' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-900">
                  <span className="inline-flex items-center gap-1.5 font-bold"><AlertCircle className="h-4 w-4" /> Enrollment unavailable</span>
                  <p className="mt-1">{loadError}</p>
                  <button type="button" onClick={() => void load()} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[11.5px] font-bold text-amber-900">
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </button>
                </div>
              )}

              {status === 'ready' && batches.length === 0 && (
                <div className="rounded-xl border border-[#ece8fb] bg-[#faf9ff] px-3 py-3 text-[12px] text-[#475569]">
                  This course has no admin-approved batch yet. Nothing can be booked until the trainer's calendar is approved.
                </div>
              )}

              {batches.length > 0 && (
                <div className="space-y-1.5" role="radiogroup" aria-label="Available batches">
                  {batches.map((entry) => {
                    const active = entry.id === selectedBatchId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => selectBatch(entry)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${active ? 'border-[#7c3aed] bg-[#f5f3ff]' : 'border-[#ece8fb] bg-white hover:bg-[#faf9ff]'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] font-extrabold text-[#1e1b4b]">{entry.title}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.seatsLeft > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {entry.seatsLeft > 0 ? `${entry.seatsLeft} seats left` : entry.waitlistLeft > 0 ? `${entry.waitlistLeft} waitlist` : 'Full'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] font-semibold text-[#64748b]">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {batchWindow(entry)}</span>
                          {entry.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> from {entry.startDate}</span>}
                          {entry.area && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {entry.area}</span>}
                          <span className="inline-flex items-center gap-1 capitalize"><Users className="h-3 w-3" /> {entry.deliveryMode}</span>
                        </div>
                        {entry.facultyName && (
                          <p className="mt-0.5 text-[10.5px] font-semibold text-[#6d28d9]">
                            Faculty: {entry.facultyName}{entry.facultyExperience ? ` · ${entry.facultyExperience}` : ''}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {batch && (
                <div className="mt-3 rounded-2xl border border-[#ece8fb] p-3">
                  <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Fees & mode</h3>
                  {modes.length > 1 && (
                    <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label="Delivery mode">
                      {modes.map((entry) => (
                        <button
                          key={entry}
                          type="button"
                          role="radio"
                          aria-checked={deliveryMode === entry}
                          onClick={() => setDeliveryMode(entry)}
                          className={`h-8 flex-1 rounded-lg border text-[11.5px] font-bold capitalize transition ${deliveryMode === entry ? 'border-[#7c3aed] bg-[#f5f3ff] text-[#4c1d95]' : 'border-[#ece8fb] text-[#475569]'}`}
                        >
                          {entry}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between rounded-lg bg-[#faf9ff] px-2.5 py-2">
                    <span className="text-[11px] font-semibold text-[#475569] capitalize">{deliveryMode} fee</span>
                    <span className="text-[13px] font-black text-[#6d28d9]">
                      {fee === 0 ? 'Free / subsidised' : `${formatINR(fee)}${unitSuffix(batch.feeUnit)}`}
                    </span>
                  </div>
                  <div className="mt-1.5 rounded-lg border border-[#ece8fb] px-2.5 py-2 text-[11px] text-[#475569]">
                    <p className="font-bold text-[#1e1b4b]">{fee === 0 ? 'Free enrollment' : 'Pay at institute'}</p>
                    <p className="mt-0.5">
                      {fee === 0
                        ? 'No payment is due for this batch.'
                        : 'A seat is reserved and the fee is recorded as an obligation. No money is captured online.'}
                    </p>
                    <p className="mt-1 text-[10.5px] text-[#94a3b8]">Online payment requires a configured, verified payment provider and is disabled until then.</p>
                  </div>
                </div>
              )}

              {formError && (
                <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11.5px] font-semibold text-rose-700" role="alert">
                  {formError}
                </p>
              )}
            </>
          )}
        </div>

        {!confirmed && (
          <footer className="border-t border-[#ece8fb] p-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!batch || submitting || (batch.seatsLeft <= 0 && batch.waitlistLeft <= 0)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7c3aed] text-[13px] font-bold text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
              {batch && batch.seatsLeft <= 0 && batch.waitlistLeft > 0 ? 'Join waitlist' : 'Confirm enrollment'}
            </button>
            <p className="mt-1.5 text-center text-[9.5px] text-[#64748b]">
              Seat, fee and payment status are confirmed by the server. Nothing is fabricated if the server rejects the request.
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

interface MyClassesPanelProps {
  onClose: () => void;
}

/** My Classes: enrollment history plus cancellation with the server's policy quote. */
export function MyClassesPanel({ onClose }: MyClassesPanelProps) {
  const [enrollments, setEnrollments] = useState<ClassEnrollment[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string>('');
  const [quote, setQuote] = useState<{ id: string; refundPercent: number; refundAmount: number; policy: string | null; note: string | null } | null>(null);

  const load = async () => {
    setState('loading');
    setMessage('');
    const result = await fetchMyClassEnrollments();
    if (!result.ok || !result.data) {
      setState('error');
      setMessage(
        result.status === 401
          ? 'Sign in with Google to see your classes.'
          : result.error === 'NETWORK_ERROR'
            ? 'The server could not be reached.'
            : 'Your classes could not be loaded right now.',
      );
      return;
    }
    setEnrollments(result.data.enrollments);
    setState('ready');
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = async (enrollment: ClassEnrollment) => {
    setBusyId(enrollment.id);
    setMessage('');
    const result = await cancelClassEnrollment(enrollment.id, 'Cancelled by student from My Classes');
    setBusyId('');
    if (!result.ok || !result.data) {
      setMessage('Cancellation was not confirmed by the server. The enrollment is unchanged.');
      return;
    }
    setQuote({
      id: enrollment.id,
      refundPercent: result.data.refundPercent,
      refundAmount: result.data.refundAmount,
      policy: result.data.refundPolicy,
      note: result.data.note,
    });
    void load();
  };

  return (
    <div
      className="fixed inset-0 z-[104] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-classes-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#ece8fb] p-4">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#94a3b8]">Student</p>
            <h2 id="my-classes-title" className="text-[15px] font-black text-[#1e1b4b]">My Classes</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close my classes" className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f5f3ff]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {state === 'loading' && (
            <p className="flex items-center gap-2 text-[12px] font-semibold text-[#4c1d95]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your enrollments…
            </p>
          )}
          {state === 'error' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[12px] text-amber-900">
              {message}
              <button type="button" onClick={() => void load()} className="mt-2 flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[11.5px] font-bold">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          )}
          {state === 'ready' && enrollments.length === 0 && (
            <p className="rounded-xl border border-[#ece8fb] bg-[#faf9ff] px-3 py-3 text-[12px] text-[#475569]">
              You have no class enrollments yet. Enroll from an approved course to see it here.
            </p>
          )}

          {enrollments.map((entry) => (
            <div
              key={entry.id}
              role="group"
              aria-label={`Enrollment ${entry.courseTitle || entry.batchTitle || 'class'}`}
              className="mb-2 rounded-2xl border border-[#ece8fb] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[12.5px] font-extrabold text-[#1e1b4b]">{entry.courseTitle || entry.batchTitle || 'Class'}</h3>
                  <p className="truncate text-[10.5px] font-semibold text-[#64748b]">
                    {entry.batchTitle || 'Batch'}{entry.startDate ? ` · from ${entry.startDate}` : ''}
                    {entry.startTime ? ` · ${clockLabel(entry.startTime)}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  entry.status === 'cancelled'
                    ? 'bg-slate-100 text-slate-600'
                    : entry.status === 'waitlisted'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {entry.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#475569]">
                {entry.feeAmount === 0 ? 'Free' : `${formatINR(entry.feeAmount)}${unitSuffix(entry.feeUnit)}`} · {paymentLabel(entry.paymentStatus)} · <span className="capitalize">{entry.deliveryMode}</span>
              </p>
              {entry.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => void cancel(entry)}
                  disabled={busyId === entry.id}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ece8fb] px-2.5 text-[11px] font-bold text-[#4c1d95] disabled:opacity-50"
                >
                  {busyId === entry.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Cancel enrollment
                </button>
              )}
              {entry.status === 'cancelled' && entry.refundPolicy && (
                <p className="mt-1 text-[10.5px] text-[#64748b]">Cancelled under {entry.refundPolicy}</p>
              )}
              {quote?.id === entry.id && (
                <div className="mt-2 rounded-xl bg-[#f5f3ff] px-2.5 py-2 text-[11px] text-[#4c1d95]">
                  <p className="font-bold">Cancellation recorded</p>
                  <p>Policy: {quote.policy || 'n/a'} · Refund {quote.refundPercent}% ({formatINR(quote.refundAmount)})</p>
                  {quote.note && <p className="mt-0.5 text-[10.5px] text-[#6d28d9]">{quote.note}</p>}
                </div>
              )}
            </div>
          ))}

          {message && state === 'ready' && (
            <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11.5px] font-semibold text-rose-700" role="alert">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
