import type { Express, Request, Response } from 'express';
import { Resend } from 'resend';

export const RESEND_VERIFIED_DOMAIN = 'mail.bookourspace.com';
export const RESEND_VERIFIED_SENDER = 'info@mail.bookourspace.com';

export interface ResendSetupStatus {
  provider: 'resend';
  configured: boolean;
  sendEnabled: boolean;
  receivingEnabled: boolean;
  domain: string;
  from: string;
  blockedReasons: string[];
}

export interface TransactionalEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer | Uint8Array | ArrayBuffer;
    contentType?: string;
    contentId?: string;
  }>;
  idempotencyKey?: string;
  explicitAuthorization?: true;
  /** Narrow escape hatch for the development-only fixed-recipient smoke test. */
  developmentOnlyTest?: true;
}

export type TransactionalEmailResult =
  | { ok: true; id: string; requestId?: string }
  | { ok: false; error: string; blockedReasons?: string[]; statusCode?: number | null };

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function extractEmailAddress(value: string): string {
  const angleAddress = value.match(/<\s*([^<>\s]+)\s*>\s*$/)?.[1];
  return (angleAddress || value).trim().toLowerCase();
}

export function getResendDevelopmentTestStatus(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  recipient: string;
  blockedReasons: string[];
} {
  const recipient = String(env.RESEND_DEV_TEST_RECIPIENT || '').trim().toLowerCase();
  const blockedReasons: string[] = [];

  if (env.NODE_ENV !== 'development') blockedReasons.push('RESEND_DEV_TEST_NOT_DEVELOPMENT');
  if (!isEnabled(env.RESEND_DEV_TEST_EMAIL_ENABLED)) blockedReasons.push('RESEND_DEV_TEST_DISABLED');
  if (!recipient) blockedReasons.push('RESEND_DEV_TEST_RECIPIENT_MISSING');

  return {
    enabled: blockedReasons.length === 0,
    recipient,
    blockedReasons,
  };
}

export function isDevelopmentTestSendAuthorized(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const status = getResendDevelopmentTestStatus(env);
  if (!status.enabled || !body || typeof body !== 'object') return false;
  const candidate = body as { confirmSend?: unknown; to?: unknown };
  return candidate.confirmSend === true && String(candidate.to || '').trim().toLowerCase() === status.recipient;
}

export function getResendSetupStatus(env: NodeJS.ProcessEnv = process.env): ResendSetupStatus {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const domain = String(env.RESEND_DOMAIN || 'mail.bookourspace.com').trim();
  const from = String(env.RESEND_FROM || '').trim();
  const blockedReasons: string[] = [];

  if (!apiKey) blockedReasons.push('RESEND_API_KEY_MISSING');
  if (!from) blockedReasons.push('RESEND_FROM_MISSING');
  if (domain.toLowerCase() !== RESEND_VERIFIED_DOMAIN) blockedReasons.push('RESEND_DOMAIN_MISMATCH');
  if (from && extractEmailAddress(from) !== RESEND_VERIFIED_SENDER) {
    blockedReasons.push('RESEND_FROM_NOT_VERIFIED');
  }
  if (!isEnabled(env.RESEND_SEND_ENABLED)) blockedReasons.push('RESEND_SEND_DISABLED');
  if (!isEnabled(env.RESEND_DOMAIN_VERIFIED)) blockedReasons.push('RESEND_DOMAIN_NOT_CONFIRMED');
  if (!isEnabled(env.RESEND_BILLING_CONFIRMED)) blockedReasons.push('RESEND_BILLING_NOT_CONFIRMED');

  return {
    provider: 'resend',
    configured: Boolean(apiKey),
    sendEnabled: blockedReasons.length === 0,
    receivingEnabled: isEnabled(env.RESEND_RECEIVING_ENABLED),
    domain,
    from,
    blockedReasons,
  };
}

/**
 * Send one transactional email only after the operator explicitly opens all
 * three safety gates: sending, domain verification, and billing confirmation.
 * Resend API failures are returned as values, matching the official SDK.
 */
export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TransactionalEmailResult> {
  const status = getResendSetupStatus(env);
  const isDevelopmentOnlyTest = input.developmentOnlyTest === true;
  const blockedReasons = isDevelopmentOnlyTest
    ? [
        ...getResendDevelopmentTestStatus(env).blockedReasons,
        ...status.blockedReasons.filter((reason) => reason !== 'RESEND_SEND_DISABLED' && reason !== 'RESEND_BILLING_NOT_CONFIRMED'),
      ].filter((reason, index, reasons) => reasons.indexOf(reason) === index)
    : status.blockedReasons;
  if (blockedReasons.length > 0) {
    return {
      ok: false,
      error: 'RESEND_NOT_READY',
      blockedReasons,
    };
  }

  if (input.explicitAuthorization !== true) {
    return { ok: false, error: 'RESEND_EXPLICIT_AUTHORIZATION_REQUIRED' };
  }

  if (isDevelopmentOnlyTest) {
    const testRecipient = getResendDevelopmentTestStatus(env).recipient;
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    if (recipients.length !== 1 || String(recipients[0]).trim().toLowerCase() !== testRecipient) {
      return { ok: false, error: 'RESEND_DEV_TEST_RECIPIENT_ONLY' };
    }
  }

  if (!input.html && !input.text) {
    return { ok: false, error: 'RESEND_EMAIL_BODY_MISSING' };
  }

  const resend = new Resend(String(env.RESEND_API_KEY).trim());
  const attachments = input.attachments?.map((attachment) => ({
    filename: attachment.filename,
    content: attachment.content,
    // The Resend Node SDK expects camelCase here and serializes these fields
    // to content_type/content_id for the API. Passing snake_case makes the
    // files arrive as ordinary attachments, so cid: images render broken.
    ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  }));
  const email = input.html
    ? {
        from: status.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }
    : {
        from: status.from,
        to: input.to,
        subject: input.subject,
        text: input.text as string,
        ...(attachments?.length ? { attachments } : {}),
      };
  const response = await resend.emails.send(
    email,
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );

  if (response.error) {
    return {
      ok: false,
      error: response.error.name || 'RESEND_API_ERROR',
      statusCode: response.error.statusCode,
    };
  }

  if (!response.data?.id) {
    return { ok: false, error: 'RESEND_MISSING_EMAIL_ID' };
  }

  return {
    ok: true,
    id: response.data.id,
    requestId: response.headers?.['x-request-id'] || undefined,
  };
}

export function buildDevelopmentTestEmail(recipient: string): TransactionalEmailInput {
  return {
    to: recipient,
    subject: 'BookOurSpace | Development QA email test',
    text: [
      'Hello BookOurSpace QA,',
      '',
      'This is a development-only transactional email test.',
      'Sender: info@mail.bookourspace.com',
      'Template: Standard BookOurSpace notification format',
      'Status: Test delivery only',
      '',
      'No customer booking, payment, invoice, reminder, or production workflow was triggered.',
      '',
      'BookOurSpace QA Team',
    ].join('\n'),
    html: `<div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe3ef;border-radius:16px;overflow:hidden"><div style="background:#0f766e;padding:24px 28px;color:#fff"><div style="font-size:22px;font-weight:700">BookOurSpace</div><div style="font-size:13px;margin-top:6px;opacity:.9">Development QA notification</div></div><div style="padding:28px"><p style="font-size:16px;margin-top:0">Hello BookOurSpace QA,</p><p>This is a development-only transactional email test using the standard BookOurSpace notification format.</p><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="padding:10px 0;color:#667085">Sender</td><td style="padding:10px 0;text-align:right">info@mail.bookourspace.com</td></tr><tr><td style="padding:10px 0;color:#667085">Template</td><td style="padding:10px 0;text-align:right">Standard notification</td></tr><tr><td style="padding:10px 0;color:#667085">Status</td><td style="padding:10px 0;text-align:right;color:#0f766e;font-weight:700">Test delivery only</td></tr></table><p style="font-size:13px;color:#667085">No customer booking, payment, invoice, reminder, or production workflow was triggered.</p></div><div style="border-top:1px solid #dbe3ef;padding:18px 28px;font-size:12px;color:#667085">BookOurSpace QA Team · info@mail.bookourspace.com</div></div></div>`,
    explicitAuthorization: true,
    developmentOnlyTest: true,
  };
}

export function registerResendDevelopmentTestApi(
  app: Express,
  options: {
    env?: NodeJS.ProcessEnv;
    isAdmin: (request: Request) => boolean;
  },
): void {
  const env = options.env || process.env;
  if (env.NODE_ENV !== 'development') return;

  app.post('/api/dev/resend/test-email', async (req: Request, res: Response) => {
    if (!options.isAdmin(req)) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' });
      return;
    }

    const developmentStatus = getResendDevelopmentTestStatus(env);
    if (!developmentStatus.enabled) {
      res.status(403).json({
        ok: false,
        error: 'RESEND_DEV_TEST_DISABLED',
        blockedReasons: developmentStatus.blockedReasons,
      });
      return;
    }

    if (!isDevelopmentTestSendAuthorized(req.body, env)) {
      res.status(400).json({
        ok: false,
        error: 'RESEND_EXPLICIT_TEST_AUTHORIZATION_REQUIRED',
        requirement: 'POST the configured test recipient with confirmSend=true.',
      });
      return;
    }

    const result = await sendTransactionalEmail(buildDevelopmentTestEmail(developmentStatus.recipient), env);

    if (!result.ok) {
      res.status(503).json(result);
      return;
    }

    res.json({ ok: true, testOnly: true, id: result.id, requestId: result.requestId });
  });
}
