import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const schema = readFileSync(path.join(process.cwd(), 'supabase', 'schema_and_rls.sql'), 'utf8');
const cancellationStart = schema.indexOf('CREATE OR REPLACE FUNCTION public.cancel_booking_atomic');
const cancellationEnd = schema.indexOf('-- ============================================================================', cancellationStart + 1);
const cancellationFunction = schema.slice(cancellationStart, cancellationEnd > cancellationStart ? cancellationEnd : undefined);

test('stay cancellation SQL contract keeps ownership and RLS boundaries explicit', () => {
  assert.ok(cancellationStart >= 0);
  assert.match(cancellationFunction, /SECURITY INVOKER/);
  assert.match(cancellationFunction, /auth\.uid\(\) IS NULL/);
  assert.match(cancellationFunction, /user_id = auth\.uid\(\)/);
  assert.match(cancellationFunction, /status <> 'cancelled'/);
  assert.match(schema, /REVOKE ALL ON FUNCTION public\.cancel_booking_atomic/);
  assert.match(schema, /GRANT EXECUTE ON FUNCTION public\.cancel_booking_atomic[^;]+TO authenticated/);
});
