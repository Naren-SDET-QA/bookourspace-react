import type { Express, Request, Response } from 'express';
import { buildPgQaSampleEmail, type PgQaSampleKind, type PgQaSampleDetails } from './pgQaEmailSamples';

export const EVOLUTION_QA_RECIPIENT = '9966191813';

export interface EvolutionSetupStatus {
  provider: 'evolution';
  configured: boolean;
  sendEnabled: boolean;
  apiUrl: string;
  instance: string;
  recipient: string;
  blockedReasons: string[];
}

export interface EvolutionFetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type EvolutionFetch = (input: string, init?: RequestInit) => Promise<EvolutionFetchLikeResponse>;

export interface EvolutionQaPackOptions {
  env?: NodeJS.ProcessEnv;
  fetcher?: EvolutionFetch;
  explicitAuthorization?: true;
  retryDelayMs?: number;
}

export interface EvolutionQaPreparedMessage {
  kind: PgQaSampleKind;
  text: string;
  media: Array<{
    data: Buffer;
    mediatype: 'image' | 'document';
    mimetype: string;
    fileName: string;
    operation: string;
  }>;
}

export type EvolutionQaResult =
  | { ok: true; sent: number; mediaSent: number; recipient: string }
  | { ok: false; error: string; blockedReasons?: string[]; statusCode?: number };

const completedOperations = new Map<string, Set<string>>();
const inFlightPacks = new Set<string>();
const completedPacks = new Set<string>();

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

/** Convert an Indian local mobile number to Evolution's international format. */
export function normalizeEvolutionRecipient(value: string): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^91\d{10}$/.test(digits)) return digits;
  return null;
}

export function getEvolutionSetupStatus(env: NodeJS.ProcessEnv = process.env): EvolutionSetupStatus {
  const apiUrl = String(env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, '');
  const instance = String(env.EVOLUTION_INSTANCE || '').trim();
  const configuredRecipient = String(env.EVOLUTION_DEV_TEST_RECIPIENT || EVOLUTION_QA_RECIPIENT).trim();
  const recipient = normalizeEvolutionRecipient(EVOLUTION_QA_RECIPIENT) || '';
  const blockedReasons: string[] = [];

  if (env.NODE_ENV !== 'development') blockedReasons.push('EVOLUTION_NOT_DEVELOPMENT');
  if (!isEnabled(env.EVOLUTION_DEV_TEST_ENABLED)) blockedReasons.push('EVOLUTION_DEV_TEST_DISABLED');
  if (!apiUrl) blockedReasons.push('EVOLUTION_API_URL_MISSING');
  if (!String(env.EVOLUTION_API_KEY || '').trim()) blockedReasons.push('EVOLUTION_API_KEY_MISSING');
  if (!instance) blockedReasons.push('EVOLUTION_INSTANCE_MISSING');
  if (!recipient) blockedReasons.push('EVOLUTION_DEV_TEST_RECIPIENT_INVALID');
  if (normalizeEvolutionRecipient(configuredRecipient) !== recipient) blockedReasons.push('EVOLUTION_DEV_TEST_RECIPIENT_MISMATCH');

  return {
    provider: 'evolution',
    configured: Boolean(apiUrl && env.EVOLUTION_API_KEY && instance && recipient),
    sendEnabled: blockedReasons.length === 0,
    apiUrl,
    instance,
    recipient,
    blockedReasons,
  };
}

export function isEvolutionDevelopmentTestSendAuthorized(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const status = getEvolutionSetupStatus(env);
  if (!status.sendEnabled || !body || typeof body !== 'object') return false;
  const candidate = body as { confirmSend?: unknown; to?: unknown };
  return candidate.confirmSend === true && normalizeEvolutionRecipient(String(candidate.to || '')) === status.recipient;
}

function safeText(value: unknown, fallback = '—'): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function qaText(kind: PgQaSampleKind, details: PgQaSampleDetails): string {
  const titles: Record<PgQaSampleKind, string> = {
    confirmation: 'PG booking confirmed',
    cancellation: 'PG booking cancelled',
    invoice_offer: 'PG invoice and offer',
    alert: 'PG booking alert',
  };
  const messages: Record<PgQaSampleKind, string> = {
    confirmation: 'Your PG booking is confirmed for the QA sample stay below.',
    cancellation: 'This sample booking has been cancelled. The barcode is for QA only and is not valid for check-in.',
    invoice_offer: 'Here is a sample booking invoice with a development-only offer preview. No payment is due.',
    alert: 'Upcoming check-in alert for the sample booking. Use the branded barcode only in development QA.',
  };
  return [
    `*BookOurSpace | ${titles[kind]}*`,
    '',
    messages[kind],
    `Property: ${safeText(details.propertyName)}`,
    `Room: ${safeText(details.roomType)}`,
    `Check-in: ${safeText(details.checkIn)}`,
    `Check-out: ${safeText(details.checkOut)}`,
    `Booking ID: ${safeText(details.bookingId)}`,
    `Amount: ₹${(Math.max(0, Number(details.amountPaise) || 0) / 100).toFixed(2)}`,
    `Status: ${kind === 'confirmation' ? 'Confirmed' : kind === 'cancellation' ? 'Cancelled' : kind === 'invoice_offer' ? 'Sample offer · not payable' : 'QA alert'}`,
    '',
    'Development QA only. This is not a live booking, invoice, payment request, or production alert.',
  ].join('\n');
}

async function postEvolution(
  status: EvolutionSetupStatus,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  fetcher: EvolutionFetch,
  retryDelayMs: number,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(`${status.apiUrl}${path}`, {
        method: 'POST',
        headers: { apikey: apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) return;
      const retryable = response.status === 429 || response.status >= 500;
      lastError = Object.assign(new Error('EVOLUTION_API_ERROR'), { statusCode: response.status });
      if (!retryable) throw lastError;
    } catch (error) {
      lastError = error;
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : undefined;
      if (statusCode !== undefined && statusCode !== 429 && statusCode < 500) throw error;
    }
    if (attempt < 2 && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  }
  throw lastError || new Error('EVOLUTION_API_ERROR');
}

async function sendMedia(
  status: EvolutionSetupStatus,
  apiKey: string,
  kind: PgQaSampleKind,
  details: PgQaSampleDetails,
  media: { data: Buffer; mediatype: 'image' | 'document'; mimetype: string; fileName: string },
  fetcher: EvolutionFetch,
  retryDelayMs: number,
): Promise<void> {
  const caption = `BookOurSpace QA sample · ${kind.replace('_', ' ')}`;
  await postEvolution(status, apiKey, `/message/sendMedia/${encodeURIComponent(status.instance)}`, {
    number: status.recipient,
    mediatype: media.mediatype,
    mimetype: media.mimetype,
    caption,
    media: media.data.toString('base64'),
    fileName: media.fileName,
  }, fetcher, retryDelayMs);
}

function attachmentBuffer(content: unknown): Buffer {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (content instanceof ArrayBuffer) return Buffer.from(new Uint8Array(content));
  return Buffer.from(String(content));
}

/** Build all four QA texts and the branded QR/PDF media without sending. */
export async function prepareEvolutionQaPack(details: PgQaSampleDetails): Promise<EvolutionQaPreparedMessage[]> {
  const kinds: PgQaSampleKind[] = ['confirmation', 'cancellation', 'invoice_offer', 'alert'];
  const prepared: EvolutionQaPreparedMessage[] = [];
  for (const kind of kinds) {
    const sample = await buildPgQaSampleEmail(kind, details);
    const media: EvolutionQaPreparedMessage['media'] = [];
    for (const attachment of sample.attachments || []) {
      if (attachment.contentId === 'bos-qr') {
        media.push({
        data: attachmentBuffer(attachment.content),
        mediatype: 'image',
        mimetype: attachment.contentType || 'image/png',
        fileName: attachment.filename,
        operation: `${kind}:qr`,
        });
      } else if (attachment.contentType === 'application/pdf') {
        media.push({
        data: attachmentBuffer(attachment.content),
        mediatype: 'document',
        mimetype: 'application/pdf',
        fileName: attachment.filename,
        operation: `${kind}:invoice`,
        });
      }
    }
    prepared.push({ kind, text: sample.text || '', media });
  }
  return prepared;
}

/**
 * Sends only the fixed development QA pack. This function cannot send in
 * production, cannot send when the opt-in flag is off, and cannot target a
 * number other than EVOLUTION_DEV_TEST_RECIPIENT.
 */
export async function sendEvolutionQaPack(
  details: PgQaSampleDetails,
  options: EvolutionQaPackOptions = {},
): Promise<EvolutionQaResult> {
  const env = options.env || process.env;
  if (options.explicitAuthorization !== true) return { ok: false, error: 'EVOLUTION_EXPLICIT_AUTHORIZATION_REQUIRED' };
  const status = getEvolutionSetupStatus(env);
  if (!status.sendEnabled) return { ok: false, error: 'EVOLUTION_NOT_READY', blockedReasons: status.blockedReasons };

  const fetcher = options.fetcher || (fetch as unknown as EvolutionFetch);
  const apiKey = String(env.EVOLUTION_API_KEY).trim();
  const packKey = `${status.recipient}:${details.bookingId}`;
  if (completedPacks.has(packKey) || inFlightPacks.has(packKey)) {
    return { ok: false, error: 'EVOLUTION_QA_DUPLICATE_BLOCKED' };
  }
  inFlightPacks.add(packKey);
  const operations = completedOperations.get(packKey) || new Set<string>();
  completedOperations.set(packKey, operations);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 250));
  let sent = 0;
  let mediaSent = 0;

  try {
    const prepared = await prepareEvolutionQaPack(details);
    for (const message of prepared) {
      const textOperation = `${message.kind}:text`;
      if (!operations.has(textOperation)) {
        await postEvolution(status, apiKey, `/message/sendText/${encodeURIComponent(status.instance)}`, {
          number: status.recipient,
          text: message.text,
        }, fetcher, retryDelayMs);
        operations.add(textOperation);
        sent += 1;
      }
      for (const media of message.media) {
        if (operations.has(media.operation)) continue;
        await sendMedia(status, apiKey, message.kind, details, media, fetcher, retryDelayMs);
        operations.add(media.operation);
        mediaSent += 1;
      }
    }
    completedPacks.add(packKey);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'EVOLUTION_API_ERROR',
      statusCode: typeof error === 'object' && error && 'statusCode' in error ? Number((error as { statusCode?: unknown }).statusCode) : undefined,
    };
  } finally {
    inFlightPacks.delete(packKey);
  }

  return { ok: true, sent, mediaSent, recipient: status.recipient };
}

export function registerEvolutionDevelopmentTestApi(
  app: Express,
  options: { env?: NodeJS.ProcessEnv; isAdmin: (request: Request) => boolean },
): void {
  const env = options.env || process.env;
  if (env.NODE_ENV !== 'development') return;

  app.post('/api/dev/evolution/pg-samples', async (req: Request, res: Response) => {
    if (!options.isAdmin(req)) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }
    if (!isEvolutionDevelopmentTestSendAuthorized(req.body, env)) {
      res.status(400).json({
        ok: false,
        error: 'EVOLUTION_EXPLICIT_TEST_AUTHORIZATION_REQUIRED',
        requirement: 'POST the configured development recipient with confirmSend=true.',
      });
      return;
    }

    const recipient = getEvolutionSetupStatus(env).recipient;
    const result = await sendEvolutionQaPack({
      recipient,
      bookingId: 'pg-qa-sample-20261111',
      guestName: 'BookOurSpace QA',
      propertyName: 'Sri Sai Executive PG — QA Sample',
      roomType: 'Single occupancy room',
      checkIn: '2026-12-10',
      checkOut: '2026-12-11',
      amountPaise: 125000,
    }, { env, explicitAuthorization: true });
    if (!result.ok) {
      res.status(503).json(result);
      return;
    }
    res.json({ ...result, testOnly: true, samples: ['confirmation', 'cancellation', 'invoice_offer', 'alert'] });
  });
}
