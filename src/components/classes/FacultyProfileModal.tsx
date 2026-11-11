import { useEffect } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  MessageCircle,
  Phone,
  Quote,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react';
import SafeImage from '../SafeImage';
import { BOS_CALL_HREF, whatsappHref } from '../../lib/contactNumbers';
import type { CourseListing } from '../../data/classesTimingsData';

interface FacultyProfileModalProps {
  open: boolean;
  course: CourseListing;
  onClose: () => void;
}

export function FacultyProfileModal({ open, course, onClose }: FacultyProfileModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const faculty = course.faculty;
  const rating = faculty.rating ?? course.rating ?? 0;
  const batches = course.batches.length;
  const certifications = faculty.certifications || [];
  const achievements = faculty.achievements || [];
  const bio = faculty.bio
    || `${faculty.name} is a verified instructor for ${course.title} with ${faculty.experience} of teaching experience.`;
  const whatsapp = whatsappHref(`Hi, I would like to know more about ${course.title} with ${faculty.name}.`);

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/65 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="faculty-profile-title"
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/70 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:rounded-3xl sm:p-5"
      >
        <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-[#6d28d9] dark:bg-violet-950/60 dark:text-violet-300">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="faculty-profile-title" className="text-[17px] font-black leading-5 text-slate-900 dark:text-white">Faculty Profile &amp; Portfolio</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Verified Instructor Credentials</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close faculty profile" className="shrink-0 rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <section className="mt-4 rounded-2xl bg-gradient-to-br from-[#e0e7ff] to-[#ede9fe] p-3 dark:from-violet-950/50 dark:to-indigo-950/40">
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <SafeImage src={faculty.photo} alt={faculty.name} category="general" className="h-[72px] w-[72px] rounded-full border-2 border-violet-300 object-cover shadow-sm" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#4f46e5] text-white dark:border-slate-950">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="text-[17px] font-black leading-5 text-[#1e1b4b] dark:text-white">{faculty.name}</h3>
              {faculty.title && <p className="text-[11px] font-black text-[#4f46e5] dark:text-violet-300">{faculty.title}</p>}
              {faculty.qualification && <p className="mt-0.5 text-[10px] font-semibold leading-4 text-slate-600 dark:text-slate-300">{faculty.qualification}</p>}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-violet-200/70 pt-2.5 dark:border-violet-800/60">
            <div className="text-center">
              <Clock className="mx-auto h-3.5 w-3.5 text-[#4f46e5] dark:text-violet-300" aria-hidden="true" />
              <p className="mt-0.5 text-[11px] font-black text-[#1e1b4b] dark:text-white">{faculty.experience.replace(/\s*(Years? Experience|yrs?)\s*/i, '') || '—'} Yrs</p>
              <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">Experience</p>
            </div>
            <div className="text-center">
              <Users className="mx-auto h-3.5 w-3.5 text-[#4f46e5] dark:text-violet-300" aria-hidden="true" />
              <p className="mt-0.5 text-[11px] font-black text-[#1e1b4b] dark:text-white">{faculty.studentsTaught ?? '—'}+</p>
              <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">Students</p>
            </div>
            <div className="text-center">
              <Star className="mx-auto h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <p className="mt-0.5 text-[11px] font-black text-[#1e1b4b] dark:text-white">{rating ? rating.toFixed(2) : '—'}</p>
              <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">Rating</p>
            </div>
            <div className="text-center">
              <BookOpen className="mx-auto h-3.5 w-3.5 text-[#4f46e5] dark:text-violet-300" aria-hidden="true" />
              <p className="mt-0.5 text-[11px] font-black text-[#1e1b4b] dark:text-white">{batches} Batches</p>
              <p className="text-[7px] font-bold uppercase tracking-wide text-slate-500">Courses</p>
            </div>
          </div>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={BOS_CALL_HREF} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-rose-50 text-[11px] font-black text-rose-600 transition hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call Desk
          </a>
          <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-[11px] font-black text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
          </a>
        </div>

        <section className="mt-4">
          <h3 className="text-[12px] font-black text-[#4f46e5] dark:text-violet-300">Biography &amp; Background</h3>
          <p className="mt-1.5 text-[11px] font-medium leading-5 text-slate-700 dark:text-slate-300">{bio}</p>
          {faculty.philosophy && (
            <blockquote className="mt-2.5 rounded-xl bg-rose-100/80 p-2.5 text-[10px] font-semibold italic leading-4 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
              <Quote className="mr-1 inline h-3 w-3" aria-hidden="true" />
              <span className="text-[8px] font-black uppercase tracking-wide">Teaching philosophy</span>
              <br />“{faculty.philosophy}”
            </blockquote>
          )}
        </section>

        {certifications.length > 0 && (
          <section className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-black text-[#4f46e5] dark:text-violet-300">Official Certifications &amp; Credentials</h3>
              <span className="text-[9px] font-black text-[#4f46e5] dark:text-violet-300">{certifications.length} Verified</span>
            </div>
            <ul className="mt-2 space-y-2">
              {certifications.map((certification) => (
                <li key={certification} className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-hidden="true" />
                    <span className="text-[10px] font-bold leading-4 text-slate-700 dark:text-slate-200">{certification}</span>
                  </span>
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-emerald-600 text-white" aria-hidden="true" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {achievements.length > 0 && (
          <section className="mt-4 pb-2">
            <h3 className="text-[12px] font-black text-[#4f46e5] dark:text-violet-300">Honors &amp; Key Achievements</h3>
            <ul className="mt-2 space-y-2">
              {achievements.map((achievement) => (
                <li key={achievement} className="flex items-start gap-2 text-[10px] font-bold leading-4 text-slate-700 dark:text-slate-200">
                  <Award className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                  {achievement}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
      </div>
    </div>
  );
}
