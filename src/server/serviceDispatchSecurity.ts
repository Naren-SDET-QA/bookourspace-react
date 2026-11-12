export const ACTIVE_TRACKING_STATUSES = new Set(['travelling', 'arrived', 'started', 'in_progress']);

export function validateLocationInput(input: { consentGranted?: unknown; latitude?: unknown; longitude?: unknown; accuracyM?: unknown }) {
  if (input.consentGranted !== true) throw new Error('LOCATION_CONSENT_REQUIRED');
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const accuracyM = input.accuracyM == null ? null : Number(input.accuracyM);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('INVALID_LOCATION');
  if (accuracyM != null && (!Number.isFinite(accuracyM) || accuracyM < 0)) throw new Error('INVALID_LOCATION_ACCURACY');
  return { latitude, longitude, accuracyM };
}

export function isLocationStale(recordedAt: string | Date | null | undefined, now = Date.now(), maxAgeMs = 15 * 60 * 1000, stoppedAt?: string | Date | null) {
  if (!recordedAt || stoppedAt) return true;
  const time = new Date(recordedAt).getTime();
  return !Number.isFinite(time) || time < now - maxAgeMs || time > now + 60_000;
}

export function isAllowedDispatchTransition(from: string, to: string) {
  const graph: Record<string, string[]> = {
    requested: ['accepted', 'rejected', 'cancelled'],
    accepted: ['assigned', 'travelling', 'in_progress', 'cancelled'],
    assigned: ['travelling', 'cancelled'],
    travelling: ['arrived', 'cancelled'],
    arrived: ['started', 'cancelled'],
    started: ['completed', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
  };
  return Boolean(graph[from]?.includes(to));
}

export function normalizeOtpCode(value: unknown) {
  const code = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{6}$/.test(code)) throw new Error('OTP_CODE_MUST_BE_SIX_DIGITS');
  return code;
}
