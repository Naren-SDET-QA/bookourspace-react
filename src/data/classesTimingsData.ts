// Classes & Training — universal India-wide discovery module (image-only demo data).
// No database writes. Sample listings are explicitly marked `demo: true`.

export type CourseCategory =
  | 'Academic'
  | 'Professional & IT'
  | 'Life Skills'
  | 'Sports & Fitness'
  | 'Competitive Exams'
  | 'Arts & Music'
  | 'Business'
  | 'Corporate'
  | 'Technical'
  | 'Healthcare'
  | 'Languages'
  | 'Kids'
  | 'Driving'
  | 'Agriculture'
  | 'Community Skills';

export const COURSE_CATEGORIES: CourseCategory[] = [
  'Academic',
  'Professional & IT',
  'Life Skills',
  'Sports & Fitness',
  'Competitive Exams',
  'Arts & Music',
  'Business',
  'Corporate',
  'Technical',
  'Healthcare',
  'Languages',
  'Kids',
  'Driving',
  'Agriculture',
  'Community Skills',
];

export type CourseMode = 'Online' | 'Offline' | 'Hybrid' | 'Recorded' | 'Not specified';
export const COURSE_MODES: CourseMode[] = ['Online', 'Offline', 'Hybrid', 'Recorded'];

export type FeeUnit = 'course' | 'month' | 'hour' | 'session';
export const FEE_UNITS: FeeUnit[] = ['course', 'month', 'hour', 'session'];

export type TimingSlot = 'Morning' | 'Afternoon' | 'Evening' | 'Weekend';
export const TIMING_SLOTS: TimingSlot[] = ['Morning', 'Afternoon', 'Evening', 'Weekend'];

export interface BatchTiming {
  slot: TimingSlot;
  days: string;
  start: string; // "18:00"
  end: string; // "20:00"
  label: string; // "6:00 PM – 8:00 PM"
}

export interface FeePlan {
  label: string;
  amount: number;
  unit: FeeUnit;
  mode?: CourseMode;
}

export interface Faculty {
  name: string;
  experience: string;
  photo: string;
}

export interface CourseListing {
  id: string;
  title: string;
  category: CourseCategory | string;
  description: string;
  provider: string;
  /** Optional provider WhatsApp number; absent means open WhatsApp contact picker. */
  providerPhone?: string;
  /** Owner id — providers may manage only their own courses. */
  providerId: string;
  area: string;
  city: string;
  distanceKm: number | null;
  mode: CourseMode;
  /** Modes this provider supports (online vs offline pricing). */
  modeOptions: CourseMode[];
  fee: number;
  feeUnit: FeeUnit | string;
  free: boolean;
  faculty: Faculty;
  batches: BatchTiming[];
  startDate: string;
  duration: string;
  seats: number | null;
  eligibility: string;
  certification: string;
  ageGroup: string;
  verified: boolean;
  /** Sample listing — clearly marked DEMO until a real provider publishes. */
  demo: boolean;
  /** True when the card reflects live, admin-approved PostgreSQL batches. */
  liveCalendar?: boolean;
  liveBatchCount?: number;
  status: 'approved' | 'pending';
  image: string;
  rating?: number;
  reviews?: number;
  feePlans: FeePlan[];
}

const img = (id: string, w = 900): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const facultyPhoto = (id: string): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=200&h=200&q=80`;

export const DEMO_PROVIDER_ID = 'demo-provider';

export const classListings: CourseListing[] = [
  {
    id: 'c-fullstack',
    title: 'Full-Stack Web Development',
    category: 'Professional & IT',
    description: 'Build production-ready web apps with React, Node.js, databases and deployment. Live mentor-led sessions with weekly projects and interview prep.',
    provider: 'CodeCraft Academy',
    providerId: DEMO_PROVIDER_ID,
    area: 'Madhapur',
    city: 'Hyderabad',
    distanceKm: 3.2,
    mode: 'Online',
    modeOptions: ['Online', 'Recorded'],
    fee: 8999,
    feeUnit: 'course',
    free: false,
    faculty: { name: 'Rahul Verma', experience: '9 yrs · ex-Amazon', photo: facultyPhoto('photo-1500648767791-00dcc994a43e') },
    batches: [
      { slot: 'Evening', days: 'Mon – Fri', start: '18:00', end: '20:00', label: '6:00 PM – 8:00 PM' },
      { slot: 'Weekend', days: 'Sat – Sun', start: '10:00', end: '13:00', label: '10:00 AM – 1:00 PM' },
    ],
    startDate: 'Every Monday',
    duration: '12 weeks',
    seats: 18,
    eligibility: 'Any graduate / final-year student',
    certification: 'BookOurSpace Verified Certificate',
    ageGroup: '18+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1517180102446-f3ece451e9d8'),
    rating: 4.8,
    reviews: 320,
    feePlans: [
      { label: 'Online live', amount: 8999, unit: 'course', mode: 'Online' },
      { label: 'Recorded only', amount: 4999, unit: 'course', mode: 'Recorded' },
    ],
  },
  {
    id: 'c-python',
    title: 'Python for Data Science',
    category: 'Professional & IT',
    description: 'Master Python, pandas, NumPy and visualisation with real datasets. Includes interview preparation and a capstone project.',
    provider: 'DataMinds',
    providerId: DEMO_PROVIDER_ID,
    area: 'Gachibowli',
    city: 'Hyderabad',
    distanceKm: 5.1,
    mode: 'Hybrid',
    modeOptions: ['Online', 'Offline', 'Recorded'],
    fee: 6499,
    feeUnit: 'course',
    free: false,
    faculty: { name: 'Priya Nair', experience: '7 yrs · Data Scientist', photo: facultyPhoto('photo-1494790108377-be9c29b29330') },
    batches: [
      { slot: 'Morning', days: 'Mon – Sat', start: '07:00', end: '09:00', label: '7:00 AM – 9:00 AM' },
      { slot: 'Evening', days: 'Tue / Thu', start: '19:00', end: '21:00', label: '7:00 PM – 9:00 PM' },
    ],
    startDate: '5th of every month',
    duration: '10 weeks',
    seats: 24,
    eligibility: 'Basic computer literacy',
    certification: 'Certificate of completion',
    ageGroup: '16+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1526379095098-d400fd0bf935'),
    rating: 4.9,
    reviews: 412,
    feePlans: [
      { label: 'Hybrid', amount: 6499, unit: 'course', mode: 'Hybrid' },
      { label: 'Online only', amount: 5499, unit: 'course', mode: 'Online' },
    ],
  },
  {
    id: 'c-maths',
    title: 'CBSE Class 10 Mathematics',
    category: 'Academic',
    description: 'Concept-first coaching for CBSE Class 10 Maths with weekly tests, doubt sessions and guaranteed revision of all chapters.',
    provider: 'BrightTutors',
    providerId: DEMO_PROVIDER_ID,
    area: 'Kukatpally',
    city: 'Hyderabad',
    distanceKm: 8.4,
    mode: 'Offline',
    modeOptions: ['Offline'],
    fee: 4500,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Suresh Rao', experience: '15 yrs · Maths HOD', photo: facultyPhoto('photo-1506794778202-cad84cf45f1d') },
    batches: [
      { slot: 'Evening', days: 'Mon / Wed / Fri', start: '17:00', end: '18:30', label: '5:00 PM – 6:30 PM' },
      { slot: 'Weekend', days: 'Sat', start: '09:00', end: '12:00', label: '9:00 AM – 12:00 PM' },
    ],
    startDate: '1st June',
    duration: '6 months',
    seats: 12,
    eligibility: 'Class 9 passed',
    certification: 'School syllabus completion certificate',
    ageGroup: '14–16',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1509228468518-180dd4864904'),
    rating: 4.7,
    reviews: 188,
    feePlans: [{ label: 'Monthly', amount: 4500, unit: 'month', mode: 'Offline' }],
  },
  {
    id: 'c-english',
    title: 'Spoken English Masterclass',
    category: 'Languages',
    description: 'Speak English with confidence through daily practice, pronunciation drills and live conversation clubs.',
    provider: 'FluentFirst',
    providerId: DEMO_PROVIDER_ID,
    area: 'Ameerpet',
    city: 'Hyderabad',
    distanceKm: 6.8,
    mode: 'Hybrid',
    modeOptions: ['Online', 'Offline'],
    fee: 2999,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Anita Joseph', experience: '11 yrs · CELTA certified', photo: facultyPhoto('photo-1438761681033-6461ffad8d80') },
    batches: [
      { slot: 'Morning', days: 'Mon – Fri', start: '08:00', end: '09:00', label: '8:00 AM – 9:00 AM' },
      { slot: 'Evening', days: 'Tue / Thu / Sat', start: '19:00', end: '20:00', label: '7:00 PM – 8:00 PM' },
    ],
    startDate: 'Rolling admissions',
    duration: '8 weeks',
    seats: 20,
    eligibility: 'No prior level required',
    certification: 'Fluency assessment certificate',
    ageGroup: '15+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1523240795612-9a054b0db644'),
    rating: 4.6,
    reviews: 265,
    feePlans: [
      { label: 'Offline batch', amount: 2999, unit: 'month', mode: 'Offline' },
      { label: 'Online batch', amount: 1999, unit: 'month', mode: 'Online' },
    ],
  },
  {
    id: 'c-carnatic',
    title: 'Carnatic Vocal Music',
    category: 'Arts & Music',
    description: 'Learn classical Carnatic vocal basics — ragas, talas and voice culture — from experienced gurus in small batches.',
    provider: 'Sangeetha Studio',
    providerId: DEMO_PROVIDER_ID,
    area: 'Banjara Hills',
    city: 'Hyderabad',
    distanceKm: 7.2,
    mode: 'Offline',
    modeOptions: ['Offline', 'Online'],
    fee: 3500,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Lakshmi Iyer', experience: '20 yrs · Carnatic vocalist', photo: facultyPhoto('photo-1544005313-94ddf0286df2') },
    batches: [{ slot: 'Weekend', days: 'Sat / Sun', start: '10:00', end: '11:30', label: '10:00 AM – 11:30 AM' }],
    startDate: 'Any Saturday',
    duration: '3 months',
    seats: 8,
    eligibility: 'Beginners welcome',
    certification: 'Studio performance certificate',
    ageGroup: '8+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1511671782779-c97d3d27a1d4'),
    rating: 4.8,
    reviews: 96,
    feePlans: [{ label: 'Monthly', amount: 3500, unit: 'month', mode: 'Offline' }],
  },
  {
    id: 'c-guitar',
    title: 'Guitar for Beginners',
    category: 'Arts & Music',
    description: 'From your first chord to your first song. Acoustic guitar fundamentals, strumming patterns and rhythm practice.',
    provider: 'ChordNest',
    providerId: DEMO_PROVIDER_ID,
    area: 'Jubilee Hills',
    city: 'Hyderabad',
    distanceKm: 9.1,
    mode: 'Offline',
    modeOptions: ['Offline'],
    fee: 4000,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Arjun Das', experience: '8 yrs · Session guitarist', photo: facultyPhoto('photo-1507003211169-0a1dd7228f2d') },
    batches: [
      { slot: 'Evening', days: 'Mon / Wed', start: '18:30', end: '19:30', label: '6:30 PM – 7:30 PM' },
      { slot: 'Weekend', days: 'Sun', start: '11:00', end: '13:00', label: '11:00 AM – 1:00 PM' },
    ],
    startDate: 'Every Monday',
    duration: '8 weeks',
    seats: 10,
    eligibility: 'Own guitar recommended',
    certification: 'Level 1 completion certificate',
    ageGroup: '10+',
    verified: false,
    demo: true,
    status: 'approved',
    image: img('photo-1510915361894-db8b60106cb1'),
    rating: 4.7,
    reviews: 142,
    feePlans: [{ label: 'Monthly', amount: 4000, unit: 'month', mode: 'Offline' }],
  },
  {
    id: 'c-dance',
    title: 'Bollywood Dance',
    category: 'Arts & Music',
    description: 'High-energy Bollywood choreography for all levels. Learn a full routine and perform at the studio showcase.',
    provider: 'StepUp Studio',
    providerId: DEMO_PROVIDER_ID,
    area: 'Kondapur',
    city: 'Hyderabad',
    distanceKm: 4.6,
    mode: 'Offline',
    modeOptions: ['Offline', 'Online'],
    fee: 3200,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Neha Kapoor', experience: '10 yrs · Choreographer', photo: facultyPhoto('photo-1534528741775-53994a69daeb') },
    batches: [{ slot: 'Evening', days: 'Tue / Thu', start: '19:00', end: '20:30', label: '7:00 PM – 8:30 PM' }],
    startDate: 'First Tuesday',
    duration: '6 weeks',
    seats: 16,
    eligibility: 'All levels',
    certification: 'Performance showcase certificate',
    ageGroup: '12+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1508700115892-45ecd05ae2ad'),
    rating: 4.6,
    reviews: 174,
    feePlans: [{ label: 'Monthly', amount: 3200, unit: 'month', mode: 'Offline' }],
  },
  {
    id: 'c-upsc',
    title: 'UPSC Prelims Foundation',
    category: 'Competitive Exams',
    description: 'Complete GS foundation for UPSC Prelims — polity, geography, history, economy and current affairs with weekly mock tests.',
    provider: 'Aspirant Academy',
    providerId: DEMO_PROVIDER_ID,
    area: 'Ashok Nagar',
    city: 'Hyderabad',
    distanceKm: 5.9,
    mode: 'Hybrid',
    modeOptions: ['Offline', 'Online'],
    fee: 12000,
    feeUnit: 'course',
    free: false,
    faculty: { name: 'Vikram Singh', experience: '12 yrs · UPSC mentor', photo: facultyPhoto('photo-1472099645785-5658abf4ff4e') },
    batches: [
      { slot: 'Morning', days: 'Mon – Sat', start: '07:00', end: '10:00', label: '7:00 AM – 10:00 AM' },
      { slot: 'Evening', days: 'Mon – Sat', start: '17:00', end: '20:00', label: '5:00 PM – 8:00 PM' },
    ],
    startDate: '15th July',
    duration: '8 months',
    seats: 40,
    eligibility: 'Graduate',
    certification: 'Course completion certificate',
    ageGroup: '21+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1434030216411-0b793f4b4173'),
    rating: 4.7,
    reviews: 540,
    feePlans: [
      { label: 'Offline full', amount: 12000, unit: 'course', mode: 'Offline' },
      { label: 'Online full', amount: 8500, unit: 'course', mode: 'Online' },
    ],
  },
  {
    id: 'c-yoga',
    title: 'Yoga & Wellness',
    category: 'Sports & Fitness',
    description: 'Beginner-friendly yoga for flexibility, strength and stress relief. Includes pranayama and meditation practice.',
    provider: 'Prana Wellness',
    providerId: DEMO_PROVIDER_ID,
    area: 'Madhapur',
    city: 'Hyderabad',
    distanceKm: 2.8,
    mode: 'Offline',
    modeOptions: ['Offline', 'Online'],
    fee: 1500,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Meera Joshi', experience: '14 yrs · Certified yoga instructor', photo: facultyPhoto('photo-1487412720507-e7ab37603c6f') },
    batches: [
      { slot: 'Morning', days: 'Mon – Sat', start: '06:00', end: '07:00', label: '6:00 AM – 7:00 AM' },
      { slot: 'Evening', days: 'Mon – Sat', start: '18:00', end: '19:00', label: '6:00 PM – 7:00 PM' },
    ],
    startDate: 'Any day',
    duration: 'Ongoing',
    seats: 25,
    eligibility: 'Open to all',
    certification: 'Wellness program certificate',
    ageGroup: '16+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1544367567-0f2fcb009e0b'),
    rating: 4.9,
    reviews: 310,
    feePlans: [{ label: 'Monthly', amount: 1500, unit: 'month', mode: 'Offline' }],
  },
  {
    id: 'c-driving',
    title: 'Car Driving — Beginner',
    category: 'Driving',
    description: 'Learn to drive a manual/automatic car with certified instructors. Includes traffic rules, parking and licence guidance.',
    provider: 'SafeDrive School',
    providerId: DEMO_PROVIDER_ID,
    area: 'Moosapet',
    city: 'Hyderabad',
    distanceKm: 7.7,
    mode: 'Offline',
    modeOptions: ['Offline'],
    fee: 6000,
    feeUnit: 'course',
    free: false,
    faculty: { name: 'Imran Khan', experience: '16 yrs · RTO certified', photo: facultyPhoto('photo-1506794778202-cad84cf45f1d') },
    batches: [
      { slot: 'Morning', days: 'Daily', start: '06:00', end: '08:00', label: '6:00 AM – 8:00 AM' },
      { slot: 'Evening', days: 'Daily', start: '16:00', end: '18:00', label: '4:00 PM – 6:00 PM' },
    ],
    startDate: 'Any Monday',
    duration: '21 days',
    seats: 10,
    eligibility: 'Learner licence required',
    certification: 'RTO licence assistance',
    ageGroup: '18+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1449965408869-eaa3f722e40d'),
    rating: 4.5,
    reviews: 88,
    feePlans: [{ label: 'Full course', amount: 6000, unit: 'course', mode: 'Offline' }],
  },
  {
    id: 'c-kids-coding',
    title: 'Coding for Kids (Scratch)',
    category: 'Kids',
    description: 'Fun, project-based coding for children using Scratch and block programming. Build games and animations every week.',
    provider: 'LittleCoders',
    providerId: DEMO_PROVIDER_ID,
    area: 'Nallagandla',
    city: 'Hyderabad',
    distanceKm: 6.3,
    mode: 'Online',
    modeOptions: ['Online', 'Offline'],
    fee: 2499,
    feeUnit: 'month',
    free: false,
    faculty: { name: 'Divya Reddy', experience: '6 yrs · STEM educator', photo: facultyPhoto('photo-1544005313-94ddf0286df2') },
    batches: [
      { slot: 'Evening', days: 'Mon / Fri', start: '17:00', end: '18:00', label: '5:00 PM – 6:00 PM' },
      { slot: 'Weekend', days: 'Sat', start: '10:00', end: '12:00', label: '10:00 AM – 12:00 PM' },
    ],
    startDate: 'Every Monday',
    duration: '8 weeks',
    seats: 12,
    eligibility: 'Grade 3 and above',
    certification: 'Kids coding certificate',
    ageGroup: '8–13',
    verified: false,
    demo: true,
    status: 'approved',
    image: img('photo-1503676260728-1c00da094a0b'),
    rating: 4.8,
    reviews: 64,
    feePlans: [{ label: 'Monthly', amount: 2499, unit: 'month', mode: 'Online' }],
  },
  {
    id: 'c-nursing',
    title: 'Nursing Entrance Coaching',
    category: 'Healthcare',
    description: 'Targeted NEET-Nursing coaching with biology, chemistry, physics and nursing aptitude practice.',
    provider: 'CareGivers Academy',
    providerId: DEMO_PROVIDER_ID,
    area: 'KPHB',
    city: 'Hyderabad',
    distanceKm: 9.8,
    mode: 'Hybrid',
    modeOptions: ['Offline', 'Online'],
    fee: 8500,
    feeUnit: 'course',
    free: false,
    faculty: { name: 'Dr. Kavita Rao', experience: '18 yrs · Biologist', photo: facultyPhoto('photo-1559839734-2b71ea197ec2') },
    batches: [{ slot: 'Morning', days: 'Mon – Sat', start: '08:00', end: '11:00', label: '8:00 AM – 11:00 AM' }],
    startDate: '1st August',
    duration: '5 months',
    seats: 30,
    eligibility: '12th Science (PCB)',
    certification: 'Academy completion certificate',
    ageGroup: '17+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1576091160399-112ba8d25d1d'),
    rating: 4.6,
    reviews: 120,
    feePlans: [
      { label: 'Offline', amount: 8500, unit: 'course', mode: 'Offline' },
      { label: 'Online', amount: 6500, unit: 'course', mode: 'Online' },
    ],
  },
  {
    id: 'c-digital-marketing',
    title: 'Digital Marketing Pro',
    category: 'Business',
    description: 'SEO, social media, paid ads, analytics and content marketing with live campaigns and a portfolio review.',
    provider: 'GrowthLab',
    providerId: DEMO_PROVIDER_ID,
    area: 'Hitech City',
    city: 'Hyderabad',
    distanceKm: 4.1,
    mode: 'Online',
    modeOptions: ['Online', 'Recorded'],
    fee: 5999,
    feeUnit: 'course',
    free: false,
    faculty: { name: 'Karan Mehta', experience: '10 yrs · Growth marketer', photo: facultyPhoto('photo-1519085360753-af0119f7cbe7') },
    batches: [{ slot: 'Evening', days: 'Mon – Thu', start: '19:00', end: '21:00', label: '7:00 PM – 9:00 PM' }],
    startDate: 'Every 2nd Monday',
    duration: '6 weeks',
    seats: 20,
    eligibility: 'Anyone',
    certification: 'Digital Marketing certificate',
    ageGroup: '18+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1460925895917-afdab827c52f'),
    rating: 4.5,
    reviews: 210,
    feePlans: [{ label: 'Live + recorded', amount: 5999, unit: 'course', mode: 'Online' }],
  },
  {
    id: 'c-agri',
    title: 'Organic Farming Basics',
    category: 'Agriculture',
    description: 'Practical organic farming — soil health, composting, pest control and crop planning for small landholders.',
    provider: 'GreenFields',
    providerId: DEMO_PROVIDER_ID,
    area: 'Shamirpet',
    city: 'Hyderabad',
    distanceKm: 22.4,
    mode: 'Offline',
    modeOptions: ['Offline', 'Online'],
    fee: 0,
    feeUnit: 'course',
    free: true,
    faculty: { name: 'Ravi Reddy', experience: '22 yrs · Agri expert', photo: facultyPhoto('photo-1506794778202-cad84cf45f1d') },
    batches: [{ slot: 'Weekend', days: 'Sat', start: '09:00', end: '13:00', label: '9:00 AM – 1:00 PM' }],
    startDate: 'Every Saturday',
    duration: '4 weeks',
    seats: 40,
    eligibility: 'Open to all farmers',
    certification: 'Organic farming certificate',
    ageGroup: '18+',
    verified: true,
    demo: true,
    status: 'approved',
    image: img('photo-1500937386664-56d1dfef3854'),
    rating: 4.9,
    reviews: 45,
    feePlans: [{ label: 'Free program', amount: 0, unit: 'course' }],
  },
  {
    id: 'c-community',
    title: 'Community Leadership Workshop',
    category: 'Community Skills',
    description: 'Learn grassroots leadership, volunteering, community organising and public speaking for social impact.',
    provider: 'CivicCircle',
    providerId: DEMO_PROVIDER_ID,
    area: 'Secunderabad',
    city: 'Hyderabad',
    distanceKm: 11.2,
    mode: 'Hybrid',
    modeOptions: ['Online', 'Offline'],
    fee: 0,
    feeUnit: 'course',
    free: true,
    faculty: { name: 'Sana Ali', experience: '12 yrs · Social worker', photo: facultyPhoto('photo-1487412720507-e7ab37603c6f') },
    batches: [{ slot: 'Weekend', days: 'Sun', start: '10:00', end: '13:00', label: '10:00 AM – 1:00 PM' }],
    startDate: 'First Sunday',
    duration: '4 weeks',
    seats: 50,
    eligibility: 'Open to all',
    certification: 'Community impact certificate',
    ageGroup: '16+',
    verified: false,
    demo: true,
    status: 'approved',
    image: img('photo-1517245386807-bb43f82c33c4'),
    rating: 4.7,
    reviews: 38,
    feePlans: [{ label: 'Free program', amount: 0, unit: 'course' }],
  },
];

export const classCategories = ['All', ...COURSE_CATEGORIES];
