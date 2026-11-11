import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  buildDevelopmentTestEmail,
  getResendDevelopmentTestStatus,
  getResendSetupStatus,
  isDevelopmentTestSendAuthorized,
  sendTransactionalEmail,
} from '../src/server/resendEmail.ts';
import {
  buildLoginOtpEmail,
  buildStayBookingConfirmationEmail,
  buildStayPaymentSuccessEmail,
  buildStayReminderEmail,
  sendStayBookingConfirmationEmail,
} from '../src/server/resendTransactionalEmails.ts';
import {
  buildBookingNotificationEmail,
  sendBookingNotificationEmail,
} from '../src/server/bookingNotificationEmails.ts';
import { buildWhatsAppFaqReply } from '../src/server/whatsappFaq.ts';
import { buildBrandBookingQrPng } from '../src/server/bookingQrImage.ts';
import { buildPgQaSampleEmail } from '../src/server/pgQaEmailSamples.ts';

test('Resend sending stays blocked until all setup gates are explicitly enabled', async () => {
  const status = getResendSetupStatus({});
  assert.equal(status.provider, 'resend');
  assert.equal(status.configured, false);
  assert.equal(status.sendEnabled, false);
  assert.equal(status.receivingEnabled, false);
  assert.deepEqual(status.blockedReasons, [
    'RESEND_API_KEY_MISSING',
    'RESEND_FROM_MISSING',
    'RESEND_SEND_DISABLED',
    'RESEND_DOMAIN_NOT_CONFIRMED',
    'RESEND_BILLING_NOT_CONFIRMED',
  ]);

  const result = await sendTransactionalEmail({
    to: 'test@example.com',
    subject: 'should not send',
    text: 'blocked by setup gates',
  }, {});
  assert.deepEqual(result, {
    ok: false,
    error: 'RESEND_NOT_READY',
    blockedReasons: status.blockedReasons,
  });
});

test('Resend setup reports a ready configuration without sending an email', () => {
  const status = getResendSetupStatus({
    RESEND_API_KEY: 're_test_only',
    RESEND_FROM: 'BookOurSpace <info@mail.bookourspace.com>',
    RESEND_SEND_ENABLED: '1',
    RESEND_DOMAIN_VERIFIED: 'true',
    RESEND_BILLING_CONFIRMED: '1',
  });
  assert.equal(status.configured, true);
  assert.equal(status.sendEnabled, true);
  assert.deepEqual(status.blockedReasons, []);
});

test('Resend helper refuses to send without an explicit authorization marker', async () => {
  const result = await sendTransactionalEmail({
    to: 'info@example.com',
    subject: 'should not send',
    text: 'missing explicit authorization',
  }, {
    RESEND_API_KEY: 're_test_only',
    RESEND_FROM: 'BookOurSpace <info@mail.bookourspace.com>',
    RESEND_SEND_ENABLED: '1',
    RESEND_DOMAIN_VERIFIED: '1',
    RESEND_BILLING_CONFIRMED: '1',
  });
  assert.deepEqual(result, {
    ok: false,
    error: 'RESEND_EXPLICIT_AUTHORIZATION_REQUIRED',
  });
});

test('Resend refuses an unverified sender even when all sending gates are open', () => {
  const status = getResendSetupStatus({
    RESEND_API_KEY: 're_test_only',
    RESEND_DOMAIN: 'mail.bookourspace.com',
    RESEND_FROM: 'BookOurSpace <info@bookourspace.com>',
    RESEND_SEND_ENABLED: '1',
    RESEND_DOMAIN_VERIFIED: '1',
    RESEND_BILLING_CONFIRMED: '1',
  });
  assert.equal(status.sendEnabled, false);
  assert.deepEqual(status.blockedReasons, ['RESEND_FROM_NOT_VERIFIED']);
});

test('development test workflow requires development mode, opt-in, fixed recipient, and confirmation', () => {
  const env = {
    NODE_ENV: 'development',
    RESEND_DEV_TEST_EMAIL_ENABLED: '1',
    RESEND_DEV_TEST_RECIPIENT: 'info@bookourspace.com',
  };
  const status = getResendDevelopmentTestStatus(env);
  assert.deepEqual(status, {
    enabled: true,
    recipient: 'info@bookourspace.com',
    blockedReasons: [],
  });
  assert.equal(isDevelopmentTestSendAuthorized({ to: 'info@bookourspace.com', confirmSend: true }, env), true);
  assert.equal(isDevelopmentTestSendAuthorized({ to: 'other@example.com', confirmSend: true }, env), false);
  assert.equal(isDevelopmentTestSendAuthorized({ to: 'info@bookourspace.com', confirmSend: false }, env), false);
  assert.equal(isDevelopmentTestSendAuthorized({ to: 'info@bookourspace.com' }, env), false);
});

test('development test workflow is disabled outside development and by default', () => {
  const status = getResendDevelopmentTestStatus({ NODE_ENV: 'production' });
  assert.equal(status.enabled, false);
  assert.deepEqual(status.blockedReasons, [
    'RESEND_DEV_TEST_NOT_DEVELOPMENT',
    'RESEND_DEV_TEST_DISABLED',
    'RESEND_DEV_TEST_RECIPIENT_MISSING',
  ]);
});

test('development QA email uses the standard BookOurSpace format and fixed-recipient mode', () => {
  const email = buildDevelopmentTestEmail('tnarendra2027@gmail.com');
  assert.equal(email.to, 'tnarendra2027@gmail.com');
  assert.equal(email.developmentOnlyTest, true);
  assert.equal(email.explicitAuthorization, true);
  assert.match(email.subject, /BookOurSpace.*Development QA/);
  assert.match(email.html, /Standard notification/);
  assert.match(email.text, /No customer booking/);
});

test('transactional email templates cover OTP, stay confirmation, payment success, and reminders without sending', () => {
  const otp = buildLoginOtpEmail({ recipient: 'guest@example.test', code: '123456' });
  assert.equal(otp.to, 'guest@example.test');
  assert.match(otp.text, /123456/);
  assert.equal(otp.explicitAuthorization, true);

  const booking = {
    bookingId: 'stay-123',
    recipient: 'guest@example.test',
    guestName: 'Guest <Name>',
    propertyName: 'Hotel & Suites',
    roomType: 'Deluxe <Room>',
    checkIn: '2026-12-10',
    checkOut: '2026-12-12',
    totalPaise: 125000,
    paymentStatus: 'verified',
    paymentReference: 'pay_123',
  };
  const confirmation = buildStayBookingConfirmationEmail(booking);
  assert.match(confirmation.html, /Guest &lt;Name&gt;/);
  assert.match(confirmation.html, /Hotel &amp; Suites/);
  assert.match(confirmation.text, /Booking ID: stay-123/);
  assert.equal(confirmation.idempotencyKey, 'stay-booking-confirmed:stay-123');
  assert.equal(buildStayPaymentSuccessEmail(booking).idempotencyKey, 'stay-payment-success:stay-123:pay_123');
  assert.equal(buildStayReminderEmail({ ...booking, reminderHours: 24 }).idempotencyKey, 'stay-reminder:stay-123:24h');
});

test('stay transactional email includes a branded PDF invoice attachment', async () => {
  const sent = [];
  const result = await sendStayBookingConfirmationEmail({
    bookingId: 'booking-pdf-1',
    recipient: 'tnarendra2027@gmail.com',
    guestName: 'Test Guest',
    propertyName: 'BookOurSpace Test Stay',
    roomType: 'Deluxe Room',
    checkIn: '2026-11-20',
    checkOut: '2026-11-21',
    totalPaise: 125000,
    paymentStatus: 'verified',
    paymentReference: 'pay_test_1',
  }, {
    env: {},
    send: async (input) => {
      sent.push(input);
      return { ok: true, id: 'email-test-1' };
    },
  });
  assert.deepEqual(result, { ok: true, id: 'email-test-1' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments.length, 1);
  assert.equal(sent[0].attachments[0].filename, 'BookOurSpace-Invoice-booking-pdf-1.pdf');
  assert.equal(sent[0].attachments[0].contentType, 'application/pdf');
  assert.match(Buffer.from(sent[0].attachments[0].content).toString('ascii', 0, 5), /^%PDF-/);
});

test('booking notification templates cover customer, provider, cancellation, and service events without sending', async () => {
  const received = buildBookingNotificationEmail({
    kind: 'new_booking_received',
    recipient: 'owner@example.test',
    recipientName: 'Owner',
    bookingId: 'booking-1',
    listingTitle: 'Studio & Hall',
    status: 'requested',
    scheduledDate: '2026-12-10',
    timeSlot: '10:00–11:00',
  });
  assert.equal(received.subject, 'BookOurSpace: New booking received');
  assert.match(received.html, /Studio &amp; Hall/);
  assert.equal(received.explicitAuthorization, true);

  const sent = [];
  const result = await sendBookingNotificationEmail({
    kind: 'booking_cancelled',
    recipient: 'customer@example.test',
    bookingId: 'booking-1',
    listingTitle: 'Studio & Hall',
    reason: 'Customer requested cancellation',
  }, {
    env: {},
    send: async (input) => {
      sent.push(input);
      return { ok: true, id: 'booking-email-test-1' };
    },
  });
  assert.deepEqual(result, { ok: true, id: 'booking-email-test-1' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Customer requested cancellation/);
});

test('WhatsApp FAQ replies are automated and contain no outbound provider side effect', () => {
  assert.match(buildWhatsAppFaqReply('Can I get my invoice?'), /receipt or invoice/i);
  assert.match(buildWhatsAppFaqReply('hello'), /booking status/i);
});

test('PG QA sample emails include the official logo, branded QR, and invoice PDF where expected', async () => {
  const details = {
    recipient: 'tnarendra2027@gmail.com',
    bookingId: 'pg-qa-test-1',
    guestName: 'BookOurSpace QA',
    propertyName: 'Sri Sai Executive PG',
    roomType: 'Single occupancy room',
    checkIn: '2026-12-10',
    checkOut: '2026-12-11',
    amountPaise: 125000,
  };
  const confirmation = await buildPgQaSampleEmail('confirmation', details);
  assert.equal(confirmation.developmentOnlyTest, true);
  assert.equal(confirmation.attachments.length, 3);
  assert.equal(confirmation.attachments[0].contentId, 'bos-logo');
  assert.equal(confirmation.attachments[0].filename, 'BookOurSpace-Brand-Logo.png');
  assert.equal(confirmation.attachments[0].contentType, 'image/png');
  assert.deepEqual([...Buffer.from(confirmation.attachments[0].content).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(confirmation.attachments[1].contentId, 'bos-qr');
  assert.equal(confirmation.attachments[1].filename, 'BookOurSpace-PG-confirmation-Barcode.png');
  assert.deepEqual([...Buffer.from(confirmation.attachments[1].content).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const barcodeAsset = await readFile('public/assets/brand/bos-booking-barcode-brand.png');
  assert.deepEqual(Buffer.from(confirmation.attachments[1].content), barcodeAsset);
  assert.equal(confirmation.attachments[2].contentType, 'application/pdf');
  assert.match(confirmation.html, /src="data:image\/png;base64,/g);
  assert.equal((confirmation.html.match(/src="data:image\/png;base64,/g) || []).length, 2);

  const cancelled = await buildPgQaSampleEmail('cancellation', details);
  assert.equal(cancelled.attachments.length, 2);
  assert.match(cancelled.text, /cancelled/i);

  const generatedQr = await buildBrandBookingQrPng('BOS-QA-PG:alert:pg-qa-test-1');
  assert.deepEqual([...generatedQr.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
