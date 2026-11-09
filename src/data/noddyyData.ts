/**
 * Noddyy — "Helper On Demand" experience content.
 *
 * Faithful mirror of the public marketing site at https://noddyy.com/ so the
 * BookOurSpace services module can offer the Noddyy helper-on-demand vertical
 * as a first-class service experience. Copy, structure and media URLs reproduce
 * the live site; only the runtime plumbing (React props, ids) is BookOurSpace.
 */

export const NODDYY_BRAND = {
  name: 'noddyy',
  tagline: 'Helper On Demand',
  logoUrl: 'https://server.noddyy.com/uploads/website/brand/5e879204e07b.png',
  footerLogoUrl: 'https://server.noddyy.com/uploads/website/brand/7d90bfda0769.png',
  email: 'info@noddyy.com',
  city: 'Hyderabad, India',
  company: 'LOHAS ONE Pvt. Ltd.',
  cin: 'U63112TS2026PTC209753',
  gst: '36AAGCL6795E1Z4',
  dpiit: 'DIPP241494',
  androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.noddyy.user_side',
  iosStoreUrl: 'https://apps.apple.com/in/app/noddyy/id6772769899',
} as const;

export const NODDYY_NAV = [
  { label: 'Services', href: '#services' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Cities', href: '#cities' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '#about' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '/contact-us' },
] as const;

export interface NoddyyService {
  id: string;
  title: string;
  description: string;
  image: string;
  slug: string;
}

export const NODDYY_SERVICES: NoddyyService[] = [
  {
    id: 'shopping-assistance',
    title: 'Shopping Assistance',
    description: 'Groceries, vegetables, medicines, gifts & everyday purchases',
    image: 'https://server.noddyy.com/uploads/website/services/b57ad9694583.png',
    slug: '/services/shopping-assistance',
  },
  {
    id: 'pickup-delivery',
    title: 'Pickup & Delivery',
    description: 'Documents, parcels, forgotten items and local deliveries',
    image: 'https://server.noddyy.com/uploads/website/services/5ff38a8cf9e7.png',
    slug: '/services/pickup-delivery',
  },
  {
    id: 'queue-standing',
    title: 'Queue Standing',
    description: 'Let a Noddyy Helper wait in line on your behalf',
    image: 'https://server.noddyy.com/uploads/website/services/317b03972829.png',
    slug: '/services/queue-standing',
  },
  {
    id: 'senior-assistance',
    title: 'Senior Assistance',
    description: 'Accompany elders for appointments, shopping and errands',
    image: 'https://server.noddyy.com/uploads/website/services/9ac41b0f621c.png',
    slug: '/services/senior-assistance',
  },
  {
    id: 'shopping-companion',
    title: 'Shopping Companion',
    description: 'Carry bags and assist during market or mall visits',
    image: 'https://server.noddyy.com/uploads/website/services/a0161be458c1.png',
    slug: '/services/shopping-companion',
  },
  {
    id: 'courier-support',
    title: 'Courier & Parcel Supports',
    description: 'Pickup, drop-off and courier coordination.',
    image: 'https://server.noddyy.com/uploads/website/services/018795f5af5d.png',
    slug: '/services/courier-support',
  },
  {
    id: 'event-assistance',
    title: 'Event Assistance',
    description: 'Setup help, coordination and support for small events.',
    image: 'https://server.noddyy.com/uploads/website/services/ed1a27390354.png',
    slug: '/services/event-assistance',
  },
  {
    id: 'endless-possibilities',
    title: 'Endless Possibilities',
    description:
      "From pickups to paperwork and everything in between, noddyy is your helper for life's daily needs.",
    image: 'https://server.noddyy.com/uploads/website/services/36b51479a384.png',
    slug: '/services/Endless-Possibilities',
  },
];

export const NODDYY_PRESS = [
  { name: 'ETV', image: 'https://server.noddyy.com/uploads/website/press/383c360008f7.jpg' },
  { name: 'Inc42', image: 'https://server.noddyy.com/uploads/website/press/29e7df992fe8.png' },
  { name: 'MoneyControl', image: 'https://server.noddyy.com/uploads/website/press/04b8869440f8.png' },
  { name: 'Economic Times', image: 'https://server.noddyy.com/uploads/website/press/85d242f416e8.png' },
  { name: 'Forbes India', image: 'https://server.noddyy.com/uploads/website/press/4e14bb1d44b5.png' },
  { name: 'Business Standard', image: 'https://server.noddyy.com/uploads/website/press/b81e43ee698b.png' },
];

export const NODDYY_HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Describe Your Task',
    description: 'Share your requirements through a voice note or simple instructions',
    image: 'https://server.noddyy.com/uploads/website/how/46e9bc024fc8.png',
  },
  {
    step: '2',
    title: 'Choose Helper Duration',
    description: 'Select how many hours you need assistance and confirm your booking',
    image: 'https://server.noddyy.com/uploads/website/how/6e4d546cf37e.png',
  },
  {
    step: '3',
    title: 'noddyy Helper Gets It Done',
    description: 'Your verified helper arrives and completes the tasks you assigned',
    image: 'https://server.noddyy.com/uploads/website/how/276d19cb27c3.png',
  },
];

export const NODDYY_TRUST = [
  {
    title: 'Verified Identity',
    description: 'Every noddyy Helper completes Aadhaar, PAN, and background verification before joining',
    image: 'https://server.noddyy.com/uploads/website/trust/b7be4a19bbbe.png',
  },
  {
    title: 'Trained Noddyy Helpers',
    description: 'Helpers are trained in customer service, task handling, hygiene, and professional conduct',
    image: 'https://server.noddyy.com/uploads/website/trust/7e7db6f4ad6d.png',
  },
  {
    title: 'No Hidden Charges',
    description: 'Transparent pricing with upfront costs. Pay only for the time and services you book',
    image: 'https://server.noddyy.com/uploads/website/trust/b5f228efc9d4.png',
  },
  {
    title: 'Top Rated Service',
    description: 'Trusted by thousands of families with consistently high customer ratings and repeat bookings',
    image: 'https://server.noddyy.com/uploads/website/trust/a3fae14b77d2.png',
  },
];

export const NODDYY_CITIES = [
  {
    name: 'Hyderabad',
    areas: '100 areas',
    image: 'https://server.noddyy.com/uploads/website/cities/8901715abdf4.png',
    comingSoon: false,
  },
  {
    name: 'Mumbai',
    areas: '0 areas',
    image: 'https://server.noddyy.com/uploads/website/cities/794adb8dd7f4.svg',
    comingSoon: true,
  },
  {
    name: 'Delhi',
    areas: '0 areas',
    image: 'https://server.noddyy.com/uploads/website/cities/b25758f4e1ef.svg',
    comingSoon: true,
  },
  {
    name: 'Gurugram',
    areas: '0 areas',
    image: 'https://server.noddyy.com/uploads/website/cities/f9f431445241.svg',
    comingSoon: true,
  },
];

export const NODDYY_TESTIMONIALS = [
  {
    quote:
      'Booked at 9 AM and the Noddyy Helper arrived in exactly 10 minutes. Very impressed with the quality of cleaning. Will definitely book again.',
    name: 'Mohan Rao A',
    location: 'Alwal, Hyderabad',
    avatar: 'https://server.noddyy.com/uploads/website/avatars/0e35c91f22ef.png',
  },
  {
    quote:
      'Excellent service! The helper was on time, very trained and thorough. My house was spotless after the cleaning.',
    name: 'Sandhya Rani A',
    location: 'Paradise, Hyderabad',
    avatar: 'https://server.noddyy.com/uploads/website/avatars/a9eb32cc27cd.png',
  },
  {
    quote:
      'Great service! Noddyy Helper arrived on time and did a thorough job. The booking process on the app is very simple.',
    name: 'Nagabhushan',
    location: 'Begumpet, Hyderabad',
    avatar: 'https://server.noddyy.com/uploads/website/avatars/1d598a72dd6b.png',
  },
  {
    quote: 'Game changer for a busy household. Verified, trained and friendly Noddyy Helpers every single time.',
    name: 'Arjun D',
    location: 'Texas, US',
    avatar: 'https://server.noddyy.com/uploads/website/avatars/888e667a742d.png',
  },
];

export const NODDYY_APP_FEATURES = [
  'Instant booking, 10-minute arrival',
  'Background-verified noddyy Helpers',
  'Transparent prices, no hidden charges',
  'Live tracking & in-app support',
];

export const NODDYY_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What is noddyy?',
    a: 'noddyy connects you with verified helpers who can complete everyday tasks on your behalf.',
  },
  {
    q: 'What kind of tasks can a noddyy Helper do?',
    a: 'Helpers can assist with shopping, deliveries, queue standing, document tasks, hospital visits, event support, and everyday errands.',
  },
  {
    q: 'Can I assign multiple tasks in one booking?',
    a: 'Yes — you can assign multiple tasks to a single helper within your booked duration.',
  },
  {
    q: 'Is noddyy a delivery service?',
    a: 'noddyy is a human-assistance platform that also handles pickups and deliveries, but helpers do much more than courier work.',
  },
  {
    q: 'Are noddyy helpers verified?',
    a: 'Every helper completes Aadhaar, PAN, and background verification before joining the platform.',
  },
  {
    q: 'Can I book a helper for my parents or family?',
    a: 'Yes — you can book a helper on behalf of your parents or family members and track the task remotely.',
  },
  {
    q: 'How quickly can I get a helper?',
    a: 'A verified helper can arrive in about 10 minutes after you confirm a booking.',
  },
  {
    q: 'Can I use noddyy from outside India?',
    a: 'You can use the app to book assistance for loved ones in supported Indian cities from abroad.',
  },
  {
    q: 'Can helpers purchase items for me?',
    a: 'Yes — helpers can make purchases on your behalf using a transparent payment arrangement.',
  },
  {
    q: 'Can a helper accompany someone to a hospital?',
    a: 'Yes — helpers can accompany elders or patients for hospital visits and appointments.',
  },
  {
    q: 'What tasks are not allowed?',
    a: 'Tasks that are illegal, unsafe, or violate platform policies are not allowed.',
  },
  {
    q: 'How is pricing calculated?',
    a: 'Pricing is transparent and based on the duration and type of service you book, with no hidden charges.',
  },
  {
    q: 'Can I communicate with my helper?',
    a: 'Yes — you can communicate with your helper through the app before and during the task.',
  },
  {
    q: 'What if my task changes after booking?',
    a: 'You can update your task details and the helper will be informed in the app.',
  },
];

export const NODDYY_FOOTER = {
  company: [
    { label: 'About us', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Investor Relations', href: '/investor-relations' },
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Anti-discrimination', href: '/anti-discrimination' },
  ],
  users: [
    { label: 'Reviews', href: '/#testimonials' },
    { label: 'Services near you', href: '/#cities' },
    { label: 'Contact us', href: '/contact-us' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Refund Policy', href: '/refund-policy' },
  ],
  helpers: [
    { label: 'Become a Noddyy Helper', href: '/contact-us' },
    { label: 'Helper guidelines', href: '/anti-discrimination' },
  ],
  social: [
    { label: 'Instagram', href: 'https://www.instagram.com/getnoddyy?igsh=MTdsNTVvNTNqc2Nqcw==' },
    { label: 'X (Twitter)', href: 'https://x.com/getnoddyy' },
    { label: 'Facebook', href: 'https://www.facebook.com/share/1CTuHFAKqE/' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/noddyy' },
    { label: 'YouTube', href: 'https://www.youtube.com/@getnoddyy' },
  ],
};

export const NODDYY_HERO = {
  badge: 'Trusted by 1L+ Users',
  headline: 'Real Human, Real Help.',
  subtitle:
    'Need groceries picked up, documents delivered, shopping assistance, queue standing, or a helping hand? Book a verified Noddyy Helper in minutes.',
  primaryCta: 'Download App',
  secondaryCta: 'See Services',
  secondaryCtaHref: '#services',
  heroImages: {
    helper: 'https://server.noddyy.com/uploads/website/hero/f830f071e5ba.png',
    shopping: 'https://server.noddyy.com/uploads/website/hero/23bfe03a8b74.png',
    phone: 'https://server.noddyy.com/uploads/website/hero/c455b3638e84.png',
  },
  trustBadges: ['Background Verified', '4.8 Rated', 'In ~10 minutes'],
  floatingCard: {
    title: 'Noddyy Helper on the way',
    eta: 'ETA ~ 10 minutes',
    rating: '4.8 Rated',
    reviews: '74,000+ reviews',
  },
};

export const NODDYY_STATS = [
  { value: '0+', label: 'Tasks Assisted' },
  { value: '0+', label: 'Verified Helpers' },
  { value: '0+', label: 'Everyday Use Cases' },
  { value: '0.0 ⭐', label: 'Customer Satisfaction' },
];

export const NODDYY_STORE_BADGES = {
  googlePlay: 'https://server.noddyy.com/uploads/website/misc/d42f6b5ebf11.png',
  appStore: 'https://server.noddyy.com/uploads/website/misc/02bddd6675ab.png',
  appScreenshot: 'https://server.noddyy.com/uploads/website/misc/95b1c72c1bcd.png',
  ctaScreenshot: 'https://server.noddyy.com/uploads/website/cta/c7f96a24df47.png',
};

export const NODDYY_LIVE = {
  todayBookings: '2,847 bookings',
  rating: '4.8 ★ rated',
};

/** Noddyy's brand palette, mirrored from the live site's stylesheet. */
export const NODDYY_COLORS = {
  orange: '#ff7a1a',
  orangeDeep: '#ea5d00',
  navy: '#15134A',
  navySoft: '#3A3560',
  blue: '#3568ff',
  blueDeep: '#1f48f5',
  whatsapp: '#25D366',
  cream: '#fff8f1',
} as const;
