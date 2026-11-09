/** Keep database and provider diagnostics out of logs; only emit bounded codes. */
export function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UNCLASSIFIED';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'UNCLASSIFIED';
}

export function logSafeError(scope: string, operation: string, error: unknown): void {
  const safeScope = scope.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'server';
  const safeOperation = operation.replace(/[^a-z0-9 _-]/gi, '').slice(0, 60) || 'operation';
  console.error(`[${safeScope}] ${safeOperation} failed`, safeErrorCode(error));
}
