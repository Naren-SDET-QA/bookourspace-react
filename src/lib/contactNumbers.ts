/** Public BookOurSpace contact number shown on call/WhatsApp actions. */
export const BOS_CONTACT_PHONE = '9966191813';
export const BOS_CONTACT_PHONE_E164 = '919966191813';

export const BOS_CALL_HREF = `tel:+${BOS_CONTACT_PHONE_E164}`;

export function whatsappHref(message?: string): string {
  const query = message?.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${BOS_CONTACT_PHONE_E164}${query}`;
}
