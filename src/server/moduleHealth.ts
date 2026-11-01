import type { ModuleFlagRow } from './moduleGate';
import { getModule } from '../modules/registry';

/**
 * Module health, safe defaults and bounded retries.
 *
 * The rules are deliberately boring: a module whose flags cannot be read is
 * unavailable (never "assume enabled"), a disabled module is reported as
 * disabled rather than broken, and nothing here repairs data automatically.
 */

export type ModuleHealthStatus = 'ok' | 'degraded' | 'disabled' | 'unavailable';

export interface ModuleHealthInput {
  flags: readonly ModuleFlagRow[] | null;
  configIssues?: readonly string[];
  /** Null when the caller has not (or cannot) check the data services. */
  dataReachable?: boolean | null;
}

export interface ModuleHealthCheckResult {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface ModuleHealthReport {
  moduleId: string;
  status: ModuleHealthStatus;
  checks: ModuleHealthCheckResult[];
  customerMessage: string | null;
  adminMessage: string;
  retryable: boolean;
}

export function evaluateModuleHealth(moduleId: string, input: ModuleHealthInput): ModuleHealthReport {
  const module = getModule(moduleId);
  if (!module) {
    return {
      moduleId,
      status: 'unavailable',
      checks: [{ id: 'registry', label: 'Registry entry', status: 'fail', detail: 'No contract registered.' }],
      customerMessage: 'This service is unavailable.',
      adminMessage: `Module "${moduleId}" has no registry entry; add one before enabling it.`,
      retryable: false,
    };
  }

  const checks: ModuleHealthCheckResult[] = [];
  const flagRow = input.flags ? input.flags.find((row) => row.module_key === moduleId) : undefined;

  if (!input.flags) {
    checks.push({ id: 'flags', label: 'Module flags reachable', status: 'fail', detail: 'The module flag table could not be read.' });
  } else if (!flagRow) {
    checks.push({ id: 'flags', label: 'Module flags reachable', status: 'fail', detail: 'No flag row exists for this module.' });
  } else {
    checks.push({
      id: 'flags',
      label: 'Module flags reachable',
      status: 'ok',
      detail: flagRow.is_enabled ? 'Enabled by the database.' : 'Disabled by the database.',
    });
  }

  if (input.configIssues && input.configIssues.length > 0) {
    checks.push({
      id: 'config',
      label: 'Configuration valid',
      status: 'warn',
      detail: `${input.configIssues.join(' ')} Safe defaults applied.`,
    });
  } else {
    checks.push({ id: 'config', label: 'Configuration valid', status: 'ok', detail: 'Published configuration passes validation.' });
  }

  if (input.dataReachable === true) {
    checks.push({ id: 'data', label: 'Data services reachable', status: 'ok', detail: 'Catalogue queries succeeded.' });
  } else if (input.dataReachable === false) {
    checks.push({ id: 'data', label: 'Data services reachable', status: 'fail', detail: 'Catalogue queries failed.' });
  } else {
    checks.push({ id: 'data', label: 'Data services reachable', status: 'ok', detail: 'Not polled by this check.' });
  }

  const flagsUnreadable = !input.flags || !flagRow;
  const disabled = Boolean(flagRow && !flagRow.is_enabled);
  const dataFailed = input.dataReachable === false;
  const configWarned = Boolean(input.configIssues && input.configIssues.length > 0);

  let status: ModuleHealthStatus = 'ok';
  if (flagsUnreadable || dataFailed) status = 'unavailable';
  else if (disabled) status = 'disabled';
  else if (configWarned) status = 'degraded';

  const customerMessage =
    status === 'ok'
      ? null
      : status === 'disabled'
        ? `${module.label} is currently unavailable.`
        : status === 'degraded'
          ? `${module.label} is available, but some settings are using defaults.`
          : `${module.label} could not be loaded. Please try again later.`;

  return {
    moduleId,
    status,
    checks,
    customerMessage,
    adminMessage:
      status === 'ok'
        ? `${module.label} is healthy.`
        : `${module.label}: ${checks.filter((check) => check.status !== 'ok').map((check) => check.detail).join(' ')}`,
    // Only transient read failures are worth retrying; a disabled module is a
    // deliberate admin decision and must not be retried into existence.
    retryable: status === 'unavailable',
  };
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
}

const TRANSIENT = /(fetch|network|timeout|timed out|econnreset|etimedout|503|429)/i;

export function isTransientDataError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return TRANSIENT.test(message);
}

/**
 * Bounded exponential retry for read-only catalogue calls. Never used for
 * payments, inventory holds or any other non-idempotent operation.
 */
export async function withBoundedRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.min(Math.max(1, Math.floor(options.attempts ?? 2)), 3);
  const baseDelay = Math.max(0, options.baseDelayMs ?? 250);
  const maxDelay = Math.max(baseDelay, options.maxDelayMs ?? 2000);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const isRetryable = options.isRetryable ?? isTransientDataError;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const finalAttempt = attempt === attempts - 1;
      if (finalAttempt || !isRetryable(error)) throw error;
      await sleep(Math.min(maxDelay, baseDelay * 2 ** attempt));
    }
  }
  throw lastError;
}

/** Registry ids that a health snapshot should cover. */
export function healthSummary(reports: readonly ModuleHealthReport[]): {
  total: number;
  healthy: number;
  degraded: number;
  disabled: number;
  unavailable: number;
} {
  return {
    total: reports.length,
    healthy: reports.filter((report) => report.status === 'ok').length,
    degraded: reports.filter((report) => report.status === 'degraded').length,
    disabled: reports.filter((report) => report.status === 'disabled').length,
    unavailable: reports.filter((report) => report.status === 'unavailable').length,
  };
}
