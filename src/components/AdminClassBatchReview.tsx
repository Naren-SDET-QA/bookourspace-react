import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Check, Clock, Loader2, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import {
  fetchAdminClassBatches,
  reviewClassBatch,
  type ClassBatch,
} from '../lib/classesApi';

const formatINR = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

const ERROR_TEXT: Record<string, string> = {
  AUDIT_REASON_REQUIRED: 'Enter an audit reason of at least 5 characters.',
  COURSE_NOT_APPROVED: 'Approve the course listing first; a batch cannot go live under a pending course.',
  BATCH_REVIEW_STATE_CONFLICT: 'This batch was already reviewed. Refresh the queue.',
  FORBIDDEN_ROLE: 'Only an admin session can review batches.',
  UNAUTHORIZED_SESSION: 'Sign in with an admin Google account.',
  NETWORK_ERROR: 'The server could not be reached. Nothing changed.',
};

/**
 * Admin approval queue for Classes batches. Publication is the only place a
 * batch becomes publicly enrollable, and every decision needs an audit reason.
 */
export function AdminClassBatchReview() {
  const [batches, setBatches] = useState<Array<ClassBatch & { courseTitle?: string }>>([]);
  const [reason, setReason] = useState('Calendar and faculty verified');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    const result = await fetchAdminClassBatches('pending_approval');
    if (!result.ok || !result.data) {
      setError(ERROR_TEXT[result.error || ''] || `The batch queue could not be loaded (${result.error || 'unknown'}).`);
      setLoading(false);
      return;
    }
    setBatches(result.data.batches);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (batchId: string, decision: 'active' | 'rejected') => {
    if (reason.trim().length < 5) {
      setError(ERROR_TEXT.AUDIT_REASON_REQUIRED);
      return;
    }
    setBusyId(batchId);
    setError('');
    setNotice('');
    const result = await reviewClassBatch(batchId, decision, reason);
    setBusyId('');
    if (!result.ok) {
      setError(ERROR_TEXT[result.error || ''] || `Review failed (${result.error}).`);
      return;
    }
    setNotice(
      decision === 'active'
        ? 'Batch published. It is now publicly enrollable with live seat counts.'
        : 'Batch rejected. It stays hidden from students.',
    );
    await load();
  };

  return (
    <section
      data-testid="admin-class-batch-review"
      className="rounded-2xl border border-amber-200 bg-white p-3.5 shadow-sm"
      aria-labelledby="admin-class-batch-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="admin-class-batch-title" className="inline-flex items-center gap-1.5 text-[14px] font-black text-[#1e1b4b]">
            <ShieldCheck className="h-4 w-4 text-amber-500" /> Classes batch approvals
          </h2>
          <p className="text-[10.5px] text-[#64748b]">
            Only an admin can publish a batch. Students cannot see or book a pending batch.
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

      <div className="mt-2">
        <label className="block">
          <span className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-[#94a3b8]">Audit reason (required)</span>
          <input
            aria-label="Audit reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-lg border border-[#ece8fb] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1e1b4b] outline-none focus:border-[#7c3aed]"
          />
        </label>
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[#4c1d95]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the approval queue…
        </p>
      ) : batches.length === 0 ? (
        <p data-testid="admin-batch-empty" className="mt-2 rounded-xl border border-[#ece8fb] bg-[#faf9ff] px-3 py-2 text-[11.5px] text-[#475569]">
          No class batch is pending review.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {batches.map((batch) => (
            <li key={batch.id} data-testid="admin-batch-row" className="rounded-xl border border-[#ece8fb] px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p data-testid="admin-batch-title" className="truncate text-[12px] font-extrabold text-[#1e1b4b]">{batch.title}</p>
                  <p className="truncate text-[10.5px] text-[#64748b]">
                    {batch.courseTitle || 'Course'} · {batch.deliveryMode} · {batch.feeUnit} · capacity {batch.capacity}
                  </p>
                </div>
                <span data-testid="admin-batch-status" className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-bold text-amber-800">
                  {batch.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] font-semibold text-[#475569]">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {batch.startTime}–{batch.endTime} {batch.daysOfWeek}</span>
                {batch.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {batch.startDate}</span>}
                <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> capacity {batch.capacity}</span>
                <span>{formatINR(batch.offlineFee)} offline · {formatINR(batch.onlineFee)} online</span>
                {batch.facultyName && <span>Faculty: {batch.facultyName}</span>}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void decide(batch.id, 'active')}
                  disabled={busyId === batch.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white disabled:opacity-50"
                >
                  {busyId === batch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve & publish
                </button>
                <button
                  type="button"
                  onClick={() => void decide(batch.id, 'rejected')}
                  disabled={busyId === batch.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 text-[11px] font-bold text-rose-700 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {notice && (
        <p data-testid="admin-batch-notice" className="mt-2 rounded-xl bg-emerald-50 px-2.5 py-2 text-[11.5px] font-semibold text-emerald-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p data-testid="admin-batch-error" className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-2.5 py-2 text-[11.5px] font-semibold text-rose-700" role="alert">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </section>
  );
}
