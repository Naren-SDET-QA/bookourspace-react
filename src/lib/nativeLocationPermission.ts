export type NativeLocationAccess = 'granted' | 'denied' | 'unavailable';

export type NativeLocationDiagnostic = {
  stage: 'permission-check' | 'permission-request' | 'position-read';
  outcome: 'granted' | 'denied' | 'prompt' | 'timeout' | 'error' | 'success' | 'unavailable';
  durationMs: number;
  errorCode?: string;
};

type PermissionStatus = {
  location?: string;
  coarseLocation?: string;
};

type PermissionOperation = () => Promise<PermissionStatus>;
type DiagnosticHandler = (event: NativeLocationDiagnostic) => void;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operation,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), Math.max(0, timeoutMs));
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function statusOf(status?: PermissionStatus): NativeLocationAccess | 'prompt' {
  if (!status) return 'prompt';
  if (status.location === 'granted' || status.coarseLocation === 'granted') return 'granted';
  const values = [status.location, status.coarseLocation].filter(Boolean);
  if (values.length > 0 && values.every((value) => value === 'denied')) return 'denied';
  return 'prompt';
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

function isPermissionDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /permission.*denied|denied.*permission/i.test(message) || errorCodeOf(error) === 'OS-PLUG-GLOC-0003';
}

export async function requestNativeLocationAccess(
  requestPermissions: PermissionOperation,
  checkPermissions: PermissionOperation,
  promptTimeoutMs = 60_000,
  statusTimeoutMs = 2_000,
  onDiagnostic?: DiagnosticHandler,
): Promise<NativeLocationAccess> {
  const checkStartedAt = Date.now();
  try {
    const current = await withTimeout(checkPermissions(), statusTimeoutMs);
    const currentStatus = statusOf(current);
    onDiagnostic?.({
      stage: 'permission-check',
      outcome: current === undefined ? 'timeout' : currentStatus,
      durationMs: Date.now() - checkStartedAt,
    });
    if (currentStatus === 'granted') return 'granted';
  } catch (error) {
    onDiagnostic?.({
      stage: 'permission-check',
      outcome: 'error',
      durationMs: Date.now() - checkStartedAt,
      errorCode: errorCodeOf(error),
    });
    if (isPermissionDenied(error)) return 'denied';
    // Requesting remains useful if the bridge check itself fails transiently.
  }

  const requestStartedAt = Date.now();
  try {
    const requested = await withTimeout(requestPermissions(), promptTimeoutMs);
    const requestedStatus = statusOf(requested);
    onDiagnostic?.({
      stage: 'permission-request',
      outcome: requested === undefined ? 'timeout' : requestedStatus,
      durationMs: Date.now() - requestStartedAt,
    });
    if (requestedStatus === 'granted') return 'granted';
    if (requestedStatus === 'denied') return 'denied';
  } catch (error) {
    onDiagnostic?.({
      stage: 'permission-request',
      outcome: 'error',
      durationMs: Date.now() - requestStartedAt,
      errorCode: errorCodeOf(error),
    });
    if (isPermissionDenied(error)) return 'denied';
  }

  // The user may answer a native prompt at the timeout boundary. Re-read the
  // authoritative OS state before reporting failure or requiring another tap.
  const finalCheckStartedAt = Date.now();
  try {
    const finalStatus = await withTimeout(checkPermissions(), statusTimeoutMs);
    const finalAccess = statusOf(finalStatus);
    onDiagnostic?.({
      stage: 'permission-check',
      outcome: finalStatus === undefined ? 'timeout' : finalAccess,
      durationMs: Date.now() - finalCheckStartedAt,
    });
    if (finalAccess !== 'prompt') return finalAccess;
  } catch (error) {
    onDiagnostic?.({
      stage: 'permission-check',
      outcome: 'error',
      durationMs: Date.now() - finalCheckStartedAt,
      errorCode: errorCodeOf(error),
    });
    if (isPermissionDenied(error)) return 'denied';
  }

  return 'unavailable';
}
