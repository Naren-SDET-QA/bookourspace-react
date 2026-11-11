import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { jsPDF } from 'jspdf';

export const BOOKOURSPACE_BRAND_NAME = 'BookOurSpace';
export const BOOKOURSPACE_SUPPORT_EMAIL = 'support@bookourspace.in';

export interface StayInvoicePdfDetails {
  invoiceNumber: string;
  bookingId: string;
  guestName: string;
  recipient: string;
  propertyName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  totalPaise: number;
  paymentStatus: string;
  paymentReference?: string | null;
}

const orange: [number, number, number] = [249, 115, 22];
const ink: [number, number, number] = [34, 34, 34];
const muted: [number, number, number] = [100, 100, 100];
const cream: [number, number, number] = [255, 247, 237];
const logoPath = fileURLToPath(new URL('../../public/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp', import.meta.url));
let logoPngPromise: Promise<Buffer | null> | undefined;

function loadLogoPng(): Promise<Buffer | null> {
  logoPngPromise ||= readFile(path.resolve(logoPath))
    .then((source) => sharp(source).png().toBuffer())
    .catch(() => null);
  return logoPngPromise;
}

function text(value: unknown, fallback = '—'): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function money(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number(paise) || 0) / 100);
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return text(value);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

/** Create the same branded, open-source jsPDF receipt style used by the stay UI. */
export async function buildStayInvoicePdf(details: StayInvoicePdfDetails): Promise<Buffer> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const total = money(details.totalPaise);
  const logo = await loadLogoPng();

  doc.setProperties({
    title: `${BOOKOURSPACE_BRAND_NAME} invoice ${details.invoiceNumber}`,
    subject: `${text(details.propertyName)} • ${text(details.bookingId)}`,
    author: BOOKOURSPACE_BRAND_NAME,
    creator: BOOKOURSPACE_BRAND_NAME,
    keywords: `${BOOKOURSPACE_BRAND_NAME}, booking, invoice, receipt`,
  });

  doc.setFillColor(...orange);
  doc.rect(0, 0, pageWidth, 108, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin - 6, 14, 196, 44, 8, 8, 'F');
  if (logo) {
    doc.addImage(new Uint8Array(logo), 'PNG', margin, 19, 182, 34);
  } else {
    doc.setFillColor(...orange);
    doc.roundedRect(margin + 4, 20, 32, 32, 7, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('BOS', margin + 20, 41, { align: 'center' });
    doc.setTextColor(...ink);
    doc.setFontSize(13);
    doc.text(BOOKOURSPACE_BRAND_NAME, margin + 44, 37);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(BOOKOURSPACE_BRAND_NAME, margin, 74);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('FIND  •  BOOK  •  ENJOY', margin, 85);
  doc.text(BOOKOURSPACE_SUPPORT_EMAIL, margin, 95);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BOOKING INVOICE / RECEIPT', pageWidth - margin, 40, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Invoice ${text(details.invoiceNumber)}`, pageWidth - margin, 56, { align: 'right' });
  doc.text(`Issued ${formatDate(new Date().toISOString())}`, pageWidth - margin, 70, { align: 'right' });

  let y = 140;
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(text(details.propertyName, 'BookOurSpace stay'), margin, y);
  y += 28;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Booking ID: ${text(details.bookingId)}`, margin, y);
  doc.text(`Invoice #: ${text(details.invoiceNumber)}`, pageWidth - margin, y, { align: 'right' });
  y += 28;

  doc.setDrawColor(230, 230, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;
  const column = pageWidth / 2 + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...orange);
  doc.text('Guest', margin, y);
  doc.text('Stay details', column, y);
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(text(details.guestName, 'Guest'), margin, y + 18);
  doc.text(`Email: ${text(details.recipient)}`, margin, y + 34, { maxWidth: pageWidth / 2 - margin - 24 });
  doc.text(`Room: ${text(details.roomType, 'Room')}`, column, y + 18);
  doc.text(`Check-in: ${formatDate(details.checkIn)}`, column, y + 34);
  doc.text(`Check-out: ${formatDate(details.checkOut)}`, column, y + 50);
  y += 86;

  doc.setFillColor(247, 247, 247);
  doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text('Description', margin + 8, y + 16);
  doc.text('Amount', pageWidth - margin - 8, y + 16, { align: 'right' });
  y += 34;
  doc.setFont('helvetica', 'normal');
  doc.text(`Stay booking — ${text(details.propertyName, 'BookOurSpace stay')}`, margin + 8, y, { maxWidth: pageWidth - margin * 2 - 150 });
  doc.text(total, pageWidth - margin - 8, y, { align: 'right' });
  y += 24;
  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;
  doc.setFillColor(...cream);
  doc.rect(margin, y - 16, pageWidth - margin * 2, 28, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...orange);
  doc.text('Total', margin + 8, y + 2);
  doc.text(total, pageWidth - margin - 8, y + 2, { align: 'right' });
  y += 38;
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Payment status: ${text(details.paymentStatus, 'verified').replace(/_/g, ' ')}`, margin, y);
  if (details.paymentReference) doc.text(`Payment reference: ${text(details.paymentReference)}`, margin, y + 16);
  y += details.paymentReference ? 42 : 26;
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('This computer-generated document reflects the server-confirmed booking amount.', margin, y, { maxWidth: pageWidth - margin * 2 });

  doc.setFillColor(...cream);
  doc.rect(0, pageHeight - 62, pageWidth, 62, 'F');
  doc.setFillColor(...orange);
  doc.rect(0, pageHeight - 62, pageWidth, 3, 'F');
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(BOOKOURSPACE_BRAND_NAME, margin, pageHeight - 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...muted);
  doc.text(`FIND  •  BOOK  •  ENJOY   •   ${BOOKOURSPACE_SUPPORT_EMAIL}`, margin, pageHeight - 30);
  doc.text('Prices in Indian Rupees (INR).', margin, pageHeight - 19);
  doc.text('Page 1 of 1', pageWidth - margin, pageHeight - 30, { align: 'right' });

  return Buffer.from(doc.output('arraybuffer'));
}
