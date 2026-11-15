/**
 * Pure barcode identifiers shared by booking cards and the lazy barcode UI.
 * Keep this module dependency-free so ordinary customer screens do not pull
 * the QR rendering and verification surface into the initial bundle.
 */
export function generateBosBarcodeId(
  prefix: 'BOS' | 'TKT' | 'PASS' | 'UPI' | 'GST' | 'REQ' = 'BOS',
  rawId: string = '0001',
  categoryOrSection?: string,
): string {
  const cleanId = String(rawId || '1001')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(-6)
    .padStart(6, '0');

  const sec = String(categoryOrSection || '').toLowerCase();
  let secCode = 'GEN';
  if (sec.includes('pg') || sec.includes('hostel')) secCode = 'PGH';
  else if (sec.includes('class') || sec.includes('course') || sec.includes('cat-15') || sec.includes('cat-16')) secCode = 'CLS';
  else if (sec.includes('venue') || sec.includes('hall') || sec.includes('cat-29') || sec.includes('cat-30')) secCode = 'VEN';
  else if (sec.includes('hotel') || sec.includes('stay')) secCode = 'HTL';
  else if (sec.includes('movie') || sec.includes('cinema')) secCode = 'MOV';
  else if (sec.includes('service') || sec.includes('cat-')) secCode = 'SRV';
  else if (sec.includes('gst') || sec.includes('pay')) secCode = 'FIN';
  else if (sec.includes('prov') || sec.includes('req')) secCode = 'PRV';

  let hash = 0;
  const combined = `${prefix}${secCode}${cleanId}`;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) % 97;
  }
  return `${prefix}-${secCode}-${cleanId}-${String(hash).padStart(2, '0')}`;
}

/** Returns the localized/human-friendly pass label for a module. */
export function getBarcodePassTitle(categoryOrSection?: string): string {
  const sec = String(categoryOrSection || '').toLowerCase();
  if (sec.includes('movie')) return '🎬 Cinema M-Ticket & Seat Entry Barcode';
  if (sec.includes('hotel') || sec.includes('stay')) return '🏨 Express Hotel Check-In Voucher Barcode';
  if (sec.includes('pg') || sec.includes('hostel')) return '🏠 PG / Hostel Resident Gate Pass Barcode';
  if (sec.includes('class') || sec.includes('course')) return '🎓 Student Batch Admit & Demo Pass Barcode';
  if (sec.includes('venue') || sec.includes('hall')) return '🏛️ Function Hall & Event Entry Pass Barcode';
  if (sec.includes('gst') || sec.includes('pay')) return '🧾 Official GST Tax Invoice Barcode';
  if (sec.includes('prov') || sec.includes('req')) return '🛡️ Provider Registration Tracking Barcode';
  return '🛠️ Verified Service Job & Booking Pass Barcode';
}
