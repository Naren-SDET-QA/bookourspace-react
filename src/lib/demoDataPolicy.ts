/**
 * Sample content (clearly marked DEMO) is available in local development so
 * every section can be previewed. A production bundle never treats fixtures as
 * marketplace inventory.
 */
export interface DemoDataEnvironment {
  DEV?: boolean;
  VITE_ENABLE_DEMO_DATA?: string;
}

export function isDemoDataEnabled(environment: DemoDataEnvironment): boolean {
  return environment.DEV === true && environment.VITE_ENABLE_DEMO_DATA === 'true';
}

export const DEMO_DATA_ENABLED = isDemoDataEnabled(import.meta.env ?? {});
