import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Loader2, Mail, Printer, Share2, X } from 'lucide-react';
import { fetchStayBookingReceipt, formatPaise, type StayReceipt } from '../../lib/stayCheckoutClient';
import { BRAND_NAME, BRAND_SUPPORT, BRAND_TAGLINE, buildStayReceiptMailtoUrl, downloadStayReceipt, loadReceiptLogo, printStayReceipt, shareStayReceipt } from '../../lib/stayReceiptPdf';

export function StayReceiptModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [receipt, setReceipt] = useState<StayReceipt | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'download' | 'print' | 'share' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadReceiptLogo().then((logo) => { if (!cancelled) setLogoDataUrl(logo); });
    void fetchStayBookingReceipt(bookingId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError((result as { message?: string }).message || 'The receipt could not be loaded.');
        return;
      }
      setReceipt(result.receipt);
      setQrToken(result.qrToken);
    });
    return () => { cancelled = true; };
  }, [bookingId]);

  const qrDataUrl = () => {
    try { return qrRef.current?.toDataURL('image/png') || null; } catch { return null; }
  };

  const run = async (kind: 'download' | 'print' | 'share') => {
    if (!receipt) return;
    setBusy(kind);
    setError('');
    try {
      // The logo is part of the document, not decoration. Attempt a fresh load
      // if the modal was used before the first fetch resolved or it failed.
      const logo = logoDataUrl ?? (await loadReceiptLogo());
      if (logo && !logoDataUrl) setLogoDataUrl(logo);
      const qr = qrDataUrl();
      if (kind === 'download') await downloadStayReceipt(receipt, qr, logo);
      else if (kind === 'print') await printStayReceipt(receipt, qr, logo);
      else {
        const shared = await shareStayReceipt(receipt, qr, logo);
        setNotice(shared ? 'Receipt shared.' : 'Sharing is unavailable on this device, so the PDF was downloaded instead.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The PDF could not be generated.');
    } finally {
      setBusy(null);
    }
  };

  const paid = Boolean(receipt?.paid) && !receipt?.refunded;
  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Booking receipt" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 text-[#222222] shadow-2xl sm:rounded-2xl dark:bg-slate-950 dark:text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <img src="/assets/brand/bos-logo-lockup.webp" alt="BookOurSpace" className="mb-2 h-8 w-auto object-contain object-left" />
            <p className="text-xl font-semibold">{receipt?.taxInvoice ? 'GST tax invoice' : paid ? 'Payment receipt' : 'Booking confirmation'}</p>
            <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">{receipt?.taxInvoice ? 'GST-compliant tax invoice after verified settlement.' : paid ? 'Paid amount, taxes and transaction reference.' : 'This is a booking confirmation, not a paid receipt. Payment is still due.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close receipt" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dddddd] dark:border-slate-700"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>

        {loading && <div className="mt-8 flex items-center justify-center gap-2 text-sm text-[#717171]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparing your document…</div>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

        {receipt && (
          <>
            <div className="mt-5 rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{receipt.hotelName}</p>
                  <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">{receipt.address}</p>
                  <p className="mt-2 font-mono text-xs">{receipt.taxInvoice ? `Tax invoice ${receipt.invoiceNumber}` : `Booking reference ${receipt.bookingId}`}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#717171]">{receipt.bookingId}</p>
                  <p className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{paid ? 'PAID IN FULL' : 'BOOKING CONFIRMED — PAYMENT DUE'}</p>
                </div>
                <div className="text-center">
                  {qrToken && (
                    <div className="inline-flex h-[168px] w-[168px] items-center justify-center rounded-lg border border-[#ebebeb] bg-white p-1">
                      <QRCodeCanvas ref={qrRef} value={qrToken} size={160} level="M" includeMargin bgColor="#ffffff" fgColor="#111111" />
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-[#717171]">Square booking QR · show at check-in</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 border-t border-[#ebebeb] pt-4 text-sm sm:grid-cols-2 dark:border-slate-800">
                <p><span className="text-[#717171] dark:text-slate-400">Guest: </span>{receipt.guestName}</p>
                <p className="break-all"><span className="text-[#717171] dark:text-slate-400">Email: </span>{receipt.guestEmail}</p>
                <p><span className="text-[#717171] dark:text-slate-400">Mobile: </span>{receipt.guestPhone}</p>
                <p><span className="text-[#717171] dark:text-slate-400">Room: </span>{receipt.roomType} ({receipt.units} room)</p>
                <p><span className="text-[#717171] dark:text-slate-400">Guests: </span>{receipt.guests}</p>
                <p><span className="text-[#717171] dark:text-slate-400">Check-in: </span>{receipt.checkIn}</p>
                <p><span className="text-[#717171] dark:text-slate-400">Check-out: </span>{receipt.checkOut}</p>
                <p className="sm:col-span-2"><span className="text-[#717171] dark:text-slate-400">Cancellation: </span>{String(receipt.cancellationPolicy || 'moderate').replace(/_/g, ' ')}</p>
                {receipt.taxInvoice && receipt.guestAddress && <p className="sm:col-span-2"><span className="text-[#717171] dark:text-slate-400">Invoice address: </span>{receipt.guestAddress}</p>}
              </div>
              <div className="mt-4 space-y-1.5 border-t border-[#ebebeb] pt-4 text-sm dark:border-slate-800">
                <div className="flex justify-between"><span>Room charges ({receipt.nights} nights × {receipt.units})</span><span>{formatPaise(receipt.subtotalPaise)}</span></div>
                {receipt.cleaningFeePaise > 0 && <div className="flex justify-between"><span>Cleaning fee</span><span>{formatPaise(receipt.cleaningFeePaise)}</span></div>}
                {receipt.serviceFeePaise > 0 && <div className="flex justify-between"><span>Service fee</span><span>{formatPaise(receipt.serviceFeePaise)}</span></div>}
                {receipt.taxInvoice && receipt.cgstPaise ? <div className="flex justify-between"><span>CGST</span><span>{formatPaise(receipt.cgstPaise)}</span></div> : null}
                {receipt.taxInvoice && receipt.sgstPaise ? <div className="flex justify-between"><span>SGST</span><span>{formatPaise(receipt.sgstPaise)}</span></div> : null}
                {receipt.taxInvoice && receipt.igstPaise ? <div className="flex justify-between"><span>IGST</span><span>{formatPaise(receipt.igstPaise)}</span></div> : null}
                {receipt.taxesPaise > 0 && (!receipt.taxInvoice || (!receipt.cgstPaise && !receipt.sgstPaise && !receipt.igstPaise)) && <div className="flex justify-between"><span>Taxes ({receipt.taxPercent}%)</span><span>{formatPaise(receipt.taxesPaise)}</span></div>}
                {receipt.discountPaise > 0 && <div className="flex justify-between"><span>Discount</span><span>−{formatPaise(receipt.discountPaise)}</span></div>}
                <div className="flex justify-between border-t border-[#ebebeb] pt-2 font-semibold dark:border-slate-800"><span>Total</span><span>{formatPaise(receipt.totalPaise)}</span></div>
                <div className="flex justify-between"><span>Paid</span><span>{formatPaise(receipt.paidPaise)}</span></div>
                <div className="flex justify-between"><span>Balance due</span><span>{formatPaise(receipt.duePaise)}</span></div>
                {receipt.refunded && <div className="flex justify-between"><span>Refunded</span><span>{formatPaise(receipt.refundPaise)}</span></div>}
              </div>
              <p className="mt-3 text-[11px] text-[#717171] dark:text-slate-400">
                {receipt.paymentMode === 'pay_after_service' ? 'Pay at Hotel' : receipt.paymentMode} · {receipt.paymentStatus.replace(/_/g, ' ')} · Reference: {receipt.paymentReference || 'not applicable'}
              </p>
              <p className="mt-1 text-[11px] text-[#717171] dark:text-slate-400">
                {receipt.taxInvoice ? `Supplier ${receipt.gstLegalName} · ${receipt.gstSupplierAddress} · GSTIN ${receipt.gstin} · SAC ${receipt.sacCode} · ${receipt.placeOfSupply}` : 'This branded document is a booking confirmation/payment receipt. A GST tax invoice is issued only when verified supplier and tax requirements are configured.'}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { window.location.href = buildStayReceiptMailtoUrl(receipt); setNotice('Your email app is opening. Attach the downloaded PDF if you want to include it.'); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#dddddd] px-4 text-sm font-semibold dark:border-slate-700">
                <Mail className="h-4 w-4" aria-hidden="true" /> Email details
              </button>
              <button type="button" onClick={() => void run('download')} disabled={busy !== null} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#f97316] px-4 text-sm font-semibold text-white disabled:opacity-60">
                {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />} Download PDF
              </button>
              <button type="button" onClick={() => void run('print')} disabled={busy !== null} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#dddddd] px-4 text-sm font-semibold disabled:opacity-60 dark:border-slate-700">
                {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />} Print
              </button>
              <button type="button" onClick={() => void run('share')} disabled={busy !== null} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#dddddd] px-4 text-sm font-semibold disabled:opacity-60 dark:border-slate-700">
                {busy === 'share' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />} Share
              </button>
            </div>
            {notice && <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{notice}</p>}
          </>
        )}
      </div>
    </div>
  );
}
