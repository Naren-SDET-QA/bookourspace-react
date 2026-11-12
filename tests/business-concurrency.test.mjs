import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';

const dbUrl = process.env.BOS_LISTINGS_DATABASE_URL;
const dbTest = dbUrl ? test : test.skip;

dbTest('invitation, ownership-transfer and payment state transitions serialize', async () => {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
  const owner = randomUUID();
  const target = randomUUID();
  const businessRef = `BIZ-CONC-${randomUUID().slice(0, 8).toUpperCase()}`;
  let businessId;
  try {
    for (const [id, email] of [[owner, `conc-owner-${owner}@example.test`], [target, `conc-target-${target}@example.test`]]) {
      await pool.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,'{}'::jsonb)`, [id, email]);
      await pool.query(`insert into public.profiles (id,email,full_name,role,account_status) values ($1,$2,'Concurrency Test','provider','active') on conflict (id) do update set role='provider',account_status='active'`, [id, email]);
    }
    const created = await pool.query(`insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source) values ($1,'Concurrency Test','services',$2,'approved',true,'concurrency_test') returning id`, [businessRef, owner]);
    businessId = created.rows[0].id;
    await pool.query(`insert into public.business_invitations (business_id,email,role,token_hash,invited_by,expires_at) values ($1,$2,'staff',$3,$4,now()+interval '1 day')`, [businessId, `conc-preexisting-${owner}@example.test`, createHash('sha256').update(randomUUID()).digest('hex'), owner]);
    const duplicate = await Promise.allSettled([
      pool.query(`insert into public.business_invitations (business_id,email,role,token_hash,invited_by,expires_at) values ($1,$2,'staff',$3,$4,now()+interval '1 day')`, [businessId, `conc-invite-${owner}@example.test`, createHash('sha256').update(randomUUID()).digest('hex'), owner]),
      pool.query(`insert into public.business_invitations (business_id,email,role,token_hash,invited_by,expires_at) values ($1,$2,'staff',$3,$4,now()+interval '1 day')`, [businessId, `conc-invite-${owner}@example.test`, createHash('sha256').update(randomUUID()).digest('hex'), owner]),
    ]);
    assert.equal(duplicate.filter((entry) => entry.status === 'rejected').length, 1, 'one duplicate invitation wins');

    const transfer = await pool.query(`insert into public.business_ownership_transfers (business_id,from_user_id,to_user_id,to_email,token_hash,created_by,expires_at) values ($1,$2,$3,$4,$5,$2,now()+interval '1 hour') returning id`, [businessId, owner, target, `conc-target-${target}@example.test`, createHash('sha256').update(randomUUID()).digest('hex')]);
    const accepted = await Promise.all([
      pool.query(`update public.business_ownership_transfers set status='accepted',accepted_at=now() where id=$1 and status='pending' returning id`, [transfer.rows[0].id]),
      pool.query(`update public.business_ownership_transfers set status='accepted',accepted_at=now() where id=$1 and status='pending' returning id`, [transfer.rows[0].id]),
    ]);
    assert.equal(accepted.reduce((sum, result) => sum + result.rowCount, 0), 1, 'only one transfer acceptance commits');

    const payment = await pool.query(`insert into public.payment_intents (id,user_id,purpose,listing_id,amount_paise,payment_mode,provider,status,idempotency_key,expires_at,business_id) values ($1,$2,'subscription','concurrency-listing',100,'pay_after_service','manual','created',$3,now()+interval '1 hour',$4) returning id`, [`concurrency-${randomUUID()}`, owner, randomUUID(), businessId]);
    const verified = await Promise.all([
      pool.query(`update public.payment_intents set status='verified',verified_at=now() where id=$1 and status='created' returning id`, [payment.rows[0].id]),
      pool.query(`update public.payment_intents set status='verified',verified_at=now() where id=$1 and status='created' returning id`, [payment.rows[0].id]),
    ]);
    assert.equal(verified.reduce((sum, result) => sum + result.rowCount, 0), 1, 'only one payment verification commits');
  } finally {
    if (businessId) await pool.query('delete from public.businesses where id=$1', [businessId]).catch(() => {});
    await pool.query('delete from public.profiles where id = any($1::uuid[])', [[owner, target]]).catch(() => {});
    await pool.query('delete from auth.users where id = any($1::uuid[])', [[owner, target]]).catch(() => {});
    await pool.end();
  }
});
