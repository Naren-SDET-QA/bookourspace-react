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

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
    if (permission && !['admin', 'institute_owner', 'branch_admin'].includes(role) && !permissions.includes(permission)) {
      throw new InstituteWorkspaceError('INSTITUTE_PERMISSION_REQUIRED', 403);
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
      const empty: InstituteWorkspace = { institute: null, institutes: [], role: null, permissions: [], branches: [], members: [], faculty: [], courses: [], batches: [], enrollments: [], admissions: [], attendance: [], fees: [], enquiries: [], reviews: [], notifications: [], analytics: { branches: 0, courses: 0, activeBatches: 0, enrolledStudents: 0, feeDue: 0, feeCollected: 0, enquiries: 0, reviews: 0, averageRating: null, attendanceRate: null } };
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
        analytics: { branches: branches.rowCount, courses: courses.rowCount, activeBatches: batches.rows.filter((row) => row.status === 'active').length, enrolledStudents: new Set(activeEnrollments.map((row) => row.student_id)).size, feeDue: due, feeCollected: paid, enquiries: enquiries.rowCount, reviews: reviews.rowCount, averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null, attendanceRate: marked ? present / marked * 100 : null },
      };
    });
  }

  async createInstitute(actor: ProviderListingActor, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => {
      const name = text(input.name);
      if (name.length < 2) throw new InstituteWorkspaceError('INSTITUTE_NAME_REQUIRED', 400);
      const result = await client.query(`insert into public.institutes (owner_id, name, description, email, phone, website, city) values (auth.uid(), $1, $2, $3, $4, $5, $6) returning *`, [name, text(input.description), text(input.email), text(input.phone), text(input.website), text(input.city)]);
      const institute = result.rows[0];
      await client.query(`insert into public.institute_members (institute_id, user_id, role, permissions) values ($1, auth.uid(), 'institute_owner', '[]'::jsonb) on conflict (institute_id, user_id) do update set status = 'active', role = 'institute_owner'`, [institute.id]);
      return institute;
    });
  }

  async updateInstitute(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_profile'); const { rows } = await client.query(`update public.institutes set name = coalesce(nullif($2, ''), name), description = $3, email = $4, phone = $5, website = $6, city = $7, logo_url = $8, status = case when $9 in ('draft','published','archived') then $9 else status end, updated_at = now() where id = $1 returning *`, [instituteId, text(input.name), text(input.description), text(input.email), text(input.phone), text(input.website), text(input.city), text(input.logoUrl), text(input.status)]); if (!rows[0]) throw new InstituteWorkspaceError('INSTITUTE_NOT_FOUND', 404); return rows[0]; });
  }

  async saveBranch(actor: ProviderListingActor, instituteId: string, branchId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_branches'); const name = text(input.name); if (name.length < 2) throw new InstituteWorkspaceError('BRANCH_NAME_REQUIRED', 400); const { rows } = branchId && UUID.test(branchId) ? await client.query(`update public.institute_branches set name=$2,address=$3,city=$4,timezone=$5,status=$6,updated_at=now() where id=$1 and institute_id=$7 returning *`, [branchId,name,text(input.address),text(input.city),text(input.timezone,'Asia/Kolkata'),text(input.status,'active'),instituteId]) : await client.query(`insert into public.institute_branches (institute_id,name,address,city,timezone) values ($1,$2,$3,$4,$5) returning *`, [instituteId,name,text(input.address),text(input.city),text(input.timezone,'Asia/Kolkata')]); if (!rows[0]) throw new InstituteWorkspaceError('BRANCH_NOT_FOUND', 404); return rows[0]; });
  }

  async saveFaculty(actor: ProviderListingActor, instituteId: string, facultyId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_faculty', text(input.branchId) || null); const name = text(input.name); if (name.length < 2) throw new InstituteWorkspaceError('FACULTY_NAME_REQUIRED', 400); const params = [instituteId,name,text(input.email),text(input.phone),text(input.qualification),text(input.experience),text(input.branchId)||null,text(input.status,'active')]; const { rows } = facultyId && UUID.test(facultyId) ? await client.query(`update public.institute_faculty set name=$2,email=$3,phone=$4,qualification=$5,experience=$6,branch_id=$7,status=$8,updated_at=now() where id=$1 and institute_id=$9 returning *`, [facultyId,...params.slice(1),instituteId]) : await client.query(`insert into public.institute_faculty (institute_id,name,email,phone,qualification,experience,branch_id,status) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`, params); if (!rows[0]) throw new InstituteWorkspaceError('FACULTY_NOT_FOUND', 404); return rows[0]; });
  }

  async saveCourse(actor: ProviderListingActor, instituteId: string, courseId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_courses'); const title = text(input.title); if (title.length < 2) throw new InstituteWorkspaceError('COURSE_TITLE_REQUIRED', 400); const payload = JSON.stringify(jsonObject(input.payload)); if (courseId && courseId.trim()) { const { rows } = await client.query(`update public.listings set title=$2,subcategory=$3,price=$4,price_unit=$5,payload=$6::jsonb,updated_at=now() where id=$1 and institute_id=$7 and entity_type='course' returning *`, [courseId,title,text(input.subcategory,'course'),number(input.price),text(input.priceUnit,'per course'),payload,instituteId]); if (!rows[0]) throw new InstituteWorkspaceError('COURSE_NOT_FOUND',404); return rows[0]; } const { rows } = await client.query(`insert into public.listings (id,owner_id,title,category_id,subcategory,entity_type,price,price_unit,status,payload,institute_id) values ($1,auth.uid(),$2,'classes',$3,'course',$4,$5,'pending_approval',$6::jsonb,$7) returning *`, [randomUUID(),title,text(input.subcategory,'course'),number(input.price),text(input.priceUnit,'per course'),payload,instituteId]); return rows[0]; });
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
      const values = [instituteId, listingId, title, text(input.deliveryMode, 'offline'), text(input.feeUnit, 'course'), number(input.onlineFee), number(input.offlineFee), Math.max(1, Math.floor(number(input.capacity, 1))), Math.max(0, Math.floor(number(input.waitlistCapacity))), text(input.startDate) || null, text(input.endDate) || null, text(input.daysOfWeek), text(input.startTime), text(input.endTime), text(input.timezone, 'Asia/Kolkata'), text(input.durationLabel), text(input.area), text(input.branchId) || null, text(input.facultyId) || null];
      if (!values[13] || !values[14]) throw new InstituteWorkspaceError('BATCH_TIMING_REQUIRED', 400);
      if (batchId && UUID.test(batchId)) {
        const { rows } = await client.query(`update public.class_batches set listing_id=$2,title=$3,delivery_mode=$4,fee_unit=$5,online_fee=$6,offline_fee=$7,capacity=$8,waitlist_capacity=$9,start_date=$10::date,end_date=$11::date,days_of_week=$12,start_time=$13::time,end_time=$14::time,timezone=$15,duration_label=$16,area=$17,branch_id=$18::uuid,faculty_id=$19::uuid,updated_at=now() where id=$1 and institute_id=$20 returning *`, [batchId, ...values.slice(1), instituteId]);
        if (!rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND', 404);
        return rows[0];
      }
      const { rows } = await client.query(`insert into public.class_batches (institute_id,listing_id,title,delivery_mode,fee_unit,online_fee,offline_fee,capacity,waitlist_capacity,start_date,end_date,days_of_week,start_time,end_time,timezone,duration_label,area,branch_id,faculty_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13::time,$14::time,$15,$16,$17,$18::uuid,$19::uuid) returning *`, values);
      return rows[0];
    });
  }

  async updateBatchStatus(actor: ProviderListingActor, instituteId: string, batchId: string, status: string) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_courses'); if (!['pending_approval', 'paused', 'archived'].includes(status)) throw new InstituteWorkspaceError('INVALID_BATCH_STATUS', 400); const { rows } = await client.query(`update public.class_batches set status=$3,updated_at=now() where id=$1 and institute_id=$2 returning *`, [batchId, instituteId, status]); if (!rows[0]) throw new InstituteWorkspaceError('BATCH_NOT_FOUND',404); return rows[0]; });
  }

  async saveAdmission(actor: ProviderListingActor, instituteId: string, admissionId: string | undefined, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_admissions', text(input.branchId)||null); const params = [instituteId,text(input.name),text(input.phone),text(input.email),text(input.source,'direct'),text(input.status,'new'),text(input.notes),text(input.followUpAt)||null,text(input.branchId)||null,text(input.courseListingId)||null,text(input.batchId)||null]; const { rows } = admissionId && UUID.test(admissionId) ? await client.query(`update public.institute_admissions set name=$2,phone=$3,email=$4,source=$5,status=$6,notes=$7,follow_up_at=$8::timestamptz,branch_id=$9::uuid,course_listing_id=$10,batch_id=$11::uuid,updated_at=now() where id=$1 and institute_id=$12 returning *`, [admissionId,...params.slice(1),instituteId]) : await client.query(`insert into public.institute_admissions (institute_id,name,phone,email,source,status,notes,follow_up_at,branch_id,course_listing_id,batch_id) values ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::uuid,$10,$11::uuid) returning *`, params); if (!rows[0]) throw new InstituteWorkspaceError('ADMISSION_NOT_FOUND',404); return rows[0]; });
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
      const description = text(input.description);
      const amount = number(input.amount, -1);
      if (description.length < 2 || amount < 0) throw new InstituteWorkspaceError('FEE_DESCRIPTION_AND_AMOUNT_REQUIRED', 400);
      const { rows } = await client.query(`insert into public.institute_fee_ledger (institute_id,branch_id,enrollment_id,student_id,description,amount,due_date,notes) values ($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::date,$8) returning *`, [instituteId, text(input.branchId) || null, text(input.enrollmentId) || null, text(input.studentId) || null, description, amount, text(input.dueDate) || null, text(input.notes)]);
      return rows[0];
    });
  }

  async markAttendance(actor: ProviderListingActor, instituteId: string, input: Record<string, unknown>) {
    return this.transaction(actor, async (client) => { await this.access(client, actor, instituteId, 'manage_attendance', text(input.branchId)||null); const batchId = text(input.batchId); const date = text(input.sessionDate); if (!UUID.test(batchId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InstituteWorkspaceError('VALID_BATCH_AND_DATE_REQUIRED',400); const session = await client.query(`insert into public.institute_attendance_sessions (institute_id,branch_id,batch_id,session_date,topic,marked_by) values ($1,$2::uuid,$3,$4,$5,auth.uid()) on conflict (batch_id,session_date) do update set topic=excluded.topic,updated_at=now() returning *`, [instituteId,text(input.branchId)||null,batchId,date,text(input.topic)]); const records = Array.isArray(input.records) ? input.records : []; for (const item of records) { const row = jsonObject(item); if (!UUID.test(text(row.studentId)) || !UUID.test(text(row.enrollmentId)) || !['present','absent','late','excused'].includes(text(row.status))) continue; await client.query(`insert into public.institute_attendance_records (session_id,enrollment_id,student_id,status,marked_by) values ($1,$2,$3,$4,auth.uid()) on conflict (session_id,student_id) do update set enrollment_id=excluded.enrollment_id,status=excluded.status,marked_by=auth.uid(),marked_at=now()`, [session.rows[0].id,text(row.enrollmentId),text(row.studentId),text(row.status)]); } return session.rows[0]; });
  }
}
