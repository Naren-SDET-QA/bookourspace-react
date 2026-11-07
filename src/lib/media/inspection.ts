/** Content-based media allowlist shared by upload screens. Filenames and the
 * browser supplied File.type are deliberately not trusted for classification. */
export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'text';
export type MediaFormat =
  | 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'gif' | 'svg'
  | 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav' | 'aac' | 'm4a'
  | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt';

export interface InspectedMedia {
  kind: MediaKind;
  format: MediaFormat;
  mimeType: string;
  maxBytes: number;
  requiresSanitization: boolean;
  preview: 'image' | 'video' | 'audio' | 'document' | 'text';
}

export class MediaInspectionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MediaInspectionError';
  }
}

const limits: Record<MediaFormat, number> = {
  jpeg: 15 * 1024 * 1024, png: 15 * 1024 * 1024, webp: 15 * 1024 * 1024,
  avif: 15 * 1024 * 1024, heic: 20 * 1024 * 1024, gif: 20 * 1024 * 1024,
  svg: 1024 * 1024, mp4: 100 * 1024 * 1024, mov: 100 * 1024 * 1024,
  webm: 100 * 1024 * 1024, mp3: 50 * 1024 * 1024, wav: 50 * 1024 * 1024,
  aac: 50 * 1024 * 1024, m4a: 50 * 1024 * 1024, pdf: 25 * 1024 * 1024,
  docx: 25 * 1024 * 1024, xlsx: 25 * 1024 * 1024, pptx: 25 * 1024 * 1024,
  txt: 2 * 1024 * 1024,
};

const descriptors: Record<MediaFormat, Omit<InspectedMedia, 'format' | 'maxBytes'>> = {
  jpeg: { kind: 'image', mimeType: 'image/jpeg', requiresSanitization: false, preview: 'image' },
  png: { kind: 'image', mimeType: 'image/png', requiresSanitization: false, preview: 'image' },
  webp: { kind: 'image', mimeType: 'image/webp', requiresSanitization: false, preview: 'image' },
  avif: { kind: 'image', mimeType: 'image/avif', requiresSanitization: false, preview: 'image' },
  heic: { kind: 'image', mimeType: 'image/heic', requiresSanitization: false, preview: 'image' },
  gif: { kind: 'image', mimeType: 'image/gif', requiresSanitization: false, preview: 'image' },
  svg: { kind: 'image', mimeType: 'image/svg+xml', requiresSanitization: true, preview: 'image' },
  mp4: { kind: 'video', mimeType: 'video/mp4', requiresSanitization: false, preview: 'video' },
  mov: { kind: 'video', mimeType: 'video/quicktime', requiresSanitization: false, preview: 'video' },
  webm: { kind: 'video', mimeType: 'video/webm', requiresSanitization: false, preview: 'video' },
  mp3: { kind: 'audio', mimeType: 'audio/mpeg', requiresSanitization: false, preview: 'audio' },
  wav: { kind: 'audio', mimeType: 'audio/wav', requiresSanitization: false, preview: 'audio' },
  aac: { kind: 'audio', mimeType: 'audio/aac', requiresSanitization: false, preview: 'audio' },
  m4a: { kind: 'audio', mimeType: 'audio/mp4', requiresSanitization: false, preview: 'audio' },
  pdf: { kind: 'document', mimeType: 'application/pdf', requiresSanitization: false, preview: 'document' },
  docx: { kind: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', requiresSanitization: false, preview: 'document' },
  xlsx: { kind: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', requiresSanitization: false, preview: 'document' },
  pptx: { kind: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', requiresSanitization: false, preview: 'document' },
  txt: { kind: 'text', mimeType: 'text/plain', requiresSanitization: false, preview: 'text' },
};

function ascii(bytes: Uint8Array, start = 0, length = bytes.length - start): string {
  return Array.from(bytes.subarray(start, start + length), (byte) => String.fromCharCode(byte)).join('');
}

function boxType(bytes: Uint8Array): string {
  return bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp' ? ascii(bytes, 8, 4) : '';
}

function officeFormat(bytes: Uint8Array): MediaFormat | null {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null;
  const entries = ascii(bytes);
  if (!entries.includes('[Content_Types].xml') || entries.includes('vbaProject.bin')) return null;
  if (entries.includes('word/document.xml')) return 'docx';
  if (entries.includes('xl/workbook.xml')) return 'xlsx';
  if (entries.includes('ppt/presentation.xml')) return 'pptx';
  return null;
}

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  if (!bytes.length || bytes.includes(0)) return false;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    let safe = 0;
    for (const char of decoded) {
      const code = char.codePointAt(0) ?? 0;
      if (code === 9 || code === 10 || code === 13 || code >= 32) safe += 1;
    }
    return safe / decoded.length >= 0.98;
  } catch {
    return false;
  }
}

/** Detect supported media by signatures/containers. A file suffix is never consulted. */
export function inspectMediaBytes(bytes: Uint8Array): InspectedMedia {
  if (!bytes.length) throw new MediaInspectionError('EMPTY_FILE', 'Choose a non-empty file.');
  if ((bytes[0] === 0x4d && bytes[1] === 0x5a) ||
      (bytes[0] === 0x7f && ascii(bytes, 1, 3) === 'ELF') ||
      ascii(bytes, 0, 4) === '#!/b' || ascii(bytes, 0, 2) === '#!') {
    throw new MediaInspectionError('EXECUTABLE_REJECTED', 'Executable content is not accepted.');
  }

  let format: MediaFormat | null = null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) format = 'jpeg';
  else if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') format = 'png';
  else if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') format = 'gif';
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') format = 'webp';
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') format = 'wav';
  else if (ascii(bytes, 0, 5) === '%PDF-') format = 'pdf';
  else if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) format = 'aac';
  else if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) format = 'mp3';
  else {
    const brand = boxType(bytes);
    if (brand === 'avif' || brand === 'avis') format = 'avif';
    else if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) format = 'heic';
    else if (brand === 'qt  ') format = 'mov';
    else if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) format = 'mp4';
    else if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') format = 'm4a';
    else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) format = 'webm';
    else format = officeFormat(bytes);
  }

  if (!format) {
    const prefix = ascii(bytes, 0, Math.min(bytes.length, 512)).trimStart();
    if (/<svg(?:\s|>)/i.test(prefix) || /<\?xml[^>]*>[\s\S]*<svg(?:\s|>)/i.test(prefix)) format = 'svg';
  }
  if (!format && looksLikeUtf8Text(bytes)) format = 'txt';
  if (!format) throw new MediaInspectionError('UNSUPPORTED_OR_MALFORMED', 'File content is unsupported or does not match a safe known format.');
  return { format, maxBytes: limits[format], ...descriptors[format] };
}

export async function inspectMediaFile(file: Pick<File, 'arrayBuffer' | 'size' | 'slice'>): Promise<InspectedMedia> {
  if (file.size > 100 * 1024 * 1024) throw new MediaInspectionError('FILE_TOO_LARGE', 'Files over 100 MB are not accepted.');
  const sample = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer());
  let detected: InspectedMedia;
  try {
    detected = inspectMediaBytes(sample);
  } catch (error) {
    // OOXML central-directory names may sit near the end of a ZIP package.
    if (sample[0] !== 0x50 || sample[1] !== 0x4b) throw error;
    detected = inspectMediaBytes(new Uint8Array(await file.arrayBuffer()));
  }
  if (file.size > detected.maxBytes) {
    throw new MediaInspectionError('FILE_TOO_LARGE', `This ${detected.format.toUpperCase()} file exceeds its ${Math.round(detected.maxBytes / 1024 / 1024)} MB limit.`);
  }
  return detected;
}
