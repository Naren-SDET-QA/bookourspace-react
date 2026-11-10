// Environment-driven Supabase configuration resolution.
//
// Rules:
//   1. There is no implicit target. Without an explicit VITE_SUPABASE_URL the
//      client stays disabled; the production project is never selected for
//      you, so no live connection can happen by accident.
//   2. An explicit target is validated as a whole: URL shape, project
//      reference and key type. Legacy JWTs can be checked against the project
//      reference; opaque publishable keys cannot encode a project reference.
//      Anything invalid fails
//      closed with an empty project URL - it never switches to production.
//   3. Hosted projects must be explicitly allowlisted as development. This is
//      a deployment decision, not inferred from a hard-coded project ref.
//      Local Supabase loopback remains available for local development.
//   4. Only public (publishable/anon) keys are accepted. Service-role secrets,
//      sb_secret_ keys and PostgreSQL connection strings are refused.
//
// This module is pure (no `import.meta.env`, no browser globals beyond atob),
// so both the Vite client and the Express server resolve configuration the
// same way and the behaviour is unit-testable.

const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/;

/** Placeholder shipped in .env.example; treated as "not configured". */
const PLACEHOLDER_KEY_VALUES = new Set([
  'your-supabase-publishable-or-anon-key',
  'your-development-project-id',
]);

export interface SupabaseConfigInput {
  url?: string | null;
  projectId?: string | null;
  developmentProjectId?: string | null;
  publishableKey?: string | null;
  anonKey?: string | null;
}

export type SupabaseEnvironment = Record<string, unknown>;

export interface ResolvedSupabaseConfig {
  /** Empty unless an explicit, valid target was configured. */
  projectId: string;
  /** Empty unless an explicit, valid target was configured. */
  projectUrl: string;
  authCallbackUrl: string;
  publishableKey: string;
  isConfigured: boolean;
  errors: string[];
}

export interface DevelopmentSupabasePreflight {
  ok: boolean;
  projectId: string;
  projectUrl: string;
  errors: string[];
}

function environmentValue(env: SupabaseEnvironment, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' ? value : undefined;
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/i;

function decodeJwtPayload(segment: string): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = typeof atob === 'function' ? atob(padded) : '';
    if (!json) return null;
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

type ParsedUrl = { ok: true; url: string; projectRef: string } | { ok: false; message: string };

function parseSupabaseUrl(raw: string): ParsedUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      message: 'VITE_SUPABASE_URL is not a valid absolute URL (expected https://<project-ref>.supabase.co).',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      message: 'VITE_SUPABASE_URL must use http(s). PostgreSQL and other connection strings are not accepted.',
    };
  }

  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return {
      ok: false,
      message: 'VITE_SUPABASE_URL must be a project origin without credentials, path, query, or fragment.',
    };
  }

  const hostname = parsed.hostname;
  if (isLoopbackHost(hostname)) {
    if (parsed.protocol !== 'http:') {
      return { ok: false, message: 'A loopback VITE_SUPABASE_URL must use http (local Supabase stack).' };
    }
    return { ok: true, url: raw.replace(/\/+$/, ''), projectRef: 'local' };
  }

  if (!hostname.endsWith('.supabase.co')) {
    return {
      ok: false,
      message:
        'VITE_SUPABASE_URL must point at <project-ref>.supabase.co (or a loopback local stack); refusing an unrecognised host.',
    };
  }

  const ref = hostname.slice(0, -'.supabase.co'.length);
  if (!ref) {
    return { ok: false, message: 'VITE_SUPABASE_URL is missing its project reference.' };
  }

  return { ok: true, url: raw.replace(/\/+$/, ''), projectRef: ref };
}

function validateKey(key: string, projectId: string, isLocal: boolean): string | null {
  if (!key) {
    return 'MISSING_SUPABASE_PUBLISHABLE_KEY: set VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).';
  }
  if (PLACEHOLDER_KEY_VALUES.has(key.toLowerCase())) {
    return 'MISSING_SUPABASE_PUBLISHABLE_KEY: the key is still the .env.example placeholder.';
  }

  const lower = key.toLowerCase();
  if (lower.startsWith('postgres://') || lower.startsWith('postgresql://')) {
    return 'SUPABASE_KEY_IS_DATABASE_URL: never put a PostgreSQL connection string in frontend env vars.';
  }
  if (lower.includes('sb_secret_')) {
    return 'SUPABASE_KEY_IS_SECRET_KEY: refusing a service-role or secret key in frontend code; use the publishable/anon key.';
  }

  if (PUBLISHABLE_KEY_PATTERN.test(key)) return null;

  const parts = key.split('.');
  if (parts.length === 3 && parts.every(Boolean)) {
    const payload = decodeJwtPayload(parts[1]);
    if (!payload) {
      return 'INVALID_SUPABASE_PUBLISHABLE_KEY: JWT-formatted keys must have a valid payload.';
    }
    const role = typeof payload.role === 'string' ? payload.role : '';
    if (role === 'service_role' || role === 'supabase_admin') {
      return 'SUPABASE_KEY_IS_SERVICE_ROLE: the key JWT has a privileged role; only anon keys may run in the browser.';
    }
    if (role !== 'anon') {
      return 'INVALID_SUPABASE_PUBLISHABLE_KEY: legacy JWT keys must have role anon.';
    }
    const keyRef = typeof payload.ref === 'string' ? payload.ref : '';
    if (!isLocal && !keyRef) {
      return 'INVALID_SUPABASE_PUBLISHABLE_KEY: hosted legacy anon JWT must include a project reference.';
    }
    if (keyRef && projectId && keyRef !== projectId) {
      return `SUPABASE_KEY_PROJECT_REFERENCE_MISMATCH: the key belongs to project "${keyRef}" but the configured project is "${projectId}".`;
    }
    return null;
  }

  if (lower.includes('service_role')) {
    return 'SUPABASE_KEY_IS_SECRET_KEY: refusing a service-role key in frontend code; use the publishable/anon key.';
  }

  return 'INVALID_SUPABASE_PUBLISHABLE_KEY: expected a Supabase publishable key or legacy anon JWT.';
}

function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_KEY_VALUES.has(key.toLowerCase());
}

export function resolveSupabaseConfig(input: SupabaseConfigInput = {}): ResolvedSupabaseConfig {
  const explicitUrl = clean(input.url);
  const explicitProjectId = clean(input.projectId);
  const developmentProjectId = clean(input.developmentProjectId);
  const publishableKey = clean(input.publishableKey);
  const anonKey = clean(input.anonKey);
  const key = publishableKey || anonKey;
  const errors: string[] = [];

  let projectId = '';
  let projectUrl = '';

  if (!explicitUrl) {
    // No implicit production fallback: without a stated URL there is no target.
    if (explicitProjectId) {
      errors.push(
        'MISSING_SUPABASE_URL: VITE_SUPABASE_PROJECT_ID is set but VITE_SUPABASE_URL is not; the URL is never derived implicitly, so live Supabase stays disabled.'
      );
    } else if (key) {
      errors.push(
        'MISSING_SUPABASE_URL: a Supabase key is set but VITE_SUPABASE_URL is not; live Supabase stays disabled.'
      );
    }
  } else {
    const parsedUrl = parseSupabaseUrl(explicitUrl);
    let urlRef = '';
    if (parsedUrl.ok) {
      projectUrl = parsedUrl.url;
      urlRef = parsedUrl.projectRef;
    } else {
      errors.push(`INVALID_SUPABASE_URL: ${parsedUrl.message}`);
    }

    if (urlRef && urlRef !== 'local') {
      if (!explicitProjectId) {
        errors.push('MISSING_SUPABASE_PROJECT_ID: hosted configuration requires an explicit VITE_SUPABASE_PROJECT_ID.');
      }
      if (!developmentProjectId) {
        errors.push('SUPABASE_DEVELOPMENT_PROJECT_NOT_ALLOWLISTED: explicitly set VITE_SUPABASE_DEVELOPMENT_PROJECT_ID for this development target.');
      } else if (developmentProjectId !== urlRef) {
        errors.push('SUPABASE_DEVELOPMENT_PROJECT_REFERENCE_MISMATCH: the URL project is not the explicitly allowlisted development project.');
      }
      if (developmentProjectId && !PROJECT_ID_PATTERN.test(developmentProjectId)) {
        errors.push('INVALID_SUPABASE_DEVELOPMENT_PROJECT_ID: the development allowlist value is not a valid project reference.');
      }
    } else if (urlRef === 'local' && explicitProjectId && explicitProjectId !== 'local') {
      errors.push('SUPABASE_PROJECT_REFERENCE_MISMATCH: a local Supabase URL must use project ID "local".');
    }

    if (explicitProjectId && !PROJECT_ID_PATTERN.test(explicitProjectId)) {
      errors.push(
        `INVALID_SUPABASE_PROJECT_ID: "${explicitProjectId}" is not a valid Supabase project reference.`
      );
    } else if (explicitProjectId && urlRef && urlRef !== 'local' && explicitProjectId !== urlRef) {
      errors.push(
        `SUPABASE_PROJECT_REFERENCE_MISMATCH: VITE_SUPABASE_URL belongs to "${urlRef}" but VITE_SUPABASE_PROJECT_ID is "${explicitProjectId}".`
      );
    }

    if (urlRef) {
      projectId = explicitProjectId || urlRef;
    }

    // The URL and the project id must describe the same target; a rejected
    // statement leaves no project at all rather than a half-configured one.
    if (errors.length > 0) {
      projectId = '';
      projectUrl = '';
    }
  }

  if (projectUrl || errors.length > 0) {
    // Vite exposes every VITE_* value to the browser, even when the client
    // would otherwise prefer a different alias. Validate both aliases so a
    // database URL, service key, or other private value cannot hide in the
    // secondary variable while the public client appears configured.
    const configuredKeys = [publishableKey, anonKey].filter(Boolean);
    if (configuredKeys.length === 0) configuredKeys.push(key);
    for (const candidate of configuredKeys) {
      // The example placeholder is allowed as an unused fallback when the
      // other alias is configured; the selected placeholder still fails below.
      if (candidate !== key && isPlaceholderKey(candidate)) continue;
      const keyError = validateKey(candidate, projectId, projectId === 'local');
      if (!keyError) continue;
      errors.push(keyError);
      // A key that belongs to a different project makes the pairing itself
      // unusable, so the configured project is dropped rather than half-used.
      if (keyError.startsWith('SUPABASE_KEY_PROJECT_REFERENCE_MISMATCH')) {
        projectId = '';
        projectUrl = '';
      }
    }
  }

  const isConfigured =
    errors.length === 0 && Boolean(projectId) && Boolean(projectUrl) && Boolean(key);
  return {
    projectId,
    projectUrl,
    authCallbackUrl: projectUrl ? `${projectUrl}/auth/v1/callback` : '',
    publishableKey: isConfigured ? key : '',
    isConfigured,
    errors,
  };
}

/** Resolve the same explicit public Supabase settings used by Vite and the server. */
export function resolveSupabaseEnvironment(env: SupabaseEnvironment = {}): ResolvedSupabaseConfig {
  return resolveSupabaseConfig({
    url: environmentValue(env, 'VITE_SUPABASE_URL'),
    projectId: environmentValue(env, 'VITE_SUPABASE_PROJECT_ID'),
    developmentProjectId: environmentValue(env, 'VITE_SUPABASE_DEVELOPMENT_PROJECT_ID'),
    publishableKey: environmentValue(env, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
    anonKey: environmentValue(env, 'VITE_SUPABASE_ANON_KEY'),
  });
}

/**
 * Strict, offline preflight for a dedicated hosted development project.
 * Unlike the runtime resolver, this also requires the project ref to be
 * explicitly supplied. It never makes a network request or prints a key.
 */
export function preflightDevelopmentSupabaseConfig(
  input: SupabaseConfigInput = {},
): DevelopmentSupabasePreflight {
  const errors: string[] = [];
  if (!clean(input.url)) errors.push('MISSING_SUPABASE_URL: set VITE_SUPABASE_URL in .env.local.');
  if (!clean(input.projectId)) errors.push('MISSING_SUPABASE_PROJECT_ID: set VITE_SUPABASE_PROJECT_ID in .env.local.');
  if (!clean(input.developmentProjectId)) errors.push('MISSING_SUPABASE_DEVELOPMENT_PROJECT_ID: explicitly allowlist the development project in .env.local.');
  if (!clean(input.developmentProjectId)) errors.push('MISSING_SUPABASE_DEVELOPMENT_PROJECT_ID: explicitly allowlist the development project in .env.local.');
  if (!clean(input.publishableKey) && !clean(input.anonKey)) {
    errors.push('MISSING_SUPABASE_PUBLISHABLE_KEY: set a publishable or legacy anon key in .env.local.');
  }

  const resolved = resolveSupabaseConfig(input);
  errors.push(...resolved.errors);
  if (resolved.projectId === 'local') {
    errors.push('HOSTED_DEVELOPMENT_PROJECT_REQUIRED: this preflight is for a dedicated hosted project, not a local stack.');
  }

  const uniqueErrors = [...new Set(errors)];
  const ok = uniqueErrors.length === 0 && resolved.isConfigured;
  return {
    ok,
    projectId: ok ? resolved.projectId : '',
    projectUrl: ok ? resolved.projectUrl : '',
    errors: uniqueErrors,
  };
}
