import { sendTransactionalEmail, type TransactionalEmailResult } from './resendEmail';

export type BookingNotificationKind =
  | 'new_booking_confirmed'
  | 'new_booking_received'
  | 'booking_approved'
  | 'booking_status_changed'
  | 'booking_cancelled'
  | 'new_service_booking'
  | 'whatsapp_faq_reply';

export interface BookingNotificationEmailDetails {
  kind: BookingNotificationKind;
  recipient: string;
  recipientName?: string;
  bookingId: string;
  listingTitle: string;
  status?: string;
  scheduledDate?: string;
  timeSlot?: string;
  reason?: string | null;
  faqQuestion?: string;
}

export interface BookingNotificationContext {
  bookingId: string;
  bookingRef?: string;
  listingTitle: string;
  customerEmail?: string | null;
  customerName?: string | null;
  providerEmail?: string | null;
  providerName?: string | null;
  status?: string | null;
  scheduledDate?: string | null;
  timeSlot?: string | null;
  reason?: string | null;
}

export interface BookingNotificationEmailDispatcher {
  env?: NodeJS.ProcessEnv;
  send?: typeof sendTransactionalEmail;
}

const COPY: Record<BookingNotificationKind, { subject: string; title: string; intro: string }> = {
  new_booking_confirmed: {
    subject: 'New booking confirmed',
    title: 'New booking confirmed',
    intro: 'Your booking is confirmed and available in BookOurSpace.',
  },
  new_booking_received: {
    subject: 'New booking received',
    title: 'New booking received',
    intro: 'A customer has submitted a new booking for your listing.',
  },
  booking_approved: {
    subject: 'Booking approved',
    title: 'Booking approved',
    intro: 'Your booking has been approved by the provider.',
  },
  booking_status_changed: {
    subject: 'Booking status changed',
    title: 'Booking status changed',
    intro: 'The status of your BookOurSpace booking has changed.',
  },
  booking_cancelled: {
    subject: 'Booking cancelled',
    title: 'Booking cancelled',
    intro: 'A BookOurSpace booking has been cancelled.',
  },
  new_service_booking: {
    subject: 'New service booking',
    title: 'New service booking',
    intro: 'A customer has requested your service.',
  },
  whatsapp_faq_reply: {
    subject: 'BookOurSpace support reply',
    title: 'Automated support reply',
    intro: 'Here is the automated answer to your BookOurSpace FAQ question.',
  },
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safePart(value: unknown, fallback = '—'): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export function buildBookingNotificationEmail(details: BookingNotificationEmailDetails) {
  const copy = COPY[details.kind];
  const greeting = details.recipientName ? `Hi ${details.recipientName},` : 'Hello,';
  const lines = [
    greeting,
    '',
    copy.intro,
    `Listing: ${safePart(details.listingTitle)}`,
    `Booking ID: ${safePart(details.bookingId)}`,
    details.status ? `Status: ${safePart(details.status).replace(/_/g, ' ')}` : '',
    details.scheduledDate ? `Date: ${safePart(details.scheduledDate)}` : '',
    details.timeSlot ? `Time: ${safePart(details.timeSlot)}` : '',
    details.reason ? `Reason: ${safePart(details.reason)}` : '',
    details.faqQuestion ? `Question: ${safePart(details.faqQuestion)}` : '',
    '',
    'Open BookOurSpace to view the latest details.',
  ].filter(Boolean).join('\n');
  return {
    to: details.recipient,
    subject: `BookOurSpace: ${copy.subject}`,
    text: lines,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(copy.intro)}</p><ul><li>Listing: ${escapeHtml(safePart(details.listingTitle))}</li><li>Booking ID: ${escapeHtml(safePart(details.bookingId))}</li>${details.status ? `<li>Status: ${escapeHtml(safePart(details.status).replace(/_/g, ' '))}</li>` : ''}${details.scheduledDate ? `<li>Date: ${escapeHtml(safePart(details.scheduledDate))}</li>` : ''}${details.timeSlot ? `<li>Time: ${escapeHtml(safePart(details.timeSlot))}</li>` : ''}${details.reason ? `<li>Reason: ${escapeHtml(safePart(details.reason))}</li>` : ''}${details.faqQuestion ? `<li>Question: ${escapeHtml(safePart(details.faqQuestion))}</li>` : ''}</ul><p>Open BookOurSpace to view the latest details.</p>`,
    idempotencyKey: `booking-notification:${details.kind}:${details.bookingId}:${details.recipient.toLowerCase()}`,
    explicitAuthorization: true as const,
  };
}

export function sendBookingNotificationEmail(
  details: BookingNotificationEmailDetails,
  options: BookingNotificationEmailDispatcher = {},
): Promise<TransactionalEmailResult> {
  return (options.send || sendTransactionalEmail)(buildBookingNotificationEmail(details), options.env || process.env);
}

export async function sendBookingNotificationEmails(
  details: BookingNotificationEmailDetails[],
  options: BookingNotificationEmailDispatcher = {},
): Promise<TransactionalEmailResult[]> {
  const results = await Promise.all(details.filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.recipient.trim())).map((item) =>
    sendBookingNotificationEmail(item, options),
  ));
  return results;
}
