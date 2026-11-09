import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { isDemoDataEnabled } from '../src/lib/demoDataPolicy.ts';

test('demo fixtures require both a local development build and explicit opt-in', () => {
  assert.equal(isDemoDataEnabled({ DEV: true, VITE_ENABLE_DEMO_DATA: 'true' }), true);
  assert.equal(isDemoDataEnabled({ DEV: false, VITE_ENABLE_DEMO_DATA: 'true' }), false);
  assert.equal(isDemoDataEnabled({ DEV: true, VITE_ENABLE_DEMO_DATA: 'false' }), false);
  assert.equal(isDemoDataEnabled({ DEV: true }), false);
  assert.equal(isDemoDataEnabled({ DEV: false }), false);
});

test('fixture-backed module screens are explicitly gated and disclose preview behavior', async () => {
  const paths = [
    '../src/context/MarketplaceContext.tsx',
    '../src/components/ClassesTimingsExperience.tsx',
    '../src/components/PGDekhoExperience.tsx',
    '../src/components/VenueCategoriesGrid.tsx',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (let index = 1; index < sources.length; index += 1) {
    assert.match(sources[index], /DEMO_DATA_ENABLED/);
  }
  assert.match(sources[0], /if \(!DEMO_DATA_ENABLED\) return \[\]/);
  assert.match(sources[1], /No enquiry was sent/);
  assert.match(sources[2], /No verified PG listings available/);

  // Stay Style 2 no longer has a fixture fallback at all: discovery comes only
  // from the verified server search, and an unavailable backend is disclosed.
  const stays = await readFile(new URL('../src/components/AirbnbIndiaExperience.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(stays, /airbnbIndiaData|DEMO_DATA_ENABLED|airbnbListings/);
  assert.match(stays, /We only show stays that are published and available/);
});

test('Supabase profile metadata cannot grant elevated roles through profile update', async () => {
  const [context, client, navbar] = await Promise.all([
    readFile(new URL('../src/context/MarketplaceContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(context, /const \[userRole, setUserRoleState\] = useState<UserRole>\('customer'\)/);
  assert.doesNotMatch(context, /user_metadata\?\.role/);
  assert.match(context, /authUser\?\.role === role/);
  const profileWriter = client.slice(client.indexOf('export async function upsertRlsProfile'), client.indexOf('export async function fetchRlsListings'));
  assert.doesNotMatch(profileWriter, /role:\s*nextRole|updates\.role|user_metadata\?\.role/);
  assert.match(navbar, /authUser\?\.role === role/);
});

test('user-writable review JSON does not create a verified-customer claim', async () => {
  const client = await readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
  assert.match(client, /current schema has no server-owned verified-customer field/);
  assert.match(client, /verifiedCustomer:\s*false/);
});

test('client-writable transaction rows are neither read as settled nor inserted', async () => {
  const [client, wallet, wizard] = await Promise.all([
    readFile(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/UserWalletAndQuickModals.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PostListingWizard.tsx', import.meta.url), 'utf8'),
  ]);
  const transactionReader = client.slice(client.indexOf('export async function fetchRlsTransactions'), client.indexOf('export async function fetchRlsFavorites'));
  assert.match(transactionReader, /return null/);
  assert.match(transactionReader, /return false/);
  assert.doesNotMatch(wallet, /DEFAULT_LEDGER|Added to Wallet|recordPayment\(/);
  assert.match(wallet, /No trusted financial ledger is connected/);
  assert.match(wizard, /No listing or payment was created/);
  assert.doesNotMatch(wizard, /recordPayment\(/);
});
