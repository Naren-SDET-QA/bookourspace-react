import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, FileText, Gavel, Loader2, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import {
  adminPgBookingAdjustment,
  approvePgRefund,
  decidePgPaymentClaim,
  fetchPgAdminAudit,
  fetchPgAdminBookings,
  pgErrorMessage,
  requestPgSuperAdminSession,
  resolvePgDispute,
  reviewPgDispute,
  waivePgFee,
  type PgAdminAuditEvent,
  type PgAdminBooking,
} from '../lib/pgBookingClient';

function rupees(paise: number | null | undefined): string {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const MONEY_TONE: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-900',
  refunded: 'bg-sky-100 text-sky-900',
  pending_verification: 'bg-amber-100 text-amber-900',
  failed: 'bg-rose-100 text-rose-900',
  collected_offline: 'bg-violet-100 text-violet-900',
  refund_pending: 'bg-amber-100 text-amber-900',
  pay_later: 'bg-slate-100 text-slate-800',
};

function MoneyBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${MONEY_TONE[value] || 'bg-slate-100 text-slate-800'}`}>
      {String(value || '').replaceAll('_', ' ')}
    </span>
  );
}

interface ActionState {
  bookingId: string;
  kind: string;
  amount: string;
  reason: string;
  note: string;
}

/**
 * The administrator console for PG & Hostels.
 *
 * Every money action is decided on the server. The browser only sends a
 * request with a mandatory reason; the server checks the administrator
 * identity, the `super_admin` scope for anything that touches money, and
 * writes an immutable audit record.
 */
export function PgAdminWorkspace() {
  const [bookings, setBookings] = useState<PgAdminBooking[]>([]);
  const [events, setEvents] = useState<PgAdminAuditEvent[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [action, setAction] = useState<ActionState | null>(null);
  const [auditLimit, setAuditLimit] = useState(50);

  const load = useCallback(async () => {
    setError('');
    try {
      const [list, audit] = await Promise.all([
        fetchPgAdminBookings(100),
        fetchPgAdminAudit(undefined, auditLimit),
      ]);
      setBookings(list.bookings || []);
      // The server already orders newest-first; sorting here keeps the display
      // correct if an older server or a cached response returns any other order.
      setEvents([...audit.events].sort((a, b) => b.id - a.id));
    } catch (cause) {
      setError(pgErrorMessage(cause));
    }
  }, [auditLimit]);

  useEffect(() => { void load(); }, [load]);

  const openAction = (booking: PgAdminBooking, kind: string) => {
    setNotice('');
    setAction({ bookingId: booking.bookingId, kind, amount: String(booking.totalPaise), reason: '', note: '' });
  };

  async function elevate() {
    setBusy(true); setError(''); setNotice('');
    try {
      await requestPgSuperAdminSession();
      setSuperAdmin(true);
      setNotice('Super administrator session granted. Money operations are now available.');
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  async function run() {
    if (!action) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (action.kind === 'waive_fee') {
        const result = await waivePgFee(action.bookingId, Number(action.amount), action.reason);
        setNotice(`Fee waived. The reservation now shows ${rupees(Number((result.booking as any)?.totalPaise))} payable.`);
      } else if (action.kind === 'approve_refund') {
        const result = await approvePgRefund(action.bookingId, Number(action.amount), action.reason);
        setNotice('Refund approved. The money moves only when the payment provider reconciles it.');
      } else if (action.kind === 'cancel_booking') {
        await adminPgBookingAdjustment(action.bookingId, 'cancel', action.reason);
        setNotice('Reservation cancelled by an administrator and recorded in the audit trail.');
      } else if (action.kind === 'review_dispute') {
        await reviewPgDispute(action.bookingId, action.note);
        setNotice('Dispute moved under review.');
      } else if (action.kind === 'resolve_dispute') {
        await resolvePgDispute(action.bookingId, { resolution: action.reason });
        setNotice('Dispute resolved and the resolution recorded.');
      } else if (action.kind === 'approve_claim') {
        await decidePgPaymentClaim(action.bookingId, 'approved', action.note);
        setNotice('Collection claim approved and recorded.');
      } else if (action.kind === 'reject_claim') {
        await decidePgPaymentClaim(action.bookingId, 'rejected', action.note);
        setNotice('Collection claim rejected and recorded.');
      }
      setAction(null);
      await load();
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  const openDisputes = useMemo(() => bookings.filter((booking) => booking.disputeStatus === 'open' || booking.disputeStatus === 'under_review'), [bookings]);
  const pendingClaims = useMemo(() => bookings.filter((booking) => booking.claimStatus === 'pending'), [bookings]);
  const refundPending = useMemo(() => bookings.filter((booking) => booking.paymentStatus === 'refund_pending'), [bookings]);

  return (
    <section className="space-y-4" aria-label="PG and hostel administration">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">PG &amp; Hostels operations</h2>
          <p className="text-xs text-slate-500">Reservations, money, disputes and collection claims, read from PostgreSQL.</p>
        </div>
        <div className="flex items-center gap-2">
          {!superAdmin && (
            <button type="button" onClick={() => void elevate()} disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-700 px-3 text-xs font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              Request super administrator session
            </button>
          )}
          {superAdmin && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[11px] font-bold text-violet-900"><ShieldCheck className="h-3 w-3" aria-hidden="true" />Super administrator</span>}
          <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh
          </button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-900">{notice}</p>}

      {action && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4" aria-label="Administrator action">
          <h3 className="text-sm font-black text-slate-900">
            {action.kind === 'cancel_booking' && 'Cancel the reservation'}
            {action.kind === 'waive_fee' && 'Waive a fee'}
            {action.kind === 'approve_refund' && 'Approve a refund'}
            {action.kind === 'review_dispute' && 'Move a dispute under review'}
            {action.kind === 'resolve_dispute' && 'Resolve a dispute'}
            {action.kind === 'approve_claim' && 'Approve a collection claim'}
            {action.kind === 'reject_claim' && 'Reject a collection claim'}
          </h3>
          <p className="mt-1 text-xs text-slate-600">Reservation {action.bookingId}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(action.kind === 'waive_fee' || action.kind === 'approve_refund') && (
              <label className="grid gap-1 text-xs font-bold text-slate-700">
                Amount (paise)
                <input type="number" min="1" value={action.amount} onChange={(event) => setAction({ ...action, amount: event.target.value })}
                  className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" />
              </label>
            )}
            <label className="grid gap-1 text-xs font-bold text-slate-700">
              {action.kind === 'review_dispute' || action.kind === 'approve_claim' || action.kind === 'reject_claim' ? 'Note' : 'Reason (recorded in the audit trail)'}
              <textarea rows={2} value={action.kind === 'review_dispute' || action.kind === 'approve_claim' || action.kind === 'reject_claim' ? action.note : action.reason}
                onChange={(event) => setAction({ ...action, ...(action.kind === 'review_dispute' || action.kind === 'approve_claim' || action.kind === 'reject_claim' ? { note: event.target.value } : { reason: event.target.value }) })}
                className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void run()} disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}Confirm
            </button>
            <button type="button" onClick={() => setAction(null)} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Open disputes</p>
          <p className="text-xl font-black text-amber-900">{openDisputes.length}</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Collection claims</p>
          <p className="text-xl font-black text-violet-900">{pendingClaims.length}</p>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-800">Refunds awaiting the provider</p>
          <p className="text-xl font-black text-sky-900">{refundPending.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-xs">
          <caption className="sr-only">PG reservations with their money state and administrator actions</caption>
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">Reservation</th>
              <th scope="col" className="px-3 py-2">Amount</th>
              <th scope="col" className="px-3 py-2">Payment</th>
              <th scope="col" className="px-3 py-2">Dispute</th>
              <th scope="col" className="px-3 py-2">Invoice</th>
              <th scope="col" className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No PostgreSQL-backed PG reservations found.</td></tr>
            )}
            {bookings.map((booking) => (
              <tr key={booking.bookingId} className="align-top">
                <td className="px-3 py-2">
                  <p className="font-bold text-slate-900">{booking.listingTitle}</p>
                  <p className="font-mono text-[10px] text-slate-500">{booking.bookingId}</p>
                  <p className="text-[11px] text-slate-500">{booking.moveIn} → {booking.moveOut} · {booking.status}</p>
                </td>
                <td className="px-3 py-2">
                  <p className="font-bold text-slate-900">{rupees(booking.totalPaise)}</p>
                  <p className="text-[10px] text-slate-500">rent {rupees(booking.rentPaise)} + deposit {rupees(booking.depositPaise)}</p>
                  {booking.waivedPaise > 0 && <p className="text-[10px] font-bold text-emerald-700">waived {rupees(booking.waivedPaise)}</p>}
                  {booking.refundPaise > 0 && <p className="text-[10px] font-bold text-sky-700">refund {rupees(booking.refundPaise)}</p>}
                </td>
                <td className="px-3 py-2"><MoneyBadge value={booking.paymentStatus} /><p className="mt-1 text-[10px] text-slate-500">{booking.paymentMode}</p></td>
                <td className="px-3 py-2">{booking.disputeStatus ? <MoneyBadge value={booking.disputeStatus} /> : <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-[10px] text-slate-600">{booking.invoiceNumber || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {['pay_later', 'failed'].includes(booking.paymentStatus) && (
                      <button type="button" onClick={() => openAction(booking, 'waive_fee')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-300 px-2 text-[11px] font-bold text-emerald-700">
                        <Wallet className="h-3 w-3" aria-hidden="true" />Waive fee
                      </button>
                    )}
                    {['pay_later', 'failed', 'collected_offline'].includes(booking.paymentStatus) && (
                      <button type="button" onClick={() => openAction(booking, 'cancel_booking')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-300 px-2 text-[11px] font-bold text-rose-700">
                        Cancel reservation
                      </button>
                    )}
                    {booking.paymentStatus === 'verified' && (
                      <button type="button" onClick={() => openAction(booking, 'approve_refund')} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-300 px-2 text-[11px] font-bold text-sky-700">
                        <CreditCard className="h-3 w-3" aria-hidden="true" />Approve refund
                      </button>
                    )}
                    {booking.disputeStatus === 'open' && (
                      <button type="button" onClick={() => { setAction({ bookingId: booking.disputeId || '', kind: 'review_dispute', amount: '', reason: '', note: '' }); }} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-amber-300 px-2 text-[11px] font-bold text-amber-800">
                        <Gavel className="h-3 w-3" aria-hidden="true" />Review dispute
                      </button>
                    )}
                    {(booking.disputeStatus === 'open' || booking.disputeStatus === 'under_review') && (
                      <button type="button" onClick={() => { setAction({ bookingId: booking.disputeId || '', kind: 'resolve_dispute', amount: '', reason: '', note: '' }); }} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-violet-300 px-2 text-[11px] font-bold text-violet-700">
                        <Gavel className="h-3 w-3" aria-hidden="true" />Resolve dispute
                      </button>
                    )}
                    {booking.claimStatus === 'pending' && (
                      <>
                        <button type="button" onClick={() => { setAction({ bookingId: booking.claimId || '', kind: 'approve_claim', amount: '', reason: '', note: '' }); }} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-300 px-2 text-[11px] font-bold text-emerald-700">Approve claim</button>
                        <button type="button" onClick={() => { setAction({ bookingId: booking.claimId || '', kind: 'reject_claim', amount: '', reason: '', note: '' }); }} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-300 px-2 text-[11px] font-bold text-rose-700">Reject claim</button>
                      </>
                    )}
                    {booking.invoiceNumber && (
                      <span className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[11px] font-bold text-slate-700">
                        <FileText className="h-3 w-3" aria-hidden="true" />{booking.invoiceNumber.slice(-8)}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-2xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">Administrator audit trail (append-only)</summary>
        <ol className="mt-3 space-y-1.5">
          {events.map((event) => (
            <li key={event.id} className="rounded-xl bg-slate-50 p-2 text-[11px] text-slate-700">
              <span className="font-bold">{event.action}</span>
              {event.bookingId && <span className="ml-1 font-mono text-[10px] text-slate-500">{event.bookingId}</span>}
              <span className="ml-1 text-slate-500">by {event.actorRole}</span>
              {event.reason && <span className="ml-1">— {event.reason}</span>}
            </li>
          ))}
          {events.length === 0 && <li className="text-[11px] text-slate-500">No administrator actions recorded yet.</li>}
        </ol>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>Newest first · showing {events.length} of the latest actions</span>
          {events.length >= auditLimit && auditLimit < 200 && (
            <button type="button" onClick={() => setAuditLimit((current) => Math.min(200, current + 50))}
              className="min-h-8 rounded-lg border border-slate-300 px-2 font-bold text-slate-700">
              Load 50 older
            </button>
          )}
        </div>
      </details>

      {!superAdmin && (
        <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-[11px] leading-5 text-slate-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Waivers, refund approvals and collection-claim decisions require a super administrator session. The server refuses them otherwise; this console cannot override that.
        </p>
      )}
    </section>
  );
}
