import crypto from 'node:crypto';
import type express from 'express';
import type { Pool } from 'pg';
import { sanitizeAccessScope } from '../lib/businessAccess';
const MODULES = new Set(['pg_hostels', 'classes', 'venues', 'services', 'hotel_stay', 'movies']);

type BusinessActor = { supabaseUserId?: string | null; authProvider?: string; role?: string };
type VerifySession = (request: express.Request) => BusinessActor | null;

function reject(response: express.Response, status: number, error: string): null {
  response.status(status).json({ ok: false, error });
  return null;
}

function actorFrom(request: express.Request, response: express.Response, verifySession: VerifySession): BusinessActor | null {
  const actor = verifySession(request);
  if (!actor) return reject(response, 401, 'UNAUTHORIZED_SESSION');
  if (!actor.supabaseUserId) return reject(response, 403, 'VERIFIED_IDENTITY_REQUIRED');
  return actor;
}

/**
 * Business-scoped provider API. Authorization is derived from the verified
 * Google session and business_members; the browser never supplies the owner.
 */
export function registerBusinessApi(
  app: express.Express,
  dependencies: { pool: Pool; verifySession: VerifySession },
): void {
  const { pool, verifySession } = dependencies;

  // Access scopes live in their own table. Reading them through a separate,
  // tolerant query keeps the portal usable on environments where the grant
  // migration has not been applied yet (those members simply stay unrestricted).
  async function accessRowsFor(userId: string) {
    try {
      const { rows } = await pool.query(
        `select business_id, allowed_modules, allowed_sections from public.business_member_access where user_id = $1`,
        [userId],
      );
      return rows;
    } catch { return [] as Array<Record<string, any>>; }
  }

  function withAccess<T extends Record<string, any>>(business: T, accessRows: Array<Record<string, any>>): T & { allowed_modules: string[] | null; allowed_sections: Record<string, string[]> } {
    const row = accessRows.find((candidate) => String(candidate.business_id) === String(business.id));
    return {
      ...business,
      allowed_modules: Array.isArray(row?.allowed_modules) ? row!.allowed_modules : null,
      allowed_sections: (row?.allowed_sections as Record<string, string[]>) || {},
    };
  }

  app.get('/api/businesses', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    try {
      const { rows } = await pool.query(
        `select b.id, b.business_ref, b.name, b.module_type, b.approval_status, b.is_enabled,
                m.role, a.enabled as module_enabled, a.approval_status as module_approval_status,
                (select count(*)::int from public.listings l where l.business_id = b.id) as listing_count
           from public.businesses b
           join public.business_members m on m.business_id = b.id and m.user_id = $1 and m.status = 'active'
           join public.business_module_access a on a.business_id = b.id and a.module_type = b.module_type
          where b.owner_user_id = $1 or m.user_id = $1
          order by b.created_at asc, b.id`,
        [actor.supabaseUserId],
      );
      const accessRows = await accessRowsFor(String(actor.supabaseUserId));
      response.json({ ok: true, businesses: rows.map((row) => withAccess(row, accessRows)), source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'BUSINESS_LIST_UNAVAILABLE' });
    }
  });

  app.get('/api/businesses/:id', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    try {
      const { rows } = await pool.query(
        `select b.id, b.business_ref, b.name, b.module_type, b.approval_status, b.is_enabled,
                m.role, a.enabled as module_enabled, a.approval_status as module_approval_status
           from public.businesses b
           join public.business_members m on m.business_id = b.id and m.user_id = $1 and m.status = 'active'
           join public.business_module_access a on a.business_id = b.id and a.module_type = b.module_type
          where b.id = $2
          limit 1`,
        [actor.supabaseUserId, String(request.params.id || '')],
      );
      if (!rows[0]) return void response.status(404).json({ ok: false, error: 'BUSINESS_NOT_FOUND' });
      const accessRows = await accessRowsFor(String(actor.supabaseUserId));
      response.json({ ok: true, business: withAccess(rows[0], accessRows), source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'BUSINESS_UNAVAILABLE' });
    }
  });

  app.post('/api/businesses', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const name = String(request.body?.name || '').trim();
    const moduleType = String(request.body?.moduleType || '');
    if (name.length < 2 || name.length > 160) return void response.status(400).json({ ok: false, error: 'INVALID_BUSINESS_NAME' });
    if (!MODULES.has(moduleType)) return void response.status(400).json({ ok: false, error: 'INVALID_BUSINESS_MODULE' });
    try {
      const ref = `BIZ-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const { rows } = await pool.query(
        `insert into public.businesses (business_ref, name, module_type, owner_user_id, approval_status, created_by, backfill_source)
         values ($1, $2, $3, $4, 'pending', $4, 'owner_created')
         returning id, business_ref, name, module_type, approval_status, is_enabled`,
        [ref, name, moduleType, actor.supabaseUserId],
      );
      response.status(201).json({ ok: true, business: rows[0], source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'BUSINESS_CREATE_FAILED' });
    }
  });
  // Super Admin business/module access. The role is re-checked from profiles,
  // not trusted from the session token or request body.
  app.patch('/api/admin/businesses/:id/access', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') return void response.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
    try {
      const admin = await pool.query('select is_super_admin from public.profiles where id = $1 and role = $2 and account_status = $3 limit 1', [actor.supabaseUserId, 'admin', 'active']);
      if (!admin.rows[0]?.is_super_admin) return void response.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
      const status = String(request.body?.approvalStatus || '');
      if (!['pending', 'approved', 'suspended', 'revoked'].includes(status)) return void response.status(400).json({ ok: false, error: 'INVALID_APPROVAL_STATUS' });
      const enabled = Boolean(request.body?.enabled);
      const businessId = String(request.params.id || '');
      const updated = await pool.query(
        `update public.businesses
            set approval_status = $1, is_enabled = $2,
                approved_by = case when $1 = 'approved' then $3 else approved_by end,
                approved_at = case when $1 = 'approved' then coalesce(approved_at, now()) else approved_at end,
                suspended_at = case when $1 = 'suspended' then now() else suspended_at end,
                revoked_at = case when $1 = 'revoked' then now() else revoked_at end,
                updated_at = now()
          where id = $4
          returning id, business_ref, name, module_type, approval_status, is_enabled`,
        [status, enabled, actor.supabaseUserId, businessId],
      );
      if (!updated.rows[0]) return void response.status(404).json({ ok: false, error: 'BUSINESS_NOT_FOUND' });
      await pool.query(
        `update public.business_module_access
            set enabled = $1, approval_status = $2,
                approved_by = case when $2 = 'approved' then $3 else approved_by end,
                approved_at = case when $2 = 'approved' then coalesce(approved_at, now()) else approved_at end,
                suspended_at = case when $2 = 'suspended' then now() else suspended_at end,
                revoked_at = case when $2 = 'revoked' then now() else revoked_at end,
                updated_at = now()
          where business_id = $4`,
        [enabled, status, actor.supabaseUserId, businessId],
      );
      await pool.query(
        `insert into public.business_audit_events (business_id,actor_user_id,event_type,after_state,reason)
         values ($1,$2,'business.access_changed',$3,$4)`,
        [businessId, actor.supabaseUserId, JSON.stringify({ approvalStatus: status, enabled }), 'Super Admin access change'],
      );
      response.json({ ok: true, business: updated.rows[0], source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'BUSINESS_ACCESS_UPDATE_FAILED' });
    }
  });

  app.post('/api/businesses/:id/invitations', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const role = String(request.body?.role || '');
    const email = String(request.body?.email || '').trim().toLowerCase();
    if (!['manager', 'staff', 'accountant'].includes(role)) return void response.status(400).json({ ok: false, error: 'INVALID_INVITATION_ROLE' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return void response.status(400).json({ ok: false, error: 'INVALID_INVITATION_EMAIL' });
    try {
      const membership = await pool.query(
        `select m.role from public.business_members m
           join public.businesses b on b.id = m.business_id
          where m.business_id = $1 and m.user_id = $2 and m.status = 'active'
            and b.approval_status = 'approved' and b.is_enabled = true
          limit 1`,
        [String(request.params.id || ''), actor.supabaseUserId],
      );
      const actorRole = membership.rows[0]?.role;
      if (!actorRole || !['owner', 'manager'].includes(actorRole)) return void response.status(403).json({ ok: false, error: 'INVITATION_FORBIDDEN' });
      if (actorRole === 'manager' && role === 'manager') return void response.status(403).json({ ok: false, error: 'ONLY_OWNER_CAN_INVITE_MANAGER' });
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const { rows } = await pool.query(
        `insert into public.business_invitations (business_id, email, role, token_hash, invited_by, expires_at)
         values ($1, $2, $3, $4, $5, now() + interval '7 days')
         returning id, email, role, status, expires_at`,
        [String(request.params.id || ''), email, role, tokenHash, actor.supabaseUserId],
      );
      response.status(201).json({ ok: true, invitation: rows[0], inviteToken: token, source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'INVITATION_CREATE_FAILED' });
    }
  });

  app.post('/api/business-invitations/accept', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const token = String(request.body?.token || '');
    if (token.length < 20) return void response.status(400).json({ ok: false, error: 'INVALID_INVITATION_TOKEN' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      const invite = await pool.query(
        `select i.*, p.email as actor_email
           from public.business_invitations i
           join public.profiles p on p.id = $1
          where i.token_hash = $2 and i.status = 'pending' and i.expires_at > now()
          limit 1`,
        [actor.supabaseUserId, tokenHash],
      );
      const row = invite.rows[0];
      if (!row || String(row.actor_email || '').toLowerCase() !== String(row.email || '').toLowerCase()) {
        return void response.status(404).json({ ok: false, error: 'INVITATION_NOT_FOUND_OR_EMAIL_MISMATCH' });
      }
      await pool.query(
        `insert into public.business_members (business_id, user_id, role, status, invited_by, invited_email, invited_at, accepted_at)
         values ($1, $2, $3, 'active', $4, $5, $6, now())
         on conflict (business_id, user_id) do update set role = excluded.role, status = 'active', accepted_at = now()`,
        [row.business_id, actor.supabaseUserId, row.role, row.invited_by, row.email, row.created_at],
      );
      await pool.query(`update public.business_invitations set status = 'accepted', accepted_by = $1, accepted_at = now() where id = $2`, [actor.supabaseUserId, row.id]);
      response.json({ ok: true, businessId: row.business_id, role: row.role, source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'INVITATION_ACCEPT_FAILED' });
    }
  });

  app.get('/api/businesses/:id/members', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    try {
      const access = await pool.query(
        `select m.role from public.business_members m where m.business_id=$1 and m.user_id=$2 and m.status='active' limit 1`,
        [String(request.params.id || ''), actor.supabaseUserId],
      );
      const role = access.rows[0]?.role;
      if (!role || !['owner','manager','accountant'].includes(role)) return void response.status(403).json({ ok: false, error: 'MEMBERS_FORBIDDEN' });
      const businessId = String(request.params.id || '');
      const { rows } = await pool.query(
        `select m.id, m.user_id, m.role, m.status, m.created_at, p.full_name, p.email
           from public.business_members m join public.profiles p on p.id=m.user_id
          where m.business_id=$1 order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, m.created_at`,
        [businessId],
      );
      let accessRows: Array<Record<string, any>> = [];
      try {
        const access = await pool.query(
          `select user_id, allowed_modules, allowed_sections from public.business_member_access where business_id = $1`,
          [businessId],
        );
        accessRows = access.rows;
      } catch { accessRows = []; }
      const members = rows.map((member) => {
        const scope = accessRows.find((candidate) => String(candidate.user_id) === String(member.user_id));
        return {
          ...member,
          allowed_modules: Array.isArray(scope?.allowed_modules) ? scope!.allowed_modules : null,
          allowed_sections: (scope?.allowed_sections as Record<string, string[]>) || {},
        };
      });
      response.json({ ok: true, members, source: 'postgres' });
    } catch { response.status(500).json({ ok: false, error: 'MEMBERS_UNAVAILABLE' }); }
  });

  // Per-member access scopes: an owner or manager may narrow a member to
  // specific modules and sections. Owners are never restrictable and a manager
  // cannot restrict another manager.
  async function memberRole(businessId: string, userId: string): Promise<string | null> {
    const { rows } = await pool.query(
      `select role from public.business_members where business_id = $1 and user_id = $2 and status = 'active' limit 1`,
      [businessId, userId],
    );
    return (rows[0]?.role as string) || null;
  }

  app.put('/api/businesses/:id/members/:userId/access', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const parsed = sanitizeAccessScope(request.body);
    if (!parsed.ok) return void response.status(400).json({ ok: false, error: parsed.error });
    const businessId = String(request.params.id || '');
    const targetUserId = String(request.params.userId || '');
    try {
      const actorRole = await memberRole(businessId, String(actor.supabaseUserId));
      if (!actorRole || !['owner', 'manager'].includes(actorRole)) return void response.status(403).json({ ok: false, error: 'ACCESS_SCOPE_FORBIDDEN' });
      const targetRole = await memberRole(businessId, targetUserId);
      if (!targetRole) return void response.status(404).json({ ok: false, error: 'MEMBER_NOT_FOUND' });
      if (targetRole === 'owner') return void response.status(403).json({ ok: false, error: 'OWNER_ACCESS_CANNOT_BE_RESTRICTED' });
      if (actorRole === 'manager' && targetRole === 'manager') return void response.status(403).json({ ok: false, error: 'ONLY_OWNER_CAN_RESTRICT_MANAGER' });
      await pool.query(
        `insert into public.business_member_access (business_id, user_id, allowed_modules, allowed_sections, updated_by)
         values ($1, $2, $3, $4::jsonb, $5)
         on conflict (business_id, user_id) do update
            set allowed_modules = excluded.allowed_modules,
                allowed_sections = excluded.allowed_sections,
                updated_by = excluded.updated_by,
                updated_at = now()`,
        [businessId, targetUserId, parsed.scope.allowedModules, JSON.stringify(parsed.scope.allowedSections), actor.supabaseUserId],
      );
      await pool.query(
        `insert into public.business_audit_events (business_id,actor_user_id,event_type,after_state,reason)
         values ($1,$2,'business.member_access_changed',$3,$4)`,
        [businessId, actor.supabaseUserId, JSON.stringify({ userId: targetUserId, ...parsed.scope }), 'Member access scope updated'],
      );
      response.json({ ok: true, access: parsed.scope, source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'ACCESS_SCOPE_UPDATE_FAILED' });
    }
  });

  app.delete('/api/businesses/:id/members/:userId/access', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const businessId = String(request.params.id || '');
    const targetUserId = String(request.params.userId || '');
    try {
      const actorRole = await memberRole(businessId, String(actor.supabaseUserId));
      if (!actorRole || !['owner', 'manager'].includes(actorRole)) return void response.status(403).json({ ok: false, error: 'ACCESS_SCOPE_FORBIDDEN' });
      const targetRole = await memberRole(businessId, targetUserId);
      if (!targetRole) return void response.status(404).json({ ok: false, error: 'MEMBER_NOT_FOUND' });
      if (targetRole === 'owner') return void response.status(403).json({ ok: false, error: 'OWNER_ACCESS_CANNOT_BE_RESTRICTED' });
      if (actorRole === 'manager' && targetRole === 'manager') return void response.status(403).json({ ok: false, error: 'ONLY_OWNER_CAN_RESTRICT_MANAGER' });
      await pool.query(`delete from public.business_member_access where business_id = $1 and user_id = $2`, [businessId, targetUserId]);
      await pool.query(
        `insert into public.business_audit_events (business_id,actor_user_id,event_type,after_state,reason)
         values ($1,$2,'business.member_access_cleared',$3,$4)`,
        [businessId, actor.supabaseUserId, JSON.stringify({ userId: targetUserId, allowedModules: null }), 'Member access restored to full business access'],
      );
      response.json({ ok: true, access: null, source: 'postgres' });
    } catch {
      response.status(500).json({ ok: false, error: 'ACCESS_SCOPE_UPDATE_FAILED' });
    }
  });

  app.get('/api/businesses/:id/invitations', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    try {
      const access = await pool.query(
        `select m.role from public.business_members m where m.business_id=$1 and m.user_id=$2 and m.status='active' limit 1`,
        [String(request.params.id || ''), actor.supabaseUserId],
      );
      if (!access.rows[0] || !['owner','manager'].includes(access.rows[0].role)) return void response.status(403).json({ ok: false, error: 'INVITATIONS_FORBIDDEN' });
      const { rows } = await pool.query(
        `select id,email,role,status,expires_at,created_at from public.business_invitations
          where business_id=$1 order by created_at desc limit 100`,
        [String(request.params.id || '')],
      );
      response.json({ ok: true, invitations: rows, source: 'postgres' });
    } catch { response.status(500).json({ ok: false, error: 'INVITATIONS_UNAVAILABLE' }); }
  });

  app.get('/api/admin/businesses', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    if (actor.role !== 'admin') return void response.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
    try {
      const admin = await pool.query('select is_super_admin from public.profiles where id=$1 and role=$2 and account_status=$3 limit 1', [actor.supabaseUserId, 'admin', 'active']);
      if (!admin.rows[0]?.is_super_admin) return void response.status(403).json({ ok: false, error: 'SUPER_ADMIN_REQUIRED' });
      const { rows } = await pool.query(
        `select b.id,b.business_ref,b.name,b.module_type,b.approval_status,b.is_enabled,b.created_at,
                p.email as owner_email, p.full_name as owner_name,
                a.enabled as module_enabled, a.approval_status as module_approval_status,
                (select count(*)::int from public.listings l where l.business_id=b.id) as listing_count,
                (select count(*)::int from public.business_members m where m.business_id=b.id and m.status='active') as member_count
           from public.businesses b
           join public.profiles p on p.id=b.owner_user_id
           left join public.business_module_access a on a.business_id=b.id and a.module_type=b.module_type
          order by b.created_at desc limit 500`,
      );
      response.json({ ok: true, businesses: rows, source: 'postgres' });
    } catch { response.status(500).json({ ok: false, error: 'ADMIN_BUSINESSES_UNAVAILABLE' }); }
  });

  app.post('/api/businesses/:id/ownership-transfer', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const email = String(request.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return void response.status(400).json({ ok: false, error: 'INVALID_TRANSFER_EMAIL' });
    try {
      const businessId = String(request.params.id || '');
      const owner = await pool.query(
        `select m.role from public.business_members m join public.businesses b on b.id=m.business_id
          where m.business_id=$1 and m.user_id=$2 and m.role='owner' and m.status='active'
            and b.approval_status='approved' and b.is_enabled=true limit 1`,
        [businessId, actor.supabaseUserId],
      );
      if (!owner.rows[0]) return void response.status(403).json({ ok: false, error: 'OWNER_REQUIRED' });
      const target = await pool.query('select id,email from public.profiles where lower(email)=$1 and account_status=$2 limit 1', [email, 'active']);
      if (!target.rows[0]) return void response.status(404).json({ ok: false, error: 'TRANSFER_TARGET_NOT_FOUND' });
      if (String(target.rows[0].id) === String(actor.supabaseUserId)) return void response.status(400).json({ ok: false, error: 'TRANSFER_TO_SELF' });
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const { rows } = await pool.query(
        `insert into public.business_ownership_transfers (business_id,from_user_id,to_user_id,to_email,token_hash,created_by,expires_at)
         values ($1,$2,$3,$4,$5,$2,now()+interval '48 hours')
         returning id,status,expires_at`,
        [businessId, actor.supabaseUserId, target.rows[0].id, email, tokenHash],
      );
      await pool.query(
        `insert into public.business_audit_events (business_id,actor_user_id,event_type,target_user_id,after_state,reason)
         values ($1,$2,'business.ownership_transfer.requested',$3,$4,'Owner requested ownership transfer')`,
        [businessId, actor.supabaseUserId, target.rows[0].id, JSON.stringify({ transferId: rows[0].id, toEmail: email })],
      );
      response.status(201).json({ ok: true, transfer: rows[0], transferToken: token, source: 'postgres' });
    } catch { response.status(500).json({ ok: false, error: 'OWNERSHIP_TRANSFER_CREATE_FAILED' }); }
  });

  app.post('/api/business-ownership-transfers/accept', async (request, response) => {
    const actor = actorFrom(request, response, verifySession);
    if (!actor) return;
    const token = String(request.body?.token || '');
    if (token.length < 20) return void response.status(400).json({ ok: false, error: 'INVALID_TRANSFER_TOKEN' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      const { rows } = await pool.query(
        `select t.*, p.email as actor_email from public.business_ownership_transfers t
           join public.profiles p on p.id=$1
          where t.token_hash=$2 and t.status='pending' and t.expires_at>now() limit 1`,
        [actor.supabaseUserId, tokenHash],
      );
      const transfer = rows[0];
      if (!transfer || String(transfer.actor_email || '').toLowerCase() !== String(transfer.to_email || '').toLowerCase() || String(transfer.to_user_id) !== String(actor.supabaseUserId)) {
        return void response.status(404).json({ ok: false, error: 'TRANSFER_NOT_FOUND_OR_EMAIL_MISMATCH' });
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query('select owner_user_id from public.businesses where id=$1 for update', [transfer.business_id]);
        if (!current.rows[0] || String(current.rows[0].owner_user_id) !== String(transfer.from_user_id)) {
          await client.query('ROLLBACK'); return void response.status(409).json({ ok: false, error: 'OWNERSHIP_CHANGED' });
        }
        await client.query('update public.businesses set owner_user_id=$1, updated_at=now() where id=$2', [actor.supabaseUserId, transfer.business_id]);
        await client.query("update public.business_members set role='manager', status='active' where business_id=$1 and user_id=$2", [transfer.business_id, transfer.from_user_id]);
        await client.query("insert into public.business_members (business_id,user_id,role,status,accepted_at) values ($1,$2,'owner','active',now()) on conflict (business_id,user_id) do update set role='owner',status='active',accepted_at=now()", [transfer.business_id, actor.supabaseUserId]);
        await client.query("update public.business_ownership_transfers set status='accepted',accepted_at=now() where id=$1", [transfer.id]);
        await client.query(
          `insert into public.business_audit_events (business_id,actor_user_id,event_type,target_user_id,after_state,reason)
           values ($1,$2,'business.ownership_transfer.accepted',$2,$3,'Recipient accepted ownership transfer')`,
          [transfer.business_id, actor.supabaseUserId, JSON.stringify({ transferId: transfer.id, fromUserId: transfer.from_user_id })],
        );
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      response.json({ ok: true, businessId: transfer.business_id, source: 'postgres' });
    } catch { response.status(500).json({ ok: false, error: 'OWNERSHIP_TRANSFER_ACCEPT_FAILED' }); }
  });

}
