import React, { useEffect, useMemo, useState } from 'react';
import SafeImage from './SafeImage';
import { isRenderableListingImageSource } from '../lib/media/signedStorageUrl';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  Clock,
  GraduationCap,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Star,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  COURSE_CATEGORIES,
  COURSE_MODES,
  FEE_UNITS,
  TIMING_SLOTS,
  classListings,
  type BatchTiming,
  type CourseListing,
  type CourseMode,
  type FeePlan,
  type TimingSlot,
} from '../data/classesTimingsData';
import { DEMO_DATA_ENABLED } from '../lib/demoDataPolicy';
import { fetchClassBatches, type ClassBatch } from '../lib/classesApi';
import { ClassEnrollmentModal, MyClassesPanel } from './ClassEnrollmentFlow';
import type { MarketplaceListing } from '../types/marketplace';

interface ClassesTimingsExperienceProps {
  onClose: () => void;
  listings?: MarketplaceListing[];
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
}

const NEW_COURSES_KEY = 'bos_demo_courses_v1';

const formatINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const feeLabel = (item: CourseListing) => item.demo
  ? `${formatINR(item.fee)}${unitLabel(item.feeUnit)}`
  : `${formatINR(item.fee)} ${item.feeUnit}`;

const unitLabel = (u: string) => (u === 'course' ? '/course' : u === 'month' ? '/month' : u === 'hour' ? '/hour' : '/session');

const courseFeeLabel = (item: CourseListing) =>
  item.liveCalendar && !item.free
    ? `From ${formatINR(item.fee)}${unitLabel(item.feeUnit)}`
    : feeLabel(item);

function timeLabel(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return value || '';
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${match[2]} ${suffix}`;
}

function liveBatchSlot(batch: ClassBatch): TimingSlot {
  const days = (batch.daysOfWeek || '').toLowerCase();
  const weekendOnly = /(sat|sun)/.test(days) && !/(mon|tue|wed|thu|fri)/.test(days);
  if (weekendOnly) return 'Weekend';
  const hour = Number((batch.startTime || '00:00').slice(0, 2));
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function liveBatchMode(batch: ClassBatch): CourseMode {
  switch (batch.deliveryMode) {
    case 'online': return 'Online';
    case 'hybrid': return 'Hybrid';
    case 'recorded': return 'Recorded';
    case 'offline': return 'Offline';
    default: return 'Not specified';
  }
}

function liveBatchFee(batch: ClassBatch): number {
  if (batch.deliveryMode === 'online' || batch.deliveryMode === 'recorded') return batch.onlineFee;
  if (batch.deliveryMode === 'offline') return batch.offlineFee;
  const paid = [batch.onlineFee, batch.offlineFee].filter((fee) => fee > 0);
  return paid.length ? Math.min(...paid) : 0;
}

/** Replace displayed demo timing/price metadata with the live PostgreSQL calendar. */
function applyLiveBatches(course: CourseListing, batches: ClassBatch[]): CourseListing {
  if (batches.length === 0) return course;
  const first = batches[0];
  const timings: BatchTiming[] = batches.map((batch) => ({
    slot: liveBatchSlot(batch),
    days: batch.daysOfWeek || 'Days not set',
    start: batch.startTime,
    end: batch.endTime,
    label: `${timeLabel(batch.startTime)} – ${timeLabel(batch.endTime)}`,
  }));
  const modes = Array.from(new Set(batches.map(liveBatchMode)));
  const feePlans: FeePlan[] = [];
  if (modes.includes('Online') || modes.includes('Recorded')) {
    feePlans.push({ label: 'Online fee', amount: first.onlineFee, unit: first.feeUnit as FeePlan['unit'], mode: 'Online' });
  }
  if (modes.includes('Offline') || modes.includes('Hybrid')) {
    feePlans.push({ label: 'Offline fee', amount: first.offlineFee, unit: first.feeUnit as FeePlan['unit'], mode: 'Offline' });
  }
  const fee = liveBatchFee(first);
  const seatsLeft = batches.reduce((total, batch) => total + Math.max(0, batch.seatsLeft), 0);
  return {
    ...course,
    mode: liveBatchMode(first),
    modeOptions: modes,
    fee,
    feeUnit: first.feeUnit,
    free: fee === 0,
    faculty: {
      name: first.facultyName,
      experience: first.facultyExperience,
      photo: '',
    },
    batches: timings,
    startDate: first.startDate || course.startDate,
    duration: first.durationLabel || course.duration,
    seats: seatsLeft,
    area: first.area || course.area,
    verified: course.verified,
    liveCalendar: true,
    liveBatchCount: batches.length,
    feePlans,
  };
}

const modeIcon = (m: CourseMode) =>
  m === 'Online' ? <Video className="h-3.5 w-3.5" /> : m === 'Recorded' ? <Video className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />;

function loadLocalCourses(): CourseListing[] {
  try {
    const raw = localStorage.getItem(NEW_COURSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalCourses(list: CourseListing[]) {
  try {
    localStorage.setItem(NEW_COURSES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function Highlight({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl bg-[#f5f3ff] px-2.5 py-1.5">
      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-[#7c3aed]">
        {icon}
        {label}
      </span>
      <span className="mt-0.5 truncate text-[11.5px] font-extrabold text-[#1e1b4b]">{value}</span>
    </div>
  );
}

function CourseCard({ item, onOpen }: { item: CourseListing; onOpen: () => void }) {
  const nextBatch = item.batches[0];
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-[#ece8fb] bg-white shadow-[0_2px_10px_rgba(91,33,182,0.05)] transition hover:shadow-[0_10px_26px_rgba(91,33,182,0.14)]">
      <div className="relative">
        <button type="button" onClick={onOpen} className="relative block aspect-[16/9] w-full overflow-hidden" aria-label={`View ${item.title}`}>
          <SafeImage src={item.image} alt={item.title} category="classes" className="h-full w-full object-cover" sizes="(max-width: 640px) 90vw, 360px" />
        </button>
        <span className={`absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white shadow-sm ${item.demo ? 'bg-[#f59e0b]' : item.liveCalendar ? 'bg-emerald-600' : 'bg-[#7c3aed]'}`}>
          {item.demo ? <Sparkles className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
          {item.demo
            ? 'DEMO'
            : item.liveCalendar
              ? `${item.liveBatchCount} live batch${item.liveBatchCount === 1 ? '' : 'es'}`
              : item.verified
                ? 'Admin approved · Verified'
                : 'Admin approved listing'}
        </span>
        {item.free ? (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">FREE</span>
        ) : null}
        {typeof item.rating === 'number' && typeof item.reviews === 'number' && <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"><Star className="h-3 w-3 fill-amber-300 text-amber-300" /> {item.rating.toFixed(1)} <span className="text-white/70">({item.reviews})</span></span>}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-md bg-[#f5f3ff] px-1.5 py-0.5 text-[9.5px] font-bold text-[#6d28d9]">{item.category}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#64748b]">
            {item.seats !== null && <><Users className="h-3 w-3" /> {item.seats} {item.liveCalendar ? 'seats left' : 'seats'}</>}
          </span>
        </div>
        <button type="button" onClick={onOpen} className="mt-1.5 text-left">
          <h3 className="line-clamp-2 text-[14.5px] font-extrabold leading-5 text-[#1e1b4b]">{item.title}</h3>
          <p className="mt-0.5 truncate text-[11px] text-[#64748b]">{item.provider}</p>
        </button>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Highlight label="Time" value={nextBatch ? nextBatch.label : 'Not provided'} icon={<Clock className="h-2.5 w-2.5" />} />
          <Highlight label="Mode" value={item.mode} icon={modeIcon(item.mode)} />
          <Highlight label="Location" value={item.area} icon={<MapPin className="h-2.5 w-2.5" />} />
          <Highlight label={item.demo ? 'Amount' : item.liveCalendar ? 'From' : 'Listed price'} value={item.free ? 'Free' : courseFeeLabel(item)} icon={<Star className="h-2.5 w-2.5" />} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#94a3b8]">
            {item.startDate && <><CalendarDays className="h-3 w-3" /> Starts {item.startDate}</>}
          </span>
          <button type="button" onClick={onOpen} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#7c3aed] px-3 text-[11.5px] font-bold text-white transition hover:bg-[#6d28d9]">
            View <Sparkles className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

function CourseDetail({ item, onClose, onEnroll }: { item: CourseListing; onClose: () => void; onEnroll: () => void }) {
  return (
    <div data-testid="class-detail-modal" className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="course-title" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-h-[88vh] sm:max-w-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <SafeImage src={item.image} alt={item.title} category="classes" className="h-40 w-full object-cover sm:h-48" sizes="(max-width: 640px) 90vw, 420px" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-800">
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-3 right-3">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${item.demo ? 'bg-[#f59e0b]' : item.liveCalendar ? 'bg-emerald-600' : 'bg-[#7c3aed]'}`}>
              {item.demo
                ? 'DEMO'
                : item.liveCalendar
                  ? `Live calendar · ${item.liveBatchCount} batch${item.liveBatchCount === 1 ? '' : 'es'}`
                  : item.verified
                    ? 'Admin approved · Verified'
                    : 'Admin approved listing'} · {item.category}
            </span>
            <h2 id="course-title" className="mt-1 text-[17px] font-black leading-tight text-white">{item.title}</h2>
            <p className="text-[11.5px] text-white/85">{item.provider} · {item.area}, {item.city}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-1.5">
            <Highlight label="Time" value={item.batches.map((b) => b.slot).join(' · ') || 'Not provided'} icon={<Clock className="h-2.5 w-2.5" />} />
            <Highlight label="Mode" value={item.mode} icon={modeIcon(item.mode)} />
            <Highlight label="Location" value={[item.area, item.city].filter(Boolean).join(' · ') || 'Not provided'} icon={<MapPin className="h-2.5 w-2.5" />} />
            <Highlight label={item.demo ? 'Amount' : item.liveCalendar ? 'From' : 'Listed price'} value={item.free ? 'Free' : courseFeeLabel(item)} icon={<Star className="h-2.5 w-2.5" />} />
          </div>

          <p className="mt-3 text-[12.5px] leading-5 text-[#475569]">{item.description}</p>

          {item.batches.length > 0 && <div className="mt-3 rounded-2xl border border-[#ece8fb] p-3">
            <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Batches & timings</h3>
            <div className="mt-1.5 space-y-1.5">
              {item.batches.map((b) => (
                <div key={`${b.slot}-${b.days}`} className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f3ff] px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#4c1d95]">
                    <Clock className="h-3 w-3" /> {b.slot} · {b.days}
                  </span>
                  <span className="text-[11px] font-semibold text-[#4c1d95]">{b.label}</span>
                </div>
              ))}
            </div>
          </div>}

          {(item.demo || item.faculty.name || item.feePlans.length > 0) && <div className="mt-3 rounded-2xl border border-[#ece8fb] p-3">
            <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">{item.demo ? 'Fee plans' : 'Provider listed price'}</h3>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {item.feePlans.map((p) => (
                <div key={p.label} className="flex items-center justify-between rounded-lg border border-[#ece8fb] px-2.5 py-1.5">
                  <span className="text-[11px] font-semibold text-[#475569]">{p.label}</span>
                  <span className="text-[12px] font-extrabold text-[#6d28d9]">{p.amount === 0 ? 'Free' : `${formatINR(p.amount)}${unitLabel(p.unit)}`}</span>
                </div>
              ))}
            </div>
          </div>}

          {(item.faculty.name || item.eligibility || item.certification) && <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#ece8fb] p-3">
              <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Faculty</h3>
              <div className="mt-1.5 flex items-center gap-2">
                {item.faculty.photo ? (
                  <SafeImage src={item.faculty.photo} alt={item.faculty.name} category="classes" className="h-9 w-9 rounded-full object-cover" sizes="36px" />
                ) : (
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f3ff] text-[11px] font-black text-[#6d28d9]">
                    {(item.faculty.name || 'Faculty').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-[#1e1b4b]">{item.faculty.name}</p>
                  <p className="truncate text-[10.5px] text-[#64748b]">{item.faculty.experience}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#ece8fb] p-3">
              <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Eligibility & certification</h3>
              <p className="mt-1 text-[11px] text-[#475569]">{item.eligibility}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#6d28d9]"><Award className="h-3 w-3" /> {item.certification}</p>
            </div>
          </div>}

          <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold text-[#64748b]">{item.duration && <span className="rounded-full bg-[#f8fafc] px-2 py-0.5">Duration: {item.duration}</span>}{item.seats !== null && <span className="rounded-full bg-[#f8fafc] px-2 py-0.5">{item.liveCalendar ? 'Seats left' : 'Seats'}: {item.seats}</span>}{item.ageGroup && <span className="rounded-full bg-[#f8fafc] px-2 py-0.5">Age: {item.ageGroup}</span>}{item.startDate && <span className="rounded-full bg-[#f8fafc] px-2 py-0.5">Start: {item.startDate}</span>}</div>
        </div>

        <div className="border-t border-[#ece8fb] p-3">
          <button type="button" onClick={onEnroll} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#7c3aed] text-[13px] font-bold text-white transition hover:bg-[#6d28d9]">
            <GraduationCap className="h-4 w-4" /> {item.demo ? 'Demo enquiry preview' : 'Select batch & enroll'}
          </button>
          <p className="mt-1.5 text-center text-[9.5px] text-[#64748b]">{item.demo ? 'Demo only — no enquiry was sent.' : 'Batches come from the trainer\'s admin-approved calendar. Seat, fee and payment status are confirmed by the server.'}</p>
        </div>
      </div>
    </div>
  );
}

export function mapProviderCourse(listing: MarketplaceListing): CourseListing {
  const custom = listing.customFieldValues || {};
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const allowedModes: CourseMode[] = ['Online', 'Offline', 'Hybrid', 'Recorded'];
  const candidateMode = text(custom.mode);
  const mode: CourseMode = allowedModes.includes(candidateMode as CourseMode) ? candidateMode as CourseMode : 'Not specified';
  const feeUnit = listing.priceUnit || 'listed price';
  const feePlans = Number.isFinite(listing.price) ? [{ label: 'Provider listed price', amount: listing.price, unit: feeUnit as any }] : [];
  return {
    id: listing.id,
    title: listing.title,
    category: listing.subcategory || listing.categoryId,
    description: listing.description,
    provider: listing.providerName,
    providerId: '',
    area: listing.location.area,
    city: listing.location.city,
    distanceKm: null,
    mode,
    modeOptions: mode === 'Not specified' ? [] : [mode],
    fee: listing.price,
    feeUnit: feeUnit as any,
    free: listing.price === 0,
    faculty: { name: '', experience: '', photo: '' },
    batches: [],
    startDate: text(custom.startDate),
    duration: text(custom.duration),
    seats: typeof custom.seats === 'number' && Number.isFinite(custom.seats) ? custom.seats : null,
    eligibility: text(custom.eligibility),
    certification: text(custom.certification),
    ageGroup: text(custom.ageGroup),
    verified: listing.isVerified,
    demo: false,
    status: 'approved',
    image: listing.images.find((image) => isRenderableListingImageSource(image)) || '',
    feePlans,
  };
}

export function ClassesTimingsExperience({ onClose, inline = false, listings = [] }: ClassesTimingsExperienceProps) {
  const [mode, setMode] = useState<'All' | CourseMode>('All');
  const [timing, setTiming] = useState<'All' | TimingSlot>('All');
  const [feeBand, setFeeBand] = useState<'All' | 'Free' | 'Under3k' | '3k8k' | '8kPlus'>('All');
  const [area, setArea] = useState('');
  const [distance, setDistance] = useState<'Any' | '5' | '10' | '20'>('Any');
  const [duration, setDuration] = useState<'Any' | 'short' | 'mid' | 'long'>('Any');
  const [age, setAge] = useState<'Any' | 'kids' | 'teens' | 'adults'>('Any');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selected, setSelected] = useState<CourseListing | null>(null);
  const [enrolled, setEnrolled] = useState<string | null>(null);
  const [localCourses, setLocalCourses] = useState<CourseListing[]>(() => DEMO_DATA_ENABLED ? loadLocalCourses() : []);
  const [showAdd, setShowAdd] = useState(false);
  const [enrollCourse, setEnrollCourse] = useState<CourseListing | null>(null);
  const [showMyClasses, setShowMyClasses] = useState(false);
  const [liveBatchesByListing, setLiveBatchesByListing] = useState<Record<string, ClassBatch[]>>({});
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const providerCourses = useMemo(() => listings
    .filter((listing) => listing.status === 'active' && (listing.categoryId === 'classes' || listing.categoryId.startsWith('class-')))
    .map(mapProviderCourse), [listings]);
  const providerCourseKey = providerCourses.map((course) => course.id).sort().join('|');
  const refreshCalendar = () => setCalendarVersion((version) => version + 1);

  // Discovery reads the real, admin-approved batch calendar for each approved
  // course. A failed call leaves the course visible but without invented seats.
  useEffect(() => {
    let cancelled = false;
    const loadLiveCalendars = async () => {
      if (providerCourses.length === 0) {
        if (!cancelled) setLiveBatchesByListing({});
        return;
      }
      const entries = await Promise.all(
        providerCourses.map(async (course) => {
          const result = await fetchClassBatches(course.id);
          const batches = result.ok && result.data ? result.data.batches : [];
          return [course.id, batches] as const;
        }),
      );
      if (!cancelled) setLiveBatchesByListing(Object.fromEntries(entries));
    };
    void loadLiveCalendars();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerCourseKey, calendarVersion]);

  useEffect(() => {
    if (!showAdd || !selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAdd, selected]);

  const allCourses = useMemo(
    () => [
      ...providerCourses.map((course) => applyLiveBatches(course, liveBatchesByListing[course.id] || [])),
      ...(DEMO_DATA_ENABLED ? [...localCourses, ...classListings] : []),
    ],
    [providerCourses, localCourses, liveBatchesByListing],
  );

  const results = useMemo(() => {
    return allCourses.filter((c) => {
      if (query.trim() && !`${c.title} ${c.provider} ${c.category} ${c.area} ${c.city}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (category !== 'All' && c.category !== category) return false;
      if (mode !== 'All' && c.mode !== mode && !c.modeOptions.includes(mode)) return false;
      if (timing !== 'All' && !c.batches.some((b) => b.slot === timing)) return false;
      if (verifiedOnly && !c.verified) return false;
      if (area.trim() && !`${c.area} ${c.city}`.toLowerCase().includes(area.trim().toLowerCase())) return false;
      if (distance !== 'Any' && (c.distanceKm === null || c.distanceKm > Number(distance))) return false;
      if (feeBand === 'Free' && !c.free) return false;
      if (feeBand === 'Under3k' && (c.free || c.fee >= 3000)) return false;
      if (feeBand === '3k8k' && (c.free || c.fee < 3000 || c.fee > 8000)) return false;
      if (feeBand === '8kPlus' && (c.free || c.fee <= 8000)) return false;
      const weeks = /(\d+)\s*week/i.exec(c.duration);
      if (duration === 'short' && (!weeks || Number(weeks[1]) >= 4)) return false;
      if (duration === 'mid' && (!weeks || Number(weeks[1]) < 4 || Number(weeks[1]) > 12)) return false;
      if (duration === 'long' && (!weeks || Number(weeks[1]) <= 12)) return false;
      if (age === 'kids' && !/^(8|9|10|11|12|13|14)/.test(c.ageGroup)) return false;
      if (age === 'teens' && !/1[4-9]/.test(c.ageGroup)) return false;
      if (age === 'adults' && !/18|21|16/.test(c.ageGroup)) return false;
      return true;
    });
  }, [allCourses, query, category, mode, timing, feeBand, area, distance, duration, age, verifiedOnly]);
  const categoryOptions = useMemo(() => ['All', ...Array.from(new Set(allCourses.map((course) => course.category))).sort()], [allCourses]);

  return (
    <div
      className={
        inline
          ? 'w-full bg-[#faf9ff] text-slate-900'
          : 'fixed inset-0 z-[71] flex flex-col overflow-hidden bg-[#faf9ff] text-slate-900'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-labelledby="classes-title"
    >
      {/* Header */}
      <header className="shrink-0 border-b border-[#ece8fb] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
          <button type="button" onClick={onClose} aria-label="Back to all sections" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ece8fb] transition hover:bg-[#f5f3ff]">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 id="classes-title" className="truncate text-[15px] font-black text-[#1e1b4b] sm:text-[17px]">
              Classes & Training
            </h1>
            <p className="truncate text-[10.5px] text-[#64748b]">India-wide · academic, IT, arts, sports, exams & more</p>
          </div>
          <button type="button" onClick={() => setShowMyClasses(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#ece8fb] px-3 text-[11.5px] font-bold text-[#4c1d95] transition hover:bg-[#f5f3ff]">
            <CalendarDays className="h-3.5 w-3.5" /> My classes
          </button>
          <button type="button" onClick={() => DEMO_DATA_ENABLED && setShowAdd(true)} disabled={!DEMO_DATA_ENABLED} title={DEMO_DATA_ENABLED ? 'Create a local demo course' : 'Providers submit courses from the provider portal'} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#7c3aed] px-3 text-[11.5px] font-bold text-white transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> List course
          </button>
        </div>

        {/* Filters */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-3 pb-2.5 sm:px-5">
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search courses" placeholder="Search course or provider" className="h-8 min-w-40 rounded-full border border-[#ece8fb] bg-white px-3 text-[11px] outline-none" />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={categoryOptions} />
          <FilterSelect label="Mode" value={mode} onChange={(v) => setMode(v as any)} options={['All', ...COURSE_MODES]} />
          <FilterSelect label="Timing" value={timing} onChange={(v) => setTiming(v as any)} options={['All', ...TIMING_SLOTS]} />
          <FilterSelect label="Fee" value={feeBand} onChange={(v) => setFeeBand(v as any)} options={[['All', 'All fees'], ['Free', 'Free'], ['Under3k', 'Under ₹3k'], ['3k8k', '₹3k–₹8k'], ['8kPlus', '₹8k+']]} />
          <FilterSelect label="Distance" value={distance} onChange={(v) => setDistance(v as any)} options={[['Any', 'Any distance'], ['5', 'Under 5 km'], ['10', 'Under 10 km'], ['20', 'Under 20 km']]} />
          <FilterSelect label="Duration" value={duration} onChange={(v) => setDuration(v as any)} options={[['Any', 'Any duration'], ['short', 'Under 4 weeks'], ['mid', '4–12 weeks'], ['long', '12+ weeks']]} />
          <FilterSelect label="Age" value={age} onChange={(v) => setAge(v as any)} options={[['Any', 'Any age'], ['kids', 'Kids (8–13)'], ['teens', 'Teens (14–19)'], ['adults', 'Adults (18+)']]} />
          <div className="flex items-center gap-1.5 rounded-full border border-[#ece8fb] bg-white px-2.5 py-1.5">
            <Search className="h-3 w-3 text-[#94a3b8]" />
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" aria-label="Filter by area" className="w-20 bg-transparent text-[11px] font-semibold outline-none placeholder:text-slate-400" />
          </div>
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            aria-pressed={verifiedOnly}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${verifiedOnly ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-[#ece8fb] bg-white text-[#475569]'}`}
          >
            <BadgeCheck className="h-3 w-3" /> Verified
          </button>
        </div>
      </header>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-extrabold text-[#1e1b4b]">{results.length} courses</h2>
            <span className="text-[10.5px] font-semibold text-[#94a3b8]">{providerCourses.length ? 'Admin-approved PostgreSQL listings' : DEMO_DATA_ENABLED ? 'Demo data' : 'Admin-approved listings only'}</span>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-[#ece8fb] bg-white p-8 text-center">
              <GraduationCap className="mx-auto h-7 w-7 text-[#7c3aed]" />
              <p className="mt-2 text-[13px] font-bold text-[#1e1b4b]">No courses match these filters</p>
              <p className="mt-0.5 text-[11px] text-[#64748b]">{DEMO_DATA_ENABLED ? 'Try clearing a filter or searching a different area.' : 'No admin-approved courses match these filters. Enrollment and payment are not available.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((c) => (
                <CourseCard key={c.id} item={c} onOpen={() => setSelected(c)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <CourseDetail
          item={selected}
          onClose={() => { setSelected(null); setEnrolled(null); }}
          onEnroll={() => {
            if (selected.demo) setEnrolled(selected.id);
            else setEnrollCourse(selected);
          }}
        />
      )}

      {enrollCourse && (
        <ClassEnrollmentModal
          courseId={enrollCourse.id}
          courseTitle={enrollCourse.title}
          onClose={() => setEnrollCourse(null)}
          onEnrolled={refreshCalendar}
        />
      )}

      {showMyClasses && <MyClassesPanel onClose={() => setShowMyClasses(false)} />}


      {enrolled && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-5 w-5" /></span>
            <h3 className="mt-2 text-[14px] font-extrabold text-[#1e1b4b]">Demo enquiry preview</h3>
            <p className="mt-1 text-[11.5px] text-[#64748b]">No enquiry was sent and no provider will contact you.</p>
            <button type="button" onClick={() => { setEnrolled(null); setSelected(null); }} className="mt-3 h-9 w-full rounded-xl bg-[#7c3aed] text-[12px] font-bold text-white">Done</button>
          </div>
        </div>
      )}

      {showAdd && (
        <AddCourseForm
          onClose={() => setShowAdd(false)}
          onCreate={(course) => {
            const next = [course, ...localCourses];
            setLocalCourses(next);
            saveLocalCourses(next);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<string | [string, string]>;
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-[#ece8fb] bg-white px-2.5 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-[#94a3b8]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-[110px] bg-transparent text-[11px] font-bold text-[#4c1d95] outline-none">
        {options.map((o) => {
          const [val, text] = Array.isArray(o) ? o : [o, o];
          return <option key={val} value={val}>{text}</option>;
        })}
      </select>
    </label>
  );
}

function AddCourseForm({ onClose, onCreate }: { onClose: () => void; onCreate: (c: CourseListing) => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(COURSE_CATEGORIES[0]);
  const [mode, setMode] = useState<CourseMode>('Offline');
  const [area, setArea] = useState('');
  const [fee, setFee] = useState('');
  const [feeUnit, setFeeUnit] = useState<'course' | 'month' | 'hour' | 'session'>('month');
  const [free, setFree] = useState(false);
  const [duration, setDuration] = useState('8 weeks');
  const [seats, setSeats] = useState('20');
  const [eligibility, setEligibility] = useState('Open to all');
  const [certification, setCertification] = useState('Completion certificate');
  const [description, setDescription] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const course: CourseListing = {
      id: `local-${Date.now()}`,
      title: title.trim(),
      category,
      description: description.trim() || 'Provider course listing.',
      provider: 'Your Academy',
      providerId: 'local-provider',
      area: area.trim() || 'Hyderabad',
      city: 'Hyderabad',
      distanceKm: 5,
      mode,
      modeOptions: [mode],
      fee: free ? 0 : Number(fee) || 0,
      feeUnit,
      free,
      faculty: { name: 'Your Faculty', experience: 'Add experience', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&h=200&q=80' },
      batches: [{ slot: 'Evening', days: 'Mon – Fri', start: '18:00', end: '20:00', label: '6:00 PM – 8:00 PM' }],
      startDate: 'Next Monday',
      duration,
      seats: Number(seats) || 20,
      eligibility,
      certification,
      ageGroup: '18+',
      verified: false,
      demo: true,
      status: 'pending',
      image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=900&q=80',
      rating: 0,
      reviews: 0,
      feePlans: [{ label: 'Standard', amount: free ? 0 : Number(fee) || 0, unit: feeUnit, mode }],
    };
    onCreate(course);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-course-title" onClick={onClose}>
      <form onSubmit={submit} className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#ece8fb] px-4 py-3">
          <h2 id="add-course-title" className="text-[14px] font-extrabold text-[#1e1b4b]">List your course</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f5f3ff]"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          <Field label="Course title"><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Spoken English for Beginners" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value as any)} className={inputCls}>{COURSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Mode"><select value={mode} onChange={(e) => setMode(e.target.value as CourseMode)} className={inputCls}>{COURSE_MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Area"><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Madhapur" className={inputCls} /></Field>
            <Field label="Fee"><input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="2999" inputMode="numeric" className={inputCls} /></Field>
            <Field label="Fee unit"><select value={feeUnit} onChange={(e) => setFeeUnit(e.target.value as any)} className={inputCls}>{FEE_UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Duration"><input value={duration} onChange={(e) => setDuration(e.target.value)} className={inputCls} /></Field>
            <Field label="Seats"><input value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" className={inputCls} /></Field>
            <Field label="Age group"><input value="18+" readOnly className={inputCls} /></Field>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-[#ece8fb] px-3 py-2">
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />
            <span className="text-[12px] font-semibold text-[#475569]">This is a free course</span>
          </label>
          <Field label="Eligibility"><input value={eligibility} onChange={(e) => setEligibility(e.target.value)} className={inputCls} /></Field>
          <Field label="Certification"><input value={certification} onChange={(e) => setCertification(e.target.value)} className={inputCls} /></Field>
          <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What will students learn?" className={inputCls} /></Field>
          <p className="text-[10px] text-[#94a3b8]">New provider courses are saved locally as DEMO and marked “pending approval”.</p>
        </div>
        <div className="border-t border-[#ece8fb] p-3">
          <button type="submit" className="h-10 w-full rounded-xl bg-[#7c3aed] text-[12.5px] font-bold text-white">Submit for approval</button>
        </div>
      </form>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-[#ece8fb] bg-white px-2.5 py-2 text-[12px] font-semibold text-[#1e1b4b] outline-none focus:border-[#7c3aed]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">{label}</span>
      {children}
    </label>
  );
}
