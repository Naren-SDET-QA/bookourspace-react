import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { ProviderListingActor } from './providerListingRepository';
import { assertPostgresConnectionTarget } from './persistencePolicy';
import { getSharedPostgresPool } from './postgresPool';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value).trim();
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteNumber(value: unknown, code: string, options: { integer?: boolean; min?: number; required?: boolean } = {}): number | null {
  const raw = text(value);
  if (!raw && !options.required) return null;
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || (options.integer && !Number.isInteger(parsed)) || (options.min != null && parsed < options.min)) {
    throw new InstituteWorkspaceError(code, 400);
  }
  return parsed;
}

function validEmail(value: unknown): boolean { return !text(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value)); }
function validPhone(value: unknown): boolean { return !text(value) || /^\+?[0-9\s()-]{10,20}$/.test(text(value)); }

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function day(value: unknown): string | null {
  const parsed = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export class InstituteWorkspaceError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, message = code) {
    super(message);
    this.name = 'InstituteWorkspaceError';
  }
}

export interface InstituteWorkspace {
  institute: Record<string, unknown> | null;
  institutes: Record<string, unknown>[];
  role: string | null;
  permissions: string[];
  branches: Record<string, unknown>[];
  members: Record<string, unknown>[];
  faculty: Record<string, unknown>[];
  courses: Record<string, unknown>[];
  batches: Record<string, unknown>[];
  enrollments: Record<string, unknown>[];
  admissions: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  fees: Record<string, unknown>[];
  enquiries: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  classrooms: Record<string, unknown>[];
  holidays: Record<string, unknown>[];
  leaveRequests: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  exams: Record<string, unknown>[];
  results: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
  certificates: Record<string, unknown>[];
  announcements: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  entitlements: Record<string, unknown>[];
  progress: Record<string, unknown>[];
  analytics: Record<string, number | null>;
}

export class InstituteWorkspaceRepository {
  private readonly pool: Pool;

  constructor(connectionString: string, environment: NodeJS.ProcessEnv = process.env) {
    assertPostgresConnectionTarget(connectionString, environment);
    this.pool = getSharedPostgresPool(connectionString, environment);
  }

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): InstituteWorkspaceRepository | null {
    const connectionString = String(environment.BOS_LISTINGS_DATABASE_URL || '').trim();
    if (String(environment.BOS_PG_URL || '').trim()) throw new Error('BOS_PG_URL_UNSUPPORTED_USE_BOS_LISTINGS_DATABASE_URL');
    if (!connectionString) return null;
    return new InstituteWorkspaceRepository(connectionString, environment);
  }

  async verifyConnection(): Promise<void> { await this.pool.query('select 1'); }

  private async transaction<T>(actor: ProviderListingActor, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!actor.supabaseUserId || !UUID.test(actor.supabaseUserId)) {
      throw new InstituteWorkspaceError('VERIFIED_AUTH_ID_REQUIRED', 401);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actor.supabaseUserId]);
      await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor.supabaseUserId, role: 'authenticated', aal: 'aal1' })]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  private async access(client: PoolClient, actor: ProviderListingActor, instituteId: string, permission?: string, branchId?: string | null): Promise<{ role: string; permissions: string[] }> {
    if (!UUID.test(instituteId)) throw new InstituteWorkspaceError('INVALID_INSTITUTE_ID', 400);
    const result = await client.query(
      `select coalesce(m.role, case when public.is_admin() then 'admin' when i.owner_id = auth.uid() then 'institute_owner' end) as role,
              coalesce(m.permissions, '[]'::jsonb) as permissions
         from public.institutes i
         left join public.institute_members m
           on m.institute_id = i.id and m.user_id = auth.uid() and m.status = 'active'
        where i.id = $1
          and (public.is_admin() or i.owner_id = auth.uid() or (m.id is not null and ($2::uuid is null or m.branch_id is null or m.branch_id = $2)))
        limit 1`,
      [instituteId, branchId && UUID.test(branchId) ? branchId : null],
    );
    const row = result.rows[0];
    if (!row) throw new InstituteWorkspaceError('INSTITUTE_ACCESS_REQUIRED', 403);
    const permissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];
    const role = String(row.role || '');
    if (permission) {
      // The database helper is the single source of truth for role permissions,
      // so Owner/Manager/Faculty/Accountant/Receptionist stay in sync with RLS.
      const allowed = await client.query('select public.institute_can_access($1,$2,$3) as allowed', [instituteId, branchId && UUID.test(branchId) ? branchId : null, permission]);
      if (!allowed.rows[0]?.allowed) throw new InstituteWorkspaceError('INSTITUTE_PERMISSION_REQUIRED', 403);
    }
    return { role, permissions };
  }

  private async selectedInstitute(client: PoolClient, instituteId?: string): Promise<{ institute: any; role: string; permissions: string[] } | null> {
    const result = await client.query(
      `select i.*, coalesce(m.role, case when public.is_admin() then 'admin' when i.owner_id = auth.uid() then 'institute_owner' end) as member_role,
              coalesce(m.permissions, '[]'::jsonb) as member_permissions
         from public.institutes i
         left join public.institute_members m
           on m.institute_id = i.id and m.user_id = auth.uid() and m.status = 'active'
        where (public.is_admin() or i.owner_id = auth.uid() or m.id is not null)
          and ($1::uuid is null or i.id = $1)
        order by i.created_at asc
        limit 1`,
      [instituteId && UUID.test(instituteId) ? instituteId : null],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return { institute: row, role: String(row.member_role || ''), permissions: Array.isArray(row.member_permissions) ? row.member_permissions.map(String) : [] };
  }

  async listMemberships(actor: ProviderListingActor) {
    return this.transaction(actor, async (client) => {
      const { rows } = await client.query(
        `select i.id, i.name, i.status, i.verification_status,
                coalesce(m.role, case when public.is_admin() then 'admin' when i.owner_id = auth.uid() then 'institute_owner' end) as role,
                coalesce(m.permissions, '[]'::jsonb) as permissions
           from public.institutes i
           left join public.institute_members m on m.institute_id = i.id and m.user_id = auth.uid() and m.status = 'active'
          where public.is_admin() or i.owner_id = auth.uid() or m.id is not null order by i.created_at`,
      );
      return rows.map((row) => ({ id: String(row.id), name: String(row.name), status: String(row.status), verificationStatus: String(row.verification_status), role: String(row.role || ''), permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [] }));
    });
  }

  async workspace(actor: ProviderListingActor, instituteId?: string): Promise<InstituteWorkspace> {
    return this.transaction(actor, async (client) => {
      const selected = await this.selectedInstitute(client, instituteId);
      const empty: InstituteWorkspace = { institute: null, institutes: [], role: null, permissions: [], branches: [], members: [], faculty: [], courses: [], batches: [], enrollments: [], admissions: [], attendance: [], fees: [], enquiries: [], reviews: [], notifications: [], classrooms: [], holidays: [], leaveRequests: [], transfers: [], exams: [], results: [], assignments: [], submissions: [], certificates: [], announcements: [], audit: [], entitlements: [], progress: [], analytics: { branches: 0, courses: 0, activeBatches: 0, enrolledStudents: 0, feeDue: 0, feeCollected: 0, enquiries: 0, reviews: 0, averageRating: null, attendanceRate: null, occupancy: null, facultyWorkload: 0, pendingAdmissions: 0, waitlistedStudents: 0, refunded: 0, pendingLeaves: 0 } };
      const membershipRows = await client.query(`select i.id, i.name, i.status, i.verification_status from public.institutes i where public.is_admin() or i.owner_id = auth.uid() or public.institute_can_access(i.id) order by i.created_at`);
      empty.institutes = membershipRows.rows.map((row) => ({ id: String(row.id), name: String(row.name), status: String(row.status), verificationStatus: String(row.verification_status) }));
      if (!selected) return empty;
      const id = String(selected.institute.id);
      await this.access(client, actor, id);
      const [branches, members, faculty, courses, batches, enrollments, admissions, attendance, fees, enquiries, reviews, notifications] = await Promise.all([
        client.query(`select id, name, address, city, timezone, status, created_at, updated_at from public.institute_branches where institute_id = $1 order by name`, [id]),
        client.query(`select m.id, m.user_id, m.branch_id, m.role, m.permissions, m.status, p.full_name, p.email, p.phone from public.institute_members m left join public.profiles p on p.id = m.user_id where m.institute_id = $1 order by m.created_at`, [id]),
        client.query(`select * from public.institute_faculty where institute_id = $1 order by name`, [id]),
        client.query(`select id, title, status, category_id, subcategory, price, price_unit, payload, institute_id, created_at, updated_at from public.listings where institute_id = $1 and entity_type = 'course' order by updated_at desc`, [id]),
        client.query(`select b.*, l.title as course_title, f.name as faculty_display_name,
                             a.confirmed_count, a.waitlist_count, a.seats_left, a.waitlist_left
                        from public.class_batches b join public.listings l on l.id = b.listing_id
                        left join public.institute_faculty f on f.id = b.faculty_id
                        cross join lateral public.class_batch_availability(b.id) a
                       where b.institute_id = $1 order by b.start_date nulls last, b.start_time`, [id]),
        client.query(`select e.*, b.title as batch_title, l.title as course_title, p.full_name as student_name, p.phone as student_phone
                        from public.class_enrollments e join public.class_batches b on b.id = e.batch_id
                        join public.listings l on l.id = e.listing_id left join public.profiles p on p.id = e.student_id
                       where b.institute_id = $1 order by e.created_at desc`, [id]),
        client.query(`select a.*, b.title as batch_title, l.title as course_title, br.name as branch_name
                        from public.institute_admissions a left join public.class_batches b on b.id = a.batch_id
                        left join public.listings l on l.id = a.course_listing_id left join public.institute_branches br on br.id = a.branch_id
                       where a.institute_id = $1 order by a.follow_up_at nulls last, a.created_at desc`, [id]),
        client.query(`select s.*, b.title as batch_title, count(r.id)::int as marked_count,
                             count(r.id) filter (where r.status = 'present')::int as present_count
                        from public.institute_attendance_sessions s join public.class_batches b on b.id = s.batch_id
                        left join public.institute_attendance_records r on r.session_id = s.id
                       where s.institute_id = $1 group by s.id, b.title order by s.session_date desc limit 100`, [id]),
        client.query(`select f.*, p.full_name as student_name, br.name as branch_name
                        from public.institute_fee_ledger f left join public.profiles p on p.id = f.student_id
                        left join public.institute_branches br on br.id = f.branch_id
                       where f.institute_id = $1 order by f.due_date nulls last, f.created_at desc`, [id]),
        client.query(`select e.*, l.title as course_title from public.enquiries e join public.listings l on l.id = e.listing_id where l.institute_id = $1 order by e.created_at desc`, [id]),
        client.query(`select r.*, l.title as course_title from public.reviews r join public.listings l on l.id = r.listing_id where l.institute_id = $1 order by r.created_at desc`, [id]),
        client.query(`select id, title, message, notif_type, is_read, link_id, created_at from public.notifications where recipient_user_id = auth.uid() or recipient_user_id is null order by created_at desc limit 50`, []),
      ]);
      const [classrooms, holidays, leaveRequests, transfers, exams, results, assignments, submissions, certificates, announcements, audit, entitlements, progress] = await Promise.all([
        client.query(`select c.*, br.name as branch_name from public.institute_classrooms c join public.institute_branches br on br.id = c.branch_id where c.institute_id = $1 order by br.name, c.name`, [id]),
        client.query(`select h.*, b.title as batch_title from public.institute_batch_holidays h join public.class_batches b on b.id = h.batch_id where h.institute_id = $1 order by h.holiday_date desc`, [id]),
        client.query(`select l.*, p.full_name as student_name, b.title as batch_title from public.institute_leave_requests l left join public.profiles p on p.id = l.student_id join public.class_enrollments e on e.id = l.enrollment_id join public.class_batches b on b.id = e.batch_id where l.institute_id = $1 order by l.created_at desc limit 200`, [id]),
        client.query(`select t.*, fb.title as from_batch_title, tb.title as to_batch_title, p.full_name as student_name from public.institute_batch_transfers t join public.class_batches fb on fb.id = t.from_batch_id join public.class_batches tb on tb.id = t.to_batch_id left join public.profiles p on p.id = t.student_id where t.institute_id = $1 order by t.created_at desc limit 200`, [id]),
        client.query(`select e.*, count(r.id)::int as results_count from public.institute_exams e left join public.institute_exam_results r on r.exam_id = e.id where e.institute_id = $1 group by e.id order by e.exam_date desc nulls last`, [id]),
        client.query(`select r.*, e.title as exam_title, e.max_marks, p.full_name as student_name from public.institute_exam_results r join public.institute_exams e on e.id = r.exam_id left join public.profiles p on p.id = r.student_id where r.institute_id = $1 order by r.updated_at desc limit 200`, [id]),
        client.query(`select a.*, b.title as batch_title from public.institute_assignments a join public.class_batches b on b.id = a.batch_id where a.institute_id = $1 order by a.due_date desc nulls last`, [id]),
        client.query(`select s.*, a.title as assignment_title, p.full_name as student_name from public.institute_assignment_submissions s join public.institute_assignments a on a.id = s.assignment_id left join public.profiles p on p.id = s.student_id where s.institute_id = $1 order by s.updated_at desc limit 200`, [id]),
        client.query(`select c.*, p.full_name as student_name, e.batch_id, b.title as batch_title from public.institute_certificates c left join public.profiles p on p.id = c.student_id left join public.class_enrollments e on e.id = c.enrollment_id left join public.class_batches b on b.id = e.batch_id where c.institute_id = $1 order by c.issued_on desc`, [id]),
        client.query(`select a.*, br.name as branch_name, b.title as batch_title from public.institute_announcements a left join public.institute_branches br on br.id = a.branch_id left join public.class_batches b on b.id = a.batch_id where a.institute_id = $1 order by a.published_at desc`, [id]),
        client.query(`select * from public.institute_audit_events where institute_id = $1 order by created_at desc limit 100`, [id]),
        client.query(`select * from public.institute_module_entitlements where institute_id = $1`, [id]),
        client.query(`select e.id as enrollment_id, e.student_id, e.batch_id, p.full_name as student_name, b.title as batch_title,
                             (select count(*)::int from public.institute_attendance_records r where r.enrollment_id = e.id) as marked_sessions,
                             (select count(*)::int from public.institute_attendance_records r where r.enrollment_id = e.id and r.status in ('present','late')) as present_sessions,
                             (select round(avg(res.marks / nullif(ex.max_marks, 0) * 100), 2) from public.institute_exam_results res join public.institute_exams ex on ex.id = res.exam_id where res.enrollment_id = e.id and res.marks is not null and ex.max_marks > 0) as exam_average,
                             (select coalesce(sum(f.amount), 0) from public.institute_fee_ledger f where f.enrollment_id = e.id and f.status = 'due') as fee_due,
                             (select c.certificate_no from public.institute_certificates c where c.enrollment_id = e.id and c.status = 'issued' order by c.issued_on desc limit 1) as certificate_no
                        from public.class_enrollments e join public.class_batches b on b.id = e.batch_id left join public.profiles p on p.id = e.student_id
                       where b.institute_id = $1 and e.status = 'confirmed' order by p.full_name nulls last`, [id]),
      ]);
      const map = (row: any): Record<string, unknown> => {
        const output: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) output[key.replace(/_([a-z])/g, (_, c) => String(c).toUpperCase())] = value instanceof Date ? value.toISOString() : value;
        return output;
      };
      const rows = (result: { rows: any[] }) => result.rows.map(map);
      const feeRows = fees.rows;
      const attendanceRows = attendance.rows;
      const activeEnrollments = enrollments.rows.filter((row) => row.status === 'confirmed');
      const paid = feeRows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + number(row.amount), 0);
      const due = feeRows.filter((row) => row.status === 'due').reduce((sum, row) => sum + number(row.amount), 0);
      const marked = attendanceRows.reduce((sum, row) => sum + number(row.marked_count), 0);
      const present = attendanceRows.reduce((sum, row) => sum + number(row.present_count), 0);
      const ratings = reviews.rows.map((row) => number(row.rating)).filter((value) => value > 0);
      return {
        institute: map(selected.institute), institutes: empty.institutes, role: selected.role, permissions: selected.permissions,
        branches: rows(branches), members: rows(members), faculty: rows(faculty), courses: rows(courses), batches: rows(batches),
        enrollments: rows(enrollments), admissions: rows(admissions), attendance: rows(attendance), fees: rows(fees), enquiries: rows(enquiries), reviews: rows(reviews), notifications: rows(notifications),
        classrooms: rows(classrooms), holidays: rows(holidays), leaveRequests: rows(leaveRequests), transfers: rows(transfers), exams: rows(exams), results: rows(results),
        assignments: rows(assignments), submissions: rows(submissions), certificates: rows(certificates), announcements: rows(announcements), audit: rows(audit), entitlements: rows(entitlements), progress: rows(progress),
        analytics: {
          branches: branches.rowCount, courses: courses.rowCount,
          activeBatches: batches.rows.filter((row) => row.status === 'active').length,
          enrolledStudents: new Set(activeEnrollments.map((row) => row.student_id)).size,
          feeDue: due, feeCollected: paid,
          refunded: feeRows.filter((row) => row.kind === 'refund').reduce((sum, row) => sum + number(row.amount), 0),
          enquiries: enquiries.rowCount, reviews: reviews.rowCount,
          averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
          attendanceRate: marked ? present / marked * 100 : null,
          occupancy: batches.rows.reduce((sum, row) => sum + number(row.capacity), 0) > 0
            ? Math.round(batches.rows.reduce((sum, row) => sum + Number(row.confirmed_count || 0), 0) / batches.rows.reduce((sum, row) => sum + number(row.capacity), 0) * 10000) / 100
            : null,
          facultyWorkload: batches.rows.filter((row) => row.faculty_id && row.status === 'active').length,
          pendingAdmissions: admissions.rows.filter((row) => ['new', 'contacted', 'assessment', 'accepted'].includes(String(row.status))).length,
          waitlistedStudents: enrollments.rows.filter((row) => row.status === 'waitlisted').length,
          pendingLeaves: leaveRequests.rows.filter((row) => row.status === 'pending').length,
        },
      };
    });
  }

  async createInstitute(actor: ProviderListingActor, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      const name = text(input.name);
      if (name.length < 2) throw new InstituteWorkspaceError('INSTITUTE_NAME_REQUIRED', 400);
      const existingBusiness = await client.query(
        `select id from public.businesses where owner_user_id=auth.uid() and module_type='classes' order by created_at,id limit 1`,
      );
      let businessId = existingBusiness.rows[0]?.id;
      if (!businessId) {
        const createdBusiness = await client.query(
          `insert into public.businesses (business_ref,name,module_type,owner_user_id,approval_status,is_enabled,backfill_source,created_by,approved_at)
           values ('BIZ-INST-' || upper(substr(md5(auth.uid()::text || ':classes'),1,12)), $1, 'classes', auth.uid(), 'approved', true, 'institute_create', auth.uid(), now())
           on conflict (business_ref) do update set updated_at=now()
           returning id`,
          [name],
        );
        businessId = createdBusiness.rows[0]?.id;
      }
      const result = await client.query(`insert into public.institutes (owner_id, business_id, name, description, email, phone, website, city) values (auth.uid(), $7, $1, $2, $3, $4, $5, $6) returning *`, [name, text(input.description), text(input.email), text(input.phone), text(input.website), text(input.city), businessId]);
      const institute = result.rows[0];
      await client.query(`insert into public.institute_members (institute_id, user_id, role, permissions) values ($1, auth.uid(), 'institute_owner', '[]'::jsonb) on conflict (institute_id, user_id) do update set status = 'active', role = 'institute_owner'`, [institute.id]);
      return institute;
    });
  }

  async updateInstitute(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_profile');
      if ('name' in input && text(input.name).length < 2) throw new InstituteWorkspaceError('INSTITUTE_NAME_REQUIRED', 400);
      if (!validEmail(input.email)) throw new InstituteWorkspaceError('INVALID_EMAIL', 400);
      if (!validPhone(input.phone)) throw new InstituteWorkspaceError('INVALID_PHONE', 400);
      const { rows } = await client.query(
        `update public.institutes
            set name = coalesce(nullif($2, ''), name), description = $3, email = $4, phone = $5,
                website = $6, city = $7, logo_url = $8, contact_person = $9,
                operating_hours = $10::jsonb, facilities = $11::jsonb,
                status = case when $12::text in ('draft','published','archived') then $12::text else status end,
                updated_at = now()
          where id = $1 returning *`,
        [instituteId, text(input.name), text(input.description), text(input.email), text(input.phone), text(input.website),
          text(input.city), text(input.logoUrl), text(input.contactPerson), JSON.stringify(jsonObject(input.operatingHours)),
          JSON.stringify(jsonArray(input.facilities)), text(input.status)],
      );
      if (!rows[0]) throw new InstituteWorkspaceError('INSTITUTE_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,$2,$3,$4::text,'{}'::jsonb)`, [instituteId, 'institute.profile_updated', 'institute', instituteId]);
      return rows[0];
    });
  }

  async saveBranch(actor: ProviderListingActor, instituteId: string, branchId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_branches'); const name = text(input.name); if (name.length < 2) throw new InstituteWorkspaceError('BRANCH_NAME_REQUIRED', 400); if (!text(input.city)) throw new InstituteWorkspaceError('BRANCH_CITY_REQUIRED', 400); const { rows } = branchId && UUID.test(branchId) ? await client.query(`update public.institute_branches set name=$2,address=$3,city=$4,timezone=$5,status=$6,updated_at=now() where id=$1 and institute_id=$7 returning *`, [branchId,name,text(input.address),text(input.city),text(input.timezone,'Asia/Kolkata'),text(input.status,'active'),instituteId]) : await client.query(`insert into public.institute_branches (institute_id,name,address,city,timezone) values ($1,$2,$3,$4,$5) returning *`, [instituteId,name,text(input.address),text(input.city),text(input.timezone,'Asia/Kolkata')]); if (!rows[0]) throw new InstituteWorkspaceError('BRANCH_NOT_FOUND', 404); return rows[0]; });
  }

  async saveFaculty(actor: ProviderListingActor, instituteId: string, facultyId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_faculty', text(input.branchId) || null);
      const name = text(input.name);
      if (name.length < 2) throw new InstituteWorkspaceError('FACULTY_NAME_REQUIRED', 400);
      if (!validEmail(input.email)) throw new InstituteWorkspaceError('INVALID_EMAIL', 400);
      if (!validPhone(input.phone)) throw new InstituteWorkspaceError('INVALID_PHONE', 400);
      const params = [instituteId, name, text(input.email), text(input.phone), text(input.qualification), text(input.experience),
        text(input.branchId) || null, text(input.status, 'active'), text(input.photoUrl), JSON.stringify(jsonArray(input.subjects)),
        JSON.stringify(jsonArray(input.availability))];
      const { rows } = facultyId && UUID.test(facultyId)
        ? await client.query(`update public.institute_faculty set name=$2,email=$3,phone=$4,qualification=$5,experience=$6,branch_id=$7,status=$8,photo_url=$9,subjects=$10::jsonb,availability=$11::jsonb,updated_at=now() where id=$1 and institute_id=$12 returning *`, [facultyId, ...params.slice(1), instituteId])
        : await client.query(`insert into public.institute_faculty (institute_id,name,email,phone,qualification,experience,branch_id,status,photo_url,subjects,availability) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) returning *`, params);
      if (!rows[0]) throw new InstituteWorkspaceError('FACULTY_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,$2,'faculty',$3::text,'{}'::jsonb)`, [instituteId, facultyId ? 'faculty.updated' : 'faculty.created', String(rows[0].id)]);
      return rows[0];
    });
  }

  async saveCourse(actor: ProviderListingActor, instituteId: string, courseId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_courses');
      const title = text(input.title);
      if (title.length < 2) throw new InstituteWorkspaceError('COURSE_TITLE_REQUIRED', 400);
      const rawModes = typeof input.modes === 'string' ? text(input.modes).split(',').map((mode) => mode.trim().toLowerCase()).filter(Boolean) : jsonArray(input.modes).map(String).map((mode) => mode.toLowerCase());
      if (rawModes.some((mode) => !['online', 'offline', 'hybrid'].includes(mode))) throw new InstituteWorkspaceError('INVALID_COURSE_MODE', 400);
      const modes = rawModes.filter((mode) => ['online', 'offline', 'hybrid'].includes(mode));
      const price = finiteNumber(input.price, 'COURSE_FEE_INVALID', { min: 0, required: true });
      const payload = JSON.stringify({
        ...jsonObject(input.payload),
        description: text(input.description) || text(jsonObject(input.payload).description),
        syllabus: text(input.syllabus) || text(jsonObject(input.payload).syllabus),
        duration: text(input.duration) || text(jsonObject(input.payload).duration),
        modes: modes.length ? modes : jsonArray(jsonObject(input.payload).modes).map(String),
        eligibility: text(input.eligibility) || text(jsonObject(input.payload).eligibility),
      });
      if (courseId && courseId.trim()) {
        const { rows } = await client.query(`update public.listings set title=$2,subcategory=$3,price=$4,price_unit=$5,payload=$6::jsonb,updated_at=now() where id=$1 and institute_id=$7 and entity_type='course' returning *`, [courseId, title, text(input.subcategory, 'course'), price, text(input.priceUnit, 'per course'), payload, instituteId]);
        if (!rows[0]) throw new InstituteWorkspaceError('COURSE_NOT_FOUND', 404);
        await client.query(`select public.institute_audit($1,'course.updated','listing',$2::text,'{}'::jsonb)`, [instituteId, courseId]);
        return rows[0];
      }
      const { rows } = await client.query(`insert into public.listings (id,owner_id,title,category_id,subcategory,entity_type,price,price_unit,status,payload,institute_id) values ($1,auth.uid(),$2,'classes',$3,'course',$4,$5,'pending_approval',$6::jsonb,$7) returning *`, [randomUUID(), title, text(input.subcategory, 'course'), price, text(input.priceUnit, 'per course'), payload, instituteId]);
      await client.query(`select public.institute_audit($1,'course.created','listing',$2::text,'{}'::jsonb)`, [instituteId, String(rows[0].id)]);
      return rows[0];
    });
  }

  async publishCourse(actor: ProviderListingActor, instituteId: string, courseId: string) {
    return this.transaction(actor, async (client) => { const status = actor.role === 'admin' ? 'active' : 'pending_approval'; await this.access(client, actor, instituteId, actor.role === 'admin' ? undefined : 'manage_courses'); const { rows } = await client.query(`update public.listings set status=$3,updated_at=now() where id=$1 and institute_id=$2 and entity_type='course' returning *`, [courseId,instituteId,status]); if (!rows[0]) throw new InstituteWorkspaceError('COURSE_NOT_FOUND',404); return rows[0]; });
  }

  async saveBatch(actor: ProviderListingActor, instituteId: string, batchId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_courses', text(input.branchId) || null);
      const listingId = text(input.listingId);
      const title = text(input.title);
      if (!listingId || title.length < 2) throw new InstituteWorkspaceError('BATCH_COURSE_AND_TITLE_REQUIRED', 400);
      const startTime = text(input.startTime);
      const endTime = text(input.endTime);
      if (!startTime || !endTime) throw new InstituteWorkspaceError('BATCH_TIMING_REQUIRED', 400);
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) throw new InstituteWorkspaceError('BATCH_TIME_RANGE_INVALID', 400);
      if (text(input.startDate) && text(input.endDate) && text(input.startDate) > text(input.endDate)) throw new InstituteWorkspaceError('BATCH_DATE_RANGE_INVALID', 400);
      const capacity = finiteNumber(input.capacity, 'BATCH_CAPACITY_INVALID', { integer: true, min: 1, required: true });
      const waitlistCapacity = finiteNumber(input.waitlistCapacity, 'BATCH_WAITLIST_CAPACITY_INVALID', { integer: true, min: 0 }) ?? 0;
      const onlineFee = finiteNumber(input.onlineFee, 'BATCH_FEE_INVALID', { min: 0 }) ?? 0;
      const offlineFee = finiteNumber(input.offlineFee, 'BATCH_FEE_INVALID', { min: 0 }) ?? 0;
      // Schedule conflicts are rejected server-side before the row is written.
      const conflicts = await client.query(
        `select * from public.institute_batch_conflict($1,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::time,$8::time,$9::date,$10::date)`,
        [instituteId, batchId && UUID.test(batchId) ? batchId : null, text(input.branchId) || null, text(input.facultyId) || null,
          text(input.classroomId) || null, text(input.daysOfWeek), startTime, endTime,
          text(input.startDate) || null, text(input.endDate) || null],
      );
      if (conflicts.rows[0]) {
        throw new InstituteWorkspaceError(`BATCH_SCHEDULE_CONFLICT_${String(conflicts.rows[0].reason).toUpperCase()}`, 409);
      }
      const values = [instituteId, listingId, title, text(input.deliveryMode, 'offline'), text(input.feeUnit, 'course'), onlineFee, offlineFee, capacity, waitlistCapacity, text(input.startDate) || null, text(input.endDate) || null, text(input.daysOfWeek), startTime, endTime, text(input.timezone, 'Asia/Kolkata'), text(input.durationLabel), text(input.area), text(input.branchId) || null, text(input.facultyId) || null, text(input.classroomId) || null];
      if (batchId && UUID.test(batchId)) {
        const { rows } = await client.query(`update public.class_batches set listing_id=$2,title=$3,delivery_mode=$4,fee_unit=$5,online_fee=$6,offline_fee=$7,capacity=$8,waitlist_capacity=$9,start_date=$10::date,end_date=$11::date,days_of_week=$12,start_time=$13::time,end_time=$14::time,timezone=$15,duration_label=$16,area=$17,branch_id=$18::uuid,faculty_id=$19::uuid,classroom_id=$20::uuid,updated_at=now() where id=$1 and institute_id=$21 returning *`, [batchId, ...values.slice(1), instituteId]);
        if (!rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND', 404);
        await client.query(`select public.institute_audit($1,'batch.updated','class_batch',$2::text,'{}'::jsonb)`, [instituteId, batchId]);
        return rows[0];
      }
      const { rows } = await client.query(`insert into public.class_batches (institute_id,listing_id,title,delivery_mode,fee_unit,online_fee,offline_fee,capacity,waitlist_capacity,start_date,end_date,days_of_week,start_time,end_time,timezone,duration_label,area,branch_id,faculty_id,classroom_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13::time,$14::time,$15,$16,$17,$18::uuid,$19::uuid,$20::uuid) returning *`, values);
      await client.query(`select public.institute_audit($1,'batch.created','class_batch',$2::text,'{}'::jsonb)`, [instituteId, String(rows[0].id)]);
      return rows[0];
    });
  }

  async updateBatchStatus(actor: ProviderListingActor, instituteId: string, batchId: string, status: string) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_courses'); if (!['pending_approval', 'paused', 'archived'].includes(status)) throw new InstituteWorkspaceError('INVALID_BATCH_STATUS', 400); const { rows } = await client.query(`update public.class_batches set status=$3,updated_at=now() where id=$1 and institute_id=$2 returning *`, [batchId, instituteId, status]); if (!rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND',404); return rows[0]; });
  }

  async saveAdmission(actor: ProviderListingActor, instituteId: string, admissionId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_admissions', text(input.branchId) || null);
      const studentProfileId = text(input.studentProfileId) || null;
      if (text(input.name).length < 2 || (!text(input.phone) && !text(input.email))) throw new InstituteWorkspaceError('ADMISSION_NAME_REQUIRED', 400);
      if (!validEmail(input.email)) throw new InstituteWorkspaceError('INVALID_EMAIL', 400);
      if (!validPhone(input.phone)) throw new InstituteWorkspaceError('INVALID_PHONE', 400);
      if (studentProfileId && !UUID.test(studentProfileId)) throw new InstituteWorkspaceError('INVALID_STUDENT_PROFILE_ID', 400);
      const params = [instituteId, text(input.name), text(input.phone), text(input.email), text(input.source, 'direct'),
        text(input.status, 'new'), text(input.notes), text(input.followUpAt) || null, text(input.branchId) || null,
        text(input.courseListingId) || null, text(input.batchId) || null, studentProfileId];
      const { rows } = admissionId && UUID.test(admissionId)
        ? await client.query(`update public.institute_admissions set name=$2,phone=$3,email=$4,source=$5,status=$6,notes=$7,follow_up_at=$8::timestamptz,branch_id=$9::uuid,course_listing_id=$10,batch_id=$11::uuid,student_profile_id=$12::uuid,updated_at=now() where id=$1 and institute_id=$13 returning *`, [admissionId, ...params.slice(1), instituteId])
        : await client.query(`insert into public.institute_admissions (institute_id,name,phone,email,source,status,notes,follow_up_at,branch_id,course_listing_id,batch_id,student_profile_id) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::uuid,$10,$11::uuid,$12::uuid) returning *`, params);
      if (!rows[0]) throw new InstituteWorkspaceError('ADMISSION_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,$2,'institute_admission',$3::text,'{}'::jsonb)`, [instituteId, admissionId ? 'admission.updated' : 'admission.created', String(rows[0].id)]);
      return rows[0];
    });
  }

  async updateEnquiry(actor: ProviderListingActor, instituteId: string, enquiryId: string, status: string) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_enquiries'); const { rows } = await client.query(`update public.enquiries e set status=$3 where e.id=$1 and exists (select 1 from public.listings l where l.id=e.listing_id and l.institute_id=$2) returning e.*`, [enquiryId,instituteId,text(status,'new')]); if (!rows[0]) throw new InstituteWorkspaceError('ENQUIRY_NOT_FOUND',404); return rows[0]; });
  }

  async recordFeePayment(actor: ProviderListingActor, ledgerId: string, method: string, reference: string) {
    return this.transaction(actor, async (client) => { if (!UUID.test(ledgerId)) throw new InstituteWorkspaceError('INVALID_FEE_ID',400); try { const { rows } = await client.query(`select * from public.institute_record_fee_payment($1,$2,$3)`, [ledgerId,text(method),text(reference)]); return rows[0]; } catch (error: any) { throw new InstituteWorkspaceError(String(error?.message || 'FEE_PAYMENT_FAILED').split(':')[0], 400); } });
  }

  async createFeeLedger(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_fees', text(input.branchId) || null);
      if (!(await client.query(`select public.institute_module_enabled($1,'fees') as enabled`, [instituteId])).rows[0].enabled) {
        throw new InstituteWorkspaceError('MODULE_DISABLED', 403);
      }
      const description = text(input.description);
      const amount = number(input.amount, -1);
      if (description.length < 2 || amount < 0) throw new InstituteWorkspaceError('FEE_DESCRIPTION_AND_AMOUNT_REQUIRED', 400);
      const kind = text(input.kind, 'tuition');
      const allowedKinds = ['tuition', 'installment', 'admission', 'exam', 'material', 'discount', 'adjustment'];
      if (!allowedKinds.includes(kind)) throw new InstituteWorkspaceError('INVALID_FEE_KIND', 400);
      const installments = Math.max(1, Math.min(12, Math.floor(number(input.installments, 1))));
      const branchId = text(input.branchId) || null;
      const enrollmentId = text(input.enrollmentId) || null;
      const studentId = text(input.studentId) || null;
      const dueDate = day(input.dueDate);
      const discount = Math.max(0, number(input.discountAmount));
      const created: Record<string, unknown>[] = [];
      for (let index = 1; index <= installments; index += 1) {
        const share = installments === 1 ? amount : Math.round((amount / installments) * 100) / 100;
        const { rows } = await client.query(
          `insert into public.institute_fee_ledger (institute_id,branch_id,enrollment_id,student_id,description,amount,due_date,notes,kind,installment_no,discount_amount)
           values ($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,case when $7::date is null then null else ($7::date + (($8 - 1) * interval '30 days'))::date end,$9,$10,$11,$12) returning *`,
          [instituteId, branchId, enrollmentId, studentId, installments > 1 ? `${description} (${index}/${installments})` : description, share, dueDate, index, text(input.notes), kind, installments > 1 ? index : null, index === 1 ? discount : 0],
        );
        created.push(rows[0]);
      }
      await client.query(`select public.institute_audit($1,'fee.created','fee_ledger',$2::text,$3::jsonb)`, [instituteId, String(created[0]?.id || ''), JSON.stringify({ kind, installments, amount })]);
      return installments > 1 ? created : created[0];
    });
  }

  async markAttendance(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_attendance', text(input.branchId)||null); const batchId = text(input.batchId); const date = text(input.sessionDate); if (!UUID.test(batchId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InstituteWorkspaceError('VALID_BATCH_AND_DATE_REQUIRED',400); const session = await client.query(`insert into public.institute_attendance_sessions (institute_id,branch_id,batch_id,session_date,topic,marked_by) values ($1,$2::uuid,$3,$4,$5,auth.uid()) on conflict (batch_id,session_date) do update set topic=excluded.topic,updated_at=now() returning *`, [instituteId,text(input.branchId)||null,batchId,date,text(input.topic)]); const records = Array.isArray(input.records) ? input.records : []; for (const item of records) { const row = jsonObject(item); if (!UUID.test(text(row.studentId)) || !UUID.test(text(row.enrollmentId)) || !['present','absent','late','excused'].includes(text(row.status))) continue; await client.query(`insert into public.institute_attendance_records (session_id,enrollment_id,student_id,status,marked_by) values ($1,$2,$3,$4,auth.uid()) on conflict (session_id,student_id) do update set enrollment_id=excluded.enrollment_id,status=excluded.status,marked_by=auth.uid(),marked_at=now()`, [session.rows[0].id,text(row.enrollmentId),text(row.studentId),text(row.status)]); } return session.rows[0]; });
  }

  // --- Branch infrastructure ----------------------------------------------
  async saveClassroom(actor: ProviderListingActor, instituteId: string, classroomId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_branches', text(input.branchId) || null);
      const name = text(input.name);
      const branchId = text(input.branchId);
      if (name.length < 1) throw new InstituteWorkspaceError('CLASSROOM_NAME_REQUIRED', 400);
      if (!UUID.test(branchId)) throw new InstituteWorkspaceError('CLASSROOM_BRANCH_REQUIRED', 400);
      const capacity = finiteNumber(input.capacity, 'CLASSROOM_CAPACITY_INVALID', { integer: true, min: 1, required: true });
      const { rows } = classroomId && UUID.test(classroomId)
        ? await client.query(`update public.institute_classrooms set branch_id=$2,name=$3,capacity=$4,facilities=$5::jsonb,status=$6,updated_at=now() where id=$1 and institute_id=$7 returning *`, [classroomId, branchId, name, capacity, JSON.stringify(jsonArray(input.facilities)), text(input.status, 'active'), instituteId])
        : await client.query(`insert into public.institute_classrooms (institute_id,branch_id,name,capacity,facilities) values ($1,$2,$3,$4,$5::jsonb) returning *`, [instituteId, branchId, name, capacity, JSON.stringify(jsonArray(input.facilities))]);
      if (!rows[0]) throw new InstituteWorkspaceError('CLASSROOM_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,$2,'classroom',$3::text,'{}'::jsonb)`, [instituteId, classroomId ? 'classroom.updated' : 'classroom.created', String(rows[0].id)]);
      return rows[0];
    });
  }

  async saveHoliday(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_courses');
      const batchId = text(input.batchId);
      const holidayDate = day(input.holidayDate);
      if (!UUID.test(batchId) || !holidayDate) throw new InstituteWorkspaceError('HOLIDAY_BATCH_AND_DATE_REQUIRED', 400);
      const owned = await client.query(`select 1 from public.class_batches where id=$1 and institute_id=$2`, [batchId, instituteId]);
      if (!owned.rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND', 404);
      const { rows } = await client.query(`insert into public.institute_batch_holidays (institute_id,batch_id,holiday_date,reason,created_by) values ($1,$2,$3::date,$4,auth.uid()) on conflict (batch_id,holiday_date) do update set reason=excluded.reason returning *`, [instituteId, batchId, holidayDate, text(input.reason)]);
      await client.query(`select public.institute_audit($1,'holiday.saved','class_batch',$2::text,$3::jsonb)`, [instituteId, batchId, JSON.stringify({ holidayDate })]);
      return rows[0];
    });
  }

  async deleteHoliday(actor: ProviderListingActor, instituteId: string, holidayId: string) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_courses');
      if (!UUID.test(holidayId)) throw new InstituteWorkspaceError('INVALID_HOLIDAY_ID', 400);
      const { rowCount } = await client.query(`delete from public.institute_batch_holidays where id=$1 and institute_id=$2`, [holidayId, instituteId]);
      if (!rowCount) throw new InstituteWorkspaceError('HOLIDAY_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,'holiday.deleted','holiday',$2::text,'{}'::jsonb)`, [instituteId, holidayId]);
      return { deleted: true };
    });
  }

  // --- Admissions -> enrollment ------------------------------------------
  async enrollApplicant(actor: ProviderListingActor, instituteId: string, admissionId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_admissions');
      if (!UUID.test(admissionId)) throw new InstituteWorkspaceError('INVALID_ADMISSION_ID', 400);
      const batchId = text(input.batchId);
      if (!UUID.test(batchId)) throw new InstituteWorkspaceError('BATCH_REQUIRED', 400);
      const owned = await client.query(`select 1 from public.institute_admissions where id=$1 and institute_id=$2`, [admissionId, instituteId]);
      if (!owned.rows[0]) throw new InstituteWorkspaceError('ADMISSION_NOT_FOUND', 404);
      try {
        const { rows } = await client.query(`select public.institute_enroll_applicant($1,$2,$3,$4) as result`, [admissionId, batchId, text(input.deliveryMode, 'offline'), text(input.paymentMode, 'pay_at_institute')]);
        return rows[0].result;
      } catch (error: any) {
        const code = String(error?.message || 'ENROLLMENT_FAILED').split(':')[0].trim();
        throw new InstituteWorkspaceError(code, code === 'BATCH_FULL' ? 409 : 400);
      }
    });
  }

  // --- Student records ----------------------------------------------------
  async transferStudent(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_students');
      const enrollmentId = text(input.enrollmentId);
      const toBatchId = text(input.toBatchId);
      if (!UUID.test(enrollmentId) || !UUID.test(toBatchId)) throw new InstituteWorkspaceError('ENROLLMENT_AND_TARGET_BATCH_REQUIRED', 400);
      const owned = await client.query(`select 1 from public.class_enrollments e join public.class_batches b on b.id=e.batch_id where e.id=$1 and b.institute_id=$2`, [enrollmentId, instituteId]);
      if (!owned.rows[0]) throw new InstituteWorkspaceError('ENROLLMENT_NOT_FOUND', 404);
      try {
        const { rows } = await client.query(`select public.institute_transfer_enrollment($1,$2,$3) as result`, [enrollmentId, toBatchId, text(input.reason)]);
        return rows[0].result;
      } catch (error: any) {
        const code = String(error?.message || 'TRANSFER_FAILED').split(':')[0].trim();
        throw new InstituteWorkspaceError(code, code === 'BATCH_FULL' ? 409 : 400);
      }
    });
  }

  async reviewLeave(actor: ProviderListingActor, instituteId: string, leaveId: string, decision: string, note: string) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_attendance');
      if (!UUID.test(leaveId)) throw new InstituteWorkspaceError('INVALID_LEAVE_ID', 400);
      try {
        const { rows } = await client.query(`select * from public.institute_review_leave($1,$2,$3)`, [leaveId, decision, note]);
        return rows[0];
      } catch (error: any) {
        throw new InstituteWorkspaceError(String(error?.message || 'LEAVE_REVIEW_FAILED').split(':')[0], 400);
      }
    });
  }

  // --- Exams, results, assignments, certificates --------------------------
  async saveExam(actor: ProviderListingActor, instituteId: string, examId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_exams');
      const batchId = text(input.batchId);
      const title = text(input.title);
      const maxMarks = finiteNumber(input.maxMarks, 'EXAM_MAX_MARKS_INVALID', { min: 1, required: true }) ?? 0;
      if (!UUID.test(batchId) || title.length < 2) throw new InstituteWorkspaceError('EXAM_BATCH_AND_TITLE_REQUIRED', 400);
      if (maxMarks <= 0) throw new InstituteWorkspaceError('EXAM_MAX_MARKS_INVALID', 400);
      const owned = await client.query(`select 1 from public.class_batches where id=$1 and institute_id=$2`, [batchId, instituteId]);
      if (!owned.rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND', 404);
      const { rows } = examId && UUID.test(examId)
        ? await client.query(`update public.institute_exams set batch_id=$2,title=$3,exam_date=$4::date,max_marks=$5,status=$6,updated_at=now() where id=$1 and institute_id=$7 returning *`, [examId, batchId, title, day(input.examDate), maxMarks, text(input.status, 'scheduled'), instituteId])
        : await client.query(`insert into public.institute_exams (institute_id,branch_id,batch_id,title,exam_date,max_marks,status,created_by) values ($1,$2::uuid,$3,$4,$5::date,$6,$7,auth.uid()) returning *`, [instituteId, text(input.branchId) || null, batchId, title, day(input.examDate), maxMarks, text(input.status, 'scheduled')]);
      if (!rows[0]) throw new InstituteWorkspaceError('EXAM_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,$2,'exam',$3::text,'{}'::jsonb)`, [instituteId, examId ? 'exam.updated' : 'exam.created', String(rows[0].id)]);
      return rows[0];
    });
  }

  async recordExamResults(actor: ProviderListingActor, instituteId: string, examId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_exams');
      if (!UUID.test(examId)) throw new InstituteWorkspaceError('INVALID_EXAM_ID', 400);
      const exam = await client.query(`select * from public.institute_exams where id=$1 and institute_id=$2`, [examId, instituteId]);
      if (!exam.rows[0]) throw new InstituteWorkspaceError('EXAM_NOT_FOUND', 404);
      const entries = Array.isArray(input.results) ? input.results : [];
      let saved = 0;
      for (const entry of entries) {
        const row = jsonObject(entry);
        const enrollmentId = text(row.enrollmentId);
        if (!UUID.test(enrollmentId)) continue;
        const student = await client.query(`select student_id from public.class_enrollments where id=$1 and batch_id=$2`, [enrollmentId, exam.rows[0].batch_id]);
        if (!student.rows[0]) continue;
        const marks = row.marks === '' || row.marks == null ? null : number(row.marks, -1);
        if (marks !== null && (marks < 0 || marks > number(exam.rows[0].max_marks))) throw new InstituteWorkspaceError('EXAM_MARKS_OUT_OF_RANGE', 400);
        await client.query(`insert into public.institute_exam_results (institute_id,exam_id,enrollment_id,student_id,marks,grade,remarks,updated_at) values ($1,$2,$3,$4,$5,$6,$7,now()) on conflict (exam_id,enrollment_id) do update set marks=excluded.marks, grade=excluded.grade, remarks=excluded.remarks, updated_at=now()`, [instituteId, examId, enrollmentId, student.rows[0].student_id, marks, text(row.grade), text(row.remarks)]);
        saved += 1;
      }
      await client.query(`select public.institute_audit($1,'exam.results_recorded','exam',$2::text,$3::jsonb)`, [instituteId, examId, JSON.stringify({ saved })]);
      return { saved };
    });
  }

  async publishExam(actor: ProviderListingActor, instituteId: string, examId: string) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_exams');
      if (!UUID.test(examId)) throw new InstituteWorkspaceError('INVALID_EXAM_ID', 400);
      const { rows } = await client.query(`update public.institute_exams set status='published', published_at=now(), updated_at=now() where id=$1 and institute_id=$2 returning *`, [examId, instituteId]);
      if (!rows[0]) throw new InstituteWorkspaceError('EXAM_NOT_FOUND', 404);
      await client.query(`update public.institute_exam_results set published_at=now(), updated_at=now() where exam_id=$1 and institute_id=$2`, [examId, instituteId]);
      await client.query(`select public.institute_audit($1,'exam.published','exam',$2::text,'{}'::jsonb)`, [instituteId, examId]);
      return rows[0];
    });
  }

  async saveAssignment(actor: ProviderListingActor, instituteId: string, assignmentId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_exams');
      const batchId = text(input.batchId);
      const title = text(input.title);
      if (!UUID.test(batchId) || title.length < 2) throw new InstituteWorkspaceError('ASSIGNMENT_BATCH_AND_TITLE_REQUIRED', 400);
      const owned = await client.query(`select 1 from public.class_batches where id=$1 and institute_id=$2`, [batchId, instituteId]);
      if (!owned.rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND', 404);
      const { rows } = assignmentId && UUID.test(assignmentId)
        ? await client.query(`update public.institute_assignments set batch_id=$2,title=$3,instructions=$4,due_date=$5::date,max_marks=$6,status=$7,updated_at=now() where id=$1 and institute_id=$8 returning *`, [assignmentId, batchId, title, text(input.instructions), day(input.dueDate), number(input.maxMarks, 100), text(input.status, 'open'), instituteId])
        : await client.query(`insert into public.institute_assignments (institute_id,batch_id,title,instructions,due_date,max_marks,status,created_by) values ($1,$2,$3,$4,$5::date,$6,$7,auth.uid()) returning *`, [instituteId, batchId, title, text(input.instructions), day(input.dueDate), number(input.maxMarks, 100), text(input.status, 'open')]);
      if (!rows[0]) throw new InstituteWorkspaceError('ASSIGNMENT_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,$2,'assignment',$3::text,'{}'::jsonb)`, [instituteId, assignmentId ? 'assignment.updated' : 'assignment.created', String(rows[0].id)]);
      return rows[0];
    });
  }

  async gradeSubmission(actor: ProviderListingActor, instituteId: string, submissionId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_exams');
      if (!UUID.test(submissionId)) throw new InstituteWorkspaceError('INVALID_SUBMISSION_ID', 400);
      const marks = number(input.marks, -1);
      if (marks < 0) throw new InstituteWorkspaceError('SUBMISSION_MARKS_REQUIRED', 400);
      const { rows } = await client.query(`update public.institute_assignment_submissions set marks=$3,feedback=$4,status='graded',updated_at=now() where id=$1 and institute_id=$2 returning *`, [submissionId, instituteId, marks, text(input.feedback)]);
      if (!rows[0]) throw new InstituteWorkspaceError('SUBMISSION_NOT_FOUND', 404);
      await client.query(`select public.institute_audit($1,'assignment.graded','submission',$2::text,'{}'::jsonb)`, [instituteId, submissionId]);
      return rows[0];
    });
  }

  async issueCertificate(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_students');
      const enrollmentId = text(input.enrollmentId);
      if (!UUID.test(enrollmentId)) throw new InstituteWorkspaceError('ENROLLMENT_REQUIRED', 400);
      const enrollment = await client.query(`select e.student_id, e.batch_id from public.class_enrollments e join public.class_batches b on b.id=e.batch_id where e.id=$1 and b.institute_id=$2`, [enrollmentId, instituteId]);
      if (!enrollment.rows[0]) throw new InstituteWorkspaceError('ENROLLMENT_NOT_FOUND', 404);
      const certificateNo = text(input.certificateNo) || `BOS-${Date.now().toString(36).toUpperCase()}-${String(enrollmentId).slice(0, 4).toUpperCase()}`;
      const { rows } = await client.query(`insert into public.institute_certificates (institute_id,enrollment_id,student_id,certificate_no,title,issued_on,issued_by) values ($1,$2,$3,$4,$5,coalesce($6::date,current_date),auth.uid()) on conflict (institute_id,certificate_no) do update set title=excluded.title returning *`, [instituteId, enrollmentId, enrollment.rows[0].student_id, certificateNo, text(input.title, 'Course completion'), day(input.issuedOn)]);
      await client.query(`select public.institute_audit($1,'certificate.issued','certificate',$2::text,$3::jsonb)`, [instituteId, String(rows[0].id), JSON.stringify({ certificateNo })]);
      return rows[0];
    });
  }

  // --- Fees ----------------------------------------------------------------
  async refundFee(actor: ProviderListingActor, ledgerId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      if (!UUID.test(ledgerId)) throw new InstituteWorkspaceError('INVALID_FEE_ID', 400);
      const ledger = await client.query(`select institute_id from public.institute_fee_ledger where id=$1`, [ledgerId]);
      if (!ledger.rows[0]) throw new InstituteWorkspaceError('FEE_NOT_FOUND', 404);
      await this.access(client, actor, String(ledger.rows[0].institute_id), 'manage_fees');
      try {
        const { rows } = await client.query(`select * from public.institute_refund_fee($1,$2,$3)`, [ledgerId, input.amount == null || input.amount === '' ? null : number(input.amount), text(input.reason)]);
        return rows[0];
      } catch (error: any) {
        throw new InstituteWorkspaceError(String(error?.message || 'REFUND_FAILED').split(':')[0], 400);
      }
    });
  }

  // --- Announcements -------------------------------------------------------
  async saveAnnouncement(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_announcements', text(input.branchId) || null);
      const title = text(input.title);
      const message = text(input.message);
      if (title.length < 2 || message.length < 2) throw new InstituteWorkspaceError('ANNOUNCEMENT_TITLE_AND_MESSAGE_REQUIRED', 400);
      if (!(await client.query(`select public.institute_module_enabled($1,'announcements') as enabled`, [instituteId])).rows[0].enabled) {
        throw new InstituteWorkspaceError('MODULE_DISABLED', 403);
      }
      const { rows } = await client.query(`insert into public.institute_announcements (institute_id,branch_id,batch_id,title,message,audience,created_by) values ($1,$2::uuid,$3::uuid,$4,$5,$6,auth.uid()) returning *`, [instituteId, text(input.branchId) || null, text(input.batchId) || null, title, message, text(input.audience, 'students')]);
      await client.query(`select public.institute_audit($1,'announcement.created','announcement',$2::text,$3::jsonb)`, [instituteId, String(rows[0].id), JSON.stringify({ audience: rows[0].audience })]);
      return rows[0];
    });
  }

  // --- Staff roles ---------------------------------------------------------
  async saveMember(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_members');
      const email = text(input.email).toLowerCase();
      if (!validEmail(email)) throw new InstituteWorkspaceError('INVALID_EMAIL', 400);
      const role = text(input.role, 'staff');
      if (!['manager', 'branch_admin', 'faculty', 'accountant', 'receptionist', 'staff'].includes(role)) {
        throw new InstituteWorkspaceError('INVALID_MEMBER_ROLE', 400);
      }
      const branchId = text(input.branchId) || null;
      if (['manager', 'branch_admin', 'faculty', 'receptionist'].includes(role) && !branchId) {
        throw new InstituteWorkspaceError('MEMBER_BRANCH_REQUIRED', 400);
      }
      // profiles is RLS-protected; the lookup runs through a definer helper that
      // first proves manage_members on this institute.
      const profile = await client.query(`select public.institute_member_lookup($1,$2) as id`, [instituteId, email]);
      const userId = profile.rows[0]?.id;
      if (!userId) throw new InstituteWorkspaceError('MEMBER_ACCOUNT_REQUIRED', 404);
      if (String(userId) === actor.supabaseUserId) throw new InstituteWorkspaceError('CANNOT_CHANGE_OWN_MEMBERSHIP', 400);
      const { rows } = await client.query(`insert into public.institute_members (institute_id,user_id,branch_id,role,permissions,status,invited_email) values ($1,$2,$3::uuid,$4,$5::jsonb,'active',$6) on conflict (institute_id,user_id) do update set branch_id=excluded.branch_id, role=excluded.role, permissions=excluded.permissions, status='active', revoked_at=null, updated_at=now() returning *`, [instituteId, userId, branchId, role, JSON.stringify(jsonArray(input.permissions)), email]);
      await client.query(`select public.institute_audit($1,'member.saved','institute_member',$2::text,$3::jsonb)`, [instituteId, String(rows[0].id), JSON.stringify({ role, branchId })]);
      return rows[0];
    });
  }

  async revokeMember(actor: ProviderListingActor, instituteId: string, memberId: string) {
    return this.transaction(actor, async (client) => {
      await this.access(client, actor, instituteId, 'manage_members');
      if (!UUID.test(memberId)) throw new InstituteWorkspaceError('INVALID_MEMBER_ID', 400);
      const { rows } = await client.query(`update public.institute_members set status='revoked', revoked_at=now(), updated_at=now() where id=$1 and institute_id=$2 and role <> 'institute_owner' returning *`, [memberId, instituteId]);
      if (!rows[0]) throw new InstituteWorkspaceError('MEMBER_NOT_FOUND_OR_OWNER', 400);
      await client.query(`select public.institute_audit($1,'member.revoked','institute_member',$2::text,'{}'::jsonb)`, [instituteId, memberId]);
      return rows[0];
    });
  }

  // --- Super admin -------------------------------------------------------
  private async adminTransaction(actor: ProviderListingActor, operation: (client: PoolClient) => Promise<any>) {
    if (actor.role !== 'admin') throw new InstituteWorkspaceError('ADMIN_REQUIRED', 403);
    return this.transaction(actor, operation);
  }

  async adminReview(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.adminTransaction(actor, async (client) => {
      const { rows } = await client.query(`select * from public.institute_admin_set_verification($1,$2,$3)`, [instituteId, text(input.verificationStatus, 'pending'), text(input.note)]);
      return rows[0];
    });
  }

  async adminSetStatus(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.adminTransaction(actor, async (client) => {
      const { rows } = await client.query(`select * from public.institute_admin_set_status($1,$2,$3)`, [instituteId, text(input.status, 'draft'), text(input.reason)]);
      return rows[0];
    });
  }

  async adminSetEntitlement(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.adminTransaction(actor, async (client) => {
      const { rows } = await client.query(`select * from public.institute_admin_set_entitlement($1,$2,$3)`, [instituteId, text(input.moduleKey), input.enabled === true]);
      return rows[0];
    });
  }

  async adminDirectory(actor: ProviderListingActor) {
    return this.adminTransaction(actor, async (client) => {
      const { rows } = await client.query(`select i.id, i.name, i.city, i.status, i.verification_status, i.owner_id, i.created_at,
                                                  (select count(*)::int from public.institute_branches b where b.institute_id=i.id) as branch_count,
                                                  (select count(*)::int from public.class_batches cb where cb.institute_id=i.id) as batch_count
                                             from public.institutes i order by i.created_at desc`);
      return rows;
    });
  }

  // --- Student self-service ----------------------------------------------
  async studentOverview(actor: ProviderListingActor) {
    if (!actor.supabaseUserId) throw new InstituteWorkspaceError('VERIFIED_AUTH_ID_REQUIRED', 401);
    return this.transaction(actor, async (client) => {
      const enrollments = await client.query(`select e.id, e.status, e.fee_amount, e.payment_status, e.batch_id, b.title as batch_title,
                                                      b.days_of_week, b.start_time, b.end_time, b.timezone, b.start_date, b.end_date,
                                                      l.title as course_title, i.name as institute_name, b.institute_id as institute_id
                                                 from public.class_enrollments e
                                                 left join public.class_batches b on b.id=e.batch_id
                                                 left join public.listings l on l.id=e.listing_id
                                                 left join public.institutes i on i.id=b.institute_id
                                                where e.student_id=auth.uid() order by e.created_at desc`);
      const progress = [];
      for (const row of enrollments.rows) {
        if (!row.institute_id) continue;
        const report = await client.query(`select public.institute_progress_report($1) as report`, [row.id]);
        progress.push(report.rows[0].report);
      }
      const [leaves, results, certificates, announcements, fees] = await Promise.all([
        client.query(`select * from public.institute_leave_requests where student_id=auth.uid() order by created_at desc limit 100`),
        client.query(`select r.*, e.title as exam_title, e.max_marks from public.institute_exam_results r join public.institute_exams e on e.id=r.exam_id where r.student_id=auth.uid() and r.published_at is not null order by r.updated_at desc`),
        client.query(`select * from public.institute_certificates where student_id=auth.uid() and status='issued' order by issued_on desc`),
        client.query(`select a.* from public.institute_announcements a where a.audience in ('students','all') and (a.batch_id is null or exists (select 1 from public.class_enrollments e where e.batch_id=a.batch_id and e.student_id=auth.uid() and e.status in ('confirmed','waitlisted'))) order by a.published_at desc limit 50`),
        client.query(`select * from public.institute_fee_ledger where student_id=auth.uid() order by due_date nulls last`),
      ]);
      return {
        enrollments: enrollments.rows, progress, leaves: leaves.rows, results: results.rows,
        certificates: certificates.rows, announcements: announcements.rows, fees: fees.rows,
      };
    });
  }
}
