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
}
