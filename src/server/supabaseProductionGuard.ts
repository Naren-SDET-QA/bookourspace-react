/**
 * Development / production Supabase separation.
 *
 * One hosted project is designated for development (see
 * `DEVELOPMENT_SUPABASE_PROJECT_REFS`). A production process must therefore
 * declare its own dedicated project instead of inheriting the development
 * one:
 *
 *   - production requires an explicit `BOS_PRODUCTION_SUPABASE_PROJECT_ID`;
 *   - no Supabase variable in the process may name a development reference;
 *   - a project designated for development in the same process is refused;
 *   - the declared reference, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID`
 *     and both project URLs must all describe the same project.
 *
 * Anything else fails closed. The guard is configuration-only: it never
 * contacts Supabase, reads a key, or logs a value.
 */

export const DEVELOPMENT_SUPABASE_PROJECT_REFS = [
  'obkfgxjzlscungkhbyvq', // designated development project (ap-south-1 / Mumbai)
  'ezrxykyocgbolpaebnqx', // legacy development project (eu-north-1 / Stockholm)
  'sfoizxarbljhldmkgsma', // retired Mumbai project
] as const;

/** The variable that makes a production Supabase target explicit. */
export const PRODUCTION_SUPABASE_PROJECT_ID_VAR = 'BOS_PRODUCTION_SUPABASE_PROJECT_ID';

export const SUPABASE_SEPARATION_ERRORS = {
  refRequired: 'PRODUCTION_SUPABASE_PROJECT_ID_REQUIRED',
  refInvalid: 'PRODUCTION_SUPABASE_PROJECT_ID_INVALID',
  refConflict: 'PRODUCTION_SUPABASE_PROJECT_ID_CONFLICT',
  developmentTarget: 'PRODUCTION_SUPABASE_TARGET_IS_DEVELOPMENT',
} as const;

const PROJECT_REF_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;

export interface ProductionSupabaseTarget {
  /** Empty outside production; otherwise the declared production project ref. */
  projectId: string;
}

function cleanProjectRef(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function projectRefFromUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const hostname = new URL(raw).hostname.toLowerCase();
    if (!hostname.endsWith('.supabase.co')) return '';
    return hostname.slice(0, -'.supabase.co'.length);
  } catch {
    return '';
  }
}

export function isDevelopmentSupabaseProjectRef(projectRef: unknown): boolean {
  const normalised = cleanProjectRef(projectRef);
  return normalised !== '' && (DEVELOPMENT_SUPABASE_PROJECT_REFS as readonly string[]).includes(normalised);
}

/**
 * Refuses a production Supabase target that is the development project, and
 * refuses to start production without an explicit dedicated target.
 */
export function assertProductionSupabaseEnvironment(
  environment: Record<string, string | undefined> = process.env,
): ProductionSupabaseTarget {
  if (environment.NODE_ENV !== 'production') return { projectId: '' };

  const declared = cleanProjectRef(environment[PRODUCTION_SUPABASE_PROJECT_ID_VAR]);
  const observations: Array<[string, string]> = [
    [PRODUCTION_SUPABASE_PROJECT_ID_VAR, declared],
    ['SUPABASE_PROJECT_ID', cleanProjectRef(environment.SUPABASE_PROJECT_ID)],
    ['VITE_SUPABASE_PROJECT_ID', cleanProjectRef(environment.VITE_SUPABASE_PROJECT_ID)],
    ['SUPABASE_URL', projectRefFromUrl(environment.SUPABASE_URL)],
    ['VITE_SUPABASE_URL', projectRefFromUrl(environment.VITE_SUPABASE_URL)],
  ];

  // A known development/legacy reference is never an acceptable production
  // target, whichever variable it hides in.
  for (const [name, projectRef] of observations) {
    if (!projectRef) continue;
    if (isDevelopmentSupabaseProjectRef(projectRef)) {
      throw new Error(`${SUPABASE_SEPARATION_ERRORS.developmentTarget}:${projectRef}:${name}`);
    }
  }

  // A project designated for development in the same process cannot also be
  // the production target.
  for (const name of ['BOS_DEVELOPMENT_DATABASE_PROJECT_ID', 'VITE_SUPABASE_DEVELOPMENT_PROJECT_ID']) {
    const developmentRef = cleanProjectRef(environment[name]);
    if (!developmentRef) continue;
    if (observations.some(([, projectRef]) => projectRef === developmentRef)) {
      throw new Error(`${SUPABASE_SEPARATION_ERRORS.developmentTarget}:${developmentRef}:${name}`);
    }
  }

  if (!declared) {
    throw new Error(
      `${SUPABASE_SEPARATION_ERRORS.refRequired}: set ${PRODUCTION_SUPABASE_PROJECT_ID_VAR} to the dedicated production Supabase project reference; production never falls back to the development project.`,
    );
  }
  if (!PROJECT_REF_PATTERN.test(declared)) {
    throw new Error(`${SUPABASE_SEPARATION_ERRORS.refInvalid}:${declared}`);
  }

  const conflicting = observations
    .filter(([, projectRef]) => projectRef !== '' && projectRef !== declared)
    .map(([name, projectRef]) => `${name}=${projectRef}`);
  if (conflicting.length > 0) {
    throw new Error(`${SUPABASE_SEPARATION_ERRORS.refConflict}:${conflicting.join(',')}`);
  }

  return { projectId: declared };
}
