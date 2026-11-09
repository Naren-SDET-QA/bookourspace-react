import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Gavel, Loader2, Receipt } from 'lucide-react';
import {
  fetchPgAudit,
  fetchPgDisputes,
  fetchPgInvoice,
  fetchPgInvoices,
  openPgDispute,
  pgErrorMessage,
  submitPgPaymentClaim,
  type PgDispute,
  type PgDisputeCategory,
  type PgInvoice,
} from '../lib/pgBookingClient';

function inr(paise: number | null | undefined): string {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const CATEGORIES: Array<{ value: PgDisputeCategory; label: string }> = [
  { value: 'payment_not_received', label: 'Payment not received' },
  { value: 'duplicate_charge', label: 'Duplicate charge' },
  { value: 'refund_delay', label: 'Refund delayed' },
  { value: 'bed_unavailable', label: 'Bed not available' },
  { value: 'terms_not_honoured', label: 'Terms not honoured' },
  { value: 'other', label: 'Something else' },
];

const INVOICE_STATUS_COPY: Record<string, string> = {
  unpaid: 'Not paid. No money has been collected by BookOurSpace.',
  payment_pending: 'A payment was started but the provider has not confirmed it yet.',
  paid: 'Payment verified by the payment provider.',
  collected_offline: 'Collected offline at the property and approved by an administrator. BookOurSpace did not reconcile this payment.',
  refunded: 'Refunded by the payment provider.',
  cancelled: 'This reservation was cancelled and nothing was collected.',
};

/**
 * A dispute between the customer, the provider and an administrator.
 *
 * The reason and the evidence are stored with the dispute, the resolution is
 * written by an administrator, and the whole history stays visible to the
 * parties of the reservation.
 */
export function PgDisputePanel({
  bookingId,
  role,
  onChanged,
}: {
  bookingId: string;
  role: 'customer' | 'provider' | 'admin';
  onChanged?: () => void;
}) {
  const [disputes, setDisputes] = useState<PgDispute[]>([]);
  const [audit, setAudit] = useState<Array<{ id: number; action: string; reason: string; actorRole: string; createdAt: string }>>([]);
  const [category, setCategory] = useState<PgDisputeCategory>('bed_unavailable');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await fetchPgDisputes(bookingId);
      setDisputes(result.disputes || []);
      const trail = await fetchPgAudit(bookingId);
      setAudit(trail.events || []);
    } catch (cause) {
      setError(pgErrorMessage(cause));
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  const active = disputes.find((dispute) => dispute.status === 'open' || dispute.status === 'under_review');

  async function submit() {
    setBusy(true); setError(''); setNotice('');
    try {
      await openPgDispute(bookingId, {
        category,
        reason,
        evidence: evidence.trim() ? [{ kind: 'reference', reference: evidence.trim(), note: 'Evidence supplied by the party' }] : [],
        amountInDisputePaise: amount ? Number(amount) : null,
      });
      setReason(''); setEvidence(''); setAmount('');
      setNotice('Dispute opened. An administrator will review it.');
      await load();
      onChanged?.();
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3" aria-label="Disputes for this reservation">
      <div className="flex flex-wrap items-center gap-2">
        <Gavel className="h-4 w-4 text-violet-700" aria-hidden="true" />
        <h4 className="text-sm font-black">Disputes</h4>
        {active && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
            {active.status.replaceAll('_', ' ')}
          </span>
        )}
      </div>

      {disputes.length > 0 && (
        <ul className="space-y-2">
          {disputes.map((dispute) => (
            <li key={dispute.id} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{CATEGORIES.find((item) => item.value === dispute.category)?.label || dispute.category}</span>
                <span className="text-[11px] text-slate-500">opened by {dispute.openerRole} · {dispute.createdAt?.slice(0, 10)}</span>
              </div>
              <p className="mt-1 leading-5 text-slate-700 dark:text-slate-200">{dispute.reason}</p>
              {(dispute.evidence || []).length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {(dispute.evidence || []).map((item, index) => (
                    <li key={index} className="text-[11px] text-slate-500">Evidence: {item.reference || item.kind}{item.note ? ` — ${item.note}` : ''}</li>
                  ))}
                </ul>
              )}
              {dispute.amountInDisputePaise ? (
                <p className="mt-1 text-[11px] text-slate-600">Amount in dispute: {inr(dispute.amountInDisputePaise)}</p>
              ) : null}
              {dispute.resolution && (
                <p className="mt-1 rounded-lg bg-emerald-50 p-2 text-[11px] leading-5 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                  Resolution: {dispute.resolution}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!active && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            What went wrong?
            <select value={category} onChange={(event) => setCategory(event.target.value as PgDisputeCategory)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
              {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Amount in dispute (paise, optional)
            <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
            Reason (at least 10 characters)
            <textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
            Evidence reference (optional)
            <input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Screenshot reference, UTR, receipt number" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </label>
          <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void submit()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white disabled:opacity-50 sm:col-span-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
            Open dispute
          </button>
        </div>
      )}

      {audit.length > 0 && (
        <details className="rounded-xl border border-slate-200 p-2">
          <summary className="cursor-pointer text-[11px] font-bold text-slate-700">History ({audit.length})</summary>
          <ol className="mt-1 space-y-1">
            {audit.slice(0, 20).map((event) => (
              <li key={event.id} className="text-[11px] text-slate-600">
                <span className="font-bold">{event.action}</span> · {event.actorRole}
                {event.reason ? ` — ${event.reason}` : ''}
              </li>
            ))}
          </ol>
        </details>
      )}
      {notice && <p role="status" className="rounded-xl bg-violet-50 p-2 text-xs text-violet-900 dark:bg-violet-950/40 dark:text-violet-100">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
    </div>
  );
}

/**
 * The owner side of an offline collection: the owner declares that they took
 * the money at the property. An administrator still has to approve it.
 */
export function PgCollectionClaimPanel({ bookingId, totalDuePaise }: { bookingId: string; totalDuePaise: number }) {
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit() {
    setBusy(true); setError(''); setNotice('');
    try {
      await submitPgPaymentClaim(bookingId, {
        method,
        reference,
        note,
        amountPaise: totalDuePaise,
        evidence: [],
      });
      setReference(''); setNote('');
      setNotice('Collection declared. An administrator has to approve it before it counts as collected.');
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2" aria-label="Declare an offline collection">
      <h4 className="text-sm font-black">Declare money collected at the property</h4>
      <p className="text-[11px] leading-5 text-slate-500">
        This records what you collected in person. It is not a payment reconciled by BookOurSpace, and an administrator approves it.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          Method
          <select value={method} onChange={(event) => setMethod(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="cash">Cash</option>
            <option value="upi_to_owner">UPI to the owner</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          Reference (receipt or UTR)
          <input value={reference} onChange={(event) => setReference(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">
          Note
          <input value={note} onChange={(event) => setNote(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <button type="button" disabled={busy || reference.trim().length < 4} onClick={() => void submit()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 disabled:opacity-50 sm:col-span-2">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          Declare {inr(totalDuePaise)} collected
        </button>
      </div>
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
    </div>
  );
}

/**
 * The server-backed invoice / receipt.
 *
 * The document states the money state that PostgreSQL holds. A receipt for
 * an unpaid reservation is never presented as a paid receipt.
 */
export function PgInvoicePanel({ bookingId }: { bookingId: string }) {
  const [invoice, setInvoice] = useState<PgInvoice | null>(null);
  const [invoices, setInvoices] = useState<PgInvoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [current, all] = await Promise.all([fetchPgInvoice(bookingId), fetchPgInvoices(bookingId)]);
      setInvoice(current.invoice || null);
      setInvoices(all.invoices || []);
    } catch (cause) {
      setError(pgErrorMessage(cause));
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  async function refundReceipt() {
    setBusy(true); setError('');
    try {
      const result = await fetchPgInvoice(bookingId, 'refund_receipt');
      setInvoice(result.invoice || null);
      await load();
    } catch (cause) {
      setError(pgErrorMessage(cause));
    } finally { setBusy(false); }
  }

  if (!invoice) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-black">Invoice</h4>
        <button type="button" onClick={() => void load()} className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700">Load invoice</button>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2" aria-label="Invoice and receipts">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-violet-700" aria-hidden="true" />
        <h4 className="text-sm font-black">Invoice {invoice.invoiceNumber}</h4>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">{invoice.status.replaceAll('_', ' ')}</span>
      </div>
      <dl className="grid gap-1 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
        <div className="flex justify-between"><dt className="text-slate-500">Rent</dt><dd className="font-semibold">{inr(invoice.rentPaise)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Security deposit</dt><dd className="font-semibold">{inr(invoice.depositPaise)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd className="font-semibold">{invoice.taxApplied ? `${inr(invoice.taxPaise)} (${invoice.taxPercent}%)` : 'No tax applied'}</dd></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 text-sm dark:border-slate-700"><dt className="font-bold">Total</dt><dd className="font-black">{inr(invoice.totalPaise)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Paid by the provider</dt><dd className="font-semibold">{inr(invoice.providerPaidPaise)}</dd></div>
        {invoice.offlineCollectedPaise > 0 && (
          <div className="flex justify-between"><dt className="text-slate-500">Collected offline at the property</dt><dd className="font-semibold">{inr(invoice.offlineCollectedPaise)}</dd></div>
        )}
        {invoice.refundPaise > 0 && (
          <div className="flex justify-between"><dt className="text-slate-500">Refunded</dt><dd className="font-semibold">{inr(invoice.refundPaise)}</dd></div>
        )}
      </dl>
      <p className="rounded-xl bg-slate-100 p-2 text-[11px] leading-5 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {INVOICE_STATUS_COPY[invoice.status] || 'The money state recorded in PostgreSQL.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {invoice.status === 'refunded' && (
          <button type="button" disabled={busy} onClick={() => void refundReceipt()} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-[11px] font-bold text-slate-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Receipt className="h-3 w-3" aria-hidden="true" />}Refund receipt
          </button>
        )}
        <button type="button" onClick={() => void load()} className="min-h-9 rounded-lg border border-slate-300 px-3 text-[11px] font-bold text-slate-700">Refresh</button>
      </div>
      {invoices.length > 1 && (
        <details className="rounded-xl border border-slate-200 p-2">
          <summary className="cursor-pointer text-[11px] font-bold text-slate-700">All documents ({invoices.length})</summary>
          <ul className="mt-1 space-y-1">
            {invoices.map((item) => (
              <li key={item.id} className="text-[11px] text-slate-600">{item.invoiceNumber} · {item.kind.replaceAll('_', ' ')} · {item.status.replaceAll('_', ' ')}</li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
    </div>
  );
}
