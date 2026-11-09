/** Shared, server-usable validation for required Stay guest contact details. */

export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
}

export type GuestValidation =
  | { ok: true; name: string; email: string; phone: string }
  | { ok: false; nameError?: string; emailError?: string; phoneError?: string; message: string };

const NAME_ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]{1,59}$/u;

export function normalizeGuestName(input: unknown): string {
  return String(input ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function normalizeIndianMobile(input: unknown): string {
  const digits = String(input ?? '').replace(/[^\d]/g, '');
  const national = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  return national.length === 10 ? `+91${national}` : '';
}

export function normalizeGuestEmail(input: unknown): string {
  return String(input ?? '').trim().toLowerCase();
}

export function validateGuestDetails(nameInput: unknown, emailInput: unknown, phoneInput: unknown): GuestValidation {
  const name = normalizeGuestName(nameInput);
  const email = normalizeGuestEmail(emailInput);
  const phone = normalizeIndianMobile(phoneInput);
  const nameError = !name
    ? 'Enter the guest’s full name.'
    : !NAME_ALLOWED.test(name)
      ? 'Use letters only (no numbers), 2–60 characters.'
      : undefined;
  const emailError = !email
    ? 'Enter the Google account email for the booking.'
    : email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
      ? 'Enter a valid email address.'
      : undefined;
  const phoneError = !phone
    ? 'Enter a valid 10-digit Indian mobile number.'
    : !/^[6-9]\d{9}$/.test(phone.slice(3))
      ? 'Indian mobile numbers must start with 6, 7, 8 or 9.'
      : undefined;
  if (nameError || emailError || phoneError) {
    return {
      ok: false,
      nameError,
      emailError,
      phoneError,
      message: nameError || emailError || phoneError || 'Enter valid guest details.',
    };
  }
  return { ok: true, name, email, phone };
}
