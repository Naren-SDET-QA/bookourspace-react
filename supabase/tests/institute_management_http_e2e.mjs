// HTTP workflow verification for institute management against a LOCAL server
// backed by the loopback PostgreSQL cluster. Exercises the real Express routes,
// session verification, RLS-scoped repository and database RPCs.
//
// Usage: BASE_URL=http://127.0.0.1:3123 node supabase/tests/institute_management_http_e2e.mjs
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3123';
const URL = process.env.BOS_INSTITUTE_TEST_DB_URL || 'postgres://postgres@127.0.0.1:55440/bookourspace_dev?sslmode=disable';
const pool = new Pool({ connectionString: URL, max: 2 });
let pass = 0;
const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) { pass += 1; console.log(`PASS ${name}`); }
  else { failures.push(name); console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const call = async (path, token, method = 'GET', body) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, body: payload };
};

const session = async (role, email) => {
  const result = await call('/api/auth/local-dev/session', undefined, 'POST', email ? { role, email } : { role });
  if (!result.body.sessionToken) throw new Error(`session failed for ${role}/${email}: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body.sessionToken;
};

const run = async () => {
  const suffix = randomUUID().slice(0, 8);
  const providerA = randomUUID();
  const providerB = randomUUID();
  const student = randomUUID();
  const accountant = randomUUID();
  for (const [id, email, role] of [
    [providerA, `http-owner-a-${suffix}@test.local`, 'provider'],
    [providerB, `http-owner-b-${suffix}@test.local`, 'provider'],
    [student, `http-student-${suffix}@test.local`, 'customer'],
    [accountant, `http-accountant-${suffix}@test.local`, 'provider'],
  ]) {
    await pool.query('insert into auth.users (id, email) values ($1,$2) on conflict (id) do nothing', [id, email]);
    await pool.query(`insert into public.profiles (id,email,full_name,role,account_status) values ($1,$2,$3,$4,'active')
                      on conflict (id) do update set role = excluded.role, account_status='active'`, [id, email, email, role]);
  }
  // The local session route picks the first active admin.
  const adminExists = await pool.query(`select 1 from public.profiles where role='admin' and account_status='active' limit 1`);
  if (!adminExists.rows[0]) await pool.query(`update public.profiles set role='admin' where id=$1`, [providerB]);

  const tokenA = await session('provider', `http-owner-a-${suffix}@test.local`);
  const tokenB = await session('provider', `http-owner-b-${suffix}@test.local`);
  const tokenStudent = await session('customer', `http-student-${suffix}@test.local`);
  const tokenAccountant = await session('provider', `http-accountant-${suffix}@test.local`);
  const tokenAdmin = await session('admin');

  const health = await call('/api/health');
  check('Server reachable', health.status === 200 || health.status === 503, `status=${health.status}`);

  const created = await call('/api/institute', tokenA, 'POST', { name: `HTTP Institute ${suffix}`, city: 'Hyderabad', email: `http-${suffix}@inst.test` });
  check('Create institute over HTTP', created.status === 201 && created.body.institute?.id, `${created.status} ${JSON.stringify(created.body).slice(0, 120)}`);
  const instituteId = created.body.institute?.id;
  if (!instituteId) throw new Error('cannot continue without institute');

  const updated = await call(`/api/institute/${instituteId}`, tokenA, 'PATCH', {
    description: 'Verified institute', contactPerson: 'Front desk', operatingHours: { 'mon-fri': '09:00-20:00' }, facilities: ['library', 'lab'],
  });
  check('Profile update with hours/facilities', updated.status === 200 && updated.body.institute?.contact_person === 'Front desk');

  const branch = await call(`/api/institute/${instituteId}/branches`, tokenA, 'POST', { name: 'Main', city: 'Hyderabad' });
  check('Create branch', branch.status === 201 && branch.body.branch?.id, branch.status);
  const branchId = branch.body.branch?.id;

  const classroom = await call(`/api/institute/${instituteId}/classrooms`, tokenA, 'POST', { branchId, name: 'Room A', capacity: 30, facilities: ['projector'] });
  check('Create classroom', classroom.status === 201 && classroom.body.classroom?.capacity === 30, JSON.stringify(classroom.body).slice(0, 120));

  const faculty = await call(`/api/institute/${instituteId}/faculty`, tokenA, 'POST', { name: 'Prof Rao', branchId, qualification: 'M.Tech', subjects: ['Maths'] });
  check('Create faculty with subjects', faculty.status === 201 && Array.isArray(faculty.body.faculty?.subjects));

  const course = await call(`/api/institute/${instituteId}/courses`, tokenA, 'POST', {
    title: 'JEE Foundation', subcategory: 'academics', price: 25000, priceUnit: 'per course',
    duration: '12 months', syllabus: 'Algebra', modes: ['offline'], description: 'Foundation course',
  });
  check('Create course listing', course.status === 201 && course.body.course?.status === 'pending_approval', JSON.stringify(course.body).slice(0, 120));
  const courseId = course.body.course?.id;

  const batch = await call(`/api/institute/${instituteId}/batches`, tokenA, 'POST', {
    listingId: courseId, title: 'Morning batch', deliveryMode: 'offline', feeUnit: 'course', offlineFee: 25000, onlineFee: 20000,
    capacity: 2, waitlistCapacity: 1, daysOfWeek: 'Mon, Wed', startTime: '09:00', endTime: '10:30', startDate: '2026-12-01', endDate: '2027-03-31',
    branchId, classroomId: classroom.body.classroom?.id, facultyId: faculty.body.faculty?.id,
  });
  check('Create batch (pending approval)', batch.status === 201 && batch.body.batch?.status === 'pending_approval', JSON.stringify(batch.body).slice(0, 160));
  const batchId = batch.body.batch?.id;

  const conflict = await call(`/api/institute/${instituteId}/batches`, tokenA, 'POST', {
    listingId: courseId, title: 'Clashing batch', deliveryMode: 'offline', feeUnit: 'course', offlineFee: 25000,
    capacity: 5, daysOfWeek: 'Wed', startTime: '10:00', endTime: '11:00', branchId,
    classroomId: classroom.body.classroom?.id, facultyId: faculty.body.faculty?.id,
  });
  check('Schedule conflict rejected', conflict.status === 409, `status=${conflict.status} ${JSON.stringify(conflict.body).slice(0, 100)}`);

  // Admin approval is the publication boundary; simulate it directly so the
  // enrollment/attendance workflow can run.
  await pool.query(`update public.class_batches set status='active' where id=$1`, [batchId]);

  const admission = await call(`/api/institute/${instituteId}/admissions`, tokenA, 'POST', {
    name: 'Applicant One', phone: '9000000001', email: 'applicant@test.local', studentProfileId: student, source: 'walk_in', status: 'accepted',
  });
  check('Create admission with student profile', admission.status === 201 && admission.body.admission?.id, JSON.stringify(admission.body).slice(0, 120));
  const admissionId = admission.body.admission?.id;

  const enrolled = await call(`/api/institute/${instituteId}/admissions/${admissionId}/enroll`, tokenA, 'POST', { batchId, deliveryMode: 'offline', paymentMode: 'pay_at_institute' });
  check('Approve & enroll applicant', enrolled.status === 201 && enrolled.body.enrollment?.status === 'confirmed', JSON.stringify(enrolled.body).slice(0, 160));

  const fee = await call(`/api/institute/${instituteId}/fees`, tokenA, 'POST', { description: 'Term 1', amount: 25000, installments: 1, kind: 'tuition', enrollmentId: enrolled.body.enrollment?.enrollment?.id });
  check('Create fee', fee.status === 201 && fee.body.fee?.id, JSON.stringify(fee.body).slice(0, 120));
  const feeId = fee.body.fee?.id;

  const paid = await call(`/api/institute/fees/${feeId}/pay`, tokenA, 'POST', { paymentMethod: 'upi', paymentReference: `UPI-${suffix}` });
  check('Verify payment with receipt', paid.status === 200 && Boolean(paid.body.fee?.receipt_no), JSON.stringify(paid.body).slice(0, 140));

  const refund = await call(`/api/institute/fees/${feeId}/refund`, tokenA, 'POST', { amount: 5000, reason: 'partial' });
  check('Refund fee', refund.status === 200 && refund.body.fee?.status === 'refunded', JSON.stringify(refund.body).slice(0, 120));

  const exam = await call(`/api/institute/${instituteId}/exams`, tokenA, 'POST', { title: 'Midterm', batchId, examDate: '2026-12-20', maxMarks: 100, status: 'completed' });
  check('Create exam', exam.status === 201 && exam.body.exam?.id, JSON.stringify(exam.body).slice(0, 120));
  const examId = exam.body.exam?.id;

  const results = await call(`/api/institute/${instituteId}/exams/${examId}/results`, tokenA, 'POST', {
    results: [{ enrollmentId: enrolled.body.enrollment?.enrollment?.id, marks: 88, grade: 'A' }],
  });
  check('Record exam result', results.status === 200 && results.body.saved === 1, JSON.stringify(results.body));

  const published = await call(`/api/institute/${instituteId}/exams/${examId}/publish`, tokenA, 'POST', {});
  check('Publish results', published.status === 200 && published.body.exam?.status === 'published');

  const announcement = await call(`/api/institute/${instituteId}/announcements`, tokenA, 'POST', { title: 'Mock test', message: 'Sunday 9am', batchId, audience: 'students' });
  check('Create announcement', announcement.status === 201 && announcement.body.announcement?.id, JSON.stringify(announcement.body).slice(0, 120));

  const certificate = await call(`/api/institute/${instituteId}/certificates`, tokenA, 'POST', { enrollmentId: enrolled.body.enrollment?.enrollment?.id, title: 'Completion' });
  check('Issue certificate', certificate.status === 201 && certificate.body.certificate?.certificate_no, JSON.stringify(certificate.body).slice(0, 140));

  const studentOverview = await call('/api/institute/student/overview', tokenStudent);
  check('Student overview returns own enrollment', studentOverview.status === 200 && (studentOverview.body.enrollments || []).length >= 1, `status=${studentOverview.status}`);
  check('Student sees published result', (studentOverview.body.results || []).some((row) => Number(row.marks) === 88));
  check('Student sees certificate', (studentOverview.body.certificates || []).length >= 1);
  check('Student sees announcement', (studentOverview.body.announcements || []).some((row) => row.title === 'Mock test'));
  check('Student progress report computed', (studentOverview.body.progress || []).length >= 1);

  const isoB = await call(`/api/institute/workspace?instituteId=${instituteId}`, tokenB);
  check('Institute B cannot read institute A workspace', isoB.status === 200 && !isoB.body.workspace?.institute, `institute=${isoB.body.workspace?.institute?.id}`);
  const writeB = await call(`/api/institute/${instituteId}/faculty`, tokenB, 'POST', { name: 'Intruder' });
  check('Institute B cannot write institute A faculty', writeB.status === 403, `status=${writeB.status}`);

  const member = await call(`/api/institute/${instituteId}/members`, tokenA, 'POST', { email: `http-accountant-${suffix}@test.local`, role: 'accountant' });
  check('Add accountant staff member', member.status === 201 && member.body.member?.role === 'accountant', JSON.stringify(member.body).slice(0, 120));
  const accountantFee = await call(`/api/institute/${instituteId}/fees`, tokenAccountant, 'POST', { description: 'Lab fee', amount: 1000 });
  check('Accountant can create a fee', accountantFee.status === 201, `status=${accountantFee.status}`);
  const accountantCourse = await call(`/api/institute/${instituteId}/courses`, tokenAccountant, 'POST', { title: 'Unauthorized course', price: 100 });
  check('Accountant cannot create a course', accountantCourse.status === 403, `status=${accountantCourse.status}`);

  const adminDirectory = await call('/api/institute/admin/directory', tokenAdmin);
  check('Admin directory available', adminDirectory.status === 200 && Array.isArray(adminDirectory.body.institutes), `status=${adminDirectory.status}`);

  const verified = await call(`/api/institute/admin/${instituteId}/verification`, tokenAdmin, 'POST', { verificationStatus: 'verified', note: 'checked' });
  check('Admin verifies institute', verified.status === 200 && verified.body.institute?.verification_status === 'verified', JSON.stringify(verified.body).slice(0, 120));

  const nonAdmin = await call(`/api/institute/admin/${instituteId}/verification`, tokenA, 'POST', { verificationStatus: 'verified' });
  check('Owner cannot self-verify', nonAdmin.status === 403, `status=${nonAdmin.status}`);

  const disabled = await call(`/api/institute/admin/${instituteId}/entitlement`, tokenAdmin, 'POST', { moduleKey: 'announcements', enabled: false });
  check('Admin disables announcements module', disabled.status === 200 && disabled.body.entitlement?.enabled === false);
  const blocked = await call(`/api/institute/${instituteId}/announcements`, tokenA, 'POST', { title: 'Blocked', message: 'should fail' });
  check('Disabled module blocks writes', blocked.status === 403 && blocked.body.error === 'MODULE_DISABLED', `status=${blocked.status} ${JSON.stringify(blocked.body)}`);

  const suspended = await call(`/api/institute/admin/${instituteId}/status`, tokenAdmin, 'POST', { status: 'suspended', reason: 'verification test' });
  check('Admin suspends institute', suspended.status === 200 && suspended.body.institute?.status === 'suspended');
  const restored = await call(`/api/institute/admin/${instituteId}/status`, tokenAdmin, 'POST', { status: 'published', reason: '' });
  check('Admin restores institute', restored.status === 200 && restored.body.institute?.status === 'published');

  console.log(`\nRESULT ${failures.length ? 'FAIL' : 'PASS'} ${pass} passed, ${failures.length} failed`);
  if (failures.length) { for (const failure of failures) console.log(` - ${failure}`); process.exitCode = 1; }
};

run().catch((error) => { console.error('FATAL', error); process.exitCode = 1; }).finally(() => pool.end());
