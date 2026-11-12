import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';

const dbUrl = process.env.BOS_LISTINGS_DATABASE_URL;
const dbTest = dbUrl ? test : test.skip;

dbTest('invitation acceptance requires pending, unexpired token and matching Google identity', async () => {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  const owner = randomUUID();
  const invited = randomUUID();
  const businessRef = `BIZ-INV-${randomUUID().slice(0, 8).toUpperCase()}`;
  let businessId;
  try {
    for (const [id, email] of [[owner, `inv-owner-${owner}@example.test`], [invited, `inv-target-${invited}@example.test`]]) {
      await pool.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,'{}'::jsonb)`, [id, email]);
      await pool.query(`insert into public.profiles (id,email,full_name,role,account_status) values ($1,$2,'Invite Test','provider','active') on conflict (id) do update set role='provider',account_status='active'`, [id, email]);
    }
    businessId = (await pool.query(`insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source) values ($1,'Invite Test','services',$2,'approved',true,'invite_test') returning id`, [businessRef, owner])).rows[0].id;
    const email = `inv-target-${invited}@example.test`;
    const pendingToken = createHash('sha256').update(randomUUID()).digest('hex');
    const expiredToken = createHash('sha256').update(randomUUID()).digest('hex');
    const revokedToken = createHash('sha256').update(randomUUID()).digest('hex');
    await pool.query(`insert into public.business_invitations (business_id,email,role,token_hash,invited_by,expires_at) values ($1,$2,'staff',$3,$4,now()+interval '1 day'),($1,$5,'staff',$6,$4,now()-interval '1 day'),($1,$7,'staff',$8,$4,now()+interval '1 day')`, [businessId, email, pendingToken, owner, `expired-${email}`, expiredToken, `revoked-${email}`, revokedToken]);
    await pool.query(`update public.business_invitations set status='revoked' where token_hash=$1`, [revokedToken]);
    const lookup = async (hash) => (await pool.query(`select i.id,p.email from public.business_invitations i join public.profiles p on p.id=$1 where i.token_hash=$2 and i.status='pending' and i.expires_at>now() limit 1`, [invited, hash])).rows[0] || null;
    assert.ok(await lookup(pendingToken), 'valid pending token resolves');
    assert.equal(await lookup(expiredToken), null, 'expired token does not resolve');
    assert.equal(await lookup(revokedToken), null, 'revoked token does not resolve');
    assert.equal((await pool.query('select lower(email) as email from public.profiles where id=$1', [invited])).rows[0].email, email.toLowerCase(), 'Google identity email matches the invite');
  } finally {
    if (businessId) await pool.query('delete from public.businesses where id=$1', [businessId]).catch(() => {});
    await pool.query('delete from public.profiles where id=any($1::uuid[])', [[owner, invited]]).catch(() => {});
    await pool.query('delete from auth.users where id=any($1::uuid[])', [[owner, invited]]).catch(() => {});
    await pool.end();
  }
});
