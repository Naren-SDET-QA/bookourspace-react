export type InstituteFormKind = 'branch' | 'classroom' | 'course' | 'batch' | 'faculty' | 'admission' | 'holiday' | 'exam' | 'announcement' | 'member';

export type InstituteFormErrors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODES = new Set(['online', 'offline', 'hybrid']);

function value(form: Record<string, unknown>, key: string): string {
  return String(form[key] ?? '').trim();
}

function optionalEmail(form: Record<string, unknown>, errors: InstituteFormErrors): void {
  const email = value(form, 'email');
  if (email && !EMAIL.test(email)) errors.email = 'Enter a valid email address.';
}

function optionalPhone(form: Record<string, unknown>, errors: InstituteFormErrors): void {
  const phone = value(form, 'phone');
  if (phone && !/^\+?[0-9\s()-]{10,20}$/.test(phone)) errors.phone = 'Enter a valid phone number.';
}

function requiredText(form: Record<string, unknown>, key: string, label: string, errors: InstituteFormErrors, min = 1): void {
  if (value(form, key).length < min) errors[key] = `${label} must be at least ${min} character${min === 1 ? '' : 's'}.`;
}

function nonNegativeNumber(form: Record<string, unknown>, key: string, label: string, errors: InstituteFormErrors, required = false): void {
  const raw = value(form, key);
  if (!raw && !required) return;
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < 0) errors[key] = `${label} must be a non-negative number.`;
}

function positiveInteger(form: Record<string, unknown>, key: string, label: string, errors: InstituteFormErrors, required = true): void {
  const raw = value(form, key);
  if (!raw && !required) return;
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed < 1) errors[key] = `${label} must be a whole number greater than zero.`;
}

function nonNegativeInteger(form: Record<string, unknown>, key: string, label: string, errors: InstituteFormErrors): void {
  const raw = value(form, key);
  if (!raw) return;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) errors[key] = `${label} must be zero or a positive whole number.`;
}

export function validateInstituteForm(kind: InstituteFormKind, form: Record<string, unknown>): InstituteFormErrors {
  const errors: InstituteFormErrors = {};
  if (kind === 'branch') {
    requiredText(form, 'name', 'Branch name', errors, 2);
    requiredText(form, 'city', 'City', errors);
  }
  if (kind === 'classroom') {
    requiredText(form, 'name', 'Room name', errors);
    requiredText(form, 'branchId', 'Branch', errors);
    positiveInteger(form, 'capacity', 'Capacity', errors);
  }
  if (kind === 'faculty') {
    requiredText(form, 'name', 'Faculty name', errors, 2);
    optionalEmail(form, errors);
    optionalPhone(form, errors);
  }
  if (kind === 'course') {
    requiredText(form, 'title', 'Course title', errors, 2);
    nonNegativeNumber(form, 'price', 'Fee', errors, true);
    requiredText(form, 'priceUnit', 'Fee unit', errors);
    const modes = value(form, 'modes').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (modes.some((mode) => !MODES.has(mode))) errors.modes = 'Use only online, offline or hybrid.';
  }
  if (kind === 'batch') {
    requiredText(form, 'title', 'Batch title', errors, 2);
    requiredText(form, 'listingId', 'Course', errors);
    requiredText(form, 'daysOfWeek', 'Days of week', errors);
    requiredText(form, 'startTime', 'Start time', errors);
    requiredText(form, 'endTime', 'End time', errors);
    if (!errors.startTime && !errors.endTime && value(form, 'startTime') >= value(form, 'endTime')) errors.endTime = 'End time must be after start time.';
    if (value(form, 'startDate') && value(form, 'endDate') && value(form, 'startDate') > value(form, 'endDate')) errors.endDate = 'End date must be on or after the start date.';
    positiveInteger(form, 'capacity', 'Seat capacity', errors);
    nonNegativeInteger(form, 'waitlistCapacity', 'Waitlist capacity', errors);
    nonNegativeNumber(form, 'onlineFee', 'Online fee', errors);
    nonNegativeNumber(form, 'offlineFee', 'Offline fee', errors);
  }
  if (kind === 'admission') {
    requiredText(form, 'name', 'Student name', errors, 2);
    const phone = value(form, 'phone');
    const email = value(form, 'email');
    if (!phone && !email) errors.contact = 'Enter a phone number or email address.';
    optionalPhone(form, errors);
    optionalEmail(form, errors);
    if (value(form, 'studentProfileId') && !UUID.test(value(form, 'studentProfileId'))) errors.studentProfileId = 'Use an existing student profile ID.';
  }
  if (kind === 'holiday') {
    requiredText(form, 'batchId', 'Batch', errors);
    requiredText(form, 'holidayDate', 'Holiday date', errors);
  }
  if (kind === 'exam') {
    requiredText(form, 'title', 'Exam title', errors, 2);
    requiredText(form, 'batchId', 'Batch', errors);
    requiredText(form, 'examDate', 'Exam date', errors);
    const marks = Number(value(form, 'maxMarks'));
    if (!Number.isFinite(marks) || marks <= 0) errors.maxMarks = 'Maximum marks must be greater than zero.';
  }
  if (kind === 'announcement') {
    requiredText(form, 'title', 'Title', errors, 2);
    requiredText(form, 'message', 'Message', errors, 10);
  }
  if (kind === 'member') {
    const email = value(form, 'email');
    if (!EMAIL.test(email)) errors.email = 'Enter the email of an existing BookOurSpace account.';
    const role = value(form, 'role');
    if (!['manager', 'branch_admin', 'faculty', 'accountant', 'receptionist'].includes(role)) errors.role = 'Choose a valid staff role.';
    if (['manager', 'branch_admin', 'faculty', 'receptionist'].includes(role) && !value(form, 'branchId')) errors.branchId = 'Choose a branch for this role.';
  }
  return errors;
}

const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Could not reach the server. Check the local database and try again.',
  DATABASE_REQUIRED_FOR_INSTITUTE_WORKSPACE: 'The institute database is not connected.',
  INSTITUTE_WORKSPACE_REPOSITORY_ERROR: 'The server could not save this record. Check the fields and try again.',
  INSTITUTE_NAME_REQUIRED: 'Enter an institute name with at least 2 characters.',
  BRANCH_NAME_REQUIRED: 'Enter a branch name with at least 2 characters.',
  FACULTY_NAME_REQUIRED: 'Enter a faculty name with at least 2 characters.',
  COURSE_TITLE_REQUIRED: 'Enter a course title with at least 2 characters.',
  BATCH_COURSE_AND_TITLE_REQUIRED: 'Choose a course and enter a batch title.',
  BATCH_TIMING_REQUIRED: 'Choose both a start time and an end time.',
  BATCH_TIME_RANGE_INVALID: 'End time must be after the start time.',
  BATCH_DATE_RANGE_INVALID: 'End date must be on or after the start date.',
  BATCH_CAPACITY_INVALID: 'Seat capacity must be a whole number greater than zero.',
  BATCH_WAITLIST_CAPACITY_INVALID: 'Waitlist capacity must be zero or a positive whole number.',
  BATCH_FEE_INVALID: 'Batch fees must be non-negative numbers.',
  COURSE_FEE_INVALID: 'Course fee must be a non-negative number.',
  BRANCH_CITY_REQUIRED: 'Enter the branch city.',
  CLASSROOM_CAPACITY_INVALID: 'Capacity must be a whole number greater than zero.',
  EXAM_MAX_MARKS_INVALID: 'Maximum marks must be greater than zero.',
  INVALID_COURSE_MODE: 'Use only online, offline or hybrid for delivery mode.',
  ANNOUNCEMENT_TITLE_AND_MESSAGE_REQUIRED: 'Enter a title and a message for the announcement.',
  MEMBER_BRANCH_REQUIRED: 'Choose a branch for this staff role.',
  MEMBER_ACCOUNT_REQUIRED: 'The email must belong to an existing BookOurSpace account.',
  ADMISSION_NAME_REQUIRED: 'Enter the student name and at least one contact method.',
  INVALID_STUDENT_PROFILE_ID: 'The student profile ID is not valid.',
  INVALID_EMAIL: 'Enter a valid email address.',
  INVALID_PHONE: 'Enter a valid phone number.',
};

export function instituteErrorMessage(error: string | undefined): string {
  if (!error) return 'The action could not be completed.';
  if (ERROR_MESSAGES[error]) return ERROR_MESSAGES[error];
  if (error.startsWith('BATCH_SCHEDULE_CONFLICT')) return 'This batch overlaps an existing class. Change the room, faculty, days or time.';
  if (error.startsWith('HTTP_')) return 'The server rejected the request. Check the fields and try again.';
  return error.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
