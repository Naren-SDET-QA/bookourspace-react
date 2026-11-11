import { useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  GraduationCap,
  Heart,
  MapPin,
  Phone,
  Share2,
  Star,
  TrendingUp,
  X,
} from 'lucide-react';
import SafeImage from '../SafeImage';
import { BOS_CALL_HREF, BOS_CONTACT_PHONE } from '../../lib/contactNumbers';
import { isCourseFavorite, toggleCourseFavorite } from '../../lib/courseFavorites';
import type { CourseListing } from '../../data/classesTimingsData';
import { FacultyProfileModal } from './FacultyProfileModal';

interface ClassesSpotlightCardsProps {
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
  onEnroll: (course: CourseListing) => void;
}

const feeLabel = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

function SpotlightCard({
  course,
  compared,
  onToggleCompare,
  onOpen,
  onEnroll,
  onOpenFaculty,
}: {
  course: CourseListing;
  compared: boolean;
  onToggleCompare: () => void;
  onOpen: () => void;
  onEnroll: () => void;
  onOpenFaculty: () => void;
}) {
  const [favorite, setFavorite] = useState(() => isCourseFavorite(course.id));
  const [shareNote, setShareNote] = useState('');
  const discount = course.originalFee && course.originalFee > course.fee
    ? Math.round((1 - course.fee / course.originalFee) * 100)
    : 0;

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: course.title, text: `${course.title} — ${course.provider}`, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Copied');
      window.setTimeout(() => setShareNote(''), 1600);
    } catch {
      setShareNote('Copy URL');
    }
  };

  return (
    <article aria-label={`Spotlight course ${course.title}`} className="overflow-hidden rounded-3xl border-2 border-[#6d28d9] bg-white shadow-[0_12px_32px_-22px_rgba(109,40,217,0.6)] dark:border-violet-700 dark:bg-slate-950">
      <div className="relative aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-slate-800">
        <SafeImage src={course.image} alt={course.title} category="classes" className="h-full w-full object-cover" priority />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#6d28d9] to-[#db2777] px-2.5 py-1 text-[9px] font-black text-white shadow">
          ✨ 🔥 SPOTLIGHT · LIVE BATCHES
        </span>
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
          <button type="button" onClick={() => void share()} aria-label="Share course" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#1e1b4b] shadow">
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setFavorite(toggleCourseFavorite(course.id))}
            aria-label={`${favorite ? 'Remove' : 'Save'} ${course.title}`}
            aria-pressed={favorite}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow"
          >
            <Heart className={`h-3.5 w-3.5 ${favorite ? 'fill-rose-600' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {shareNote && <span className="absolute right-2.5 top-12 rounded-md bg-slate-950/80 px-2 py-0.5 text-[8px] font-bold text-white">{shareNote}</span>}
        <div className="absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-slate-950/75 px-2 py-1 text-[9px] font-black text-white backdrop-blur-sm">
            <MapPin className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
            <span className="truncate">{course.area || course.city || 'Hyderabad'}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-pink-100/90 px-2 py-1 text-[9px] font-black text-pink-800 backdrop-blur-sm">
            <span className="truncate">{course.courseCode || course.title}</span>
          </span>
        </div>
      </div>

      <div className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-[9px] font-black uppercase tracking-wide text-[#4338CA] dark:text-violet-300">{course.category}</span>
          {course.highEnrollment && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">⚡ ⚡ HIGH ENROLLMENT</span>}
        </div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-black leading-5 text-[#1e1b4b] dark:text-white">{course.title}</h3>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black text-white">
            {course.rating?.toFixed(1) || '—'} <Star className="h-2.5 w-2.5 fill-white" aria-hidden="true" />
          </span>
          <span className="text-[10px] font-bold text-slate-500">({course.reviews || 0})</span>
          <span className="ml-auto flex min-w-0 items-center gap-1 text-[10px] font-black text-slate-500">
            <span className="truncate">{course.provider}</span>
            {course.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenFaculty}
          className="mt-1.5 flex w-full items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/60 px-2 py-1.5 text-left transition hover:border-violet-300 hover:bg-violet-100/70 dark:border-violet-900/60 dark:bg-violet-950/20"
          aria-label={`View faculty profile for ${course.faculty.name}`}
        >
          <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[#6d28d9]" aria-hidden="true" />
          <span className="min-w-0 truncate text-[9px] font-black text-[#4c1d95] dark:text-violet-200">Faculty: {course.faculty.name}</span>
          <span className="hidden truncate text-[8px] font-semibold text-slate-500 sm:inline">{course.faculty.title || 'Verified trainer'}</span>
          <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-[#6d28d9]" aria-hidden="true" />
        </button>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-xl font-black text-[#1e1b4b] dark:text-white">{feeLabel(course.fee)}</span>
          <span className="text-[10px] font-bold text-slate-400" title="Fee information">ⓘ</span>
          {course.originalFee && course.originalFee > course.fee && (
            <>
              <span className="text-[10px] font-bold text-slate-400 line-through">{feeLabel(course.originalFee)}</span>
              <span className="text-[10px] font-black text-emerald-600">{discount}% off</span>
            </>
          )}
          <span className="ml-auto text-[10px] font-bold text-slate-500">/{course.feeUnit || 'course'}</span>
        </div>

        <div className="mt-2 rounded-2xl border border-[#c4b5fd] bg-gradient-to-r from-[#f5f3ff] via-white to-[#ecfdf5] p-2.5 dark:border-violet-800 dark:from-violet-950/40 dark:via-slate-950 dark:to-emerald-950/20">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase leading-3 tracking-wide text-[#4338CA] dark:text-violet-200">
              <Award className="h-3.5 w-3.5" aria-hidden="true" /> Student Success &amp; Placements
            </p>
            <button type="button" onClick={onOpen} className="text-[9px] font-black text-emerald-700 dark:text-emerald-300">+ Stats &amp; Link</button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="rounded-xl border border-emerald-200 bg-white px-1 py-1.5 text-center dark:border-emerald-900 dark:bg-slate-900">
              <p className="text-[12px] font-black text-emerald-700 dark:text-emerald-300"><TrendingUp className="mr-0.5 inline h-3 w-3" />{course.placedPercent ?? '—'}%</p>
              <p className="text-[8px] font-bold text-slate-500">Placed</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white px-1 py-1.5 text-center dark:border-amber-900 dark:bg-slate-900">
              <p className="text-[12px] font-black text-amber-600"><Star className="mr-0.5 inline h-3 w-3 fill-amber-400" />{course.feedbackRating ?? course.rating ?? '—'}</p>
              <p className="text-[8px] font-bold text-slate-500">Feedback</p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-white px-1 py-1.5 text-center dark:border-violet-900 dark:bg-slate-900">
              <p className="text-[12px] font-black text-[#4338CA] dark:text-violet-300">{course.certifiedCount?.toLocaleString('en-IN') ?? '—'}+</p>
              <p className="text-[8px] font-bold text-slate-500">Certified</p>
            </div>
          </div>
        </div>

        <button type="button" onClick={onOpen} className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-red-600 px-2.5 py-2 text-left text-[10px] font-black text-white transition hover:bg-red-700">
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Current Running Batches</span>
          <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px]">{course.batches.length} batch{course.batches.length === 1 ? '' : 'es'}</span>
        </button>

        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={compared} onChange={onToggleCompare} className="h-3.5 w-3.5 accent-[#4338CA]" />
            Add to Compare
          </label>
          <a href={BOS_CALL_HREF} className="inline-flex items-center gap-1 text-[10px] font-black text-[#1d4ed8] dark:text-blue-300">
            <Phone className="h-3 w-3" aria-hidden="true" /> Call Owner
          </a>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={onOpen} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-amber-400 text-[11px] font-black text-slate-950 transition hover:bg-amber-300">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> Free Demo
          </button>
          <button type="button" onClick={onEnroll} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-orange-500 text-[11px] font-black text-white transition hover:bg-orange-600">
            ⚡ Book Seat
          </button>
        </div>
        <p className="mt-1 text-center text-[8px] font-semibold text-slate-400">No brokerage · Pay the institute directly after confirmation</p>
      </div>
    </article>
  );
}

export function ClassesSpotlightCards({ courses, onOpen, onEnroll }: ClassesSpotlightCardsProps) {
  const spotlight = useMemo(
    () => courses.filter((course) => course.highEnrollment || course.originalFee).slice(0, 4),
    [courses],
  );
  const [comparedIds, setComparedIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [facultyCourse, setFacultyCourse] = useState<CourseListing | null>(null);
  const comparedCourses = spotlight.filter((course) => comparedIds.includes(course.id));

  if (spotlight.length === 0) return null;

  return (
    <section aria-label="Spotlight live batches" className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-black text-[#1e1b4b] dark:text-white">Spotlight · Live Batches</h2>
          <p className="text-[10px] text-slate-500">Hand-picked courses with placement stats and running batches.</p>
        </div>
        {comparedIds.length > 0 && (
          <button type="button" onClick={() => setShowCompare(true)} className="shrink-0 rounded-lg bg-[#4338CA] px-2.5 py-1 text-[10px] font-black text-white">
            Compare ({comparedIds.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {spotlight.map((course) => (
          <SpotlightCard
            key={course.id}
            course={course}
            compared={comparedIds.includes(course.id)}
            onToggleCompare={() => setComparedIds((prev) => prev.includes(course.id) ? prev.filter((id) => id !== course.id) : [...prev, course.id])}
            onOpen={() => onOpen(course)}
            onEnroll={() => onEnroll(course)}
            onOpenFaculty={() => setFacultyCourse(course)}
          />
        ))}
      </div>

      {facultyCourse && (
        <FacultyProfileModal open course={facultyCourse} onClose={() => setFacultyCourse(null)} />
      )}

      {showCompare && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3" role="dialog" aria-modal="true" aria-label="Compare courses">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black">Compare Courses ({comparedCourses.length})</h3>
              <button type="button" onClick={() => setShowCompare(false)} aria-label="Close comparison" className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[10px]">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="p-2">Course</th>{comparedCourses.map((course) => <th key={course.id} className="p-2">{course.title}<button type="button" onClick={() => setComparedIds((prev) => prev.filter((id) => id !== course.id))} className="ml-1 text-rose-500">×</button></th>)}</tr></thead>
                <tbody>
                  {[
                    ['Provider', (course: CourseListing) => course.provider],
                    ['Fee', (course: CourseListing) => feeLabel(course.fee)],
                    ['Rating', (course: CourseListing) => `${course.rating ?? '—'} / 5`],
                    ['Mode', (course: CourseListing) => [course.mode, ...course.modeOptions].filter((v, i, a) => a.indexOf(v) === i).join(' + ')],
                    ['Duration', (course: CourseListing) => course.duration || 'On request'],
                    ['Batches', (course: CourseListing) => `${course.batches.length} running`],
                  ].map(([label, read]) => (
                    <tr key={String(label)} className="border-b border-slate-100 dark:border-slate-800">
                      <th className="p-2 font-black text-slate-500">{String(label)}</th>
                      {comparedCourses.map((course) => <td key={course.id} className="p-2 font-bold">{String((read as (c: CourseListing) => string)(course))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => setComparedIds([])} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-black dark:border-slate-700">Clear comparison</button>
          </div>
        </div>
      )}
    </section>
  );
}
