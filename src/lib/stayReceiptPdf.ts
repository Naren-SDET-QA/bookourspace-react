import { Capacitor } from '@capacitor/core';
import type { StayReceipt } from './stayCheckoutClient';

const orange: [number, number, number] = [249, 115, 22];
const ink: [number, number, number] = [34, 34, 34];
const muted: [number, number, number] = [113, 113, 113];
const cream: [number, number, number] = [255, 247, 237];
export const BRAND_NAME = 'BookOurSpace';
export const BRAND_TAGLINE = 'FIND  •  BOOK  •  ENJOY';
export const BRAND_SUPPORT = 'support@bookourspace.in';

export function formatInrReceipt(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((Number(paise) || 0) / 100);
}

/** Opens a user-controlled mail composer; no mail is sent by the server. */
export function buildStayReceiptMailtoUrl(receipt: StayReceipt): string {
  const subject = `BookOurSpace booking confirmation | ${receipt.bookingId}`;
  const lines = [
    'BookOurSpace — Find · Book · Enjoy',
    '',
    `Booking ID: ${receipt.bookingId}`,
    `Hotel: ${receipt.hotelName}`,
    `Guest: ${receipt.guestName}`,
    `Email: ${receipt.guestEmail}`,
    `Mobile: ${receipt.guestPhone}`,
    `Check-in / check-out: ${receipt.checkIn} / ${receipt.checkOut}`,
    `Room: ${receipt.roomType} · ${receipt.units} room(s) · ${receipt.guests} guest(s) · ${receipt.nights} night(s)`,
    `Cancellation policy: ${String(receipt.cancellationPolicy || 'moderate').replace(/_/g, ' ')}`,
    `Payment: ${receipt.paymentMode} · ${receipt.paymentStatus}`,
    `Taxes: ${formatInrReceipt(receipt.taxesPaise)}`,
    `Discount: ${formatInrReceipt(receipt.discountPaise)}`,
    `Total: ${formatInrReceipt(receipt.totalPaise)}`,
    `Paid: ${formatInrReceipt(receipt.paidPaise)} · Balance due: ${formatInrReceipt(receipt.duePaise)}`,
    '',
    'This message contains booking details only. Use the app to download or share the branded PDF and booking QR.',
  ];
  return `mailto:${encodeURIComponent(receipt.guestEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export async function buildStayReceiptPdf(receipt: StayReceipt, qrDataUrl: string | null, logoDataUrl?: string | null): Promise<import('jspdf').jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.setProperties({
    title: `${BRAND_NAME} booking document`,
    subject: `${receipt.hotelName || 'Stay'} • ${receipt.bookingId}`,
    author: BRAND_NAME,
    creator: BRAND_NAME,
    keywords: `${BRAND_NAME}, booking, stay, receipt`,
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  let y = 0;

  // Branded header band. Brand name, tagline and support are always drawn,
  // so the document is branded even when the logo image cannot load.
  doc.setFillColor(...orange);
  doc.rect(0, 0, pageWidth, 108, 'F');
  if (logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin - 6, 14, 196, 44, 8, 8, 'F');
    doc.addImage(logoDataUrl, 'PNG', margin, 19, 182, 34);
  } else {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin - 6, 14, 196, 44, 8, 8, 'F');
    doc.setFillColor(...orange);
    doc.roundedRect(margin + 4, 20, 32, 32, 7, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('BOS', margin + 20, 41, { align: 'center' });
    doc.setTextColor(...ink);
    doc.setFontSize(13);
    doc.text(BRAND_NAME, margin + 44, 37);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(BRAND_TAGLINE, margin + 44, 48);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(BRAND_NAME, margin, 74);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(BRAND_TAGLINE, margin, 85);
  doc.text(BRAND_SUPPORT, margin, 95);
  const paid = receipt.paid && !receipt.refunded;
  const taxInvoice = Boolean(receipt.taxInvoice && receipt.gstin);
  const title = receipt.refunded
    ? 'REFUND RECEIPT'
    : taxInvoice
      ? 'TAX INVOICE'
      : paid
        ? 'PAYMENT RECEIPT'
        : 'BOOKING CONFIRMATION — PAYMENT DUE';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, pageWidth - margin, 40, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Issued ${formatDate(receipt.issuedAt)}`, pageWidth - margin, 55, { align: 'right' });
  doc.setFontSize(6.5);
  doc.text('Find a space. Book it. Enjoy it.', pageWidth - margin, 72, { align: 'right' });
  doc.text(BRAND_SUPPORT, pageWidth - margin, 84, { align: 'right' });
  y = 134;

  // QR block (top right) and booking identity (left)
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 104, y - 4, 104, 104);
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text('Scan at check-in', pageWidth - margin - 52, y + 114, { align: 'center' });
  }
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(receipt.hotelName || 'BookOurSpace stay', margin, y + 6, { maxWidth: pageWidth - margin * 2 - 130 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(doc.splitTextToSize(receipt.address || 'Address shared after booking', pageWidth - margin * 2 - 130), margin, y + 24);
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(receipt.taxInvoice ? `Tax invoice ${receipt.invoiceNumber || ''}` : `Booking reference ${receipt.bookingId}`, margin, y + 64);
  doc.setFont('helvetica', 'normal');
  doc.text(`Status: ${receipt.status.replace(/_/g, ' ')}  •  Payment: ${receipt.paymentStatus.replace(/_/g, ' ')}`, margin, y + 92);
  y += 132;

  // Guest + stay details
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;
  const col2 = pageWidth / 2 + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...orange);
  doc.text('Guest', margin, y);
  doc.text('Stay', col2, y);
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(receipt.guestName || 'Guest', margin, y + 16);
  doc.text(`Email: ${receipt.guestEmail || '—'}`, margin, y + 46, { maxWidth: pageWidth / 2 - margin - 24 });
  if (taxInvoice && receipt.guestAddress) doc.text(`Address: ${receipt.guestAddress}`, margin, y + 61, { maxWidth: pageWidth / 2 - margin - 24 });
  doc.text(`Phone: ${receipt.guestPhone || '—'}`, margin, y + 31);
  doc.text(`Room: ${receipt.roomType}`, col2, y + 16);
  doc.text(`Check-in: ${formatDate(receipt.checkIn)}`, col2, y + 31);
  doc.text(`Check-out: ${formatDate(receipt.checkOut)}`, col2, y + 46);
  doc.text(`${Math.max(1, receipt.nights)} night(s) • ${receipt.units} room(s) • ${receipt.guests} guest(s)`, col2, y + 61);
  doc.text(`Cancellation: ${String(receipt.cancellationPolicy || 'moderate').replace(/_/g, ' ')}`, col2, y + 76);
  y += 96;

  // Itemized table
  doc.setFillColor(247, 247, 247);
  doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Description', margin + 8, y + 16);
  doc.text('Amount', pageWidth - margin - 8, y + 16, { align: 'right' });
  y += 30;
  const rows: Array<[string, number, boolean?]> = [
    [`Room charges (${Math.max(1, receipt.nights)} night(s) × ${receipt.units} room(s))`, receipt.subtotalPaise],
    ...(receipt.cleaningFeePaise ? [['Cleaning fee', receipt.cleaningFeePaise] as [string, number]] : []),
    ...(receipt.serviceFeePaise ? [['Service fee', receipt.serviceFeePaise] as [string, number]] : []),
    ...(receipt.taxInvoice && receipt.cgstPaise ? [[`CGST (${(receipt.taxPercent || 0) / 2}%)`, receipt.cgstPaise] as [string, number]] : []),
    ...(receipt.taxInvoice && receipt.sgstPaise ? [[`SGST (${(receipt.taxPercent || 0) / 2}%)`, receipt.sgstPaise] as [string, number]] : []),
    ...(receipt.taxInvoice && receipt.igstPaise ? [[`IGST (${receipt.taxPercent}%)`, receipt.igstPaise] as [string, number]] : []),
    ...(receipt.taxesPaise && (!receipt.taxInvoice || (!receipt.cgstPaise && !receipt.sgstPaise && !receipt.igstPaise))
      ? [[`Taxes (${receipt.taxPercent}%)`, receipt.taxesPaise] as [string, number]]
      : []),
    ['Discount', -Math.max(0, receipt.discountPaise)],
  ];
  doc.setFont('helvetica', 'normal');
  for (const [label, amount] of rows) {
    doc.text(label, margin + 8, y);
    doc.text(formatInrReceipt(amount), pageWidth - margin - 8, y, { align: 'right' });
    y += 18;
  }
  doc.setDrawColor(210, 210, 210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;
  doc.setFillColor(...cream);
  doc.rect(margin, y - 13, pageWidth - margin * 2, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...orange);
  doc.text('Total', margin + 8, y);
  doc.text(formatInrReceipt(receipt.totalPaise), pageWidth - margin - 8, y, { align: 'right' });
  doc.setTextColor(...ink);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Paid', margin + 8, y);
  doc.text(formatInrReceipt(receipt.paidPaise), pageWidth - margin - 8, y, { align: 'right' });
  y += 16;
  doc.text('Balance due', margin + 8, y);
  doc.text(formatInrReceipt(receipt.duePaise), pageWidth - margin - 8, y, { align: 'right' });
  y += 16;
  if (receipt.refunded) {
    doc.text('Refunded', margin + 8, y);
    doc.text(formatInrReceipt(receipt.refundPaise), pageWidth - margin - 8, y, { align: 'right' });
    y += 16;
  }
  y += 14;

  if (!receipt.breakdownExact) {
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text('Itemization reflects the current published room price. The payable total is the server-confirmed booking amount.', margin, y, { maxWidth: pageWidth - margin * 2 });
    y += 22;
  }

  // Payment details
  doc.setTextColor(...orange);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Payment details', margin, y);
  doc.setTextColor(...ink);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const method = receipt.paymentMode === 'pay_after_service' ? 'Pay at hotel' : receipt.paymentMode === 'razorpay' ? 'Razorpay' : receipt.paymentMode === 'upi' ? 'UPI' : receipt.paymentMode;
  doc.text(`Method: ${method}`, margin, y);
  doc.text(`Status: ${receipt.paymentStatus.replace(/_/g, ' ')}`, col2, y);
  y += 16;
  doc.text(`Transaction reference: ${receipt.paymentReference || 'Not applicable — payment due at the property'}`, margin, y);
  y += 16;
  if (receipt.verifiedAt) {
    doc.text(`Verified: ${formatDate(receipt.verifiedAt)}`, margin, y);
    y += 16;
  }
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(paid ? 'PAID IN FULL' : 'PAYMENT PENDING', margin, y + 6);
  y += 34;

  // Branded footer band
  doc.setDrawColor(249, 214, 179);
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;
  doc.setFillColor(...cream);
  doc.rect(0, pageHeight - 62, pageWidth, 62, 'F');
  doc.setFillColor(...orange);
  doc.rect(0, pageHeight - 62, pageWidth, 3, 'F');
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(BRAND_NAME, margin, pageHeight - 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...muted);
  doc.text(`${BRAND_TAGLINE}   •   ${BRAND_SUPPORT}`, margin, pageHeight - 31);
  doc.text('Find, book and enjoy verified spaces across India.', margin, pageHeight - 21);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, pageWidth - margin, pageHeight - 21, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  const gstLines = [
    taxInvoice ? `Supplier: ${receipt.gstLegalName}` : '',
    taxInvoice ? `Supplier address: ${receipt.gstSupplierAddress}` : '',
    taxInvoice ? `GSTIN: ${receipt.gstin}` : 'This is a booking confirmation/payment receipt, not a GST tax invoice.',
    taxInvoice && receipt.placeOfSupply ? `Place of supply: ${receipt.placeOfSupply}` : '',
    taxInvoice && receipt.sacCode ? `SAC: ${receipt.sacCode} (Hotel accommodation services)` : '',
    taxInvoice ? 'Tax invoice issued after verified settlement and verified supplier/tax configuration.' : 'A GST tax invoice is issued only when verified supplier details, applicable tax rules and invoice requirements are configured.',
    'This is a computer-generated document. Unpaid documents are booking confirmations, not paid receipts.',
    'BookOurSpace • support@bookourspace.in • Prices in Indian Rupees (INR).',
  ].filter(Boolean);
  gstLines.forEach((line, index) => {
    doc.text(line, margin, y + index * 10, { maxWidth: pageWidth - margin * 2 });
  });
  doc.text('Page 1 of 1', pageWidth - margin, pageHeight - 31, { align: 'right' });

  return doc;
}

async function shareNativePdf(blob: Blob, filename: string): Promise<void> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const saved = await Filesystem.writeFile({ path: filename, data: btoa(binary), directory: Directory.Cache });
  await Share.share({ title: 'BookOurSpace receipt', text: 'Booking receipt PDF', url: saved.uri, dialogTitle: 'Save or share receipt' });
}

export async function downloadStayReceipt(receipt: StayReceipt, qrDataUrl: string | null, logoDataUrl?: string | null): Promise<void> {
  const doc = await buildStayReceiptPdf(receipt, qrDataUrl, logoDataUrl);
  const filename = `BookOurSpace-${receipt.bookingId}.pdf`;
  if (Capacitor.isNativePlatform()) {
    await shareNativePdf(doc.output('blob'), filename);
    return;
  }
  doc.save(filename);
}

export async function printStayReceipt(receipt: StayReceipt, qrDataUrl: string | null, logoDataUrl?: string | null): Promise<void> {
  const doc = await buildStayReceiptPdf(receipt, qrDataUrl, logoDataUrl);
  if (Capacitor.isNativePlatform()) {
    // Print preview is not exposed by WKWebView/Android WebView for blobs.
    // Use the native share/save sheet so the PDF can be opened in a print app.
    await shareNativePdf(doc.output('blob'), `BookOurSpace-${receipt.bookingId}.pdf`);
    return;
  }
  doc.autoPrint();
  const url = doc.output('bloburl');
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function shareStayReceipt(receipt: StayReceipt, qrDataUrl: string | null, logoDataUrl?: string | null): Promise<boolean> {
  const doc = await buildStayReceiptPdf(receipt, qrDataUrl, logoDataUrl);
  const blob = doc.output('blob');
  if (Capacitor.isNativePlatform()) {
    await shareNativePdf(blob, `BookOurSpace-${receipt.bookingId}.pdf`);
    return true;
  }
  const file = new File([blob], `BookOurSpace-${receipt.bookingId}.pdf`, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
  if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
    await nav.share({ title: 'BookOurSpace booking receipt', text: `Booking ${receipt.bookingId}`, files: [file] });
    return true;
  }
  doc.save(`BookOurSpace-${receipt.bookingId}.pdf`);
  return false;
}


export async function loadReceiptLogo(): Promise<string | null> {
  try {
    const response = await fetch('/assets/brand/bos-logo-lockup.webp');
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await new Promise<string | null>((resolve) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) { resolve(null); return; }
          context.drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = () => resolve(null);
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}
