import { useState } from 'react';
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react';
import { issueTrackingShareLink } from '../../lib/deliveryTrackingClient';
import {
  buildTrackingShareMessage,
  trackingUrlContainsSecrets,
  whatsappShareHref,
} from '../../lib/trackingShare';
import { trackingStatusLabel, type DeliveryStatus } from '../../lib/deliveryTracking';

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the execCommand path used on older iOS Safari.
  }
  try {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', 'true');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

export function TrackingShareBar({
  bookingId,
  bookingRef,
  status,
  shareStateLabel,
  lastGpsLabel,
}: {
  bookingId: string;
  bookingRef: string;
  status: DeliveryStatus;
  shareStateLabel: string;
  lastGpsLabel: string;
}) {
  const [url, setUrl] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const ensureLink = async () => {
    if (url && !trackingUrlContainsSecrets(url)) return url;
    setBusy(true);
    setError('');
    try {
      const issued = await issueTrackingShareLink(bookingId, optIn);
      if (!issued.url || trackingUrlContainsSecrets(issued.url)) {
        throw new Error('TRACKING_LINK_INVALID');
      }
      setUrl(issued.url);
      return issued.url;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'TRACKING_LINK_UNAVAILABLE';
      setError(message);
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    try {
      const link = await ensureLink();
      const ok = await copyText(link);
      setFeedback(ok ? 'Tracking link copied' : 'Copy is unavailable on this browser');
    } catch {
      setFeedback('');
    }
  };

  const onShare = async () => {
    try {
      const link = await ensureLink();
      const message = buildTrackingShareMessage({
        bookingRef,
        trackingUrl: link,
        statusLabel: trackingStatusLabel(status),
      });
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'BookOurSpace tracking', text: message, url: link });
        setFeedback('Tracking link shared');
        return;
      }
      const ok = await copyText(message);
      setFeedback(ok ? 'Sharing is unavailable. The tracking message was copied instead.' : 'Sharing is unavailable on this browser');
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      setFeedback('');
    }
  };

  const onWhatsApp = async () => {
    try {
      const link = await ensureLink();
      const message = buildTrackingShareMessage({
        bookingRef,
        trackingUrl: link,
        statusLabel: trackingStatusLabel(status),
      });
      window.open(whatsappShareHref(message), '_blank', 'noopener,noreferrer');
      setFeedback('WhatsApp opened with the tracking message');
    } catch {
      setFeedback('');
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/20" aria-label="Share tracking link">
      <p className="text-[10px] font-black uppercase tracking-wide text-violet-700">Share live tracking</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        <div>
          <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">Booking</dt>
          <dd className="truncate font-black text-[#1f1650] dark:text-white">{bookingRef}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">Status</dt>
          <dd className="font-black text-[#1f1650] dark:text-white">{shareStateLabel}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">Last GPS update</dt>
          <dd>{lastGpsLabel}</dd>
        </div>
      </dl>
      <label className="mt-2 flex items-start gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={optIn} onChange={(event) => setOptIn(event.target.checked)} className="mt-0.5" />
        Send WhatsApp booking updates to the phone on this booking. Location coordinates are never placed in the link.
      </label>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => void onCopy()} disabled={busy} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-[#5b21b6] text-[11px] font-black text-white disabled:opacity-50">
          {feedback.startsWith('Tracking link copied') ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy Tracking Link
        </button>
        <button type="button" onClick={() => void onShare()} disabled={busy} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-violet-300 bg-white text-[11px] font-black text-violet-800 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-100 disabled:opacity-50">
          <Share2 className="h-3.5 w-3.5" /> Share Tracking Link
        </button>
        <button type="button" onClick={() => void onWhatsApp()} disabled={busy} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-[#25D366] text-[11px] font-black text-white disabled:opacity-50">
          <MessageCircle className="h-3.5 w-3.5" /> Share on WhatsApp
        </button>
      </div>
      {feedback && <p role="status" className="mt-2 text-[10px] font-semibold text-emerald-700">{feedback}</p>}
      {error && <p role="alert" className="mt-2 text-[10px] font-semibold text-rose-600">{error}</p>}
    </section>
  );
}

export default TrackingShareBar;
