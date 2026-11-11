import { useCallback, useEffect, useState } from 'react';
import {
  BadgeIndianRupee,
  CalendarClock,
  Check,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  Navigation,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import {
  decideServicePaymentClaim,
  fetchServiceBookings,
  fetchServiceEarnings,
  fetchServicePaymentClaims,
  recordServicePaymentClaim,
  refundServiceBooking,
  serviceBookingErrorMessage,
  transitionServiceBooking,
  type ServiceBooking,
  type ServiceEarnings,
  type ServicePaymentClaim,
} from '../lib/servicesBookingClient';
import { HelperTrackingPublisher } from './tracking/HelperTrackingPublisher';

interface ServiceOperationsWorkspaceProps {
  role: 'provider' | 'admin';
  onClose: () => void;
}

const STATUS_TONE: Record<ServiceBooking['status'], string> = {
  requested: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  accepted: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  in_progress: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  cancelled: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
};

function money(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function ServiceOperationsWorkspace({ role, onClose }: ServiceOperationsWorkspaceProps) {
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [claims, setClaims] = useState<ServicePaymentClaim[]>([]);
  const [earnings, setEarnings] = useState<ServiceEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reschedule, setReschedule] = useState<Record<string, { date: string; slot: string }>>({});
  const [paymentDraft, setPaymentDraft] = useState<Record<string, { method: 'cash' | 'upi'; reference: string; evidenceNote: string }>>({});
  const [claimNote, setClaimNote] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [trackingBookingId, setTrackingBookingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bookingResult, claimResult, earningResult] = await Promise.all([
        fetchServiceBookings(),
        fetchServicePaymentClaims().catch(() => ({ claims: [] as ServicePaymentClaim[] })),
        role === 'provider' ? fetchServiceEarnings().catch(() => ({ earnings: null })) : Promise.resolve({ earnings: null }),
      ]);
      setBookings(bookingResult.bookings);
      setClaims(claimResult.claims);
      setEarnings(earningResult.earnings);
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  const act = async (booking: ServiceBooking, action: 'accept' | 'reject' | 'start' | 'complete' | 'cancel' | 'reschedule') => {
    setBusyId(booking.id);
    setError('');
    setNotice('');
    try {
      const draft = reschedule[booking.id];
      const body = action === 'reschedule' && draft
        ? { scheduledDate: draft.date, timeSlot: draft.slot }
        : action === 'cancel' || action === 'reject'
          ? { reason: cancelReason[booking.id] || (role === 'admin' ? '' : 'Changed plans') }
          : {};
      const result = await transitionServiceBooking(booking.id, action, body);
      setBookings((current) => current.map((row) => (row.id === booking.id ? result.booking : row)));
      setNotice(`Booking ${result.booking.bookingRef} is now ${result.booking.status.replace('_', ' ')}.`);
      if (action === 'complete' && role === 'provider') {
        const earningResult = await fetchServiceEarnings().catch(() => null);
        if (earningResult) setEarnings(earningResult.earnings);
      }
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };

  const submitClaim = async (booking: ServiceBooking) => {
    const draft = paymentDraft[booking.id];
    if (!draft) return;
    setBusyId(booking.id);
    setError('');
    try {
      const result = await recordServicePaymentClaim(booking.id, {
        method: draft.method,
        reference: draft.reference,
        evidenceNote: draft.evidenceNote,
      });
      setClaims((current) => [result.claim, ...current]);
      setBookings((current) => current.map((row) => (row.id === booking.id ? { ...row, paymentStatus: 'declared' } : row)));
      setNotice(`Payment claim for ${booking.bookingRef} is pending administrator verification.`);
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };

  const decideClaim = async (claim: ServicePaymentClaim, decision: 'approved' | 'rejected') => {
    setBusyId(claim.id);
    setError('');
    try {
      const result = await decideServicePaymentClaim(claim.id, decision, claimNote[claim.id] || '');
      setClaims((current) => current.map((row) => (row.id === claim.id ? result.claim : row)));
      setBookings((current) => current.map((row) => (row.id === claim.bookingId ? result.booking : row)));
      setNotice(`Payment claim ${claim.bookingRef} ${decision}.`);
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };


  const refund = async (booking: ServiceBooking) => {
    setBusyId(booking.id);
    setError('');
    setNotice('');
    try {
      await refundServiceBooking(booking.id);
      setNotice(`Refund recorded for ${booking.bookingRef}. Only a provider-confirmed refund event changes this booking.`);
      await load();
    } catch (caught) {
      setError(serviceBookingErrorMessage(caught));
    } finally {
      setBusyId('');
    }
  };

  const pendingClaims = claims.filter((claim) => claim.status === 'pending');

  return (
    <div className="fixed inset-0 z-[74] overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="service-workspace-title">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 px-4 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            <X className="h-4 w-4" aria-hidden="true" /> Close
          </button>
          <h1 id="service-workspace-title" className="text-lg font-black tracking-tight">
            {role === 'admin' ? 'Services Admin Oversight' : 'Provider Service Jobs'}
          </h1>
          <button type="button" onClick={() => void load()} className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {error && <p role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
        {notice && <p role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{notice}</p>}

        {role === 'provider' && earnings && (
          <section className="grid gap-3 sm:grid-cols-4" aria-label="Earnings">
            {[
              { label: 'Completed jobs', value: String(earnings.completedJobs), icon: ClipboardList },
              { label: 'Gross value', value: money(earnings.grossAmount), icon: CircleDollarSign },
              { label: 'Settled', value: money(earnings.settledAmount), icon: Wallet },
              { label: 'Outstanding', value: money(earnings.outstandingAmount), icon: BadgeIndianRupee },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <Icon className="h-5 w-5 text-violet-600" aria-hidden="true" />
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className="mt-1 text-xl font-black tabular-nums">{card.value}</p>
                </div>
              );
            })}
          </section>
        )}

        {role === 'admin' && (
          <section aria-labelledby="claims-title">
            <h2 id="claims-title" className="flex items-center gap-2 text-base font-extrabold"><ShieldCheck className="h-4 w-4 text-violet-600" aria-hidden="true" /> Pending payment claims ({pendingClaims.length})</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cash/UPI claims require an audit reason. Approving one marks the booking settled; no screenshot alone settles money.</p>
            <div className="mt-3 space-y-3">
              {pendingClaims.map((claim) => (
                <article key={claim.id} className="rounded-2xl border border-amber-200 bg-white p-4 dark:border-amber-900 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{claim.bookingRef} · {money(claim.amount)}</p>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{claim.method.toUpperCase()} · pending</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">Evidence: {claim.evidenceNote}{claim.reference ? ` · Ref: ${claim.reference}` : ''}</p>
                  <label className="mt-3 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    Audit reason (required)
                    <input value={claimNote[claim.id] || ''} onChange={(event) => setClaimNote((current) => ({ ...current, [claim.id]: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Verified against provider bank/UPI statement…" />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busyId === claim.id} onClick={() => void decideClaim(claim, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden="true" /> Approve settlement</button>
                    <button type="button" disabled={busyId === claim.id} onClick={() => void decideClaim(claim, 'rejected')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"><X className="h-4 w-4" aria-hidden="true" /> Reject</button>
                  </div>
                </article>
              ))}
              {pendingClaims.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No payment claims are waiting for review.</p>}
            </div>
          </section>
        )}

        <section aria-labelledby="jobs-title">
          <h2 id="jobs-title" className="text-base font-extrabold">{role === 'admin' ? 'All service bookings' : 'Assigned service jobs'}</h2>
          {loading ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading bookings…</p>
          ) : bookings.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {role === 'admin' ? 'No service bookings have been created yet.' : 'No service bookings assigned yet. A customer books one of your active service listings.'}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {bookings.map((booking) => {
                const busy = busyId === booking.id;
                const draft = reschedule[booking.id] || { date: booking.scheduledDate, slot: booking.timeSlot };
                return (
                  <article key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-black">{booking.listingTitle}</p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{booking.bookingRef} · {booking.scheduledDate} · {booking.timeSlot}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[booking.status]}`}>{booking.status.replace('_', ' ')}</span>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${booking.paymentStatus === 'settled' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{booking.paymentStatus === 'declared' ? 'payment pending review' : booking.paymentStatus}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{booking.serviceAddress}</p>
                    {booking.notes && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Customer note: {booking.notes}</p>}
                    <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{money(booking.amount)} · {booking.paymentMode === 'pay_after_service' ? 'pay after service' : 'UPI'}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {role !== 'admin' && booking.status === 'requested' && (
                        <>
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'accept')} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Accept job</button>
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'reject')} className="min-h-10 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950">Reject</button>
                        </>
                      )}
                      {role !== 'admin' && booking.status === 'accepted' && (
                        <>
                          <button type="button" onClick={() => setTrackingBookingId(booking.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white"><Navigation className="h-3.5 w-3.5" /> Share live GPS</button>
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'start')} className="min-h-10 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-60">Start service</button>
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'cancel')} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                        </>
                      )}
                      {role !== 'admin' && booking.status === 'in_progress' && (
                        <>
                          <button type="button" onClick={() => setTrackingBookingId(booking.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white"><Navigation className="h-3.5 w-3.5" /> Share live GPS</button>
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'complete')} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Mark completed</button>
                        </>
                      )}
                      {role !== 'admin' && ['requested', 'accepted'].includes(booking.status) && (
                        <div className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                          <label className="text-[10px] font-bold text-slate-500">Reschedule date<input type="date" min={new Date().toISOString().slice(0, 10)} value={draft.date} onChange={(event) => setReschedule((current) => ({ ...current, [booking.id]: { ...draft, date: event.target.value } }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
                          <label className="text-[10px] font-bold text-slate-500">Slot<input value={draft.slot} onChange={(event) => setReschedule((current) => ({ ...current, [booking.id]: { ...draft, slot: event.target.value } }))} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800" /></label>
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'reschedule')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-violet-300 px-3 text-[11px] font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-60 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Save slot</button>
                        </div>
                      )}
                      {role !== 'admin' && booking.status === 'completed' && ['due', 'failed'].includes(booking.paymentStatus) && (
                        <div className="w-full rounded-xl border border-violet-200 p-3 dark:border-violet-900">
                          <p className="text-[11px] font-bold text-violet-800 dark:text-violet-200">Record collected payment for admin verification</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <select value={paymentDraft[booking.id]?.method || 'cash'} onChange={(event) => setPaymentDraft((current) => ({ ...current, [booking.id]: { method: event.target.value as 'cash' | 'upi', reference: current[booking.id]?.reference || '', evidenceNote: current[booking.id]?.evidenceNote || '' } }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                              <option value="cash">Cash</option>
                              <option value="upi">UPI</option>
                            </select>
                            <input placeholder="UPI reference (for UPI)" value={paymentDraft[booking.id]?.reference || ''} onChange={(event) => setPaymentDraft((current) => ({ ...current, [booking.id]: { method: current[booking.id]?.method || 'cash', reference: event.target.value, evidenceNote: current[booking.id]?.evidenceNote || '' } }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                            <input placeholder="What was collected / proof note" value={paymentDraft[booking.id]?.evidenceNote || ''} onChange={(event) => setPaymentDraft((current) => ({ ...current, [booking.id]: { method: current[booking.id]?.method || 'cash', reference: current[booking.id]?.reference || '', evidenceNote: event.target.value } }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                          </div>
                          <button type="button" disabled={busy} onClick={() => void submitClaim(booking)} className="mt-2 min-h-9 rounded-lg bg-violet-700 px-3 text-[11px] font-bold text-white hover:bg-violet-800 disabled:opacity-60">Submit for verification</button>
                        </div>
                      )}
                      {role !== 'admin' && booking.status === 'completed' && booking.paymentStatus === 'settled' && (
                        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Payment verified and settled</p>
                      )}

                      {role === 'admin' && booking.paymentStatus === 'settled' && booking.status !== 'completed' && (
                        <button type="button" disabled={busy} onClick={() => void refund(booking)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-300 px-4 text-xs font-bold text-sky-800 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-900 dark:text-sky-300 dark:hover:bg-sky-950">
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Refund verified payment
                        </button>
                      )}
                      {role === 'admin' && booking.status !== 'cancelled' && booking.status !== 'completed' && (
                        <div className="flex w-full flex-wrap items-center gap-2">
                          <input value={cancelReason[booking.id] || ''} onChange={(event) => setCancelReason((current) => ({ ...current, [booking.id]: event.target.value }))} placeholder="Audit reason for cancellation" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-800" />
                          <button type="button" disabled={busy} onClick={() => void act(booking, 'cancel')} className="min-h-10 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950">Cancel with reason</button>
                        </div>
                      )}
                    </div>


                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      {trackingBookingId && <HelperTrackingPublisher bookingId={trackingBookingId} onClose={() => setTrackingBookingId('')} />}
    </div>
  );
}
