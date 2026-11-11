import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  GraduationCap,
  Heart,
  MapPin,
  Monitor,
  Phone,
  Share2,
  Star,
  Users,
  Video,
} from 'lucide-react';
import SafeImage from '../SafeImage';
import { BOS_CALL_HREF, BOS_CONTACT_PHONE } from '../../lib/contactNumbers';
import { isCourseFavorite, toggleCourseFavorite } from '../../lib/courseFavorites';
import type { CourseListing } from '../../data/classesTimingsData';
import { FacultyProfileModal } from './FacultyProfileModal';

interface ClassesStyleThreeDetailProps {
  course: CourseListing;
  onClose: () => void;
  onEnroll: () => void;
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
    /* The review stays visible for this session. */
  }
}

const feeLabel = (course: CourseListing): string => {
  if (course.free || course.fee === 0) return 'Free';
  return `₹${Math.round(course.fee).toLocaleString('en-IN')}`;
};

function modeIcon(mode: string) {
  if (/online/i.test(mode)) return <Video className="h-4 w-4" aria-hidden="true" />;
  if (/hybrid/i.test(mode)) return <Monitor className="h-4 w-4" aria-hidden="true" />;
  if (/recorded/i.test(mode)) return <Video className="h-4 w-4" aria-hidden="true" />;
  return <Building2 className="h-4 w-4" aria-hidden="true" />;
}

export function ClassesStyleThreeDetail({ course, onClose, onEnroll }: ClassesStyleThreeDetailProps) {
  const [facultyOpen, setFacultyOpen] = useState(false);
  const [reviews, setReviews] = useState<CourseReviewEntry[]>(() => loadCourseReviews(course.id));
  const [writingReview, setWritingReview] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [favorite, setFavorite] = useState(() => isCourseFavorite(course.id));

  const localAverage = reviews.length
    ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) * 10) / 10
    : null;
  const displayRating = localAverage ?? course.rating;
  const displayReviewCount = (course.reviews ?? 0) + reviews.length;
  const batch = course.batches[0];
  const phone = (course.providerPhone || '').replace(/\D/g, '');
  const modes = Array.from(new Set([course.mode, ...course.modeOptions].filter((mode) => mode && mode !== 'Not specified')));
  const modeText = modes.includes('Online') && modes.includes('Offline')
    ? 'Online + Offline'
    : modes.length > 1 ? modes.join(' + ') : modes[0] || course.mode;
  const level = course.level || course.eligibility || course.ageGroup || 'All levels';
  const location = [course.area, course.city].filter(Boolean).join(', ') || 'Location shared on enquiry';
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${course.provider} ${location}`)}`;
  const whatsappText = `Hi ${course.provider || 'there'}, I am interested in "${course.title}" at ${course.area}${course.city ? `, ${course.city}` : ''}. Is a demo/trial available?`;
  const whatsappHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}` : '';

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: course.title, text: `${course.title} — ${course.provider}`, url });
        return;
      }
    } catch {
      /* Fall back to clipboard. */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied');
      window.setTimeout(() => setShareNote(''), 2000);
    } catch {
      setShareNote('Copy the URL from the address bar');
    }
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
    saveCourseReview(course.id, entry);
    setReviewName('');
    setReviewComment('');
    setReviewRating(5);
    setWritingReview(false);
  };

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-white text-[#1e1b4b] dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="classes-style3-detail-title">
      <header className="sticky top-0 z-20 border-b border-[#ece8fb] bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Back to all classes" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece8fb] text-[#4c1d95] hover:bg-[#f5f3ff] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-black">Course Details</p>
          <button
            type="button"
            onClick={() => setFavorite(toggleCourseFavorite(course.id))}
            aria-label={`${favorite ? 'Remove' : 'Save'} ${course.title}`}
            aria-pressed={favorite}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece8fb] text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/20"
          >
            <Heart className={`h-4 w-4 ${favorite ? 'fill-rose-600' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => void share()} aria-label="Share course" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ece8fb] text-[#4c1d95] hover:bg-[#f5f3ff] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {shareNote && <div aria-live="polite" className="bg-emerald-50 px-4 py-1.5 text-center text-[10px] font-bold text-emerald-800">{shareNote}</div>}

      <main className="mx-auto max-w-3xl px-3 pb-28 pt-3">
        {(() => {
          const photos = (course.photos && course.photos.length > 0 ? course.photos : [course.image]).filter(Boolean);
          const mainPhoto = photos[0] || course.image;
          return (
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-1.5">
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
                <SafeImage src={mainPhoto} alt={course.title} category="classes" priority className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-slate-950/70 px-2 py-0.5 text-[9px] font-black text-white">1/{photos.length}</span>
                {course.verified && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-black text-white">
                    <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified
                  </span>
                )}
                {photos.length > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-lg bg-slate-950/75 px-2 py-1 text-[9px] font-black text-white">+{Math.max(0, photos.length - 3)} Photos</span>
                )}
              </div>
              <div className="grid grid-rows-2 gap-1.5">
                {[1, 2].map((index) => (
                  <div key={index} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                    <SafeImage src={photos[index] || mainPhoto} alt={`${course.title} photo ${index + 1}`} category="classes" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <h1 id="classes-style3-detail-title" className="mt-3 text-xl font-black leading-tight sm:text-2xl">{course.title}</h1>
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#64748b] dark:text-slate-400">
          <GraduationCap className="h-3.5 w-3.5 text-[#7c3aed]" aria-hidden="true" /> {course.provider}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {displayRating && displayRating > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-600">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" /> {displayRating.toFixed(1)}
              <span className="font-semibold text-slate-500">({displayReviewCount} reviews)</span>
            </span>
          ) : (
            <span className="rounded-full bg-[#f5f3ff] px-2 py-1 text-[9px] font-black text-[#6d28d9]">New course</span>
          )}
          <span className="rounded-full bg-[#f5f3ff] px-2 py-1 text-[9px] font-black text-[#6d28d9]">{course.category}</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[#ece8fb] p-2 text-center dark:border-slate-800">
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-[#6d28d9]">{modeIcon(modes[0] || course.mode)}</span>
            <p className="mt-1 text-[8px] font-black uppercase tracking-wide text-slate-400">Mode</p>
            <p className="mt-0.5 line-clamp-2 text-[9px] font-black">{modeText}</p>
          </div>
          <div className="rounded-xl border border-[#ece8fb] p-2 text-center dark:border-slate-800">
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-[#6d28d9]"><CalendarDays className="h-4 w-4" aria-hidden="true" /></span>
            <p className="mt-1 text-[8px] font-black uppercase tracking-wide text-slate-400">Batch</p>
            <p className="mt-0.5 line-clamp-2 text-[9px] font-black">{batch ? `Batch (${batch.days})` : course.startDate || 'On request'}</p>
          </div>
          <div className="rounded-xl border border-[#ece8fb] p-2 text-center dark:border-slate-800">
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-[#6d28d9]"><Award className="h-4 w-4" aria-hidden="true" /></span>
            <p className="mt-1 text-[8px] font-black uppercase tracking-wide text-slate-400">Level</p>
            <p className="mt-0.5 line-clamp-2 text-[9px] font-black">{level}</p>
          </div>
        </div>

        <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Faculty</h2>
          <button
            type="button"
            onClick={() => setFacultyOpen(true)}
            aria-label={`View faculty profile for ${course.faculty.name || 'faculty'}`}
            className="mt-2 flex w-full items-center gap-2.5 rounded-xl text-left transition hover:bg-[#faf8ff] dark:hover:bg-slate-900"
          >
            {course.faculty.photo ? (
              <SafeImage src={course.faculty.photo} alt={course.faculty.name || 'Faculty'} category="classes" className="h-12 w-12 rounded-full object-cover ring-2 ring-[#ddd6fe]" sizes="48px" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f3ff] text-[12px] font-black text-[#6d28d9]">
                {(course.faculty.name || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-black">{course.faculty.name || 'Faculty shared on enquiry'}</p>
              <p className="truncate text-[9px] font-semibold text-slate-500">{course.faculty.title || 'Verified trainer'}</p>
              <p className="truncate text-[9px] font-semibold text-slate-500">{course.faculty.experience || 'Experience shared on enquiry'}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#7c3aed]" aria-hidden="true" />
          </button>
        </section>

        <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Course Overview</h2>
          <p className="mt-1.5 whitespace-pre-line text-[11px] leading-5 text-[#475569] dark:text-slate-300">{course.description || 'Course details are shared by the training provider.'}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[#ece8fb] pt-2 text-[9px] dark:border-slate-800">
            <div><p className="font-black uppercase tracking-wide text-slate-400">Duration</p><p className="mt-0.5 font-black">{course.duration || 'On request'}</p></div>
            <div><p className="font-black uppercase tracking-wide text-slate-400">Mode</p><p className="mt-0.5 font-black">{modeText}</p></div>
            <div><p className="font-black uppercase tracking-wide text-slate-400">Language</p><p className="mt-0.5 font-black">{course.language || 'Shared on enquiry'}</p></div>
          </div>
        </section>

        {course.syllabus && course.syllabus.length > 0 && (
          <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Syllabus</h2>
              <span className="text-[10px] font-black text-[#6d28d9] dark:text-violet-300">View Full Syllabus</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {course.syllabus.map((module) => (
                <div key={module} className="flex items-start gap-2 rounded-lg bg-[#faf9ff] px-2 py-1.5 text-[10px] font-semibold text-[#475569] dark:bg-slate-900 dark:text-slate-300">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#7c3aed]" aria-hidden="true" />
                  <span>{module}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Batches &amp; Timings</h2>
          {course.batches.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {course.batches.map((item, index) => (
                <div key={`${item.slot}-${item.days}-${index}`} className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${index === 0 ? 'border-[#7c3aed] bg-[#f5f3ff]' : 'border-[#ece8fb] bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black">{item.slot === 'Evening' ? 'Regular Batch' : item.slot === 'Weekend' ? 'Weekend Batch' : item.slot || 'Batch'} · {item.days}</p>
                    <p className="text-[9px] font-semibold text-slate-500">{item.label}</p>
                  </div>
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${index === 0 ? 'border-[#7c3aed] bg-[#7c3aed]' : 'border-slate-300'}`} aria-hidden="true" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-slate-500">Timing is shared by the institute on enquiry.</p>
          )}
          {course.startDate && <p className="mt-2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">Next batch: {course.startDate}</p>}
        </section>

        <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Fees &amp; Offers</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-[#f5f3ff] p-2.5">
              <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Course fee</p>
              <p className="mt-0.5 text-lg font-black text-[#6d28d9] dark:text-violet-300">{feeLabel(course)}</p>
              {!course.free && <p className="text-[9px] font-semibold text-slate-500">per {course.feeUnit || 'course'}</p>}
            </div>
            {course.earlyBird ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Offer</p>
                <p className="mt-0.5 text-[11px] font-black text-emerald-800 dark:text-emerald-200">{course.earlyBird}</p>
              </div>
            ) : course.feePlans.filter((plan) => plan.amount !== course.fee || plan.label !== 'Course Fee').map((plan, index) => (
              <div key={`${plan.label}-${index}`} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                <p className="text-[9px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{plan.label || `Plan ${index + 1}`}</p>
                <p className="mt-0.5 text-sm font-black text-emerald-800 dark:text-emerald-200">₹{Math.round(plan.amount).toLocaleString('en-IN')}</p>
                <p className="text-[9px] font-semibold text-emerald-700/80 dark:text-emerald-300/80">{plan.unit || course.feeUnit}{plan.mode ? ` · ${plan.mode}` : ''}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] text-slate-500">Any discount or offer is confirmed by the institute; no discount is assumed by BookOurSpace.</p>
        </section>

        <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Location</h2>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#475569] dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 text-[#7c3aed]" aria-hidden="true" /> {location}
          </p>
          {typeof course.lat === 'number' && typeof course.lng === 'number' ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-[#ece8fb] dark:border-slate-700">
              <iframe
                title={`Map for ${course.title}`}
                loading="lazy"
                className="h-48 w-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${course.lng - 0.008}%2C${course.lat - 0.008}%2C${course.lng + 0.008}%2C${course.lat + 0.008}&layer=mapnik&marker=${course.lat}%2C${course.lng}`}
              />
            </div>
          ) : null}
          <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-[10px] font-black text-[#6d28d9] underline dark:text-violet-300">
            View on Map
          </a>
        </section>

        <section className="mt-3 rounded-2xl border border-[#ece8fb] p-3 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Reviews ({displayReviewCount})</h2>
            <button type="button" onClick={() => setWritingReview((value) => !value)} className="text-[10px] font-black text-[#6d28d9] dark:text-violet-300">
              {writingReview ? 'Cancel' : 'Write a review'}
            </button>
          </div>
          {writingReview && (
            <form onSubmit={submitReview} className="mt-2 space-y-1.5 rounded-xl bg-[#faf9ff] p-2 dark:bg-slate-900">
              <input value={reviewName} onChange={(event) => setReviewName(event.target.value)} placeholder="Your name" className="w-full rounded-lg border border-[#ece8fb] px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800" />
              <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))} className="w-full rounded-lg border border-[#ece8fb] px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800">
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? '' : 's'}</option>)}
              </select>
              <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={2} placeholder="Your experience" className="w-full resize-none rounded-lg border border-[#ece8fb] px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-800" />
              <button type="submit" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-[#7c3aed] px-2.5 text-[10px] font-black text-white"><Check className="h-3 w-3" aria-hidden="true" /> Submit review</button>
            </form>
          )}
          {course.featuredReview && (
            <div className="mt-2 rounded-xl bg-[#faf9ff] p-2 dark:bg-slate-900">
              <p className="flex items-center gap-1 text-[10px] font-black">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[8px] text-violet-700">{(course.featuredReview.name || 'S').slice(0, 1)}</span>
                {course.featuredReview.name}
                <span className="text-amber-500">{'★'.repeat(course.featuredReview.rating)}</span>
                <span className="ml-auto text-[8px] font-semibold text-slate-400">{course.featuredReview.date}</span>
              </p>
              <p className="mt-1 text-[9px] text-slate-500">{course.featuredReview.comment}</p>
            </div>
          )}
          {reviews.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {reviews.slice(0, 3).map((review) => (
                <div key={review.id} className="rounded-xl bg-[#faf9ff] p-2 dark:bg-slate-900">
                  <p className="flex items-center gap-1 text-[10px] font-black">{review.name} <span className="text-amber-500">{'★'.repeat(review.rating)}</span></p>
                  <p className="text-[9px] text-slate-500">{review.comment}</p>
                  <p className="mt-0.5 text-[8px] text-slate-400">{review.date}</p>
                </div>
              ))}
            </div>
          ) : displayRating && displayRating > 0 ? (
            <p className="mt-2 text-[10px] text-slate-500">Rated {displayRating.toFixed(1)} by {displayReviewCount} learners. Written reviews are not published yet.</p>
          ) : (
            <p className="mt-2 text-[10px] text-slate-500">No reviews yet. Be the first to share your experience.</p>
          )}
        </section>
      </main>

      <div className="sticky bottom-0 z-20 border-t border-[#ece8fb] bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-3xl grid-cols-2 gap-2">
          {phone ? (
            <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#7c3aed] text-xs font-black text-[#6d28d9] dark:border-violet-700 dark:text-violet-300">
              <Phone className="h-4 w-4" aria-hidden="true" /> Call Institute
            </a>
          ) : whatsappHref ? (
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#7c3aed] text-xs font-black text-[#6d28d9] dark:border-violet-700 dark:text-violet-300">
              <Phone className="h-4 w-4" aria-hidden="true" /> Contact Institute
            </a>
          ) : (
            <a
              href={BOS_CALL_HREF}
              title="Call the BookOurSpace institute desk"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#7c3aed] text-xs font-black text-[#6d28d9] dark:border-violet-700 dark:text-violet-300"
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> Call Institute · {BOS_CONTACT_PHONE}
            </a>
          )}
          <button type="button" onClick={onEnroll} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#7c3aed] text-xs font-black text-white transition hover:bg-[#6d28d9]">
            Enroll Now
          </button>
        </div>
      </div>
      <FacultyProfileModal open={facultyOpen} course={course} onClose={() => setFacultyOpen(false)} />
    </div>
  );
}
