import {
  sendTransactionalEmail,
  type TransactionalEmailInput,
  type TransactionalEmailResult,
} from './resendEmail';
import { buildStayInvoicePdf } from './invoicePdf';

export interface StayEmailBookingDetails {
  bookingId: string;
  recipient: string;
  guestName: string;
  propertyName: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  totalPaise: number;
  paymentStatus: string;
  paymentReference?: string | null;
}

export interface StayEmailReminderDetails extends StayEmailBookingDetails {
  reminderHours: 24 | 2;
}

export interface LoginOtpEmailDetails {
  recipient: string;
  code: string;
  expiresInMinutes?: number;
}

export interface ResendEmailDispatcher {
  env?: NodeJS.ProcessEnv;
  send?: typeof sendTransactionalEmail;
}

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

function safeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

function dispatch(input: TransactionalEmailInput, options: ResendEmailDispatcher = {}): Promise<TransactionalEmailResult> {
  return (options.send || sendTransactionalEmail)(input, options.env || process.env);
}

async function withStayInvoiceAttachment(
  input: TransactionalEmailInput,
  details: StayEmailBookingDetails,
): Promise<TransactionalEmailInput> {
  const pdf = await buildStayInvoicePdf({
    invoiceNumber: `BOS-${details.bookingId}`,
    bookingId: details.bookingId,
    guestName: details.guestName,
    recipient: details.recipient,
    propertyName: details.propertyName,
    roomType: details.roomType,
    checkIn: details.checkIn,
    checkOut: details.checkOut,
    totalPaise: details.totalPaise,
    paymentStatus: details.paymentStatus,
    paymentReference: details.paymentReference,
  });
  return {
    ...input,
    attachments: [{
      filename: `BookOurSpace-Invoice-${details.bookingId}.pdf`,
      content: pdf,
      contentType: 'application/pdf',
    }],
  };
}

export function buildLoginOtpEmail(details: LoginOtpEmailDetails): TransactionalEmailInput {
  const code = String(details.code || '').trim();
  const expiresInMinutes = Math.max(1, Math.min(30, Number(details.expiresInMinutes) || 10));
  return {
    to: details.recipient,
    subject: 'Your BookOurSpace sign-in code',
    text: `Your BookOurSpace sign-in code is ${code}. It expires in ${expiresInMinutes} minutes and can be used only once. If you did not request it, ignore this email.`,
    html: `<p>Your BookOurSpace sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.3em">${escapeHtml(code)}</p><p>This code expires in ${expiresInMinutes} minutes and can be used only once.</p><p>If you did not request it, you can ignore this email.</p>`,
    idempotencyKey: `login-otp:${details.recipient.toLowerCase()}:${code}`,
    explicitAuthorization: true,
  };
}

export function buildStayBookingConfirmationEmail(details: StayEmailBookingDetails): TransactionalEmailInput {
  const subject = safeSubject(`Stay booking confirmed: ${details.propertyName}`);
  const body = [
    `Hi ${details.guestName},`,
    '',
    `Your stay booking at ${details.propertyName} is confirmed.`,
    `Room: ${details.roomType}`,
    `Check-in: ${details.checkIn}`,
    `Check-out: ${details.checkOut}`,
    `Amount: ${money(details.totalPaise)}`,
    `Payment status: ${details.paymentStatus}`,
    details.paymentReference ? `Payment reference: ${details.paymentReference}` : '',
    `Booking ID: ${details.bookingId}`,
    '',
    'Open BookOurSpace to view your receipt and QR pass.',
  ].filter(Boolean).join('\n');
  return {
    to: details.recipient,
    subject,
    text: body,
    html: `<p>Hi ${escapeHtml(details.guestName)},</p><p>Your stay booking at <strong>${escapeHtml(details.propertyName)}</strong> is confirmed.</p><ul><li>Room: ${escapeHtml(details.roomType)}</li><li>Check-in: ${escapeHtml(details.checkIn)}</li><li>Check-out: ${escapeHtml(details.checkOut)}</li><li>Amount: ${escapeHtml(money(details.totalPaise))}</li><li>Payment status: ${escapeHtml(details.paymentStatus)}</li>${details.paymentReference ? `<li>Payment reference: ${escapeHtml(details.paymentReference)}</li>` : ''}<li>Booking ID: ${escapeHtml(details.bookingId)}</li></ul><p>Open BookOurSpace to view your receipt and QR pass.</p>`,
    idempotencyKey: `stay-booking-confirmed:${details.bookingId}`,
    explicitAuthorization: true,
  };
}

export function buildStayPaymentSuccessEmail(details: StayEmailBookingDetails): TransactionalEmailInput {
  const subject = safeSubject(`Payment received for ${details.propertyName}`);
  return {
    to: details.recipient,
    subject,
    text: `Hi ${details.guestName}, payment of ${money(details.totalPaise)} for your stay at ${details.propertyName} was verified successfully. Booking ID: ${details.bookingId}.${details.paymentReference ? ` Payment reference: ${details.paymentReference}` : ''}`,
    html: `<p>Hi ${escapeHtml(details.guestName)},</p><p>Your payment of <strong>${escapeHtml(money(details.totalPaise))}</strong> for your stay at <strong>${escapeHtml(details.propertyName)}</strong> was verified successfully.</p><p>Booking ID: ${escapeHtml(details.bookingId)}${details.paymentReference ? `<br>Payment reference: ${escapeHtml(details.paymentReference)}` : ''}</p>`,
    idempotencyKey: `stay-payment-success:${details.bookingId}:${details.paymentReference || 'verified'}`,
    explicitAuthorization: true,
  };
}

export function buildStayReminderEmail(details: StayEmailReminderDetails): TransactionalEmailInput {
  const subject = safeSubject(`Stay reminder: ${details.propertyName} in ${details.reminderHours} hours`);
  return {
    to: details.recipient,
    subject,
    text: `Hi ${details.guestName}, this is your ${details.reminderHours}-hour reminder for your stay at ${details.propertyName}. Check-in: ${details.checkIn}. Check-out: ${details.checkOut}. Booking ID: ${details.bookingId}.`,
    html: `<p>Hi ${escapeHtml(details.guestName)},</p><p>This is your <strong>${details.reminderHours}-hour reminder</strong> for your stay at <strong>${escapeHtml(details.propertyName)}</strong>.</p><p>Check-in: ${escapeHtml(details.checkIn)}<br>Check-out: ${escapeHtml(details.checkOut)}<br>Booking ID: ${escapeHtml(details.bookingId)}</p>`,
    idempotencyKey: `stay-reminder:${details.bookingId}:${details.reminderHours}h`,
    explicitAuthorization: true,
  };
}

export function sendLoginOtpEmail(details: LoginOtpEmailDetails, options?: ResendEmailDispatcher) {
  return dispatch(buildLoginOtpEmail(details), options);
}

export async function sendStayBookingConfirmationEmail(details: StayEmailBookingDetails, options?: ResendEmailDispatcher) {
  return dispatch(await withStayInvoiceAttachment(buildStayBookingConfirmationEmail(details), details), options);
}

export async function sendStayPaymentSuccessEmail(details: StayEmailBookingDetails, options?: ResendEmailDispatcher) {
  return dispatch(await withStayInvoiceAttachment(buildStayPaymentSuccessEmail(details), details), options);
}

export function sendStayReminderEmail(details: StayEmailReminderDetails, options?: ResendEmailDispatcher) {
  return dispatch(buildStayReminderEmail(details), options);
}
