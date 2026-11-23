#!/usr/bin/env node
/**
 * Read-only provider-membership permission audit.
 *
 * Runs the whole connection in `default_transaction_read_only = on`, so it can
 * be pointed at a review database without any possibility of a write. It never
 * changes a grant: the "proposed default" column is a proposal for an
 * administrator to approve, not something this script applies.
 *
 * Usage:
 *   node scripts/audit-access-control-members.mjs [output.md]
 */

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const DATABASE_URL =
  process.env.BOS_LISTINGS_DATABASE_URL
  || process.env.BOS_TEST_DATABASE_URL
  || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';

const outputPath = path.resolve(process.argv[2] || 'ACCESS_CONTROL_MEMBER_AUDIT.md');

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
await client.query('begin read only');
await client.query("set local statement_timeout = '30s'");

const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const [
  missingMembers,
  closedModuleMembers,
  ownerRows,
  unknownModuleRows,
  customersWithoutGrants,
  suspendedWithGrants,
  sourceCounts,
  adminRows,
] = await Promise.all([
  q(`
    select p.email, p.id, m.role as member_role, b.name as business_name,
           b.module_type, b.approval_status, b.is_enabled
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      join public.profiles p on p.id = m.user_id
     where m.status = 'active'
       and m.role <> 'owner'
       and not exists (
         select 1 from public.business_member_access ma
          where ma.business_id = m.business_id and ma.user_id = m.user_id
       )
     order by p.email, b.name
  `),
  q(`
    select p.email, b.name as business_name, b.module_type, ma.allowed_modules
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      join public.profiles p on p.id = m.user_id
      join public.business_member_access ma
        on ma.business_id = m.business_id and ma.user_id = m.user_id
     where m.status = 'active'
       and m.role <> 'owner'
       and not (b.module_type = any(ma.allowed_modules))
     order by p.email
  `),
  q(`
    select p.email, b.name as business_name
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      join public.profiles p on p.id = m.user_id
      join public.business_member_access ma
        on ma.business_id = m.business_id and ma.user_id = m.user_id
     where m.role = 'owner'
     order by p.email
  `),
  q(`
    select p.email, cma.module_key, count(*) over (partition by p.id) as user_rows
      from public.customer_module_access cma
      join public.profiles p on p.id = cma.user_id
     where cma.module_key not in ('pg','hotels','services','movies','classes','function_hall','ecommerce')
     order by p.email
  `),
  q(`
    select p.email, p.id
      from public.profiles p
     where p.role = 'customer'
       and p.account_status = 'active'
       and not exists (select 1 from public.customer_module_access g where g.user_id = p.id)
     order by p.email
  `),
  q(`
    select p.email, p.account_status, count(g.id)::int as grant_rows
      from public.profiles p
      join public.customer_module_access g on g.user_id = p.id
     where p.account_status <> 'active'
     group by p.email, p.account_status
     order by p.email
  `),
  q(`
    select grant_source, count(*)::int as rows
      from public.customer_module_access
     group by grant_source
     order by grant_source
  `),
  q(`
    select count(*)::int as admins_with_grants
      from public.profiles p
      join public.customer_module_access g on g.user_id = p.id
     where p.role = 'admin'
  `),
]);

await client.query('rollback');
await client.end();

const lines = [];
const add = (line = '') => lines.push(line);
const code = (value) => `\`${value}\``;

add('# Provider membership permission audit');
add();
add(`Generated: ${new Date().toISOString()}`);
add();
add('Read-only: the audit transaction was opened with `begin read only`. No permission was changed.');
add();
add('## Summary');
add();
add('| Check | Count |');
add('| --- | --- |');
add(`| Active non-owner memberships with no grant row | ${missingMembers.length} |`);
add(`| Members whose grant omits their business module | ${closedModuleMembers.length} |`);
add(`| Owners holding a member grant row (should be 0) | ${ownerRows.length} |`);
add(`| Customer grants with an unknown category | ${unknownModuleRows.length} |`);
add(`| Active customers with no grant rows | ${customersWithoutGrants.length} |`);
add(`| Non-active accounts still holding grants | ${suspendedWithGrants.length} |`);
add(`| Admin accounts holding customer grants (should be 0) | ${adminRows[0]?.admins_with_grants ?? 0} |`);
add();
add('## Grant provenance');
add();
if (sourceCounts.length === 0) add('_No customer grant rows._');
else {
  add('| grant_source | rows |');
  add('| --- | --- |');
  for (const row of sourceCounts) add(`| ${code(row.grant_source)} | ${row.rows} |`);
}
add();
add('## Memberships missing a permission row');
add();
if (missingMembers.length === 0) {
  add('_None._');
} else {
  add('| Member | Business | Module | Business state | Current effective access | Proposed default (needs approval) |');
  add('| --- | --- | --- | --- | --- | --- |');
  for (const row of missingMembers) {
    add(
      `| ${code(row.email)} | ${row.business_name} | ${code(row.module_type)} | ${row.approval_status}/${row.is_enabled ? 'enabled' : 'disabled'} | `
      + `Legacy unrestricted member access (no row) | VIEW only on ${code(row.module_type)} |`,
    );
  }
}
add();
add('## Members whose grant omits their business module');
add();
if (closedModuleMembers.length === 0) add('_None._');
else {
  add('| Member | Business | Module | Stored modules | Proposed repair |');
  add('| --- | --- | --- | --- | --- |');
  for (const row of closedModuleMembers) {
    add(
      `| ${code(row.email)} | ${row.business_name} | ${code(row.module_type)} | ${code((row.allowed_modules || []).join(', '))} | `
      + `Manual review (could be an intentional suspension of access) |`,
    );
  }
}
add();
add('## Owners with a grant row');
add();
if (ownerRows.length === 0) add('_None._');
else {
  for (const row of ownerRows) add(`- ${code(row.email)} — ${row.business_name}`);
}
add();
add('## Customer grants with an unknown category');
add();
if (unknownModuleRows.length === 0) add('_None._');
else {
  add('| Customer | Category | Rows for that customer |');
  add('| --- | --- | --- |');
  for (const row of unknownModuleRows) {
    add(`| ${code(row.email)} | ${code(row.module_key)} | ${row.user_rows} |`);
  }
}
add();
add('## Active customers with no grant rows');
add();
if (customersWithoutGrants.length === 0) add('_None._');
else {
  for (const row of customersWithoutGrants) add(`- ${code(row.email)} (${row.id})`);
}
add();
add('## Non-active accounts still holding grants');
add();
if (suspendedWithGrants.length === 0) add('_None._');
else {
  add('| Account | Status | Grant rows |');
  add('| --- | --- | --- |');
  for (const row of suspendedWithGrants) add(`| ${code(row.email)} | ${code(row.account_status)} | ${row.grant_rows} |`);
}
add();
add('## Risk notes');
add();
add('- A missing row for an active non-owner member is **legacy unrestricted access**: the provider gate treats it as full access to that business until `BOS_STRICT_PERMISSION_DEFAULTS=1`. The proposed VIEW-only default must be reviewed before it is applied, because applying it is a reduction in access.');
add('- Owners bypass member grants by design; a row for an owner is refused by the database guard and should never exist.');
add('- No rows in this report were changed. Repairs only happen from the admin console after a preview and an explicit apply.');

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
console.error(`\nWritten to ${outputPath}`);
