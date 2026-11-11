import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
import sharp from 'sharp';

const logoPath = fileURLToPath(new URL('../../public/assets/brand/bos-logo-lockup-560-5771e9b215e6.webp', import.meta.url));
let logoPngPromise: Promise<Buffer | null> | undefined;

async function loadLogoPng(): Promise<Buffer | null> {
  logoPngPromise ||= readFile(path.resolve(logoPath))
    .then((source) => sharp(source).resize({ width: 84, height: 84, fit: 'contain' }).png().toBuffer())
    .catch(() => null);
  return logoPngPromise;
}

/**
 * Generates a server-side QR image using the open-source `qrcode` package.
 * The payload is caller-provided and must remain opaque; never put guest PII
 * or payment data directly in a QR code.
 */
export async function buildBrandBookingQrPng(payload: string): Promise<Buffer> {
  const value = String(payload || '').trim();
  if (!value || value.length > 2048) throw new Error('INVALID_QR_PAYLOAD');
  const qr = await QRCode.toBuffer(value, {
    type: 'png',
    width: 640,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f766e', light: '#ffffff' },
  });
  const logo = await loadLogoPng();
  if (!logo) return qr;
  const center = await sharp({
    create: { width: 124, height: 124, channels: 4, background: '#ffffff' },
  })
    .composite([{ input: logo, left: 20, top: 20 }])
    .png()
    .toBuffer();
  return sharp(qr)
    .composite([{ input: center, left: 258, top: 258 }])
    .png()
    .toBuffer();
}
