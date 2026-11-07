import { useMemo, useState } from 'react';
import SafeImage from './SafeImage';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  MapPin,
  Star,
} from 'lucide-react';
import {
  NODDYY_BRAND,
  NODDYY_NAV,
  NODDYY_SERVICES,
  NODDYY_PRESS,
  NODDYY_HOW_IT_WORKS,
  NODDYY_TRUST,
  NODDYY_CITIES,
  NODDYY_TESTIMONIALS,
  NODDYY_APP_FEATURES,
  NODDYY_FAQ,
  NODDYY_FOOTER,
  NODDYY_HERO,
  NODDYY_STATS,
  NODDYY_STORE_BADGES,
  NODDYY_LIVE,
  NODDYY_COLORS,
} from '../data/noddyyData';

interface NoddyyExperienceProps {
  onClose: () => void;
  onSwitchToOld: () => void;
  inline?: boolean;
}

/** Shared brand helpers. */
const fontHeading = { fontFamily: "'Sora', 'Inter', ui-sans-serif, system-ui, sans-serif" } as const;
const fontBody = { fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" } as const;

function StoreBadges({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex ${compact ? 'flex-col gap-3' : 'flex-wrap items-center gap-3'}`}>
      <a
        href={NODDYY_BRAND.androidStoreUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get it on Google Play"
        className="transition hover:opacity-90"
      >
        <SafeImage category="general"
          src={NODDYY_STORE_BADGES.googlePlay}
          alt="Get it on Google Play"
          loading="lazy"
          className={compact ? 'h-12 w-auto' : 'h-14 w-auto'}
        />
      </a>
      <a
        href={NODDYY_BRAND.iosStoreUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download on the App Store"
        className="transition hover:opacity-90"
      >
        <SafeImage category="general"
          src={NODDYY_STORE_BADGES.appStore}
          alt="Download on the App Store"
          loading="lazy"
          className={compact ? 'h-12 w-auto' : 'h-14 w-auto'}
        />
      </a>
    </div>
  );
}

function NavBar({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="sticky top-0 z-50 border-b border-black/5 bg-white/95 backdrop-blur"
      style={fontBody}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to BookOurSpace services"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-[#15134A] transition hover:bg-black/5"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <a href="#top" className="flex items-center gap-1" aria-label="noddyy home">
            <SafeImage category="general"
              src={NODDYY_BRAND.logoUrl}
              alt="noddyy"
              className="h-8 w-auto"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </a>
        </div>

        <nav className="hidden items-center gap-6 lg:flex">
          {NODDYY_NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-semibold text-[#15134A]/80 transition hover:text-[#15134A]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={NODDYY_BRAND.androidStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center rounded-full px-5 py-2.5 text-sm font-bold text-white sm:inline-flex"
            style={{ backgroundColor: NODDYY_COLORS.orange }}
          >
            Download App
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-[#15134A] lg:hidden"
            aria-label="Toggle menu"
          >
            <ChevronDown className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-black/5 bg-white px-4 py-3 lg:hidden" style={fontBody}>
          <div className="flex flex-col gap-1">
            {NODDYY_NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#15134A]/80 transition hover:bg-black/5"
              >
                {item.label}
              </a>
            ))}
            <a
              href={NODDYY_BRAND.androidStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 rounded-full px-5 py-2.5 text-center text-sm font-bold text-white"
              style={{ backgroundColor: NODDYY_COLORS.orange }}
            >
              Download App
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden"
      style={{ backgroundColor: NODDYY_COLORS.cream }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-8 lg:px-8 lg:pb-20 lg:pt-16">
        {/* Copy */}
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-full border border-[#ff7a1a]/25 bg-white px-4 py-1.5 text-sm font-bold"
            style={{ color: NODDYY_COLORS.orangeDeep }}
          >
            <Star className="h-4 w-4 fill-current" />
            {NODDYY_HERO.badge}
          </span>

          <h1
            className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            Real Human, Real Help.
          </h1>

          <p
            className="mt-5 max-w-xl text-base leading-relaxed text-[#15134A]/70 sm:text-lg"
            style={fontBody}
          >
            {NODDYY_HERO.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={NODDYY_BRAND.androidStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-white shadow-lg transition hover:opacity-90"
              style={{ backgroundColor: NODDYY_COLORS.orange, boxShadow: `0 12px 30px -8px ${NODDYY_COLORS.orange}` }}
            >
              Download App
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={NODDYY_HERO.secondaryCtaHref}
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#15134A]/15 px-7 py-3.5 text-base font-bold text-[#15134A] transition hover:border-[#15134A]/35"
              style={fontBody}
            >
              {NODDYY_HERO.secondaryCta}
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
            {NODDYY_HERO.trustBadges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#15134A]/70"
                style={fontBody}
              >
                <Check className="h-4 w-4" style={{ color: NODDYY_COLORS.whatsapp }} />
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Visual */}
        <div className="relative">
          <div className="relative mx-auto max-w-md lg:max-w-none">
            <SafeImage category="general"
              src={NODDYY_HERO.heroImages.helper}
              alt="A Noddyy Helper arriving at the door"
              className="w-full rounded-3xl object-cover shadow-2xl"
              loading="eager"
            />
            {/* Floating arrival card */}
            <div
              className="absolute -bottom-5 left-4 flex items-center gap-3 rounded-2xl bg-white p-3 pr-5 shadow-xl sm:left-6"
              style={fontBody}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: NODDYY_COLORS.orange }}
              >
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#15134A]">{NODDYY_HERO.floatingCard.title}</p>
                <p className="text-xs font-semibold text-[#15134A]/60">
                  {NODDYY_HERO.floatingCard.eta} · {NODDYY_HERO.floatingCard.rating}
                </p>
              </div>
            </div>
            {/* Rating pill */}
            <div
              className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 shadow-lg"
              style={fontBody}
            >
              <Star className="h-4 w-4 fill-[#fbbf24] text-[#fbbf24]" />
              <span className="text-sm font-bold text-[#15134A]">{NODDYY_HERO.floatingCard.rating}</span>
              <span className="text-xs font-semibold text-[#15134A]/60">
                {NODDYY_HERO.floatingCard.reviews}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PressStrip() {
  return (
    <section className="border-y border-black/5 bg-white py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p
          className="mb-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-[#15134A]/50"
          style={fontBody}
        >
          In the spotlight
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {NODDYY_PRESS.map((press) => (
            <SafeImage category="general"
              key={press.name}
              src={press.image}
              alt={press.name}
              loading="lazy"
              className="h-8 w-auto object-contain grayscale"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section id="services" className="py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            What can your Noddyy Helper do?
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {NODDYY_SERVICES.map((service) => (
            <a
              key={service.id}
              href={service.slug}
              className="group flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white transition hover:-translate-y-1 hover:shadow-xl"
              style={fontBody}
            >
              <div className="aspect-[4/3] overflow-hidden bg-[#fff8f1]">
                <SafeImage category="general"
                  src={service.image}
                  alt={service.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-bold text-[#15134A]" style={fontHeading}>
                  {service.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#15134A]/65">
                  {service.description}
                </p>
                <span
                  className="mt-3 inline-flex items-center gap-1 text-sm font-bold"
                  style={{ color: NODDYY_COLORS.orangeDeep }}
                >
                  Book now
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function ByTheNumbers() {
  return (
    <section
      className="py-16 lg:py-20"
      style={{ background: `linear-gradient(135deg, ${NODDYY_COLORS.navy} 0%, ${NODDYY_COLORS.navySoft} 100%)` }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={fontHeading}>
            Trusted Help, When You Need It Most
          </h2>
          <p className="mt-3 text-base text-white/70" style={fontBody}>
            From shopping and deliveries to everyday assistance, Noddyy Helpers are making life easier
            across Hyderabad.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {NODDYY_STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl font-extrabold text-white sm:text-5xl" style={fontHeading}>
                {stat.value}
              </div>
              <div className="mt-2 text-sm font-semibold text-white/70" style={fontBody}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            Book in 3 Simple Steps
          </h2>
          <p className="mt-3 text-base text-[#15134A]/65" style={fontBody}>
            Tell us what you need, choose how long you need help, and a verified Noddyy Helper takes
            care of the rest
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {NODDYY_HOW_IT_WORKS.map((step) => (
            <div key={step.step} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-extrabold text-white" style={{ ...fontHeading, backgroundColor: NODDYY_COLORS.orange }}>
                {step.step}
              </div>
              <div className="mx-auto mt-5 aspect-square w-40 overflow-hidden rounded-2xl border border-black/5 bg-[#fff8f1]">
                <SafeImage category="general" src={step.image} alt={step.title} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-[#15134A]" style={fontHeading}>
                {step.title}
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[#15134A]/65" style={fontBody}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyNoddyy() {
  return (
    <section className="py-16 lg:py-20" style={{ backgroundColor: '#fff8f1' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            Human Help, On Demand
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {NODDYY_TRUST.map((item) => (
            <div key={item.title} className="rounded-2xl border border-black/5 bg-white p-6">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-[#fff8f1]">
                <SafeImage category="general" src={item.image} alt={item.title} loading="lazy" className="h-9 w-9 object-contain" />
              </div>
              <h3 className="mt-4 text-base font-bold text-[#15134A]" style={fontHeading}>
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#15134A]/65" style={fontBody}>
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cities() {
  return (
    <section id="cities" className="py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            Human Help Across India
          </h2>
          <p className="mt-3 text-base text-[#15134A]/65" style={fontBody}>
            Book verified noddyy Helpers for shopping, document tasks, queue standing, hospital
            visits, pickups, and more.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {NODDYY_CITIES.map((city) => (
            <a
              key={city.name}
              href={`/${city.name.toLowerCase()}`}
              className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <SafeImage category="general"
                  src={city.image}
                  alt={city.comingSoon ? `${city.name} - Coming Soon` : city.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex items-center justify-between p-4">
                <div>
                  <h3 className="text-base font-bold text-[#15134A]" style={fontHeading}>
                    {city.name}
                    {city.comingSoon && (
                      <span className="ml-2 text-xs font-semibold text-[#15134A]/50">- Coming Soon</span>
                    )}
                  </h3>
                  <p className="text-xs font-semibold text-[#15134A]/55" style={fontBody}>
                    {city.areas}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-[#15134A]/40 transition group-hover:translate-x-0.5" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const [index, setIndex] = useState(0);
  const total = NODDYY_TESTIMONIALS.length;
  const active = NODDYY_TESTIMONIALS[index];

  return (
    <section id="testimonials" className="py-16 lg:py-20" style={{ backgroundColor: '#fff8f1' }}>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            Hear from our Noddyy Users
          </h2>
          <div className="mt-3 inline-flex items-center gap-2" style={fontBody}>
            <span className="inline-flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-5 w-5 fill-[#fbbf24] text-[#fbbf24]" />
              ))}
            </span>
            <span className="text-sm font-bold text-[#15134A]">4.8</span>
            <span className="text-sm font-semibold text-[#15134A]/55">· 112 ratings</span>
          </div>
        </div>

        <div className="relative mt-10">
          <figure className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm sm:p-10">
            <blockquote className="mx-auto max-w-2xl text-lg font-medium leading-relaxed text-[#15134A]/85 sm:text-xl" style={fontBody}>
              “{active.quote}”
            </blockquote>
            <figcaption className="mt-6 flex items-center justify-center gap-3">
              <SafeImage category="general"
                src={active.avatar}
                alt={active.name}
                loading="lazy"
                className="h-12 w-12 rounded-full object-cover"
              />
              <span className="text-left">
                <span className="block text-sm font-bold text-[#15134A]" style={fontBody}>
                  {active.name}
                </span>
                <span className="block text-xs font-semibold text-[#15134A]/55" style={fontBody}>
                  {active.location}
                </span>
              </span>
            </figcaption>
          </figure>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIndex((index - 1 + total) % total)}
              aria-label="Previous review"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#15134A] transition hover:bg-black/5"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {NODDYY_TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Review ${i + 1}`}
                  className="h-2 w-2 rounded-full transition"
                  style={{ backgroundColor: i === index ? NODDYY_COLORS.orange : '#15134A22' }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIndex((index + 1) % total)}
              aria-label="Next review"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-[#15134A] transition hover:bg-black/5"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DownloadCta() {
  return (
    <section id="download" className="py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 rounded-[2rem] bg-white p-8 shadow-xl sm:p-12 lg:grid-cols-2" style={{ border: '1px solid #00000008' }}>
          <div>
            <h2
              className="text-3xl font-extrabold tracking-tight sm:text-4xl"
              style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
            >
              Book a noddyy Helper in 60 seconds.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#15134A]/70" style={fontBody}>
              Open the app, share audio Instructions, select address &amp; duration. A trained noddyy
              Helper is at your door in minutes.
            </p>

            <ul className="mt-6 space-y-3" style={fontBody}>
              {NODDYY_APP_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm font-semibold text-[#15134A]/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: NODDYY_COLORS.whatsapp }} />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <StoreBadges />
            </div>

            <div className="mt-6 inline-flex items-center gap-4 rounded-full bg-[#fff8f1] px-4 py-2" style={fontBody}>
              <span className="text-sm font-bold text-[#15134A]">Today</span>
              <span className="text-sm font-semibold text-[#15134A]/60">{NODDYY_LIVE.todayBookings}</span>
              <span className="text-sm font-semibold text-[#15134A]/60">{NODDYY_LIVE.rating}</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <SafeImage category="general"
              src={NODDYY_STORE_BADGES.appScreenshot}
              alt="Noddyy app screenshot"
              loading="lazy"
              className="w-full rounded-3xl object-cover shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section id="faq" className="py-16 lg:py-20" style={{ backgroundColor: '#fff8f1' }}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ ...fontHeading, color: NODDYY_COLORS.navy }}
          >
            Frequently asked questions
          </h2>
          <p className="mt-3 text-base text-[#15134A]/65" style={fontBody}>
            Everything you need to know about Noddyy home services.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {NODDYY_FAQ.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q} className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="text-sm font-bold text-[#15134A] sm:text-base" style={fontBody}>
                    {item.q}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-[#15134A]/50 transition ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && (
                  <div className="px-5 pb-4">
                    <p className="text-sm leading-relaxed text-[#15134A]/65" style={fontBody}>
                      {item.a}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      className="relative overflow-hidden py-20 lg:py-24"
      style={{ background: `linear-gradient(135deg, ${NODDYY_COLORS.navy} 0%, ${NODDYY_COLORS.navySoft} 100%)` }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl" style={fontHeading}>
              Stop Running Around.
              <br />
              Let noddyy Handle It.
            </h2>
            <p className="mt-4 max-w-lg text-base text-white/70 sm:text-lg" style={fontBody}>
              Get trusted human help for shopping, pickups, queue standing, hospital visits, document
              tasks, and more — whenever you need it.
            </p>
            <div className="mt-8">
              <StoreBadges compact />
            </div>
          </div>
          <div className="mx-auto w-full max-w-sm">
            <SafeImage category="general"
              src={NODDYY_STORE_BADGES.ctaScreenshot}
              alt="Noddyy app preview"
              loading="lazy"
              className="w-full rounded-3xl object-cover shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer({ onBack }: { onBack: () => void }) {
  return (
    <footer className="bg-white py-14" style={fontBody}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <SafeImage category="general"
              src={NODDYY_BRAND.footerLogoUrl}
              alt="noddyy"
              loading="lazy"
              className="h-8 w-auto"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <p className="mt-3 text-sm text-[#15134A]/70">{NODDYY_BRAND.tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {NODDYY_FOOTER.social.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="inline-flex items-center rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-[#15134A]/70 transition hover:bg-black/5"
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#15134A]">Company</h4>
            <ul className="mt-3 space-y-2">
              {NODDYY_FOOTER.company.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-[#15134A]/65 transition hover:text-[#15134A]">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#15134A]">For Noddyy Users</h4>
            <ul className="mt-3 space-y-2">
              {NODDYY_FOOTER.users.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-[#15134A]/65 transition hover:text-[#15134A]">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#15134A]">For Noddyy Helpers</h4>
            <ul className="mt-3 space-y-2">
              {NODDYY_FOOTER.helpers.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className="text-sm text-[#15134A]/65 transition hover:text-[#15134A]">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-black/5 pt-6 text-xs text-[#15134A]/55 sm:flex-row sm:items-center">
          <div>
            <a href={`mailto:${NODDYY_BRAND.email}`} className="font-semibold text-[#15134A]/70">
              {NODDYY_BRAND.email}
            </a>{' '}
            · {NODDYY_BRAND.city}
          </div>
          <div className="max-w-xl">
            © 2026 {NODDYY_BRAND.company} All rights reserved. | CIN : {NODDYY_BRAND.cin} | GST :{' '}
            {NODDYY_BRAND.gst} | DPIIT : {NODDYY_BRAND.dpiit}
          </div>
        </div>

        <div className="mt-4 flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-xs font-bold text-[#15134A] transition hover:bg-black/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to BookOurSpace services
          </button>
        </div>
      </div>
    </footer>
  );
}

export function NoddyyExperience({ onClose, onSwitchToOld, inline = false }: NoddyyExperienceProps) {
  const back = useMemo(() => onClose, [onClose]);

  return (
    <div
      className={
        inline
          ? 'w-full bg-white text-slate-900'
          : 'fixed inset-0 z-[71] flex flex-col overflow-y-auto bg-white text-slate-900'
      }
      role={inline ? undefined : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label="Noddyy — Helper On Demand"
      style={fontBody}
    >
      <NavBar onBack={back} />

      <main className="flex-1">
        <Hero />
        <PressStrip />
        <Services />
        <ByTheNumbers />
        <HowItWorks />
        <WhyNoddyy />
        <Cities />
        <Testimonials />
        <DownloadCta />
        <Faq />
        <FinalCta />
      </main>

      <Footer onBack={back} />

      {/* BookOurSpace context switcher — keeps this experience anchored to the services module. */}
      <div className="sticky bottom-0 z-50 border-t border-black/5 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <span className="text-xs font-bold text-[#15134A]/60" style={fontBody}>
            Noddyy — Helper On Demand (BookOurSpace Services)
          </span>
          <button
            type="button"
            onClick={onSwitchToOld}
            className="inline-flex h-8 items-center rounded-full px-4 text-xs font-bold text-[#15134A]/70 transition hover:bg-black/5"
            style={fontBody}
          >
            Switch to classic Services view
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoddyyExperience;
