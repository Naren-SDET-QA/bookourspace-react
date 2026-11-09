import React, { useEffect, useMemo, useRef, useState } from 'react';
import SafeImage from './SafeImage';
import { isRenderableListingImageSource } from '../lib/media/signedStorageUrl';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Building2,
  CalendarDays,
  Copy,
  MessageCircle,
  Share2,
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
import { SectionStyleTabs, type SectionStyleNumber } from './sectionStyle/SectionStyleTabs';
import { saveStylePreference } from '../lib/sectionStyleSettings';
import { StyleThreeList } from './sectionStyle/StyleThreeList';
import type { MarketplaceListing } from '../types/marketplace';

interface ClassesTimingsExperienceProps {
  onClose: () => void;
  listings?: MarketplaceListing[];
  /** Render in the page flow under the common header instead of as a full-screen dialog. */
  inline?: boolean;
  /** 'cards' keeps the course-card grid; 'timetable' renders a weekly schedule; 'style3' is the compact list. */
  style?: 'cards' | 'timetable' | 'style3';
}

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ClassTimetable({ courses, onOpen }: { courses: CourseListing[]; onOpen: (course: CourseListing) => void }) {
  const buckets = new Map<string, Array<{ course: CourseListing; slot: string }>>(
    WEEK_DAYS.map((day) => [day, []]),
  );
  const flexible: CourseListing[] = [];
  for (const course of courses) {
    if (course.batches.length === 0) {
      flexible.push(course);
      continue;
    }
    for (const batch of course.batches) {
      const labels = String(batch.days || '').toLowerCase();
      for (const day of WEEK_DAYS) {
        if (labels.includes(day.toLowerCase())) {
          buckets.get(day)!.push({ course, slot: batch.slot || batch.label || 'Timing on request' });
        }
      }
    }
  }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#ece8fb] bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-black text-[#1e1b4b]">Weekly timetable</h3>
            <p className="text-[11px] text-[#64748b]">Batches grouped by day. Click a batch to open the course and enroll.</p>
          </div>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10.5px] font-bold text-violet-700">{courses.length} courses</span>
        </div>
      </div>
      <div className="grid gap-2 overflow-x-auto sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {WEEK_DAYS.map((day) => {
          const items = buckets.get(day)!;
          return (
            <section key={day} className="min-w-0 rounded-2xl border border-[#ece8fb] bg-white">
              <header className="flex items-center justify-between rounded-t-2xl bg-[#f5f3ff] px-3 py-2">
                <h4 className="text-[12px] font-black text-[#4c1d95]">{day}</h4>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#64748b]">{items.length}</span>
              </header>
              <div className="space-y-1.5 p-2">
                {items.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 px-2 py-3 text-center text-[10.5px] text-slate-400">No batches</p>
                ) : (
                  items.map((item, index) => (
                    <button
                      key={`${item.course.id}-${index}`}
                      type="button"
                      onClick={() => onOpen(item.course)}
                      className="w-full rounded-xl border border-[#ece8fb] bg-white p-2 text-left transition hover:border-violet-400 hover:bg-violet-50/60"
                    >
                      <span className="block text-[11px] font-black leading-4 text-[#1e1b4b]">{item.course.title}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-violet-700">{item.slot}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-[#64748b]">{item.course.provider}</span>
                      <span className="mt-1 block text-[10px] font-bold text-[#1e1b4b]">{item.course.free ? 'Free' : `${formatINR(item.course.fee)} ${unitLabel(item.course.feeUnit)}`}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
      {flexible.length > 0 && (
        <div className="rounded-2xl border border-[#ece8fb] bg-white p-3">
          <h4 className="text-[12px] font-black text-[#1e1b4b]">Flexible / schedule on request</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {flexible.map((course) => (
              <button key={course.id} type="button" onClick={() => onOpen(course)} className="rounded-xl border border-[#ece8fb] px-3 py-2 text-left text-[11px] font-bold text-[#1e1b4b] hover:border-violet-400">
                {course.title}
                <span className="block text-[10px] font-semibold text-[#64748b]">{course.provider}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

type CourseReviewEntry = {
  id: string;
  name: string;
  rating: number;
  comment: string;
  date: string;
};

const COURSE_REVIEWS_KEY = 'bos_course_reviews_v1';

function loadCourseReviews(courseId: string): CourseReviewEntry[] {
  try {
    const all = JSON.parse(localStorage.getItem(COURSE_REVIEWS_KEY) || '{}') as Record<string, unknown>;
    const list = all[courseId];
    return Array.isArray(list)
      ? list.filter((entry): entry is CourseReviewEntry => Boolean(entry) && typeof entry === 'object' && typeof (entry as CourseReviewEntry).comment === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveCourseReview(courseId: string, review: CourseReviewEntry) {
  try {
    const all = JSON.parse(localStorage.getItem(COURSE_REVIEWS_KEY) || '{}') as Record<string, unknown>;
    const existing = Array.isArray(all[courseId]) ? all[courseId] as CourseReviewEntry[] : [];
    all[courseId] = [review, ...existing].slice(0, 20);
    localStorage.setItem(COURSE_REVIEWS_KEY, JSON.stringify(all));
  } catch {
    /* Review stays visible for this session even if storage is unavailable. */
  }
}

function DetailTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[#ece8fb] bg-white px-2.5 py-2">
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-[#7c3aed]">
        {icon}{label}
      </span>
      <p className="mt-0.5 line-clamp-2 text-[11.5px] font-extrabold leading-4 text-[#1e1b4b]">{value}</p>
    </div>
  );
}

function CourseDetail({ item, onClose, onEnroll }: { item: CourseListing; onClose: () => void; onEnroll: () => void }) {
  const [reviews, setReviews] = useState<CourseReviewEntry[]>(() => loadCourseReviews(item.id));
  const [showReview, setShowReview] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [shareNote, setShareNote] = useState('');
  const reviewRef = useRef<HTMLDivElement | null>(null);

  const localAverage = reviews.length
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10
    : null;
  const displayRating = localAverage ?? item.rating;
  const displayReviewCount = (item.reviews ?? 0) + reviews.length;
  const phone = (item.providerPhone || '').replace(/\D/g, '');
  const whatsappText = `Hi ${item.provider || 'there'}, I am interested in "${item.title}" at ${item.area}${item.city ? `, ${item.city}` : ''}. Is a demo/trial available?`;
  const whatsappHref = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, text: `${item.title} — ${item.provider}`, url });
        return;
      }
    } catch {
      /* Fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied');
      window.setTimeout(() => setShareNote(''), 2000);
    } catch {
      setShareNote('Copy the URL from the address bar');
    }
  };

  const focusReviews = () => {
    setShowReview(true);
    window.setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const submitReview = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewComment.trim()) return;
    const entry: CourseReviewEntry = {
      id: `review-${Date.now()}`,
      name: reviewName.trim() || 'Verified learner',
      rating: reviewRating,
      comment: reviewComment.trim(),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    };
    const next = [entry, ...reviews];
    setReviews(next);
    saveCourseReview(item.id, entry);
    setReviewName('');
    setReviewComment('');
    setReviewRating(5);
    setShowReview(false);
  };

  const timingText = item.batches.length
    ? item.batches.map((batch) => [batch.slot, batch.days].filter(Boolean).join(' · ')).join(' | ')
    : 'Timing on request';
  const capacityText = item.seats !== null
    ? `${item.seats} ${item.liveCalendar ? 'seats left' : 'students'}`
    : 'Capacity on request';

  return (
    <div data-testid="class-detail-modal" className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="course-title" onClick={onClose}>
      <div className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-3xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        {/* Fixed top bar: category, featured, share, close */}
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#ece8fb] bg-white px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#6d28d9]">{item.category}</span>
            {item.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">
                <Sparkles className="h-3 w-3" /> Featured
              </span>
            )}
            {item.liveCalendar && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">
                {item.liveBatchCount || item.batches.length} live batch{(item.liveBatchCount || item.batches.length) === 1 ? '' : 'es'}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => void share()} aria-label="Share course" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#ece8fb] px-2.5 text-[10.5px] font-bold text-[#4c1d95] hover:bg-[#f5f3ff]">
              <Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Share</span>
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ece8fb] text-slate-600 hover:bg-[#f5f3ff]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {shareNote && <div aria-live="polite" className="shrink-0 border-b border-emerald-100 bg-emerald-50 px-4 py-1.5 text-[10.5px] font-bold text-emerald-800">{shareNote}</div>}

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative">
            <SafeImage src={item.image} alt={item.title} category="classes" className="h-52 w-full object-cover sm:h-64" sizes="(max-width: 640px) 100vw, 768px" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black text-[#4c1d95] shadow-sm">
              <BadgeCheck className="h-3 w-3" /> {item.verified ? 'Verified provider' : 'Admin approved listing'}
            </span>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="course-title" className="text-lg font-black leading-tight text-[#1e1b4b] sm:text-xl">{item.title}</h2>
                <p className="mt-1 text-[12px] font-semibold text-[#64748b]">{item.provider} · {[item.area, item.city].filter(Boolean).join(', ')}</p>
              </div>
              <div className="rounded-2xl bg-[#f5f3ff] px-3.5 py-2 text-right">
                <span className="text-[8.5px] font-black uppercase tracking-wider text-[#7c3aed]">Pricing</span>
                <div className="text-xl font-black text-[#1e1b4b]">{item.free ? 'Free' : formatINR(item.fee)}</div>
                {!item.free && <div className="text-[9.5px] font-bold text-[#6d28d9]">{item.feeUnit === 'course' ? 'onwards' : unitLabel(item.feeUnit)}</div>}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-semibold text-[#64748b]">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-[#7c3aed]" /> {[item.area, item.city].filter(Boolean).join(', ')}</span>
              {typeof displayRating === 'number' && displayRating > 0 && (
                <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {displayRating.toFixed(1)} ({displayReviewCount} reviews)</span>
              )}
              {item.distanceKm !== null && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-[#7c3aed]" /> {item.distanceKm.toFixed(1)} km away</span>}
              <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1 text-[#6d28d9] underline-offset-2 hover:underline"><Copy className="h-3 w-3" /> Copy link</button>
            </div>

            <section className="mt-4">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-[#94a3b8]">Description & details</h3>
              <p className="mt-1 text-[12px] leading-5 text-[#475569]">{item.description || 'Course details are provided by the training provider.'}</p>
            </section>

            <section className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#1e1b4b]">Classes & Courses Details</h3>
                <div className="flex flex-wrap gap-1">
                  {item.verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700">Admin approved</span>}
                  {item.demo && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">Demo listing</span>}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
                <DetailTile icon={<Building2 className="h-2.5 w-2.5" />} label="Delivery mode" value={item.mode} />
                <DetailTile icon={<MapPin className="h-2.5 w-2.5" />} label="Platform / campus" value={[item.area, item.city].filter(Boolean).join(', ') || 'Not provided'} />
                <DetailTile icon={<Users className="h-2.5 w-2.5" />} label="Batch capacity" value={capacityText} />
                <DetailTile icon={<Users className="h-2.5 w-2.5" />} label="Age group & level" value={item.ageGroup || 'All learners'} />
                <DetailTile icon={<CalendarDays className="h-2.5 w-2.5" />} label="Course duration" value={item.duration || 'Contact provider'} />
                <DetailTile icon={<Clock className="h-2.5 w-2.5" />} label="Timings & days" value={timingText} />
                <DetailTile icon={<Star className="h-2.5 w-2.5" />} label="Fee & installments" value={item.feePlans.length ? item.feePlans.map((plan) => `${plan.label}: ${plan.amount === 0 ? 'Free' : `${formatINR(plan.amount)}${unitLabel(plan.unit)}`}`).join(' · ') : (item.free ? 'Free' : courseFeeLabel(item))} />
                <DetailTile icon={<Award className="h-2.5 w-2.5" />} label="Certificate" value={item.certification || 'Provider certificate'} />
                <DetailTile icon={<BadgeCheck className="h-2.5 w-2.5" />} label="Eligibility" value={item.eligibility || 'Open to all'} />
                {item.startDate && <DetailTile icon={<CalendarDays className="h-2.5 w-2.5" />} label="Starts" value={item.startDate} />}
                {item.modeOptions.length > 0 && <DetailTile icon={<Video className="h-2.5 w-2.5" />} label="Available modes" value={item.modeOptions.join(' · ')} />}
                <DetailTile icon={<GraduationCap className="h-2.5 w-2.5" />} label="Faculty" value={[item.faculty.name, item.faculty.experience].filter(Boolean).join(' · ') || 'Real-time corporate trainers'} />
              </div>
            </section>

            {item.batches.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#ece8fb] p-3">
                <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Batches & timings</h3>
                <div className="mt-1.5 space-y-1.5">
                  {item.batches.map((batch) => (
                    <div key={`${batch.slot}-${batch.days}`} className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f3ff] px-2.5 py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#4c1d95]"><Clock className="h-3 w-3" /> {batch.slot} · {batch.days}</span>
                      <span className="text-[11px] font-semibold text-[#4c1d95]">{batch.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(item.faculty.name || item.faculty.photo || item.verified) && (
              <div className="mt-4 rounded-2xl border border-[#ece8fb] bg-[#faf9ff] p-3">
                <h3 className="inline-flex items-center gap-1 text-[12px] font-extrabold text-[#1e1b4b]"><Award className="h-3.5 w-3.5 text-[#7c3aed]" /> Verified teacher credentials</h3>
                <div className="mt-2 flex items-center gap-2">
                  {item.faculty.photo ? (
                    <SafeImage src={item.faculty.photo} alt={item.faculty.name || 'Faculty'} category="classes" className="h-10 w-10 rounded-full object-cover" sizes="40px" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f3ff] text-[11px] font-black text-[#6d28d9]">{(item.faculty.name || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-[#1e1b4b]">{item.faculty.name || 'Real-time corporate trainers'}</p>
                    <p className="truncate text-[10.5px] text-[#64748b]">{item.faculty.experience || 'Industry verified faculty'}</p>
                  </div>
                </div>
              </div>
            )}

            <div ref={reviewRef} id="course-reviews" className="mt-4 scroll-mt-4 rounded-2xl border border-[#ece8fb] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[12px] font-extrabold text-[#1e1b4b]">Reviews</h3>
                  <p className="text-[10px] text-[#64748b]">{displayReviewCount > 0 ? `${displayReviewCount} learner review${displayReviewCount === 1 ? '' : 's'}${typeof displayRating === 'number' ? ` · ${displayRating.toFixed(1)} average` : ''}` : 'No written reviews yet'}</p>
                </div>
                <button type="button" onClick={() => setShowReview((open) => !open)} className="inline-flex h-7 items-center gap-1 rounded-full border border-[#7c3aed]/30 bg-[#f5f3ff] px-2.5 text-[10px] font-black text-[#6d28d9]">
                  <Star className="h-3 w-3" /> Write a review
                </button>
              </div>

              {showReview && (
                <form onSubmit={submitReview} className="mt-2 rounded-xl border border-[#ece8fb] bg-[#faf9ff] p-2.5">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" onClick={() => setReviewRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={reviewRating === value} className="p-0.5">
                        <Star className={`h-4 w-4 ${value <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                      </button>
                    ))}
                  </div>
                  <input value={reviewName} onChange={(event) => setReviewName(event.target.value)} placeholder="Your name (optional)" className="mt-1.5 w-full rounded-lg border border-[#ece8fb] px-2 py-1.5 text-[11px] outline-none focus:border-[#7c3aed]" />
                  <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Share your experience with this course…" rows={2} required className="mt-1.5 w-full rounded-lg border border-[#ece8fb] px-2 py-1.5 text-[11px] outline-none focus:border-[#7c3aed]" />
                  <button type="submit" className="mt-1.5 inline-flex h-8 items-center gap-1 rounded-lg bg-[#7c3aed] px-3 text-[11px] font-black text-white"><MessageCircle className="h-3 w-3" /> Submit review</button>
                </form>
              )}

              {reviews.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-xl bg-[#f8fafc] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10.5px] font-bold text-[#1e1b4b]">{review.name}</span>
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {review.rating}.0</span>
                      </div>
                      <p className="mt-0.5 text-[10.5px] leading-4 text-[#475569]">{review.comment}</p>
                      <p className="mt-0.5 text-[9px] text-[#94a3b8]">{review.date}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl bg-[#f8fafc] px-2.5 py-2 text-[10.5px] text-[#64748b]">Be the first to review this course. Reviews are stored on this device in demo mode.</p>
              )}
            </div>
          </div>
        </div>

        {/* Fixed bottom bar: WhatsApp, Review, Enroll */}
        <footer className="shrink-0 border-t border-[#ece8fb] bg-white p-2.5 sm:p-3">
          <div className="grid grid-cols-3 gap-2">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp about this course" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-[11px] font-black text-emerald-800 hover:bg-emerald-100">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
            <button type="button" onClick={focusReviews} aria-label="Review this course" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#7c3aed]/30 bg-[#f5f3ff] text-[11px] font-black text-[#6d28d9] hover:bg-[#ede9fe]">
              <Star className="h-4 w-4" /> Review
            </button>
            <button type="button" onClick={onEnroll} aria-label="Select batch & enroll" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#7c3aed] text-[11px] font-black text-white hover:bg-[#6d28d9]">
              <GraduationCap className="h-4 w-4" /> Enroll
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px] leading-3 text-[#64748b]">
            {item.demo ? 'Demo only — no enquiry or payment was sent.' : 'Batches come from the trainer’s admin-approved calendar. Seat, fee and payment status are confirmed by the server.'}
          </p>
        </footer>
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
    providerPhone: listing.providerPhone || '',
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

export function ClassesTimingsExperience({ onClose, inline = false, listings = [], style = 'cards' }: ClassesTimingsExperienceProps) {
  const [activeStyle, setActiveStyle] = useState<'cards' | 'timetable' | 'style3'>(style);
  useEffect(() => { setActiveStyle(style); }, [style]);
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

      <SectionStyleTabs
        active={activeStyle === 'timetable' ? 2 : activeStyle === 'style3' ? 3 : 1}
        onChange={(value: SectionStyleNumber) => {
          const next = value === 1 ? 'cards' : value === 2 ? 'timetable' : 'style3';
          saveStylePreference('classes', next);
          setActiveStyle(next);
          window.location.hash = `classes/style${value}`;
        }}
        label="Classes display style"
        className="border-b border-[#ece8fb] bg-white/90"
      />

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
          ) : activeStyle === 'style3' ? (
            <StyleThreeList
              label="Classes style 3 list"
              items={results.map((course) => ({
                id: course.id,
                title: course.title,
                subtitle: [course.provider, course.area || course.city].filter(Boolean).join(' · '),
                meta: [course.mode, course.duration].filter(Boolean).join(' · '),
                price: course.free ? 'Free' : `₹${course.fee.toLocaleString('en-IN')}`,
                image: course.image || null,
                badge: course.demo ? 'Sample' : course.verified ? 'Verified' : undefined,
                onClick: () => setSelected(course),
              }))}
              emptyLabel="No courses match these filters."
            />
          ) : activeStyle === 'timetable' ? (
            <ClassTimetable courses={results} onOpen={setSelected} />
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
          key={selected.id}
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
