/**
 * Sample content (clearly marked DEMO) is available in local development so
 * every section can be previewed. A production bundle never treats fixtures as
 * marketplace inventory.
 */
export interface DemoDataEnvironment {
  DEV?: boolean;
  VITE_ENABLE_DEMO_DATA?: string;
  /** Explicit, operator-set opt-in for a hosted preview build. */
  VITE_AI_STUDIO_DEMO?: string;
}

export function isDemoDataEnabled(environment: DemoDataEnvironment): boolean {
  return environment.VITE_ENABLE_DEMO_DATA === 'true'
    && (environment.DEV === true || environment.VITE_AI_STUDIO_DEMO === 'true');
}

export const DEMO_DATA_ENABLED = isDemoDataEnabled(import.meta.env ?? {});
