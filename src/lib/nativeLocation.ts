import { requestNativeLocationAccess } from './nativeLocationPermission';
import type { NativeLocationDiagnostic } from './nativeLocationPermission';

export interface NativeCoordinates { latitude: number; longitude: number }
export interface NativePosition { coords: NativeCoordinates }
export interface NativePositionOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  enableLocationFallback?: boolean;
}

type PositionReader = (options: NativePositionOptions) => Promise<NativePosition>;
type PermissionStatus = { location?: string; coarseLocation?: string };
type PermissionReader = () => Promise<PermissionStatus>;
type DiagnosticHandler = (event: NativeLocationDiagnostic) => void;

export class NativeLocationError extends Error {
  readonly code?: string;

  constructor(code?: string) {
    super(code === 'OS-PLUG-GLOC-0003' ? 'LOCATION_PERMISSION_DENIED' : 'LOCATION_POSITION_UNAVAILABLE');
    this.name = 'NativeLocationError';
    this.code = code;
  }
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

function isPermissionDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return errorCodeOf(error) === 'OS-PLUG-GLOC-0003' || /permission.*denied|denied.*permission/i.test(message);
}

function diagnostic(handler: DiagnosticHandler | undefined, stage: NativeLocationDiagnostic['stage'], startedAt: number, error?: unknown) {
  handler?.({
    stage,
    outcome: error ? 'error' : 'success',
    durationMs: Date.now() - startedAt,
    ...(errorCodeOf(error) ? { errorCode: errorCodeOf(error) } : {}),
  });
}

function validPosition(position: NativePosition): boolean {
  const { latitude, longitude } = position.coords;
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/** Request a balanced approximate fix; this supports Android coarse grants. */
export async function getNativePosition(
  readPosition: PositionReader,
  requestPermissions: PermissionReader,
  checkPermissions: PermissionReader,
  onDiagnostic?: DiagnosticHandler,
): Promise<NativePosition> {
  const access = await requestNativeLocationAccess(requestPermissions, checkPermissions, 60_000, 3_000, onDiagnostic);
  if (access !== 'granted') throw new NativeLocationError(access === 'denied' ? 'OS-PLUG-GLOC-0003' : undefined);

  let lastError: unknown;
  // Prefer an actual GPS fix when precise permission is available. Android
  // automatically degrades this request to approximate location if the user
  // granted only coarse access; the bounded retry then explicitly asks for a
  // balanced fix for devices that need that fallback.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now();
    try {
      const position = await readPosition({
        enableHighAccuracy: attempt === 0,
        timeout: attempt === 0 ? 30_000 : 12_000,
        maximumAge: 0,
        enableLocationFallback: true,
      });
      if (!validPosition(position)) throw new NativeLocationError('INVALID_COORDINATES');
      diagnostic(onDiagnostic, 'position-read', startedAt);
      return position;
    } catch (error) {
      lastError = error;
      diagnostic(onDiagnostic, 'position-read', startedAt, error);
      const code = errorCodeOf(error);
      if (isPermissionDenied(error) || code === 'OS-PLUG-GLOC-0007' || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new NativeLocationError(isPermissionDenied(lastError) ? 'OS-PLUG-GLOC-0003' : errorCodeOf(lastError));
}
