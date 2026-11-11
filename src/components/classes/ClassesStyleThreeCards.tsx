import { useState } from 'react';
import { BadgeCheck, CalendarDays, Clock, GraduationCap, Heart, MapPin, Star, Users } from 'lucide-react';
import SafeImage from '../SafeImage';
import { isCourseFavorite, toggleCourseFavorite } from '../../lib/courseFavorites';
import type { CourseListing } from '../../data/classesTimingsData';

interface ClassesStyleThreeCardsProps {
  courses: CourseListing[];
  onOpen: (course: CourseListing) => void;
}

const feeLabel = (course: CourseListing): string => {
  if (course.free || course.fee === 0) return 'Free';
  const amount = `₹${Math.round(course.fee).toLocaleString('en-IN')}`;
  const unit = course.feeUnit === 'course' ? '/course' : course.feeUnit === 'month' ? '/month' : course.feeUnit === 'hour' ? '/hour' : '/session';
  return course.liveCalendar ? `From ${amount}${unit}` : amount;
};

function modeDisplay(course: CourseListing): string {
  const options = new Set([course.mode, ...course.modeOptions]);
  if (options.has('Online') && options.has('Offline')) return 'Online + Offline';
  if (options.has('Online') && options.has('Recorded')) return 'Online + Recorded';
  return course.modeOptions.length > 1 ? course.modeOptions.join(' + ') : course.mode;
}

export function ClassesStyleThreeCards({ courses, onOpen }: ClassesStyleThreeCardsProps) {
  const [, setFavoritesVersion] = useState(0);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {courses.map((course) => {
        const batch = course.batches[0];
        const liveBatchCount = course.liveBatchCount ?? course.batches.length;
        const favorite = isCourseFavorite(course.id);
        return (
          <article
            key={course.id}
            aria-label={`Course listing ${course.title}`}
            className="group overflow-hidden rounded-2xl border border-[#ece8fb] bg-white shadow-[0_2px_10px_rgba(91,33,182,0.05)] transition hover:shadow-[0_10px_26px_rgba(91,33,182,0.14)]"
          >
            <button type="button" onClick={() => onOpen(course)} className="relative block aspect-[16/9] w-full overflow-hidden text-left">
              <SafeImage src={course.image} alt={course.title} category="classes" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 640px) 92vw, 560px" />
              <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[9px] font-black text-white shadow-sm">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" /> {course.liveCalendar
                  ? `${liveBatchCount} live batch${liveBatchCount === 1 ? '' : 'es'}`
                  : course.verified ? 'Verified' : course.demo ? 'Sample' : 'Listed'}
              </span>
              <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-black text-violet-700 shadow-sm">
                {modeDisplay(course)}
              </span>
              {typeof course.rating === 'number' && course.rating > 0 && (
                <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded-full bg-slate-950/65 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                  <Star className="h-2.5 w-2.5 fill-amber-300 text-amber-300" aria-hidden="true" /> {course.rating.toFixed(1)}
                  {typeof course.reviews === 'number' && <span className="text-white/75">({course.reviews})</span>}
                </span>
              )}
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label={`${favorite ? 'Remove' : 'Save'} ${course.title}`}
                aria-pressed={favorite}
                onClick={() => {
                  toggleCourseFavorite(course.id);
                  setFavoritesVersion((value) => value + 1);
                }}
                className="absolute -top-5 right-2.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-md"
              >
                <Heart className={`h-4 w-4 ${favorite ? 'fill-rose-600' : ''}`} aria-hidden="true" />
              </button>

              <div className="p-3">
                <button type="button" onClick={() => onOpen(course)} className="block w-full text-left">
                  <h3 className="line-clamp-2 text-[14px] font-black leading-5 text-[#1e1b4b]">{course.title}</h3>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-[#64748b]">
                    <GraduationCap className="h-3 w-3 text-violet-700" aria-hidden="true" /> {course.provider}
                  </p>
                </button>

                <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#faf9ff] p-2">
                  {course.faculty.photo ? (
                    <SafeImage src={course.faculty.photo} alt={course.faculty.name || 'Faculty'} category="classes" className="h-8 w-8 shrink-0 rounded-full object-cover" sizes="32px" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-black text-violet-700">
                      {(course.faculty.name || 'T').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-black text-[#1e1b4b]">{course.faculty.name || 'Faculty shared on enquiry'}</p>
                    <p className="truncate text-[8px] font-semibold text-[#94a3b8]">{course.faculty.experience || 'Verified trainer'}</p>
                  </div>
                  {batch && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-1.5 py-1 text-[8px] font-black text-amber-800">
                      <Clock className="h-2.5 w-2.5" aria-hidden="true" /> {batch.days} · {batch.label}
                    </span>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[9px] font-bold text-[#475569]">
                  <span className="flex flex-col rounded-lg bg-[#f5f3ff] px-1.5 py-1">
                    <span className="flex items-center gap-1 font-black text-[#1e1b4b]"><Star className="h-2.5 w-2.5 text-violet-600" aria-hidden="true" /> {feeLabel(course)}</span>
                    <span className="text-[7px] font-semibold uppercase tracking-wide text-slate-400">Course Fee</span>
                  </span>
                  <span className="flex min-w-0 flex-col rounded-lg bg-[#f5f3ff] px-1.5 py-1">
                    <span className="flex min-w-0 items-center gap-1 font-black text-[#1e1b4b]"><MapPin className="h-2.5 w-2.5 shrink-0 text-violet-600" aria-hidden="true" /><span className="truncate">{course.area || course.city || 'Online'}</span></span>
                    <span className="text-[7px] font-semibold uppercase tracking-wide text-slate-400">{course.city || 'Location'}</span>
                  </span>
                  <span className="flex flex-col rounded-lg bg-[#f5f3ff] px-1.5 py-1">
                    <span className="flex items-center gap-1 font-black text-[#1e1b4b]"><CalendarDays className="h-2.5 w-2.5 text-violet-600" aria-hidden="true" /> {course.startDate || 'Next batch'}</span>
                    <span className="text-[7px] font-semibold uppercase tracking-wide text-slate-400">Next Batch</span>
                  </span>
                </div>

                {course.seats !== null && (
                  <p className="mt-1.5 flex items-center gap-1 text-[8.5px] font-bold text-slate-500">
                    <Users className="h-2.5 w-2.5" aria-hidden="true" /> {course.seats} {course.liveCalendar ? 'seats left' : 'seats'}
                  </p>
                )}

                <button
                  type="button"
                  aria-label={`View ${course.title}`}
                  onClick={() => onOpen(course)}
                  className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-xl bg-[#7c3aed] text-[11px] font-black text-white transition hover:bg-[#6d28d9]"
                >
                  View Details <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
