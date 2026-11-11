import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import {
  sendTransactionalEmail,
  type TransactionalEmailInput,
  type TransactionalEmailResult,
} from './resendEmail';
import { buildStayInvoicePdf } from './invoicePdf';

export type PgQaSampleKind = 'confirmation' | 'cancellation' | 'invoice_offer' | 'alert';

export interface PgQaSampleDetails {
  recipient: string;
  bookingId: string;
  guestName: string;
  propertyName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  amountPaise: number;
}

export interface PgQaSampleDispatcher {
  env?: NodeJS.ProcessEnv;
  send?: typeof sendTransactionalEmail;
}

const logoPath = fileURLToPath(new URL('../../public/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp', import.meta.url));
const barcodePath = fileURLToPath(new URL('../../public/assets/brand/bos-booking-barcode-brand.png', import.meta.url));
let logoPromise: Promise<Buffer | null> | undefined;
let barcodePromise: Promise<Buffer | null> | undefined;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(paise: number): string {
  return `₹${(Math.max(0, Number(paise) || 0) / 100).toFixed(2)}`;
}

function loadLogo(): Promise<Buffer | null> {
  logoPromise ||= readFile(path.resolve(logoPath))
    .then((source) => sharp(source).png().toBuffer())
    .catch(() => null);
  return logoPromise;
}

function loadBarcode(): Promise<Buffer | null> {
  barcodePromise ||= readFile(path.resolve(barcodePath)).catch(() => null);
  return barcodePromise;
}

function copy(kind: PgQaSampleKind, details: PgQaSampleDetails): { subject: string; title: string; message: string; status: string } {
  if (kind === 'confirmation') return {
    subject: `PG booking confirmed: ${details.propertyName}`,
    title: 'PG booking confirmed',
    message: 'Your PG booking is confirmed for the QA sample stay below.',
    status: 'Confirmed',
  };
  if (kind === 'cancellation') return {
    subject: `PG booking cancelled: ${details.propertyName}`,
    title: 'PG booking cancelled',
    message: 'This sample booking has been cancelled. The attached barcode is for QA only and is not valid for check-in.',
    status: 'Cancelled',
  };
  if (kind === 'invoice_offer') return {
    subject: `PG invoice & offer: ${details.propertyName}`,
    title: 'PG invoice and offer',
    message: 'Here is a sample booking invoice with a development-only offer preview.',
    status: 'Sample offer · not payable',
  };
  return {
    subject: `BookOurSpace PG alert: check-in ${details.checkIn}`,
    title: 'PG booking alert',
    message: 'Upcoming check-in alert for the sample booking. Use the branded barcode only in the development QA flow.',
    status: 'QA alert',
  };
}

function htmlTemplate(kind: PgQaSampleKind, details: PgQaSampleDetails, logoSrc: string, barcodeSrc: string): string {
  const item = copy(kind, details);
  const offer = kind === 'invoice_offer'
    ? '<div style="margin:18px 0;padding:14px 16px;border:1px solid #fed7aa;border-radius:10px;background:#fff7ed;color:#9a3412"><strong>Development offer preview:</strong> 10% sample partner offer. No payment is due and no offer is redeemable.</div>'
    : '';
  return `<div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #dbe3ef;border-radius:16px;overflow:hidden"><div style="background:#0f766e;padding:22px 28px;color:#fff"><img src="${escapeHtml(logoSrc)}" alt="BookOurSpace" style="display:block;width:220px;max-width:100%;height:auto;background:#fff;border-radius:8px;padding:6px"><div style="font-size:13px;margin-top:12px;opacity:.9">PG booking · development QA sample</div></div><div style="padding:28px"><p style="font-size:16px;margin-top:0">Hi ${escapeHtml(details.guestName)},</p><h1 style="font-size:24px;margin:0 0 10px;color:#0f766e">${escapeHtml(item.title)}</h1><p>${escapeHtml(item.message)}</p>${offer}<table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="padding:9px 0;color:#667085">Property</td><td style="padding:9px 0;text-align:right">${escapeHtml(details.propertyName)}</td></tr><tr><td style="padding:9px 0;color:#667085">Room</td><td style="padding:9px 0;text-align:right">${escapeHtml(details.roomType)}</td></tr><tr><td style="padding:9px 0;color:#667085">Check-in</td><td style="padding:9px 0;text-align:right">${escapeHtml(details.checkIn)}</td></tr><tr><td style="padding:9px 0;color:#667085">Check-out</td><td style="padding:9px 0;text-align:right">${escapeHtml(details.checkOut)}</td></tr><tr><td style="padding:9px 0;color:#667085">Booking ID</td><td style="padding:9px 0;text-align:right">${escapeHtml(details.bookingId)}</td></tr><tr><td style="padding:9px 0;color:#667085">Amount</td><td style="padding:9px 0;text-align:right;font-weight:700">${escapeHtml(money(details.amountPaise))}</td></tr></table><div style="text-align:center;margin:24px 0 10px"><img src="${escapeHtml(barcodeSrc)}" alt="BookOurSpace booking barcode" style="width:220px;height:236px;border:8px solid #fff;box-shadow:0 0 0 1px #dbe3ef;border-radius:12px;object-fit:contain"><p style="font-size:12px;color:#667085;margin-bottom:0">${kind === 'cancellation' ? 'Cancelled sample barcode · not valid for entry' : 'Branded QA booking barcode · sample only'}</p></div><p style="font-size:12px;color:#667085">Status: <strong>${escapeHtml(item.status)}</strong>. This message was sent only for development testing.</p></div><div style="border-top:1px solid #dbe3ef;padding:18px 28px;font-size:12px;color:#667085">BookOurSpace · info@mail.bookourspace.com · support@bookourspace.in</div></div></div>`;
}

export async function buildPgQaSampleEmail(kind: PgQaSampleKind, details: PgQaSampleDetails): Promise<TransactionalEmailInput> {
  const item = copy(kind, details);
  const logo = await loadLogo();
  const barcode = await loadBarcode();
  if (!logo) throw new Error('BOOKOURSPACE_LOGO_MISSING');
  if (!barcode) throw new Error('BOOKOURSPACE_BARCODE_MISSING');
  // Use the matching inline attachment content IDs. Data URLs are blocked by
  // common mail clients and were the cause of the broken branded images.
  const logoSrc = 'cid:bos-logo';
  const barcodeSrc = 'cid:bos-qr';
  const attachments: NonNullable<TransactionalEmailInput['attachments']> = [
    { filename: 'BookOurSpace-Brand-Logo.png', content: logo, contentType: 'image/png', contentId: 'bos-logo' },
    { filename: `BookOurSpace-PG-${kind}-Barcode.png`, content: barcode, contentType: 'image/png', contentId: 'bos-qr' },
  ];
  if (kind === 'invoice_offer' || kind === 'confirmation') {
    const pdf = await buildStayInvoicePdf({
      invoiceNumber: `BOS-PG-QA-${details.bookingId}`,
      bookingId: details.bookingId,
      guestName: details.guestName,
      recipient: details.recipient,
      propertyName: details.propertyName,
      roomType: details.roomType,
      checkIn: details.checkIn,
      checkOut: details.checkOut,
      totalPaise: details.amountPaise,
      paymentStatus: kind === 'confirmation' ? 'sample verified' : 'sample offer — not payable',
      paymentReference: 'QA-SAMPLE-NOT-A-LIVE-PAYMENT',
    });
    attachments.push({
      filename: `BookOurSpace-PG-${kind}-Invoice.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    });
  }
  const text = [
    `Hi ${details.guestName},`,
    '',
    item.title,
    item.message,
    `Property: ${details.propertyName}`,
    `Room: ${details.roomType}`,
    `Check-in: ${details.checkIn}`,
    `Check-out: ${details.checkOut}`,
    `Booking ID: ${details.bookingId}`,
    `Amount: ${money(details.amountPaise)}`,
    `Status: ${item.status}`,
    '',
    'The supplied BookOurSpace-branded barcode is attached for the development QA sample.',
    'This message is not a live booking, invoice, payment request, or production alert.',
  ].join('\n');
  return {
    to: details.recipient,
    subject: `BookOurSpace | ${item.subject}`,
    text,
    html: htmlTemplate(kind, details, logoSrc, barcodeSrc),
    attachments,
    idempotencyKey: `pg-qa-sample:${kind}:${details.bookingId}`,
    explicitAuthorization: true,
    developmentOnlyTest: true,
  };
}

export async function sendPgQaSampleEmail(kind: PgQaSampleKind, details: PgQaSampleDetails, options: PgQaSampleDispatcher = {}): Promise<TransactionalEmailResult> {
  return (options.send || sendTransactionalEmail)(await buildPgQaSampleEmail(kind, details), options.env || process.env);
}

export async function sendPgQaSampleEmails(details: PgQaSampleDetails, options: PgQaSampleDispatcher = {}): Promise<TransactionalEmailResult[]> {
  const kinds: PgQaSampleKind[] = ['confirmation', 'cancellation', 'invoice_offer', 'alert'];
  const results: TransactionalEmailResult[] = [];
  for (const kind of kinds) results.push(await sendPgQaSampleEmail(kind, details, options));
  return results;
}
