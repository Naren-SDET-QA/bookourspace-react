import type express from 'express';
import { InstituteWorkspaceError, InstituteWorkspaceRepository } from './instituteWorkspaceRepository';
import type { ProviderListingActor } from './providerListingRepository';
import { logSafeError } from './safeLogging';

export interface InstituteWorkspaceApiDependencies {
  repository: InstituteWorkspaceRepository;
  verifySession: (request: express.Request) => ProviderListingActor | null;
}

function body(request: express.Request): Record<string, unknown> {
  return request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof InstituteWorkspaceError) {
    response.status(error.httpStatus).json({ ok: false, error: error.code });
    return;
  }
  logSafeError('institute-workspace', 'repository', error);
  response.status(500).json({ ok: false, error: 'INSTITUTE_WORKSPACE_REPOSITORY_ERROR' });
}

function session(request: express.Request, response: express.Response, verifySession: InstituteWorkspaceApiDependencies['verifySession']): ProviderListingActor | null {
  const actor = verifySession(request);
  if (!actor) { response.status(401).json({ ok: false, error: 'UNAUTHORIZED_SESSION' }); return null; }
  if (!actor.supabaseUserId) { response.status(403).json({ ok: false, error: 'VERIFIED_AUTH_ID_REQUIRED' }); return null; }
  return actor;
}

export function registerInstituteWorkspaceApi(app: express.Express, dependencies: InstituteWorkspaceApiDependencies): void {
  const { repository, verifySession } = dependencies;

  app.get('/api/institute/memberships', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, memberships: await repository.listMemberships(actor), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.get('/api/institute/workspace', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.setHeader('Cache-Control', 'private, no-store'); response.json({ ok: true, workspace: await repository.workspace(actor, String(request.query.instituteId || '') || undefined), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, institute: await repository.createInstitute(actor, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.patch('/api/institute/:id', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, institute: await repository.updateInstitute(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/:id/branches', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, branch: await repository.saveBranch(actor, String(request.params.id), undefined, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/branches/:branchId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, branch: await repository.saveBranch(actor, String(request.params.id), String(request.params.branchId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/:id/faculty', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, faculty: await repository.saveFaculty(actor, String(request.params.id), undefined, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/faculty/:facultyId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, faculty: await repository.saveFaculty(actor, String(request.params.id), String(request.params.facultyId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/:id/courses', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, course: await repository.saveCourse(actor, String(request.params.id), undefined, body(request)), source: 'postgres', reviewState: 'pending_approval' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/courses/:courseId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, course: await repository.saveCourse(actor, String(request.params.id), String(request.params.courseId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/courses/:courseId/publish', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, course: await repository.publishCourse(actor, String(request.params.id), String(request.params.courseId)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/:id/batches', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, batch: await repository.saveBatch(actor, String(request.params.id), undefined, body(request)), source: 'postgres', reviewState: 'pending_approval' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/batches/:batchId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, batch: await repository.saveBatch(actor, String(request.params.id), String(request.params.batchId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/batches/:batchId/status', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, batch: await repository.updateBatchStatus(actor, String(request.params.id), String(request.params.batchId), String(body(request).status || 'paused')), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/:id/admissions', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, admission: await repository.saveAdmission(actor, String(request.params.id), undefined, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/admissions/:admissionId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, admission: await repository.saveAdmission(actor, String(request.params.id), String(request.params.admissionId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.patch('/api/institute/:id/enquiries/:enquiryId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, enquiry: await repository.updateEnquiry(actor, String(request.params.id), String(request.params.enquiryId), String(body(request).status || 'contacted')), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/:id/attendance', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, session: await repository.markAttendance(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  app.post('/api/institute/fees/:ledgerId/pay', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, fee: await repository.recordFeePayment(actor, String(request.params.ledgerId), String(body(request).paymentMethod || ''), String(body(request).paymentReference || '')), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/fees', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, fee: await repository.createFeeLedger(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Branch infrastructure ---------------------------------------------
  app.post('/api/institute/:id/classrooms', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, classroom: await repository.saveClassroom(actor, String(request.params.id), undefined, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/classrooms/:classroomId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, classroom: await repository.saveClassroom(actor, String(request.params.id), String(request.params.classroomId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/holidays', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, holiday: await repository.saveHoliday(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.delete('/api/institute/:id/holidays/:holidayId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, ...(await repository.deleteHoliday(actor, String(request.params.id), String(request.params.holidayId))) }); } catch (error) { sendError(response, error); }
  });

  // --- Admissions -> enrollment -----------------------------------------
  app.post('/api/institute/:id/admissions/:admissionId/enroll', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, enrollment: await repository.enrollApplicant(actor, String(request.params.id), String(request.params.admissionId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Student records ---------------------------------------------------
  app.post('/api/institute/:id/transfers', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, transfer: await repository.transferStudent(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/leaves/:leaveId/review', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, leave: await repository.reviewLeave(actor, String(request.params.id), String(request.params.leaveId), String(body(request).decision || 'approved'), String(body(request).note || '')), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Exams, results, assignments, certificates -------------------------
  app.post('/api/institute/:id/exams', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, exam: await repository.saveExam(actor, String(request.params.id), undefined, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/exams/:examId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, exam: await repository.saveExam(actor, String(request.params.id), String(request.params.examId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/exams/:examId/results', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, ...(await repository.recordExamResults(actor, String(request.params.id), String(request.params.examId), body(request))), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/exams/:examId/publish', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, exam: await repository.publishExam(actor, String(request.params.id), String(request.params.examId)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/assignments', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, assignment: await repository.saveAssignment(actor, String(request.params.id), undefined, body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.patch('/api/institute/:id/assignments/:assignmentId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, assignment: await repository.saveAssignment(actor, String(request.params.id), String(request.params.assignmentId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/submissions/:submissionId/grade', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, submission: await repository.gradeSubmission(actor, String(request.params.id), String(request.params.submissionId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/certificates', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, certificate: await repository.issueCertificate(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Fees ---------------------------------------------------------------
  app.post('/api/institute/fees/:ledgerId/refund', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, fee: await repository.refundFee(actor, String(request.params.ledgerId), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Announcements and staff -------------------------------------------
  app.post('/api/institute/:id/announcements', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, announcement: await repository.saveAnnouncement(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/:id/members', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.status(201).json({ ok: true, member: await repository.saveMember(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.delete('/api/institute/:id/members/:memberId', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, member: await repository.revokeMember(actor, String(request.params.id), String(request.params.memberId)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Super admin -------------------------------------------------------
  app.get('/api/institute/admin/directory', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.setHeader('Cache-Control', 'private, no-store'); response.json({ ok: true, institutes: await repository.adminDirectory(actor), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/admin/:id/verification', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, institute: await repository.adminReview(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/admin/:id/status', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, institute: await repository.adminSetStatus(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
  app.post('/api/institute/admin/:id/entitlement', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.json({ ok: true, entitlement: await repository.adminSetEntitlement(actor, String(request.params.id), body(request)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });

  // --- Student self-service ---------------------------------------------
  app.get('/api/institute/student/overview', async (request, response) => {
    const actor = session(request, response, verifySession); if (!actor) return;
    try { response.setHeader('Cache-Control', 'private, no-store'); response.json({ ok: true, ...(await repository.studentOverview(actor)), source: 'postgres' }); } catch (error) { sendError(response, error); }
  });
}
