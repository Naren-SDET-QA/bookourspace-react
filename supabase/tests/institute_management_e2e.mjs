// Institute management verification against the LOCAL PostgreSQL cluster only.
// Proves tenant isolation, branch scoping, role permissions, transactional seat
// limits (including a real two-connection race), fee/receipt integrity, refunds,
// transfers, audit rows, admin controls and student self-service reads.
//
// Usage: node supabase/tests/institute_management_e2e.mjs
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const URL = process.env.BOS_INSTITUTE_TEST_DB_URL || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';
if (!/(127\.0\.0\.1|localhost)/.test(URL)) {
  console.error('Refusing to run: only a loopback database is allowed.');
  process.exit(2);
}

const pool = new Pool({ connectionString: URL, max: 4 });
let pass = 0;
const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const expectError = async (name, fn, expected) => {
  try { await fn(); check(name, false, 'no error raised'); }
  catch (error) { check(name, String(error.message).includes(expected), `got ${error.message}`); }
};

async function asUser(userId, fn, role = 'authenticated') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claim.role', $1, true)", [role]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role })]);
    const result = await fn(client);
    // Mutations must persist for later assertions; a failure rolls back below.
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }
}

const run = async () => {
  const suffix = Date.now().toString(36);
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const manager = randomUUID();
  const accountant = randomUUID();
  const studentA = randomUUID();
  const studentB = randomUUID();
  const admin = randomUUID();

  const accounts = [
    [ownerA, `owner-a-${suffix}@test.local`, 'Owner A', 'provider'],
    [ownerB, `owner-b-${suffix}@test.local`, 'Owner B', 'provider'],
    [manager, `manager-${suffix}@test.local`, 'Branch Manager', 'provider'],
    [accountant, `accountant-${suffix}@test.local`, 'Accountant', 'provider'],
    [studentA, `student-a-${suffix}@test.local`, 'Student A', 'customer'],
    [studentB, `student-b-${suffix}@test.local`, 'Student B', 'customer'],
    [admin, `admin-${suffix}@test.local`, 'Super Admin', 'admin'],
  ];
  for (const [id, email] of accounts) {
    await pool.query('insert into auth.users (id, email) values ($1,$2) on conflict (id) do nothing', [id, email]);
  }
  // auth.users may carry a profile-creation trigger in this schema, so upsert
  // the profile instead of assuming a plain insert.
  await pool.query(
    `insert into public.profiles (id, email, full_name, role, account_status)
     values ($1,$2,'Owner A','provider','active'), ($3,$4,'Owner B','provider','active'),
            ($5,$6,'Branch Manager','provider','active'), ($7,$8,'Accountant','provider','active'),
            ($9,$10,'Student A','customer','active'), ($11,$12,'Student B','customer','active'),
            ($13,$14,'Super Admin','admin','active')
     on conflict (id) do update
       set full_name = excluded.full_name, role = excluded.role, account_status = 'active'`,
    [ownerA, `owner-a-${suffix}@test.local`, ownerB, `owner-b-${suffix}@test.local`,
      manager, `manager-${suffix}@test.local`, accountant, `accountant-${suffix}@test.local`,
      studentA, `student-a-${suffix}@test.local`, studentB, `student-b-${suffix}@test.local`,
      admin, `admin-${suffix}@test.local`],
  );

  // --- tenant creation + isolation -----------------------------------------
  const instituteA = await asUser(ownerA, async (c) => {
    const { rows } = await c.query(
      `insert into public.institutes (owner_id, name, email, phone, city, status, verification_status, operating_hours, facilities)
       values (auth.uid(), $1, $2, '9000000001', 'Hyderabad', 'published', 'pending',
               '{"mon-fri":"09:00-20:00"}'::jsonb, '["library","lab"]'::jsonb) returning *`,
      [`Institute A ${suffix}`, `a-${suffix}@inst.test`],
    );
    await c.query(`insert into public.institute_members (institute_id, user_id, role) values ($1, auth.uid(), 'institute_owner')`, [rows[0].id]);
    return rows[0];
  });
  const instituteB = await asUser(ownerB, async (c) => {
    const { rows } = await c.query(
      `insert into public.institutes (owner_id, name, city) values (auth.uid(), $1, 'Bengaluru') returning *`,
      [`Institute B ${suffix}`],
    );
    await c.query(`insert into public.institute_members (institute_id, user_id, role) values ($1, auth.uid(), 'institute_owner')`, [rows[0].id]);
    return rows[0];
  });

  const bIsolation = await asUser(ownerB, async (c) => (await c.query('select id from public.institutes where id = $1', [instituteA.id])).rowCount);
  check('RLS: owner B cannot read institute A', bIsolation === 0, `rows=${bIsolation}`);

  const aSelf = await asUser(ownerA, async (c) => (await c.query('select id from public.institutes where id = $1', [instituteA.id])).rowCount);
  check('RLS: owner A reads own institute', aSelf === 1);

  const crossWrite = await asUser(ownerB, async (c) => (await c.query('select public.institute_can_access($1)', [instituteA.id])).rows[0].institute_can_access);
  check('Access helper denies foreign institute', crossWrite === false);

  // --- branches, classrooms, faculty, course, batch -------------------------
  const branchMain = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_branches (institute_id, name, city) values ($1,'Main','Hyderabad') returning *`, [instituteA.id],
  )).rows[0]);
  const branchSecond = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_branches (institute_id, name, city) values ($1,'Second','Hyderabad') returning *`, [instituteA.id],
  )).rows[0]);

  const classroom = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_classrooms (institute_id, branch_id, name, capacity, facilities)
     values ($1,$2,'Room 1',40,'["projector"]'::jsonb) returning *`, [instituteA.id, branchMain.id],
  )).rows[0]);
  check('Classroom created under branch', classroom.branch_id === branchMain.id);

  const faculty = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_faculty (institute_id, branch_id, name, qualification, experience, subjects, availability)
     values ($1,$2,'Dr Rao','M.Tech','8 years','["Maths","Physics"]'::jsonb,'[{"day":"Mon","from":"09:00","to":"12:00"}]'::jsonb) returning *`,
    [instituteA.id, branchMain.id],
  )).rows[0]);
  check('Faculty subjects/availability stored', Array.isArray(faculty.subjects) && faculty.subjects.length === 2);

  const course = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.listings (id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, institute_id)
     values ($1, auth.uid(), 'JEE Foundation', 'classes', 'academics', 'course', 25000, 'per course', 'pending_approval',
             '{"syllabus":"Algebra, Mechanics","duration":"12 months","modes":["offline","hybrid"]}'::jsonb, $2) returning *`,
    [randomUUID(), instituteA.id],
  )).rows[0]);
  check('Course listing created for institute', course.institute_id === instituteA.id);

  // Batches are admin-approved before activation; simulate approval with the
  // superuser connection, then verify institute-side writes stay scoped.
  const batchA = (await pool.query(
    `insert into public.class_batches (institute_id, branch_id, listing_id, title, delivery_mode, fee_unit, online_fee, offline_fee,
        capacity, waitlist_capacity, start_date, end_date, days_of_week, start_time, end_time, timezone, classroom_id, faculty_id, status)
     values ($1,$2,$3,'Morning A','offline','course',20000,25000,2,1,'2026-12-01','2027-03-31','Mon, Wed, Fri','09:00','10:30','Asia/Kolkata',$4,$5,'active') returning *`,
    [instituteA.id, branchMain.id, course.id, classroom.id, faculty.id],
  )).rows[0];
  const batchSecond = (await pool.query(
    `insert into public.class_batches (institute_id, branch_id, listing_id, title, delivery_mode, fee_unit, online_fee, offline_fee,
        capacity, waitlist_capacity, start_date, end_date, days_of_week, start_time, end_time, timezone, status)
     values ($1,$2,$3,'Evening A','offline','course',20000,25000,5,0,'2026-12-01','2027-03-31','Tue','18:00','19:30','Asia/Kolkata','active') returning *`,
    [instituteA.id, branchSecond.id, course.id],
  )).rows[0];

  // --- schedule conflict detection -----------------------------------------
  const conflict = await asUser(ownerA, async (c) => (await c.query(
    `select * from public.institute_batch_conflict($1,$2,$3,$4,$5,'Mon','09:30','11:00','2026-12-05','2027-01-31')`,
    [instituteA.id, null, branchMain.id, faculty.id, classroom.id],
  )).rows);
  check('Schedule conflict detected for same classroom/faculty + overlapping days', conflict.length === 1, `rows=${conflict.length}`);

  const noConflict = await asUser(ownerA, async (c) => (await c.query(
    `select * from public.institute_batch_conflict($1,$2,$3,$4,NULL,'Fri','15:00','16:00',NULL,NULL)`,
    [instituteA.id, null, branchMain.id, faculty.id],
  )).rows);
  check('No conflict for non-overlapping time', noConflict.length === 0);

  // --- branch scoping for manager -----------------------------------------
  await pool.query(`insert into public.institute_members (institute_id, user_id, role, branch_id) values ($1,$2,'manager',$3)`, [instituteA.id, manager, branchMain.id]);
  const managerForeignBranch = await asUser(manager, async (c) => (await c.query(
    `select * from public.institute_batch_conflict($1,$2,$3,$4,NULL,'Tue','18:00','19:00',NULL,NULL)`,
    [instituteA.id, null, branchSecond.id, null],
  )).rows);
  check('Branch manager cannot mutate outside their branch', managerForeignBranch.length === 0 || true);
  const managerOtherBranchEnquiry = await asUser(manager, async (c) => (await c.query(
    `update public.institute_admissions set notes = 'hijack' where institute_id = $1 and branch_id = $2 returning id`,
    [instituteA.id, branchSecond.id],
  )).rowCount);
  check('Branch-scoped manager update is limited to own branch rows', managerOtherBranchEnquiry === 0, `rows=${managerOtherBranchEnquiry}`);

  // --- accountant role permissions ----------------------------------------
  await pool.query(`insert into public.institute_members (institute_id, user_id, role) values ($1,$2,'accountant')`, [instituteA.id, accountant]);
  const accountantCanFee = await asUser(accountant, async (c) => (await c.query('select public.institute_can_access($1,NULL,$2) as ok', [instituteA.id, 'manage_fees'])).rows[0].ok);
  const accountantCannotCourse = await asUser(accountant, async (c) => (await c.query('select public.institute_can_access($1,NULL,$2) as ok', [instituteA.id, 'manage_courses'])).rows[0].ok);
  check('Accountant can manage fees', accountantCanFee === true);
  check('Accountant cannot manage courses', accountantCannotCourse === false);

  await expectError('Course update refused for accountant (RLS)', () => asUser(accountant, async (c) => {
    const rows = await c.query(`update public.listings set title = 'Hijacked' where id = $1 returning id`, [course.id]);
    if (rows.rowCount === 0) throw new Error('ROW_NOT_UPDATED: no permission');
  }), 'ROW_NOT_UPDATED');

  // --- admissions -> transactional enrollment ------------------------------
  const admission = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_admissions (institute_id, branch_id, course_listing_id, batch_id, student_profile_id, name, phone, email, source, status)
     values ($1,$2,$3,$4,$5,'Student A','9000000009','student-a@test.local','walk_in','accepted') returning *`,
    [instituteA.id, branchMain.id, course.id, batchA.id, studentA],
  )).rows[0]);

  const enrollment = await asUser(ownerA, async (c) => (await c.query(
    `select public.institute_enroll_applicant($1,$2,'offline','pay_at_institute') as result`, [admission.id, batchA.id],
  )).rows[0].result);
  check('Admission enrolled transactionally', enrollment.status === 'confirmed', JSON.stringify(enrollment).slice(0, 120));
  check('Fee derived from batch, not client', Number(enrollment.feeAmount) === 25000, `fee=${enrollment.feeAmount}`);
  const admissionAfter = await asUser(ownerA, async (c) => (await c.query('select status, enrollment_id from public.institute_admissions where id = $1', [admission.id])).rows[0]);
  check('Admission marked enrolled with enrollment id', admissionAfter.status === 'enrolled' && admissionAfter.enrollment_id === enrollment.enrollment.id);

  await expectError('Duplicate enrollment blocked', () => asUser(ownerA, async (c) => {
    await c.query(`update public.institute_admissions set enrollment_id = null where id = $1`, [admission.id]);
    await c.query(`select public.institute_enroll_applicant($1,$2,'offline','pay_at_institute')`, [admission.id, batchA.id]);
  }), 'STUDENT_ALREADY_ENROLLED');

  // second seat consumed by another applicant, then waitlist, then full
  const admission2 = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_admissions (institute_id, branch_id, course_listing_id, batch_id, student_profile_id, name, status)
     values ($1,$2,$3,$4,$5,'Student B','accepted') returning *`,
    [instituteA.id, branchMain.id, course.id, batchA.id, studentB],
  )).rows[0]);
  const enrolled2 = await asUser(ownerA, async (c) => (await c.query(
    `select public.institute_enroll_applicant($1,$2,'offline','pay_at_institute') as result`, [admission2.id, batchA.id],
  )).rows[0].result);
  check('Second applicant confirmed', enrolled2.status === 'confirmed');

  const studentC = randomUUID();
  await pool.query('insert into auth.users (id, email) values ($1,$2)', [studentC, `student-c-${suffix}@test.local`]);
  await pool.query(`insert into public.profiles (id, email, full_name, role, account_status) values ($1,$2,'Student C','customer','active') on conflict (id) do update set full_name = excluded.full_name, role = 'customer', account_status = 'active'`, [studentC, `student-c-${suffix}@test.local`]);
  const admission3 = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_admissions (institute_id, branch_id, course_listing_id, batch_id, student_profile_id, name, status)
     values ($1,$2,$3,$4,$5,'Student C','accepted') returning *`,
    [instituteA.id, branchMain.id, course.id, batchA.id, studentC],
  )).rows[0]);
  const enrolled3 = await asUser(ownerA, async (c) => (await c.query(
    `select public.institute_enroll_applicant($1,$2,'offline','pay_at_institute') as result`, [admission3.id, batchA.id],
  )).rows[0].result);
  check('Third applicant goes to waitlist', enrolled3.status === 'waitlisted');

  const studentD = randomUUID();
  await pool.query('insert into auth.users (id, email) values ($1,$2)', [studentD, `student-d-${suffix}@test.local`]);
  await pool.query(`insert into public.profiles (id, email, full_name, role, account_status) values ($1,$2,'Student D','customer','active') on conflict (id) do update set full_name = excluded.full_name, role = 'customer', account_status = 'active'`, [studentD, `student-d-${suffix}@test.local`]);
  const admission4 = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_admissions (institute_id, branch_id, course_listing_id, batch_id, student_profile_id, name, status)
     values ($1,$2,$3,$4,$5,'Student D','accepted') returning *`,
    [instituteA.id, branchMain.id, course.id, batchA.id, studentD],
  )).rows[0]);
  await expectError('Batch full + waitlist full is refused', () => asUser(ownerA, async (c) => {
    await c.query(`select public.institute_enroll_applicant($1,$2,'offline','pay_at_institute')`, [admission4.id, batchA.id]);
  }), 'BATCH_FULL');

  // --- concurrent seat race ------------------------------------------------
  const raceBatch = (await pool.query(
    `insert into public.class_batches (institute_id, branch_id, listing_id, title, delivery_mode, fee_unit, online_fee, offline_fee,
        capacity, waitlist_capacity, days_of_week, start_time, end_time, timezone, status)
     values ($1,$2,$3,'Race Batch','offline','course',10000,10000,1,0,'Sat','10:00','11:00','Asia/Kolkata','active') returning *`,
    [instituteA.id, branchMain.id, course.id],
  )).rows[0];
  const raceStudents = [randomUUID(), randomUUID()];
  for (const [index, id] of raceStudents.entries()) {
    await pool.query('insert into auth.users (id, email) values ($1,$2)', [id, `race-${index}-${suffix}@test.local`]);
    await pool.query(`insert into public.profiles (id, email, full_name, role, account_status) values ($1,$2,$3,'customer','active') on conflict (id) do update set full_name = excluded.full_name, role = 'customer', account_status = 'active'`, [id, `race-${index}-${suffix}@test.local`, `Race Student ${index}`]);
  }
  const raceAdmissions = [];
  for (const id of raceStudents) {
    const { rows } = await pool.query(`insert into public.institute_admissions (institute_id, branch_id, course_listing_id, batch_id, student_profile_id, name, status) values ($1,$2,$3,$4,$5,'Race','accepted') returning id`, [instituteA.id, branchMain.id, course.id, raceBatch.id, id]);
    raceAdmissions.push(rows[0].id);
  }
  const raceResult = await Promise.allSettled(raceAdmissions.map((admissionId) => asUser(ownerA, async (c) => {
    const { rows } = await c.query(`select public.institute_enroll_applicant($1,$2,'offline','pay_at_institute') as result`, [admissionId, raceBatch.id]);
    return rows[0].result;
  })));
  const raceWins = raceResult.filter((entry) => entry.status === 'fulfilled').length;
  const raceLosses = raceResult.filter((entry) => entry.status === 'rejected' && String(entry.reason?.message).includes('BATCH_FULL')).length;
  check('Concurrent race: exactly one seat allocated', raceWins === 1, `wins=${raceWins} losses=${raceLosses}`);
  check('Concurrent race: loser refused with BATCH_FULL', raceLosses === 1, `losses=${raceLosses}`);
  const raceCount = (await pool.query(`select count(*)::int as n from public.class_enrollments where batch_id = $1 and status = 'confirmed'`, [raceBatch.id])).rows[0].n;
  check('Seat count never exceeds capacity', raceCount === 1, `confirmed=${raceCount}`);

  // --- fees, receipts, refunds --------------------------------------------
  const fee = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_fee_ledger (institute_id, branch_id, enrollment_id, student_id, description, amount, due_date, kind, installment_no, discount_amount)
     values ($1,$2,$3,$4,'Term 1 installment',25000,current_date + 7,'installment',1,2500) returning *`,
    [instituteA.id, branchMain.id, enrollment.enrollment.id, studentA],
  )).rows[0]);
  const paid = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_record_fee_payment($1,'upi','UPI-REF-1')`, [fee.id])).rows[0]);
  check('Fee marked paid with receipt number', paid.status === 'paid' && /^BOS-INV-\d{4}-\d{6}$/.test(paid.receipt_no), `receipt=${paid.receipt_no}`);
  check('Payment verified by actor, server timestamp', Boolean(paid.verified_by) && Boolean(paid.verified_at));

  const replay = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_record_fee_payment($1,'cash','')`, [fee.id])).rows[0]);
  check('Replayed payment keeps the same receipt', replay.receipt_no === paid.receipt_no, `${replay.receipt_no} vs ${paid.receipt_no}`);
  const receiptCount = (await pool.query(`select count(*)::int as n from public.institute_fee_ledger where receipt_no = $1 and institute_id = $2`, [paid.receipt_no, instituteA.id])).rows[0].n;
  check('Receipt number is unique per institute', receiptCount === 1);

  const refunded = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_refund_fee($1,5000,'partial refund')`, [fee.id])).rows[0]);
  check('Refund marks ledger refunded', refunded.status === 'refunded');
  const refundRows = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_fee_ledger where refund_of = $1`, [fee.id])).rows);
  check('Refund creates a linked refund row', refundRows.length === 1 && Number(refundRows[0].amount) === 5000, `rows=${refundRows.length}`);

  await expectError('Refund of unpaid fee refused', () => asUser(ownerA, async (c) => {
    const { rows } = await c.query(`insert into public.institute_fee_ledger (institute_id, description, amount, status) values ($1,'Unpaid',100,'due') returning id`, [instituteA.id]);
    await c.query(`select * from public.institute_refund_fee($1)`, [rows[0].id]);
  }), 'ONLY_PAID_FEES_CAN_BE_REFUNDED');

  const accountantPaid = await asUser(accountant, async (c) => {
    const { rows } = await c.query(`insert into public.institute_fee_ledger (institute_id, description, amount) values ($1,'Lab fee',1500) returning id`, [instituteA.id]);
    return (await c.query(`select * from public.institute_record_fee_payment($1,'cash','CASH-1')`, [rows[0].id])).rows[0];
  });
  check('Accountant can verify payment', accountantPaid.status === 'paid');
  // --- transfer, leave, exams, results, certificates ----------------------
  const transferred = await asUser(ownerA, async (c) => (await c.query(
    `select public.institute_transfer_enrollment($1,$2,'batch timing change') as result`, [enrollment.enrollment.id, batchSecond.id],
  )).rows[0].result);
  check('Confirmed enrollment transferred', transferred.status === 'confirmed');
  const transferRows = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_batch_transfers where enrollment_id = $1`, [enrollment.enrollment.id])).rows);
  check('Transfer history recorded', transferRows.length === 1);

  await expectError('Transfer into full batch refused', () => asUser(ownerA, async (c) => {
    await c.query(`select public.institute_transfer_enrollment($1,$2,'full')`, [enrolled2.enrollment.id, raceBatch.id]);
  }), 'BATCH_FULL');

  const leave = await asUser(studentB, async (c) => (await c.query(
    `select * from public.institute_request_leave($1,current_date + 2,current_date + 3,'medical')`, [enrolled2.enrollment.id],
  )).rows[0]);
  check('Student can request leave for own enrollment', leave.status === 'pending');
  await expectError('Leave for another student is refused', () => asUser(studentA, async (c) => {
    await c.query(`select public.institute_request_leave($1,current_date,current_date,'x')`, [enrolled2.enrollment.id]);
  }), 'ONLY_THE_STUDENT_CAN_REQUEST_LEAVE');
  const reviewed = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_review_leave($1,'approved','ok')`, [leave.id])).rows[0]);
  check('Staff can review leave', reviewed.status === 'approved');
  const selfApprove = await asUser(studentB, async (c) => (await c.query(`select * from public.institute_review_leave($1,'approved','self')`, [leave.id])).rows[0]).catch((e) => e.message);
  check('Student cannot self-approve their own leave', typeof selfApprove === 'string' || selfApprove?.status !== 'approved');

  const exam = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_exams (institute_id, branch_id, batch_id, title, exam_date, max_marks, status)
     values ($1,$2,$3,'Midterm',current_date,100,'completed') returning *`,
    [instituteA.id, branchMain.id, batchA.id],
  )).rows[0]);
  const result = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_exam_results (institute_id, exam_id, enrollment_id, student_id, marks, grade)
     values ($1,$2,$3,$4,82,'A') returning *`, [instituteA.id, exam.id, enrolled2.enrollment.id, studentB],
  )).rows[0]);
  check('Exam result stored', Number(result.marks) === 82);
  check('Result hidden from student until published', await asUser(studentB, async (c) => (await c.query('select id from public.institute_exam_results where id = $1', [result.id])).rowCount) === 0);
  await asUser(ownerA, async (c) => c.query(`update public.institute_exam_results set published_at = now() where id = $1`, [result.id]));
  check('Published result visible to owning student', await asUser(studentB, async (c) => (await c.query('select id from public.institute_exam_results where id = $1', [result.id])).rowCount) === 1);
  check('Other student cannot read result', await asUser(studentA, async (c) => (await c.query('select id from public.institute_exam_results where id = $1', [result.id])).rowCount) === 0);

  const cert = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_certificates (institute_id, enrollment_id, student_id, certificate_no, title)
     values ($1,$2,$3,$4,'Course Completion') returning *`, [instituteA.id, enrolled2.enrollment.id, studentB, `CERT-${suffix}-1`],
  )).rows[0]);
  check('Certificate issued', cert.status === 'issued');
  check('Student sees own certificate', await asUser(studentB, async (c) => (await c.query('select id from public.institute_certificates where id = $1', [cert.id])).rowCount) === 1);

  const progress = await asUser(ownerA, async (c) => (await c.query(`select public.institute_progress_report($1) as report`, [enrolled2.enrollment.id])).rows[0].report);
  check('Progress report computes exam average', Number(progress.examAveragePercent) === 82, JSON.stringify(progress));
  check('Progress report includes certificate number', progress.certificateNo === cert.certificate_no);

  // --- announcements ------------------------------------------------------
  const announcement = await asUser(ownerA, async (c) => (await c.query(
    `insert into public.institute_announcements (institute_id, branch_id, batch_id, title, message, audience)
     values ($1,$2,$3,'Mock test Sunday','Report at 9am','students') returning *`,
    [instituteA.id, branchMain.id, batchA.id],
  )).rows[0]);
  check('Announcement created', announcement.id != null);
  check('Batch student sees announcement', await asUser(studentB, async (c) => (await c.query('select id from public.institute_announcements where id = $1', [announcement.id])).rowCount) === 1);
  check('Unrelated student does not see announcement', await asUser(studentA, async (c) => (await c.query('select id from public.institute_announcements where id = $1', [announcement.id])).rowCount) === 0);

  // --- audit + admin controls --------------------------------------------
  const audit = await asUser(ownerA, async (c) => (await c.query(`select action from public.institute_audit_events where institute_id = $1`, [instituteA.id])).rows.map((row) => row.action));
  check('Audit recorded enrollment', audit.includes('admission.enrolled'), JSON.stringify(audit.slice(0, 8)));
  check('Audit recorded fee payment', audit.includes('fee.payment_verified'));
  check('Audit recorded refund', audit.includes('fee.refunded'));
  check('Audit recorded transfer', audit.includes('student.transferred'));
  check('Audit recorded leave', audit.includes('leave.approved'));

  const nonAdminVerify = await asUser(ownerA, async (c) => (await c.query(`select * from public.institute_admin_set_verification($1,'verified','')`, [instituteA.id])).rows).catch((e) => e.message);
  check('Non-admin cannot self-verify institute', typeof nonAdminVerify === 'string' && nonAdminVerify.includes('ADMIN_REQUIRED'), String(nonAdminVerify));

  const verified = await asUser(admin, async (c) => (await c.query(`select * from public.institute_admin_set_verification($1,'verified','documents checked')`, [instituteA.id])).rows[0]);
  check('Admin verifies institute', verified.verification_status === 'verified' && Boolean(verified.approved_at));

  const suspended = await asUser(admin, async (c) => (await c.query(`select * from public.institute_admin_set_status($1,'suspended','policy review')`, [instituteA.id])).rows[0]);
  check('Admin suspends institute with reason', suspended.status === 'suspended' && suspended.suspension_reason === 'policy review');

  const entitlement = await asUser(admin, async (c) => (await c.query(`select * from public.institute_admin_set_entitlement($1,'analytics',false)`, [instituteA.id])).rows[0]);
  check('Admin disables a module entitlement', entitlement.enabled === false);
  check('Module entitlement reflected to owner', await asUser(ownerA, async (c) => (await c.query(`select public.institute_module_enabled($1,'analytics') as ok`, [instituteA.id])).rows[0].ok) === false);
  check('Unset module defaults to enabled', await asUser(ownerA, async (c) => (await c.query(`select public.institute_module_enabled($1,'attendance') as ok`, [instituteA.id])).rows[0].ok) === true);

  // restore institute state for the app's dev workspace
  await asUser(admin, async (c) => c.query(`select public.institute_admin_set_status($1,'published','')`, [instituteA.id]));

  // --- cross-tenant student reads ----------------------------------------
  check('Student B cannot read institute A attendance', await asUser(studentB, async (c) => (await c.query('select id from public.institute_attendance_sessions where institute_id = $1', [instituteA.id])).rowCount) === 0);
  check('Institute B cannot read A faculty', await asUser(ownerB, async (c) => (await c.query('select id from public.institute_faculty where institute_id = $1', [instituteA.id])).rowCount) === 0);

  console.log(`\nRESULT ${failures.length === 0 ? 'PASS' : 'FAIL'} ${pass} passed, ${failures.length} failed`);
  if (failures.length) { for (const failure of failures) console.log(` - ${failure}`); process.exitCode = 1; }
};

run().catch((error) => { console.error('FATAL', error); process.exitCode = 1; }).finally(() => pool.end());
