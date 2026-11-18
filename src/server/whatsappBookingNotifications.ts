import { logSafeError } from './safeLogging';

export type WhatsAppBookingEvent = 'booking_confirmed' | 'provider_on_the_way';

export interface WhatsAppSetupStatus {
  provider: 'meta';
  configured: boolean;
  sendEnabled: boolean;
  blockedReasons: string[];
  phoneNumberId: string;
  apiVersion: string;
  templates: Record<WhatsAppBookingEvent, string>;
}

export interface WhatsAppSendRequest {
  event: WhatsAppBookingEvent;
  to: string;
  bookingRef: string;
  trackingUrl: string;
  optIn: boolean;
  alreadySent: boolean;
}

export interface WhatsAppSendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  providerMessageId?: string;
  statusCode?: number;
}

export type WhatsAppFetch = (input: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export function normalizeWhatsAppRecipient(value: string): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return `91${digits}`;
  if (/^0\d{10}$/.test(digits)) return `91${digits.slice(1)}`;
  if (/^91\d{10}$/.test(digits)) return digits;
  if (/^[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

export function getWhatsAppSetupStatus(env: NodeJS.ProcessEnv = process.env): WhatsAppSetupStatus {
  const blockedReasons: string[] = [];
  const accessToken = String(env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(env.WHATSAPP_API_VERSION || 'v21.0').trim() || 'v21.0';
  const sendEnabled = flag(env.WHATSAPP_SEND_ENABLED);
  const templates = {
    booking_confirmed: String(env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED || '').trim(),
    provider_on_the_way: String(env.WHATSAPP_TEMPLATE_PROVIDER_ON_THE_WAY || '').trim(),
  };
  if (!sendEnabled) blockedReasons.push('WHATSAPP_SEND_DISABLED');
  if (!accessToken) blockedReasons.push('WHATSAPP_ACCESS_TOKEN_MISSING');
  if (!phoneNumberId) blockedReasons.push('WHATSAPP_PHONE_NUMBER_ID_MISSING');
  if (!templates.booking_confirmed) blockedReasons.push('WHATSAPP_TEMPLATE_BOOKING_CONFIRMED_MISSING');
  if (!templates.provider_on_the_way) blockedReasons.push('WHATSAPP_TEMPLATE_PROVIDER_ON_THE_WAY_MISSING');
  return {
    provider: 'meta',
    configured: Boolean(accessToken && phoneNumberId),
    sendEnabled: blockedReasons.length === 0,
    blockedReasons,
    phoneNumberId,
    apiVersion,
    templates,
  };
}

export function bookingConfirmedCopy(bookingRef: string, trackingUrl: string): string {
  return [
    'Your BookOurSpace booking is confirmed!',
    '',
    `Booking reference: ${bookingRef}`,
    '',
    'Your service provider will share their live location when they start the journey.',
    '',
    'Track your booking:',
    trackingUrl,
    '',
    'Thank you for choosing BookOurSpace!',
  ].join('\n');
}

export function providerOnTheWayCopy(trackingUrl: string): string {
  return [
    'Your BookOurSpace service provider is on the way!',
    '',
    'You can now track their live location, remaining distance and estimated arrival time.',
    '',
    'Track here:',
    trackingUrl,
  ].join('\n');
}

function templatePayload(event: WhatsAppBookingEvent, to: string, template: string, bookingRef: string, trackingUrl: string) {
  const language = 'en';
  const components = event === 'booking_confirmed'
    ? [{ type: 'body', parameters: [{ type: 'text', text: bookingRef }, { type: 'text', text: trackingUrl }] }]
    : [{ type: 'body', parameters: [{ type: 'text', text: trackingUrl }] }];
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: template, language: { code: language }, components },
  };
}

export async function sendWhatsAppBookingMessage(
  request: WhatsAppSendRequest,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: WhatsAppFetch = fetch,
): Promise<WhatsAppSendResult> {
  if (!request.optIn) return { ok: false, skipped: true, error: 'WHATSAPP_OPT_IN_REQUIRED' };
  if (request.alreadySent) return { ok: false, skipped: true, error: 'WHATSAPP_ALREADY_SENT' };
  const to = normalizeWhatsAppRecipient(request.to);
  if (!to) return { ok: false, skipped: true, error: 'WHATSAPP_RECIPIENT_INVALID' };
  const status = getWhatsAppSetupStatus(env);
  if (!status.sendEnabled) {
    return { ok: false, skipped: true, error: status.blockedReasons[0] || 'WHATSAPP_NOT_CONFIGURED' };
  }
  const token = String(env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const template = status.templates[request.event];
  const url = `https://graph.facebook.com/${status.apiVersion}/${status.phoneNumberId}/messages`;
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templatePayload(request.event, to, template, request.bookingRef, request.trackingUrl)),
    });
    if (!response.ok) {
      return { ok: false, error: 'WHATSAPP_PROVIDER_ERROR', statusCode: response.status };
    }
    const payload = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }> };
    return { ok: true, providerMessageId: payload?.messages?.[0]?.id, statusCode: response.status };
  } catch (error) {
    logSafeError('whatsapp-booking', request.event, error);
    return { ok: false, error: 'WHATSAPP_NETWORK_ERROR' };
  }
}

export async function sendWhatsAppBookingMessageWithRetry(
  request: WhatsAppSendRequest,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: WhatsAppFetch = fetch,
  attempts = 3,
): Promise<WhatsAppSendResult> {
  let last: WhatsAppSendResult = { ok: false, error: 'WHATSAPP_NETWORK_ERROR' };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await sendWhatsAppBookingMessage(request, env, fetcher);
    if (last.ok || last.skipped) return last;
    if (last.statusCode && last.statusCode >= 400 && last.statusCode < 500 && last.statusCode !== 429) return last;
  }
  return last;
}
