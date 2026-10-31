import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Award,
  TrendingUp,
  Star,
  ExternalLink,
  Upload,
  CheckCircle2,
  BookOpen,
  Sparkles,
  Edit3,
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { useMarketplace } from '../context/MarketplaceContext';
import { AppLanguage, getListingTitle } from '../utils/translations';

interface CourseCalendarModalProps {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onEnrollDate?: (listing: MarketplaceListing, selectedStartDate: string) => void;
  currentLang?: AppLanguage;
}

export const CourseCalendarModal: React.FC<CourseCalendarModalProps> = ({
  listing,
  onClose,
  onEnrollDate,
  currentLang = 'en',
}) => {
  const { updateListing } = useMarketplace();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDayIso, setSelectedDayIso] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'calendar' | 'student_success'>('calendar');
  const [isEditingSuccess, setIsEditingSuccess] = useState(false);

  const defaultPlacementRate = String(
    listing?.customFieldValues?.placementRate || '94%'
  );
  const defaultAvgFeedback = String(
    listing?.customFieldValues?.avgFeedbackScore ||
      listing?.providerRating ||
      '4.9'
  );
  const defaultCertifiedCount = String(
    listing?.customFieldValues?.certifiedCount || '1,420+'
  );
  const defaultPlacementUrl = String(
    listing?.customFieldValues?.placementReportUrl ||
      'https://placements.bookourspace.in/verified-report-2026.pdf'
  );
  const defaultTopHiring = String(
    listing?.customFieldValues?.topRecruiters ||
      'TCS, Infosys, Accenture, Amazon, Deloitte'
  );

  const [placementRate, setPlacementRate] = useState(defaultPlacementRate);
  const [avgFeedback, setAvgFeedback] = useState(defaultAvgFeedback);
  const [certifiedCount, setCertifiedCount] = useState(defaultCertifiedCount);
  const [placementUrl, setPlacementUrl] = useState(defaultPlacementUrl);
  const [topHiring, setTopHiring] = useState(defaultTopHiring);
  const [savedNotice, setSavedNotice] = useState(false);

  const calendarData = useMemo(() => {
    const base = new Date();
    const viewDate = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const monthLabel = viewDate.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Deterministic course schedule per month:
    // Start Dates: 1st, 5th, 10th, 15th, 22nd
    // Exam Dates: 14th, 28th
    // Off-Days: Sundays (dayOfWeek === 0) and 2nd Saturday (day === 12)
    const startDays = new Set([1, 5, 10, 15, 22]);
    const examDays = new Set([14, 28]);

    const days: Array<{
      day: number;
      iso: string;
      type: 'start' | 'exam' | 'off' | 'class';
      label: string;
    }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      const dow = dt.getDay();
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (dow === 0 || d === 12) {
        days.push({
          day: d,
          iso,
          type: 'off',
          label: dow === 0 ? 'Weekly Off (Sunday)' : 'Academic Holiday / Lab Maintenance',
        });
      } else if (startDays.has(d)) {
        days.push({
          day: d,
          iso,
          type: 'start',
          label: `New Batch Starts (${d === 1 || d === 15 ? 'Morning & Evening' : 'Fast-Track Batch'})`,
        });
      } else if (examDays.has(d)) {
        days.push({
          day: d,
          iso,
          type: 'exam',
          label: d === 14 ? 'Mid-Module Assessment & Mock Test' : 'Final Certification Exam & Project Viva',
        });
      } else {
        days.push({
          day: d,
          iso,
          type: 'class',
          label: 'Regular Live Classroom & Hands-on Lab Session',
        });
      }
    }

    return {
      monthLabel,
      firstDayIndex,
      days,
    };
  }, [monthOffset]);

  if (!listing) return null;

  const title = getListingTitle(listing, currentLang);
  const selectedDayObj =
    calendarData.days.find((d) => d.iso === selectedDayIso) ||
    calendarData.days.find((d) => d.type === 'start') ||
    calendarData.days[0];

  const handleSaveStudentSuccess = () => {
    updateListing(listing.id, {
      customFieldValues: {
        ...listing.customFieldValues,
        placementRate,
        avgFeedbackScore: avgFeedback,
        certifiedCount,
        placementReportUrl: placementUrl,
        topRecruiters: topHiring,
      },
    });
    setIsEditingSuccess(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#3730A3] via-indigo-800 to-purple-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                {currentLang === 'te'
                  ? 'కోర్సు క్యాలెండర్ & స్టూడెంట్ సక్సెస్'
                  : 'Academic Course Calendar & Student Success'}
              </span>
              <h3 className="text-sm sm:text-base font-black truncate">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-[#3730A3] text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {currentLang === 'te'
                ? '📅 బ్యాచ్ & పరీక్షల క్యాలెండర్'
                : '📅 Monthly Course Calendar'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('student_success')}
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'student_success'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>
              {currentLang === 'te'
                ? '🎓 స్టూడెంట్ సక్సెస్ & ప్లేస్‌మెంట్స్'
                : '🎓 Student Success & Placements'}
            </span>
          </button>
        </div>

        {activeTab === 'calendar' ? (
          <div className="p-5 space-y-4">
            {/* Month Navigator */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m - 1)}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-center">
                <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  {calendarData.monthLabel}
                </div>
                <div className="text-[10px] text-slate-500">
                  {currentLang === 'te'
                    ? 'ప్రారంభ తేదీలు, పరీక్షల తేదీలు & సెలవులు'
                    : 'Batch Start Dates • Assessment Exams • Off-Days'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m + 1)}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Color Legend */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>{currentLang === 'te' ? 'బ్యాచ్ ప్రారంభం (Start Date)' : 'Batch Start Date'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>{currentLang === 'te' ? 'పరీక్ష తేదీ (Exam Date)' : 'Exam / Assessment'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>{currentLang === 'te' ? 'సెలవు (Off-Day)' : 'Off-Day / Holiday'}</span>
              </span>
            </div>

            {/* 7-Column Monthly Grid */}
            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-400 mb-1.5">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: calendarData.firstDayIndex }).map((_, idx) => (
                  <div key={`pad-${idx}`} className="h-10" />
                ))}
                {calendarData.days.map((item) => {
                  const isSelected = selectedDayObj?.iso === item.iso;
                  const cellStyle =
                    item.type === 'start'
                      ? 'bg-emerald-500 text-white border-emerald-600 font-black shadow-xs'
                      : item.type === 'exam'
                      ? 'bg-amber-400 text-slate-950 border-amber-500 font-black shadow-xs'
                      : item.type === 'off'
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-800 font-bold'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 font-semibold';

                  return (
                    <button
                      key={item.iso}
                      type="button"
                      onClick={() => setSelectedDayIso(item.iso)}
                      className={`h-10 rounded-xl border text-xs flex flex-col items-center justify-center relative transition cursor-pointer ${cellStyle} ${
                        isSelected ? 'ring-2 ring-indigo-600 scale-105 z-10' : 'hover:scale-102'
                      }`}
                    >
                      <span>{item.day}</span>
                      <span className="text-[8px] leading-none uppercase opacity-90">
                        {item.type === 'start'
                          ? 'START'
                          : item.type === 'exam'
                          ? 'EXAM'
                          : item.type === 'off'
                          ? 'OFF'
                          : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Schedule Details */}
            {selectedDayObj && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-slate-800/80 border border-indigo-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300">
                    Schedule for {selectedDayObj.iso}
                  </div>
                  <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-0.5">
                    {selectedDayObj.label}
                  </div>
                </div>
                {onEnrollDate && (
                  <button
                    type="button"
                    onClick={() => {
                      onEnrollDate(listing, selectedDayObj.iso);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl bg-[#3730A3] hover:bg-indigo-800 text-white text-xs font-black shrink-0 cursor-pointer shadow-xs"
                  >
                    {currentLang === 'te' ? 'ఈ బ్యాచ్‌లో చేరండి →' : 'Enroll for This Date →'}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Student Success & Placement Stats Section */
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Verified Student Success & Placement Outcomes</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Live placement statistics, student feedback ratings & certification milestones
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingSuccess((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center gap-1 border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditingSuccess ? 'Cancel Edit' : 'Provider: Update Stats'}</span>
              </button>
            </div>

            {savedNotice && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Student Success & Placement stats updated on this course listing!</span>
              </div>
            )}

            {/* 3 KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center">
                <TrendingUp className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300">
                  {placementRate}
                </div>
                <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  Placement Rate
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-center">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400 mx-auto mb-1" />
                <div className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-300">
                  {avgFeedback} / 5.0
                </div>
                <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  Avg Student Feedback
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-center">
                <Award className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
                <div className="text-lg sm:text-xl font-black text-indigo-700 dark:text-indigo-300">
                  {certifiedCount}
                </div>
                <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  Certified Alumni
                </div>
              </div>
            </div>

            {/* Hiring Partners & Placement Proof Link */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-700 dark:text-slate-300">
                  🏢 Top Hiring Companies:
                </span>
                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                  {topHiring}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700">
                <span className="font-bold text-slate-600 dark:text-slate-400">
                  📄 Placement Audit & Certification Report:
                </span>
                <a
                  href={placementUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-black text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <span>View Placement Report</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Provider Upload / Update Form */}
            {isEditingSuccess && (
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-slate-800 border border-indigo-200 dark:border-slate-700 space-y-3">
                <div className="text-xs font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  <span>Provider: Upload or Link Student Success & Placement Stats</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Placement Rate (%)
                    </label>
                    <input
                      type="text"
                      value={placementRate}
                      onChange={(e) => setPlacementRate(e.target.value)}
                      placeholder="e.g. 96%"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Avg Feedback Score
                    </label>
                    <input
                      type="text"
                      value={avgFeedback}
                      onChange={(e) => setAvgFeedback(e.target.value)}
                      placeholder="e.g. 4.9"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Certifications Issued
                    </label>
                    <input
                      type="text"
                      value={certifiedCount}
                      onChange={(e) => setCertifiedCount(e.target.value)}
                      placeholder="e.g. 1,850+"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Top Hiring Partners
                  </label>
                  <input
                    type="text"
                    value={topHiring}
                    onChange={(e) => setTopHiring(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Placement Report / Certification Verification URL
                  </label>
                  <input
                    type="url"
                    value={placementUrl}
                    onChange={(e) => setPlacementUrl(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveStudentSuccess}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
                  >
                    ✓ Save Student Success Stats
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
