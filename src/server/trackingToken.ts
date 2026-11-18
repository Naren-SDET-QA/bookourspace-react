import { createHash, randomBytes } from 'node:crypto';
import { TRACKING_TOKEN_BYTES, isTrackingTokenFormat } from '../lib/trackingShare';

export function generateTrackingToken(random: () => Buffer = () => randomBytes(TRACKING_TOKEN_BYTES)): string {
  const token = random().toString('base64url');
  if (!isTrackingTokenFormat(token)) throw new Error('TRACKING_TOKEN_INVALID');
  return token;
}

export function hashTrackingToken(token: string): string {
  if (!isTrackingTokenFormat(token)) throw new Error('TRACKING_TOKEN_INVALID');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
