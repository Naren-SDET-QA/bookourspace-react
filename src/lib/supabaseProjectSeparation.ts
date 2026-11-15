/**
 * Shared Supabase project separation facts.
 *
 * These values are the one place that decides which hosted project references
 * are designated for development. Both the browser configuration resolver and
 * the production startup guard import them, so a project can never be accepted
 * as "development" in one place and as "production" in another.
 *
 * No key, token or secret is part of this module. Project references are public
 * identifiers that appear in every Supabase URL.
 */

export const DEVELOPMENT_SUPABASE_PROJECT_REFS = [
  'obkfgxjzlscungkhbyvq', // designated development project (ap-south-1 / Mumbai)
  'ezrxykyocgbolpaebnqx', // legacy development project (eu-north-1 / Stockholm)
  'sfoizxarbljhldmkgsma', // retired Mumbai project
] as const;

/**
 * Server-side declaration of the dedicated production project.
 * The runtime startup guard requires it in production.
 */
export const PRODUCTION_SUPABASE_PROJECT_ID_VAR = 'BOS_PRODUCTION_SUPABASE_PROJECT_ID';

/**
 * Browser-visible copy of the production declaration. Vite only exposes
 * `VITE_`-prefixed variables to `import.meta.env`, so the client resolver needs
 * its own alias. A project reference is public (it is part of the project URL);
 * this is never a secret and never a service key.
 */
export const PRODUCTION_SUPABASE_VITE_PROJECT_ID_VAR = 'VITE_BOS_PRODUCTION_SUPABASE_PROJECT_ID';

export function isDevelopmentSupabaseProjectRef(projectRef: unknown): boolean {
  const normalised = typeof projectRef === 'string' ? projectRef.trim().toLowerCase() : '';
  return normalised !== '' && (DEVELOPMENT_SUPABASE_PROJECT_REFS as readonly string[]).includes(normalised);
}
