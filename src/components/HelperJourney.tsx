import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Headphones,
  MapPin,
  Mic,
  Navigation,
  Package,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Timer,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';

/**
 * "Need Helper" — a BookOurSpace-branded, Noddyy-style on-demand helper
 * journey: describe → book → plan → review → confirm.
 *
 * Everything is local state; no new tables, no new backend routes. Confirming
 * just advances to the success screen so the flow can be demoed end-to-end
 * inside the Services section.
 */

interface HelperJourneyProps {
  onClose: () => void;
  /** Render inside the page flow rather than as a fixed overlay. */
  inline?: boolean;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface TaskType {
  id: string;
  label: string;
  hint: string;
  emoji: string;
}

const TASK_TYPES: TaskType[] = [
  { id: 'grocery', label: 'Grocery Shopping', hint: 'Groceries, vegetables, medicines', emoji: '🛒' },
  { id: 'food', label: 'Food Pickup', hint: 'Restaurant or café pickup', emoji: '🍱' },
  { id: 'home', label: 'Home Supplies', hint: 'Hardware, stationery, essentials', emoji: '🏠' },
  { id: 'courier', label: 'Courier & Parcel', hint: 'Pickup and drop-off', emoji: '📦' },
  { id: 'queue', label: 'Queue Standing', hint: 'Wait in line on your behalf', emoji: '🕐' },
  { id: 'errand', label: 'Everyday Errand', hint: 'Anything else, just ask', emoji: '✅' },
];

const DURATIONS = [
  { id: '1', label: '1 hour', hours: 1 },
  { id: '2', label: '2 hours', hours: 2 },
  { id: '3', label: '3 hours', hours: 3 },
  { id: '4', label: 'Full day', hours: 8 },
];

const HELPER_RATE = 99; // ₹ / hour
const PLATFORM_FEE = 29;
const CONVENIENCE_FEE = 12;

function inr(value: number): string {
  return `₹${value.toFixed(2)}`;
}

function Stepper({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    1: 'Describe',
    2: 'Book',
    3: 'Plan',
    4: 'Review',
    5: 'Confirmed',
  };
  return (
    <div className="flex items-center gap-1.5">
      {([1, 2, 3, 4, 5] as Step[]).map((value) => (
        <div key={value} className="flex flex-1 items-center gap-1.5">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              step >= value ? 'bg-[#5b21b6] text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {step > value ? <Check className="h-3 w-3" /> : value}
          </div>
          <span
            className={`hidden text-[11px] font-semibold sm:block ${
              step === value ? 'text-[#5b21b6]' : 'text-slate-400'
            }`}
          >
            {labels[value]}
          </span>
          {value < 5 && <span className="h-0.5 flex-1 rounded bg-slate-200" />}
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  emoji,
  label,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-semibold transition ${
        active
          ? 'border-[#5b21b6] bg-[#f5f3ff] text-[#5b21b6]'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      <span aria-hidden="true">{emoji}</span>
      {label}
    </button>
  );
}

function TrustRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-600">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f3ff] text-[#5b21b6]">
        {icon}
      </span>
      {label}
    </div>
  );
}

/** Draft cache so a half-filled journey survives a refresh. */
const DRAFT_KEY = 'bos_helper_journey_draft_v1';

interface HelperDraft {
  step: Step;
  taskType: string;
  description: string;
  locations: 'single' | 'multiple';
  address: string;
  extraAddress: string;
  durationId: string;
  helpers: number;
  coupon: string;
  couponApplied: boolean;
}

function loadDraft(): Partial<HelperDraft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HelperDraft>;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return {};
}

export function HelperJourney({ onClose, inline = false }: HelperJourneyProps) {
  const [draft] = useState(() => loadDraft());
  const draftStep = Number(draft.step);
  const [step, setStep] = useState<Step>(() => (draftStep >= 1 && draftStep <= 4 ? (draftStep as Step) : 1));
  const [taskType, setTaskType] = useState<string>(draft.taskType ?? 'grocery');
  const [description, setDescription] = useState<string>(draft.description ?? '');
  const [recording, setRecording] = useState(false);
  const [locations, setLocations] = useState<'single' | 'multiple'>(draft.locations === 'multiple' ? 'multiple' : 'single');
  const [address, setAddress] = useState<string>(draft.address ?? '');
  const [extraAddress, setExtraAddress] = useState<string>(draft.extraAddress ?? '');
  const [durationId, setDurationId] = useState<string>(draft.durationId ?? '2');
  const [helpers, setHelpers] = useState<number>(draft.helpers ?? 1);
  const [coupon, setCoupon] = useState<string>(draft.coupon ?? '');
  const [couponApplied, setCouponApplied] = useState<boolean>(draft.couponApplied ?? false);
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Cache the in-progress journey (cleared once the booking is confirmed).
  useEffect(() => {
    if (step === 5) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, taskType, description, locations, address, extraAddress, durationId, helpers, coupon, couponApplied } satisfies HelperDraft)
      );
    } catch {
      /* ignore quota/privacy errors */
    }
  }, [step, taskType, description, locations, address, extraAddress, durationId, helpers, coupon, couponApplied]);

  const duration = DURATIONS.find((d) => d.id === durationId) ?? DURATIONS[1];
  const activeTask = TASK_TYPES.find((t) => t.id === taskType) ?? TASK_TYPES[0];

  const totals = useMemo(() => {
    const labour = duration.hours * HELPER_RATE * helpers;
    const subtotal = labour + PLATFORM_FEE + CONVENIENCE_FEE;
    const discount = couponApplied ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
    const tax = Math.round((subtotal - discount) * 0.05 * 100) / 100;
    const total = Math.round((subtotal - discount + tax) * 100) / 100;
    return { labour, subtotal, discount, tax, total };
  }, [duration.hours, helpers, couponApplied]);

  const next = () => setStep((s) => (s < 5 ? ((s + 1) as Step) : s));
  const back = () => (step === 1 ? onClose() : setStep((s) => ((s - 1) as Step)));

  const shellClass = inline
    ? 'w-full bg-gradient-to-b from-[#f5f3ff] via-white to-white text-slate-900'
    : 'fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-gradient-to-b from-[#f5f3ff] via-white to-white text-slate-900';

  // Shared responsive page width (mobile-first, a little wider on tablet/desktop).
  const pageClass = 'mx-auto w-full max-w-[520px] px-4 sm:max-w-[600px] sm:px-6';

  // Inline mode renders in page flow, so the CTA must be a normal block — a
  // fixed bar would sit under the app's z-40 bottom nav and be unclickable.
  const contentPad = inline ? 'pb-6' : 'pb-28';
  const actionBar = inline
    ? 'mt-4 border-t border-slate-200 bg-white px-4 py-3'
    : 'fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]';

  const Header = (
    <div className='sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur'>
      <div className="mx-auto flex h-14 max-w-[520px] items-center gap-3 px-4">
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-[#1f1650]">
            BookOurSpace <span className="font-bold text-[#7c3aed]">Helper</span>
          </p>
          <p className="truncate text-[11px] font-semibold text-slate-500">
            {step === 5 ? 'Booking confirmed' : `Step ${step} of 5`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close helper journey"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  /* ------------------------------ Step 1 ------------------------------ */
  if (step === 1) {
    return (
      <div className={shellClass}>
        {Header}
        <div className={`${pageClass} ${contentPad} pt-4`}>
          <Stepper step={step} />
          <h1 className="mt-5 text-[26px] font-black leading-[1.1] text-[#1f1650]">
            Describe Your Task,
            <br />
            <span className="text-[#7c3aed]">We&apos;ll Handle the Rest.</span>
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-slate-500">
            Smart matching. Verified helpers. Tasks done on time.
          </p>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
              Task Description
            </p>
            <button
              type="button"
              onClick={() => setRecording((r) => !r)}
              className={`mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition ${
                recording ? 'bg-rose-500 animate-pulse' : 'bg-[#7c3aed] hover:bg-[#6d28d9]'
              }`}
              aria-label={recording ? 'Stop recording' : 'Record a voice note'}
            >
              <Mic className="h-7 w-7" />
            </button>
            <p className="mt-3 text-[13px] font-semibold text-slate-600">
              {recording ? 'Listening… tap to stop' : 'Tap to describe your task'}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {recording ? 'Speak in your language — we will transcribe it.' : 'Speak in your language — we will transcribe it.'}
            </p>
          </div>

          <div className="mt-4">
            <SectionCard title="Task Type">
              <div className="flex flex-wrap gap-2">
                {TASK_TYPES.map((type) => (
                  <Chip
                    key={type.id}
                    active={taskType === type.id}
                    onClick={() => setTaskType(type.id)}
                    emoji={type.emoji}
                    label={type.label}
                  />
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-5 text-slate-500">
                Select the type of task you&apos;d like our helper to do. You can assign multiple tasks in
                one booking.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f5f3ff] px-3 py-2 text-[12px] font-semibold text-[#5b21b6]">
                <Sparkles className="h-4 w-4" />
                AI will match the right helper to your task type.
              </div>
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard title="Helper Requirements">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Location</p>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Where should the helper go?"
                      className="w-full bg-transparent text-[14px] font-semibold text-[#1f1650] outline-none placeholder:font-medium placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">When</p>
                    <p className="text-[14px] font-semibold text-[#1f1650]">Today, as soon as possible</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <Timer className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Duration</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {DURATIONS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDurationId(d.id)}
                          className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
                            durationId === d.id
                              ? 'bg-[#5b21b6] text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard title="Address Selection">
              <div className="flex gap-2">
                {(['single', 'multiple'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLocations(mode)}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-[12px] font-bold transition ${
                      locations === mode
                        ? 'border-[#5b21b6] bg-[#f5f3ff] text-[#5b21b6]'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {mode === 'single' ? 'Single location' : 'Multiple locations'}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {locations === 'single' ? 'Single Location' : 'First location'}
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Flat 402, Madhapur, Hyderabad"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#7c3aed]"
              />
              {locations === 'multiple' && (
                <input
                  value={extraAddress}
                  onChange={(e) => setExtraAddress(e.target.value)}
                  placeholder="Add another location"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#7c3aed]"
                />
              )}
            </SectionCard>
          </div>
        </div>

        <div className={actionBar}>
          <div className="mx-auto flex w-full max-w-[520px] items-center gap-3 sm:max-w-[600px]">
            <div className="hidden text-[12px] font-semibold text-slate-500 sm:block">
              Est. {inr(totals.total)} · {duration.label}
            </div>
            <button
              type="button"
              onClick={next}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5b21b6] to-[#7c3aed] text-sm font-bold text-white shadow-lg shadow-[#5b21b6]/30 transition hover:from-[#4c1d95] hover:to-[#6d28d9]"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Step 2 ------------------------------ */
  if (step === 2) {
    return (
      <div className={shellClass}>
        {Header}
        <div className={`${pageClass} ${contentPad} pt-4`}>
          <Stepper step={step} />
          <h1 className="mt-5 text-[24px] font-black leading-[1.1] text-[#1f1650] sm:text-[26px]">
            Book a Helper,
            <br />
            <span className="text-[#7c3aed]">we&apos;ll handle the rest.</span>
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-slate-500">
            Confirm your task, location and duration.
          </p>

          <div className="mt-4">
            <SectionCard title="Task Type">
              <div className="flex flex-wrap gap-2">
                {TASK_TYPES.map((type) => (
                  <Chip
                    key={type.id}
                    active={taskType === type.id}
                    onClick={() => setTaskType(type.id)}
                    emoji={type.emoji}
                    label={type.label}
                  />
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-5 text-slate-500">
                Smooth billing. Our billing system supports multiple tasks and locations in a single trip.
              </p>
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard title="Helper Requirements">
              <div className="space-y-2.5">
                {[
                  { icon: <MapPin className="h-4 w-4" />, label: 'Location', value: locations === 'multiple' ? `${address || 'Location'} + 1 more` : address || 'Add a location' },
                  { icon: <CalendarClock className="h-4 w-4" />, label: 'Date & Time', value: 'Today, as soon as possible' },
                  { icon: <Timer className="h-4 w-4" />, label: 'Duration', value: `${duration.label} · ${activeTask.label}` },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{row.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{row.label}</p>
                      <p className="truncate text-[13px] font-semibold text-[#1f1650]">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Task Requirements
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Type a quick brief, e.g. pick the freshest vegetables and 2 litres of milk"
                className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#7c3aed]"
              />

              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Helpers</p>
                <div className="mt-1 flex items-center gap-2">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setHelpers(count)}
                      className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-bold transition ${
                        helpers === count ? 'bg-[#5b21b6] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" />
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        <div className={actionBar}>
          <div className="mx-auto flex w-full max-w-[520px] items-center gap-3 sm:max-w-[600px]">
            <div className="hidden text-[12px] font-semibold text-slate-500 sm:block">
              Est. {inr(totals.total)}
            </div>
            <button
              type="button"
              onClick={next}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5b21b6] to-[#7c3aed] text-sm font-bold text-white shadow-lg shadow-[#5b21b6]/30 transition hover:from-[#4c1d95] hover:to-[#6d28d9]"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Step 3 ------------------------------ */
  if (step === 3) {
    return (
      <div className={shellClass}>
        {Header}
        <div className={`${pageClass} ${contentPad} pt-4`}>
          <Stepper step={step} />
          <h1 className="mt-5 text-[26px] font-black leading-[1.1] text-[#1f1650]">
            Plan Your Journey.
            <br />
            <span className="text-[#7c3aed]">We Handle the Rest.</span>
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-slate-500">
            Add locations, choose time &amp; leave the rest to us.
          </p>

          {/* Map */}
          <div className="relative mt-4 h-56 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#e8e3f8] via-[#f3efff] to-[#dbeafe]">
            <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(#7c3aed33 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
            <div className="absolute left-[22%] top-[30%] flex flex-col items-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-lg">
                <MapPin className="h-4 w-4" />
              </span>
              <span className="mt-1 rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 shadow">Home</span>
            </div>
            <div className="absolute left-[62%] top-[48%] flex flex-col items-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f97316] text-white shadow-lg">
                <Truck className="h-4 w-4" />
              </span>
              <span className="mt-1 rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 shadow">Helper</span>
            </div>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M 24 34 Q 40 56 62 52" fill="none" stroke="#7c3aed" strokeWidth="1.4" strokeDasharray="3 2" />
            </svg>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-white/95 px-3 py-2 shadow">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Navigation className="h-3.5 w-3.5 text-[#7c3aed]" /> 2.4 km away
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Clock className="h-3.5 w-3.5 text-[#7c3aed]" /> ~12 min
              </span>
            </div>
          </div>

          <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#7c3aed] bg-white py-3 text-[13px] font-bold text-[#5b21b6]">
            <MapPin className="h-4 w-4" /> Add Multiple Locations
          </button>

          <div className="mt-4 space-y-2.5">
            {[
              { icon: <MapPin className="h-4 w-4" />, title: 'Your Location', sub: 'Distance calculated from your saved address' },
              { icon: <Timer className="h-4 w-4" />, title: 'Time Taken', sub: '47 min from your location' },
              { icon: <BadgeCheck className="h-4 w-4" />, title: 'Confirm Your Match', sub: 'Matching based on task type & rating' },
              { icon: <Star className="h-4 w-4" />, title: 'Hire The Right Helper', sub: 'Verified & trained professionals' },
            ].map((row) => (
              <div key={row.title} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f5f3ff] text-[#5b21b6]">{row.icon}</span>
                <div>
                  <p className="text-[13px] font-bold text-[#1f1650]">{row.title}</p>
                  <p className="text-[11px] text-slate-500">{row.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-bold text-[#1f1650]">Your Helper · Regular</p>
                <p className="text-[11px] text-slate-500">
                  {duration.label} · {helpers} {helpers === 1 ? 'helper' : 'helpers'}
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> 4.8
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f8f7fc] px-3 py-2">
              <span className="text-[12px] font-semibold text-slate-500">
                {duration.hours}h × {helpers} helper{helpers > 1 ? 's' : ''}
              </span>
              <span className="text-[13px] font-bold text-[#1f1650]">{inr(totals.labour)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-[12px] font-semibold text-slate-500">Platform &amp; convenience</span>
              <span className="text-[12px] font-semibold text-slate-600">{inr(PLATFORM_FEE + CONVENIENCE_FEE)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-bold text-[#1f1650]">Total</span>
              <span className="text-[16px] font-black text-[#5b21b6]">{inr(totals.total)}</span>
            </div>
          </div>
        </div>

        <div className={actionBar}>
          <div className="mx-auto w-full max-w-[520px] sm:max-w-[600px]">
            <button
              type="button"
              onClick={next}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5b21b6] to-[#7c3aed] text-sm font-bold text-white shadow-lg shadow-[#5b21b6]/30 transition hover:from-[#4c1d95] hover:to-[#6d28d9]"
            >
              Continue to Review
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Step 4 ------------------------------ */
  if (step === 4) {
    return (
      <div className={shellClass}>
        {Header}
        <div className={`${pageClass} ${contentPad} pt-4`}>
          <Stepper step={step} />
          <h1 className="mt-5 text-[24px] font-black leading-[1.1] text-[#1f1650]">
            Review &amp; Confirm
            <br />
            <span className="text-[#7c3aed]">Your Booking</span>
          </h1>
          <p className="mt-2 text-[13px] leading-5 text-slate-500">
            Almost there! Review your details and confirm your booking.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <TrustRow icon={<ShieldCheck className="h-4 w-4" />} label="Verified helpers" />
            <TrustRow icon={<Clock className="h-4 w-4" />} label="On-time, always" />
            <TrustRow icon={<Wallet className="h-4 w-4" />} label="Safe & secure" />
            <TrustRow icon={<Sparkles className="h-4 w-4" />} label="Quick & easy" />
          </div>

          <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#5b21b6] to-[#7c3aed] p-5 text-white shadow-lg">
            <p className="text-[12px] font-semibold text-white/70">Total you pay</p>
            <p className="text-[34px] font-black leading-none">{inr(totals.total)}</p>
            <p className="mt-1 text-[12px] font-semibold text-white/70">
              incl. taxes · {duration.label} · {helpers} {helpers === 1 ? 'helper' : 'helpers'}
            </p>
          </div>

          <div className="mt-4">
            <SectionCard
              title="Price Breakdown"
              action={
                <button
                  type="button"
                  onClick={() => setShowBreakdown((v) => !v)}
                  className="text-[12px] font-bold text-[#5b21b6]"
                >
                  {showBreakdown ? 'Hide' : 'View'} breakdown <ChevronDown className={`inline h-3.5 w-3.5 transition ${showBreakdown ? 'rotate-180' : ''}`} />
                </button>
              }
            >
              {showBreakdown && (
                <div className="space-y-2">
                  {[
                    { label: `Helper time (${duration.hours}h × ${helpers})`, value: totals.labour },
                    { label: 'Platform fee', value: PLATFORM_FEE },
                    { label: 'Convenience fee', value: CONVENIENCE_FEE },
                    ...(couponApplied ? [{ label: 'Coupon discount (10%)', value: -totals.discount }] : []),
                    { label: 'Taxes (5%)', value: totals.tax },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-[13px]">
                      <span className="text-slate-500">{row.label}</span>
                      <span className={`font-bold ${row.value < 0 ? 'text-emerald-600' : 'text-[#1f1650]'}`}>
                        {row.value < 0 ? `-${inr(Math.abs(row.value))}` : inr(row.value)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-[14px]">
                    <span className="font-bold text-[#1f1650]">Total</span>
                    <span className="font-black text-[#5b21b6]">{inr(totals.total)}</span>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard title="Apply Coupon Code">
              <div className="flex gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3">
                  <Ticket className="h-4 w-4 text-slate-400" />
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="w-full bg-transparent py-2.5 text-[13px] font-semibold outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCouponApplied(true)}
                  className="rounded-xl bg-[#7c3aed] px-4 text-[13px] font-bold text-white"
                >
                  Apply
                </button>
              </div>
              {couponApplied && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
                  <Check className="h-4 w-4" /> Coupon applied — 10% off
                </p>
              )}
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard title="Helper Details">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f5f3ff] text-lg">🧑‍🔧</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#1f1650]">BookOurSpace Helper</p>
                  <p className="text-[11px] text-slate-500">Regular · 4.8 ★ · 74k+ tasks</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Verified</span>
              </div>
              <div className="mt-3 space-y-1.5 rounded-xl bg-[#f8f7fc] p-3 text-[12px] text-slate-600">
                <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-[#7c3aed]" /> {address || 'No address added'}</p>
                <p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-[#7c3aed]" /> Today · ~10 min arrival</p>
                <p className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-[#7c3aed]" /> {duration.label} · {activeTask.label}</p>
              </div>
            </SectionCard>
          </div>

          <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">
            BookOurSpace is a product of LOHAS ONE Pvt. Ltd. · Payments are collected securely after service
            confirmation.
          </p>
        </div>

        <div className={actionBar}>
          <div className="mx-auto w-full max-w-[520px] sm:max-w-[600px]">
            <button
              type="button"
              onClick={next}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5b21b6] to-[#7c3aed] text-sm font-bold text-white shadow-lg shadow-[#5b21b6]/30 transition hover:from-[#4c1d95] hover:to-[#6d28d9]"
            >
              <ShieldCheck className="h-4 w-4" />
              Confirm &amp; Pay {inr(totals.total)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Step 5 ------------------------------ */
  return (
    <div className={shellClass}>
      {Header}
      <div className="mx-auto w-full max-w-[520px] px-4 pb-24 pt-8 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
          <BadgeCheck className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="mt-5 text-[26px] font-black leading-[1.1] text-[#1f1650]">
          We Find. We Connect.
          <br />
          <span className="text-[#7c3aed]">You Relax.</span>
        </h1>
        <p className="mt-2 text-[13px] leading-5 text-slate-500">
          Real-time tracking. Real-time trust. Total peace of mind.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Booking confirmed</p>
          <p className="mt-1 text-[16px] font-black text-[#1f1650]">BOS-{new Date().getFullYear()}-{Math.floor(1000 + Math.random() * 9000)}</p>
          <div className="mt-3 space-y-2 text-[13px] text-slate-600">
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#7c3aed]" /> {address || 'Your saved address'}</p>
            <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-[#7c3aed]" /> Helper arriving in ~10 minutes</p>
            <p className="flex items-center gap-2"><Wallet className="h-4 w-4 text-[#7c3aed]" /> {inr(totals.total)} payable after service</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { icon: <Navigation className="h-4 w-4" />, label: 'Live tracking' },
            { icon: <Clock className="h-4 w-4" />, label: 'Real-time updates' },
            { icon: <Headphones className="h-4 w-4" />, label: '24/7 support' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-[#f5f3ff] text-[#5b21b6]">
                {item.icon}
              </span>
              <p className="mt-2 text-[11px] font-bold text-slate-600">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex h-12 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700"
          >
            Book another
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#5b21b6] text-sm font-bold text-white shadow-lg shadow-[#5b21b6]/30"
          >
            Done
          </button>
        </div>

        <p className="mt-6 text-[12px] font-semibold text-slate-400">
          BookOurSpace Helper — Human help, on demand.
        </p>
      </div>
    </div>
  );
}

export default HelperJourney;
