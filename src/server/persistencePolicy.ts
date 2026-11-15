/**
 * The API currently uses JSON files for authoritative application state.
 * Those files are useful for local/test compatibility, but are not a
 * transactional or multi-instance production repository. Fail closed until
 * a real PostgreSQL repository is wired into the server.
 */
export function assertProductionPersistenceReady(
  environment: Record<string, string | undefined> = process.env,
): void {
  if (environment.NODE_ENV !== 'production') return;

  throw new Error(
    'AUTHORITATIVE_JSON_STORE_DISABLED_IN_PRODUCTION: configure and wire a verified transactional PostgreSQL repository before starting the production server.',
  );
}
