export interface SupabaseLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

const MISSING_OBJECT_CODES = new Set([
  'PGRST205', // table not in PostgREST schema cache
  'PGRST202', // function not in schema cache
  '42P01', // undefined_table
  '42883', // undefined_function
  '3F000', // invalid_schema_name
]);

const MISSING_OBJECT_PATTERN =
  /(could not find the (table|function)|does not exist|no such table|undefined (table|function)|schema cache)/i;

export function isMissingDatabaseObjectError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_OBJECT_CODES.has(String(error.code))) return true;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  return MISSING_OBJECT_PATTERN.test(text);
}

export function describeDatabaseError(error: SupabaseLikeError | null | undefined): string {
  if (!error) return 'unknown error';
  const code = error.code ? `${error.code}: ` : '';
  return `${code}${error.message || error.details || 'database request failed'}`;
}
