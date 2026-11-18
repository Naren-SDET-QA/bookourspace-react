import { Award, BadgeCheck, CalendarDays, Clock, Heart, MapPin, Phone, Star } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CourseListing } from '../../data/classesTimingsData';
import SafeImage from '../SafeImage';
import { listingFacts, type ListingKind } from './classesListingKind';

export type ServiceCardLayout = 'featured' | 'grid' | 'catalog' | 'tile' | 'row' | 'shelf';

/** 2-column mobile, 4-column desktop listing grid used by every Classes section. */
export const CLASSES_CATALOG_GRID =
  'grid grid-cols-2 items-stretch gap-2.5 sm:gap-3 lg:grid-cols-4';

const BADGE_TONES = [
  'bg-[#fff4c2] text-[#7a5b00]',
  'bg-[#d9f2e3] text-[#176b3a]',
  'bg-[#d6e8ff] text-[#1a4fbf]',
  'bg-[#efe2ff] text-[#6b21a8]',
  'bg-[#ffe4cc] text-[#9a3412]',
  'bg-[#fde2e8] text-[#9f1239]',
] as const;

function badgeTone(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return BADGE_TONES[hash % BADGE_TONES.length];
}

/** Keep listing ids/sources; only raise Unsplash render quality for catalog covers. */
function catalogImageSrc(src: string): string {
  if (!src || src.startsWith('storage://') || src.startsWith('/') || src.startsWith('data:')) return src;
  try {
    const url = new URL(src);
    if (!url.hostname.includes('unsplash.com')) return src;
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');
    const width = Number(url.searchParams.get('w') || '0');
    if (!Number.isFinite(width) || width < 800) url.searchParams.set('w', '960');
    url.searchParams.set('q', '86');
    return url.toString();
  } catch {
    return src;
  }
}

function instructorLine(course: CourseListing, facts: ReturnType<typeof listingFacts>): string {
  if (facts.tutorName && facts.tutorName !== course.provider) return `${facts.tutorName} · ${course.provider}`;
  return facts.tutorName || course.provider;
}

type Props = {
  course: CourseListing;
  onOpen: (course: CourseListing) => void;
  layout?: ServiceCardLayout;
  /** Render as a div so a parent `article` can own the listing name for E2E. */
  embedded?: boolean;
};

const KIND_TONE: Record<ListingKind, string> = {
  admissions: 'bg-[#ffe500] text-[#212121]',
  tuition: 'bg-[#2874f0] text-white',
  training: 'bg-[#388e3c] text-white',
};

function Rating({ value, reviews, size = 'md' }: { value: number; reviews: number | null; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-[4px] bg-[#388e3c] font-bold text-white ${size === 'sm' ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[12px]'}`}>
      {value.toFixed(1)} <Star className={size === 'sm' ? 'h-2.5 w-2.5 fill-white' : 'h-3 w-3 fill-white'} aria-hidden />
      {reviews ? <span className="font-medium opacity-90">({reviews})</span> : null}
    </span>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'green' | 'blue' | 'yellow' }) {
  const cls =
    tone === 'green'
      ? 'bg-[#388e3c] text-white'
      : tone === 'yellow'
        ? 'bg-[#ffe500] text-[#212121]'
        : 'bg-[#2874f0] text-white';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${cls}`}>
      {children}
    </span>
  );
}

function Fact({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-medium text-[#878787]">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ClassesServiceCard({ course, onOpen, layout = 'featured', embedded = false }: Props) {
  const facts = listingFacts(course);
  const openListing = () => onOpen(course);
  const imageAlt = `${course.title} at ${course.provider}`;

  if (layout === 'shelf') return <ShelfCard course={course} facts={facts} onOpen={openListing} imageAlt={imageAlt} />;
  if (layout === 'grid' || layout === 'catalog') return <GridCard course={course} facts={facts} onOpen={openListing} imageAlt={imageAlt} />;
  if (layout === 'tile') return <TileCard course={course} facts={facts} onOpen={openListing} imageAlt={imageAlt} />;
  if (layout === 'row') return <RowCard course={course} facts={facts} onOpen={openListing} imageAlt={imageAlt} />;
  return <FeaturedCard course={course} facts={facts} onOpen={openListing} imageAlt={imageAlt} embedded={embedded} />;
}

function FeaturedCard({
  course,
  facts,
  onOpen,
  imageAlt,
  embedded = false,
}: {
  course: CourseListing;
  facts: ReturnType<typeof listingFacts>;
  onOpen: () => void;
  imageAlt: string;
  embedded?: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const className =
    'bos-svc-card @container cursor-pointer overflow-hidden rounded-xl border border-[#e0e0e0] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe500]';
  const body = (
    <div className="flex flex-col @md:flex-row">
      <div className="bos-svc-photo relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[#f1f3f6] @md:aspect-auto @md:w-[15.5rem] @md:min-h-[220px]">
        <SafeImage
          src={catalogImageSrc(course.image)}
          alt={imageAlt}
          category="classes"
          className="absolute inset-0 h-full w-full object-cover"
          sizes="(max-width: 639px) 92vw, 248px"
        />
        <span className={`absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_TONE[facts.kind]}`}>
          {facts.kindLabel}
        </span>
        {facts.kind === 'tuition' && facts.tutorPhoto ? (
          <span className="absolute bottom-2.5 left-2.5 h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-[#f1f3f6] shadow-md">
            <SafeImage src={facts.tutorPhoto} alt="" category="classes" className="h-full w-full object-cover" sizes="44px" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setLiked((value) => !value);
          }}
          aria-pressed={liked}
          aria-label={liked ? `Remove ${course.title} from favourites` : `Save ${course.title} to favourites`}
          className="bos-svc-heart absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow-md"
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-[#e0417c] text-[#e0417c]' : 'text-[#212121]'}`} aria-hidden />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
        <div className="flex flex-wrap gap-1.5">
          {facts.verified ? (
            <Badge tone="green">
              <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
            </Badge>
          ) : null}
          {facts.admissionOpen ? <Badge tone="yellow">Admissions open</Badge> : null}
          {facts.popular ? <Badge tone="blue">Popular</Badge> : null}
        </div>
        {facts.kind === 'admissions' ? <AdmissionsBody course={course} facts={facts} /> : null}
        {facts.kind === 'tuition' ? <TuitionBody course={course} facts={facts} /> : null}
        {facts.kind === 'training' ? <TrainingBody course={course} facts={facts} /> : null}
        <div className="mt-auto grid grid-cols-2 gap-2.5 pt-3">
          <FeaturedActions course={course} facts={facts} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div data-listing-kind={facts.kind} onClick={onOpen} className={className}>
        {body}
      </div>
    );
  }

  return (
    <article
      data-listing-kind={facts.kind}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${course.title}`}
      className={className}
    >
      {body}
    </article>
  );
}

function AdmissionsBody({ course, facts }: { course: CourseListing; facts: ReturnType<typeof listingFacts> }) {
  const programmes = [course.title, course.eligibility].filter((value) => value && value !== course.provider);
  return (
    <>
      <h3 className="mt-2 text-[16px] font-bold leading-snug text-[#212121] sm:text-[18px]">{course.provider}</h3>
      <p className="mt-0.5 text-[13px] font-medium text-[#2874f0]">{course.title}</p>
      <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] font-medium text-[#878787]">
        {facts.institutionType ? <span>{facts.institutionType}</span> : null}
        {facts.board ? <span>· {facts.board}</span> : null}
        {facts.academicYear ? <span>· {facts.academicYear}</span> : null}
      </p>
      {programmes[0] ? (
        <p className="mt-1 line-clamp-2 text-[12px] font-medium text-[#212121]">{programmes.filter(Boolean).join(' · ')}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {facts.place ? (
          <Fact icon={<MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />}>{facts.place}</Fact>
        ) : null}
        {facts.nextBatch && !facts.academicYear ? (
          <Fact icon={<CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />}>{facts.nextBatch}</Fact>
        ) : null}
        {facts.seatsLabel ? <Fact>{facts.seatsLabel}</Fact> : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {facts.rating !== null ? <Rating value={facts.rating} reviews={facts.reviews} /> : <span />}
        {facts.feeLabel ? (
          <p className="text-[18px] font-bold text-[#212121]">
            {facts.feeLabel}
            {facts.feeSuffix ? <span className="text-[12px] font-semibold text-[#878787]">{facts.feeSuffix}</span> : null}
          </p>
        ) : null}
      </div>
    </>
  );
}

function TuitionBody({ course, facts }: { course: CourseListing; facts: ReturnType<typeof listingFacts> }) {
  const tags = [...facts.subjects, facts.board].filter(Boolean) as string[];
  return (
    <>
      <h3 className="mt-2 text-[15px] font-medium leading-snug text-[#212121] @md:text-[16px]">{course.title}</h3>
      <p className="mt-0.5 text-[13px] font-semibold text-[#878787]">
        {facts.tutorName ? `${facts.tutorName} · ${course.provider}` : course.provider}
      </p>
      <p className="mt-0.5 text-[12px] font-medium text-[#878787]">{tags.length > 0 ? tags.join(' • ') : course.category}</p>
      {facts.place ? (
        <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-[#878787]">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{facts.place}</span>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {facts.modeLabel ? (
          <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-bold text-[#2874f0]">{facts.modeLabel}</span>
        ) : null}
        {facts.batchTiming ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f7fa] px-2 py-0.5 text-[11px] font-semibold text-[#212121]">
            <Clock className="h-3 w-3" aria-hidden /> {facts.batchTiming}
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          {facts.rating !== null ? <Rating value={facts.rating} reviews={facts.reviews} /> : null}
          {facts.feeLabel ? (
            <span className="text-[18px] font-bold text-[#212121]">
              {facts.feeLabel}
              {facts.feeSuffix ? <span className="text-[12px] font-semibold text-[#878787]">{facts.feeSuffix}</span> : null}
            </span>
          ) : null}
        </p>
        {facts.nextBatch ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-[#fff8e1] px-2.5 py-1 text-[11px] font-bold text-[#212121]">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Next batch: {facts.nextBatch}
          </span>
        ) : null}
      </div>
    </>
  );
}

function TrainingBody({ course, facts }: { course: CourseListing; facts: ReturnType<typeof listingFacts> }) {
  return (
    <>
      <h3 className="mt-2 text-[15px] font-medium leading-snug text-[#212121] @md:text-[16px]">{course.title}</h3>
      <p className="mt-0.5 text-[13px] font-semibold text-[#878787]">{course.provider}</p>
      <p className="mt-0.5 text-[12px] font-medium text-[#878787]">
        {[course.category, facts.level].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {facts.duration ? (
          <span className="rounded-full bg-[#f5f7fa] px-2 py-0.5 text-[11px] font-semibold text-[#212121]">{facts.duration}</span>
        ) : null}
        {facts.modeLabel ? (
          <span className="rounded-full bg-[#eef4ff] px-2 py-0.5 text-[11px] font-bold text-[#2874f0]">{facts.modeLabel}</span>
        ) : null}
        {facts.certificate ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5e9] px-2 py-0.5 text-[11px] font-bold text-[#388e3c]">
            <Award className="h-3 w-3" aria-hidden /> {facts.verified ? 'Verified certificate' : 'Certificate'}
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {facts.rating !== null ? <Rating value={facts.rating} reviews={facts.reviews} /> : <span />}
        {facts.feeLabel ? (
          <p className="text-[18px] font-bold text-[#212121]">
            {facts.feeLabel}
            {facts.feeSuffix ? <span className="text-[12px] font-semibold text-[#878787]">{facts.feeSuffix}</span> : null}
          </p>
        ) : null}
      </div>
    </>
  );
}

function FeaturedActions({
  course,
  facts,
  onOpen,
}: {
  course: CourseListing;
  facts: ReturnType<typeof listingFacts>;
  onOpen: () => void;
}) {
  const enquire = course.providerPhone ? (
    <a
      href={`tel:${course.providerPhone}`}
      onClick={(event) => event.stopPropagation()}
      aria-label={`Call ${course.provider} about ${course.title}`}
      className="bos-svc-cta flex items-center justify-center gap-1.5 rounded-lg border border-[#2874f0] bg-white py-2.5 text-[13px] font-bold text-[#2874f0]"
    >
      <Phone className="h-4 w-4" aria-hidden /> Enquire
    </a>
  ) : (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`Enquire about ${course.title}`}
      className="bos-svc-cta flex items-center justify-center gap-1.5 rounded-lg border border-[#2874f0] bg-white py-2.5 text-[13px] font-bold text-[#2874f0]"
    >
      <Phone className="h-4 w-4" aria-hidden /> Enquire
    </button>
  );

  const details = (label: string) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="bos-svc-cta rounded-lg bg-[#2874f0] py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-[#1a5dc9]"
    >
      {label}
    </button>
  );

  if (facts.kind === 'admissions') {
    return (
      <>
        {enquire}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="bos-svc-cta rounded-lg bg-[#ffe500] py-2.5 text-[13px] font-bold text-[#212121] shadow-sm"
        >
          Apply for Admission
        </button>
      </>
    );
  }

  if (facts.kind === 'training') {
    return (
      <>
        {details('View Details')}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="bos-svc-cta rounded-lg bg-[#ffe500] py-2.5 text-[13px] font-bold text-[#212121] shadow-sm"
        >
          Join Training
        </button>
      </>
    );
  }

  return (
    <>
      {enquire}
      {details('View Details →')}
    </>
  );
}

function FeeRow({ facts }: { facts: ReturnType<typeof listingFacts> }) {
  return (
    <p className="mt-1.5 flex min-h-[1.5rem] flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      {facts.feeLabel ? (
        <span className="text-[15px] font-bold leading-none text-[#212121] sm:text-[16px]">
          {facts.feeLabel}
          {facts.feeSuffix ? <span className="text-[11px] font-semibold text-[#878787]">{facts.feeSuffix}</span> : null}
        </span>
      ) : null}
      {facts.originalFeeLabel ? (
        <span className="text-[12px] font-medium text-[#9e9e9e] line-through">{facts.originalFeeLabel}</span>
      ) : null}
      {facts.discountPercent ? (
        <span className="text-[12px] font-bold text-[#388e3c]">{facts.discountPercent}% OFF</span>
      ) : null}
    </p>
  );
}

function GridCard({
  course,
  facts,
  onOpen,
  imageAlt,
}: {
  course: CourseListing;
  facts: ReturnType<typeof listingFacts>;
  onOpen: () => void;
  imageAlt: string;
}) {
  const [liked, setLiked] = useState(false);
  const heading = facts.kind === 'admissions' ? course.provider : course.title;
  const institute = facts.kind === 'admissions' ? course.title : instructorLine(course, facts);

  return (
    <article
      data-listing-kind={facts.kind}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${course.title}`}
      className="bos-svc-card group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe500]"
    >
      <div className="bos-svc-photo relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-[#f1f3f6]">
        <SafeImage
          src={catalogImageSrc(course.image)}
          alt={imageAlt}
          category="classes"
          className="absolute inset-0 h-full w-full object-cover"
          sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
        />
        <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold ${badgeTone(facts.categoryBadge)}`}>
          {facts.categoryBadge}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setLiked((value) => !value);
          }}
          aria-pressed={liked}
          aria-label={liked ? `Remove ${course.title} from favourites` : `Save ${course.title} to favourites`}
          className="bos-svc-heart absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 shadow-md"
        >
          <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-[#e0417c] text-[#e0417c]' : 'text-[#212121]'}`} aria-hidden />
        </button>
        {facts.kind === 'tuition' ? (
          course.providerPhone ? (
            <a
              href={`tel:${course.providerPhone}`}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Call ${course.provider} about ${course.title}`}
              className="bos-svc-cta absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[#2874f0] shadow-md"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              aria-label={`Enquire about ${course.title}`}
              className="bos-svc-cta absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[#2874f0] shadow-md"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
            </button>
          )
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-2.5 sm:p-3">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[13px] font-bold leading-snug text-[#212121] sm:text-[15px]">{heading}</h3>
        <p className="mt-1 truncate text-[11px] font-medium text-[#878787] sm:text-[12px]">{institute}</p>
        <FeeRow facts={facts} />
        <div className="mt-auto pt-2.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="bos-svc-cta w-full rounded-lg bg-[#2874f0] py-2 text-[12px] font-bold text-white shadow-sm hover:bg-[#1a5dc9] sm:py-2.5 sm:text-[13px]"
          >
            View Details →
          </button>
        </div>
      </div>
    </article>
  );
}

function ShelfCard({
  course,
  facts,
  onOpen,
  imageAlt,
}: {
  course: CourseListing;
  facts: ReturnType<typeof listingFacts>;
  onOpen: () => void;
  imageAlt: string;
}) {
  const [liked, setLiked] = useState(false);
  const heading = facts.kind === 'admissions' ? course.provider : course.title;
  const institute = facts.kind === 'admissions' ? course.title : instructorLine(course, facts);
  const enquire = facts.kind === 'tuition' ? (
    course.providerPhone ? (
      <a
        href={`tel:${course.providerPhone}`}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Call ${course.provider} about ${course.title}`}
        className="bos-svc-cta absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[#222] shadow-md"
      >
        <Phone className="h-3.5 w-3.5" aria-hidden />
      </a>
    ) : (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Enquire about ${course.title}`}
        className="bos-svc-cta absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-[#222] shadow-md"
      >
        <Phone className="h-3.5 w-3.5" aria-hidden />
      </button>
    )
  ) : null;

  return (
    <article
      data-listing-kind={facts.kind}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${course.title}`}
      className="bos-svc-card bos-svc-card--airbnb min-w-0 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe500]"
    >
      <div className="bos-svc-photo relative aspect-[4/3] overflow-hidden rounded-xl bg-[#ebebeb]">
        <SafeImage
          src={catalogImageSrc(course.image)}
          alt={imageAlt}
          category="classes"
          className="absolute inset-0 h-full w-full object-cover"
          sizes="(max-width: 639px) 46vw, (max-width: 1023px) 24vw, 14vw"
        />
        {course.demo ? (
          <span className="absolute left-2 top-2 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#222]">
            Demo
          </span>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setLiked((value) => !value);
          }}
          aria-pressed={liked}
          aria-label={liked ? `Remove ${course.title} from favourites` : `Save ${course.title} to favourites`}
          className="bos-svc-heart absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full"
        >
          <Heart
            className={`h-4 w-4 drop-shadow ${liked ? 'fill-[#e0417c] text-[#e0417c]' : 'fill-black/40 text-white'}`}
            aria-hidden
          />
        </button>
        {enquire}
      </div>
      <div className="mt-2 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-snug text-[#222]">{heading}</h3>
          {facts.rating !== null ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-[12px] font-medium text-[#222]">
              <Star className="h-3 w-3 fill-[#222] text-[#222]" aria-hidden />
              {facts.rating.toFixed(2)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[12px] text-[#6a6a6a]">{institute}</p>
        {facts.place ? <p className="truncate text-[12px] text-[#6a6a6a]">{facts.place}</p> : null}
        <p className="mt-0.5 truncate text-[12px] text-[#222]">
          {facts.feeLabel ? (
            <>
              <span className="font-semibold">{facts.feeLabel}</span>
              {facts.feeSuffix ? <span className="font-normal text-[#6a6a6a]">{facts.feeSuffix}</span> : null}
            </>
          ) : (
            <span className="text-[#6a6a6a]">Fees not published</span>
          )}
          {facts.modeLabel ? <span className="text-[#6a6a6a]"> · {facts.modeLabel}</span> : null}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className="bos-svc-cta mt-1 text-[12px] font-semibold text-[#222] underline decoration-[#ddd] underline-offset-2"
        >
          View Details →
        </button>
      </div>
    </article>
  );
}

function TileCard({
  course,
  facts,
  onOpen,
  imageAlt,
}: {
  course: CourseListing;
  facts: ReturnType<typeof listingFacts>;
  onOpen: () => void;
  imageAlt: string;
}) {
  return (
    <button
      type="button"
      data-listing-kind={facts.kind}
      onClick={onOpen}
      aria-label={`View details for ${course.title}`}
      className="bos-svc-card bos-svc-card--flat flex w-[168px] shrink-0 flex-col overflow-hidden rounded-xl border border-[#e8e8e8] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,.06)] sm:w-[188px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe500]"
    >
      <span className="bos-svc-photo relative block aspect-[16/10] overflow-hidden bg-[#f1f3f6]">
        <SafeImage src={catalogImageSrc(course.image)} alt={imageAlt} category="classes" className="h-full w-full object-cover" sizes="188px" />
        <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold ${badgeTone(facts.categoryBadge)}`}>
          {facts.categoryBadge}
        </span>
      </span>
      <span className="flex flex-1 flex-col p-2.5">
        <span className="line-clamp-2 min-h-[32px] text-[13px] font-bold leading-4 text-[#212121]">
          {facts.kind === 'admissions' ? course.provider : course.title}
        </span>
        <span className="mt-1 block truncate text-[12px] font-medium text-[#878787]">
          {facts.kind === 'admissions' ? course.title : instructorLine(course, facts)}
        </span>
        <FeeRow facts={facts} />
        <span className="bos-svc-cta mt-2 block w-full rounded-lg bg-[#2874f0] py-1.5 text-center text-[11px] font-bold text-white">
          View Details →
        </span>
      </span>
    </button>
  );
}

function RowCard({
  course,
  facts,
  onOpen,
  imageAlt,
}: {
  course: CourseListing;
  facts: ReturnType<typeof listingFacts>;
  onOpen: () => void;
  imageAlt: string;
}) {
  return (
    <button
      type="button"
      data-listing-kind={facts.kind}
      onClick={onOpen}
      aria-label={`View details for ${course.title}`}
      className="bos-svc-card bos-svc-card--flat flex w-full gap-3 border-b border-[#f0f0f0] bg-white p-3 text-left last:border-0 sm:gap-4 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffe500]"
    >
      <span className="bos-svc-photo relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-[#f1f3f6] sm:h-[120px] sm:w-[120px]">
        <SafeImage src={catalogImageSrc(course.image)} alt={imageAlt} category="classes" className="h-full w-full object-cover" sizes="120px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_TONE[facts.kind]}`}>{facts.kindLabel}</span>
        <span className="mt-1 line-clamp-2 block text-[14px] font-medium text-[#212121] sm:text-[16px]">
          {facts.kind === 'admissions' ? course.provider : course.title}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-[#878787]">
          {facts.kind === 'admissions' ? course.title : course.provider}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-[#878787]">
          {facts.kind === 'admissions'
            ? [facts.institutionType, facts.board, facts.place].filter(Boolean).join(' · ')
            : facts.kind === 'tuition'
              ? [facts.modeLabel, facts.batchTiming, facts.place].filter(Boolean).join(' · ')
              : [facts.duration, facts.modeLabel, facts.certificate ? 'Certificate' : null].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {facts.rating !== null ? <Rating value={facts.rating} reviews={facts.reviews} /> : null}
          {facts.verified ? (
            <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#2874f0]">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified
            </span>
          ) : null}
        </span>
        {facts.feeLabel ? (
          <span className="mt-1.5 block text-[18px] font-bold text-[#212121]">
            {facts.feeLabel}
            {facts.feeSuffix ? <span className="text-[12px] font-semibold text-[#878787]">{facts.feeSuffix}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}
