const FAQ_RESPONSES: Array<{ keywords: string[]; reply: string }> = [
  {
    keywords: ['status', 'booking', 'reservation'],
    reply: 'You can view the latest booking status, dates, provider details, and pass from BookOurSpace > My Bookings.',
  },
  {
    keywords: ['cancel', 'cancellation', 'refund'],
    reply: 'Open BookOurSpace > My Bookings, select the booking, and choose Cancel. Any refund is calculated from the listing policy and payment status.',
  },
  {
    keywords: ['payment', 'paid', 'invoice', 'receipt'],
    reply: 'Your payment receipt or invoice is attached to the confirmation email when available. You can also open the booking receipt from My Bookings.',
  },
  {
    keywords: ['otp', 'login', 'sign in', 'signin'],
    reply: 'Use Google sign-in or request a one-time password with your registered email from the BookOurSpace sign-in screen.',
  },
];

export function buildWhatsAppFaqReply(question: string): string {
  const normalized = question.trim().toLowerCase();
  const match = FAQ_RESPONSES.find(({ keywords }) => keywords.some((keyword) => normalized.includes(keyword)));
  return match?.reply || 'I can help with booking status, cancellations and refunds, payments and invoices, or sign-in OTPs. Please reply with one of those topics.';
}
