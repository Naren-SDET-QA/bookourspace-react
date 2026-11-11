import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Heart,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Share2,
  ShieldCheck,
  Snowflake,
  Users,
  Zap,
  Car,
  Armchair,
} from 'lucide-react';
import type { MarketplaceListing } from '../types/marketplace';
import SafeImage from './SafeImage';
import { BOS_CALL_HREF, whatsappHref } from '../lib/contactNumbers';

interface VenueDetailModalProps {
  listing: MarketplaceListing;
  onClose: () => void;
  onChat: () => void;
  onRequestAvailability: () => void;
}

const TABS = ['Overview', 'Amenities', 'Timings', 'Policies'] as const;
type Tab = (typeof TABS)[number];

const field = (listing: MarketplaceListing, key: string): string => {
  const raw = listing.customFieldValues?.[key];
  if (raw === undefined || raw === null || raw === '') return '';
  return String(raw);
};

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function VenueDetailModal({ listing, onClose, onChat, onRequestAvailability }: VenueDetailModalProps) {
  const [tab, setTab] = useState<Tab>('Overview');
  const [imgIdx, setImgIdx] = useState(0);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const images = listing.images.filter((image) => typeof image === 'string' && image.trim().length > 0);
  const capacity = field(listing, 'capacity') || field(listing, 'seatingCapacity');
  const acType = field(listing, 'acType') || field(listing, 'venueType') || field(listing, 'acHallType');
  const parking = field(listing, 'parkingCapacity');
  const power = field(listing, 'powerBackup') || field(listing, 'guestRooms');
  const stage = field(listing, 'stageSpecs');
  const sound = field(listing, 'soundLight') || field(listing, 'decorationSound');
  const decor = field(listing, 'decorationPolicy') || field(listing, 'decorationSound');
  const operatingHours = field(listing, 'operatingHours');
  const cancellation = field(listing, 'cancellationPolicy');
  const catering = field(listing, 'cateringPolicy');
  const ownership = field(listing, 'ownership');
  const approval = field(listing, 'approvalRequired');

  const strip = useMemo(
    () =>
      [
        { icon: Users, label: 'Capacity', value: capacity },
        { icon: Snowflake, label: 'AC', value: acType },
        { icon: Car, label: 'Parking', value: parking },
        { icon: Armchair, label: 'Seating', value: capacity },
        { icon: Zap, label: 'Power', value: power },
      ].filter((item) => item.value),
    [capacity, acType, parking, power],
  );

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#venue-${listing.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: listing.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user cancelled */
    }
  };

  const rows = (items: Array<{ label: string; value: string }>) =>
    items.filter((r) => r.value).map((r) => (
      <div key={r.label} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
        <span className="shrink-0 text-[11.5px] font-semibold text-slate-500">{r.label}</span>
        <span className="text-right text-[12px] font-bold text-slate-800">{r.value}</span>
      </div>
    ));

  return (
    <div className="fixed inset-0 z-[95] overflow-y-auto bg-[#faf9ff]" role="dialog" aria-modal="true" aria-labelledby="venue-detail-title">
      <div className="mx-auto w-full max-w-4xl pb-28">
        {/* Gallery */}
        <div className="relative">
          <div className="relative h-60 w-full overflow-hidden rounded-b-[28px] bg-slate-200 sm:h-80">
            {images[imgIdx] ? (
              <SafeImage
                src={images[imgIdx]}
                alt={listing.title}
                className="h-full w-full object-cover"
                category="venues"
                sizes="100vw"
              />
            ) : (
              <div role="img" aria-label="No venue photo provided" className="flex h-full w-full items-center justify-center bg-violet-50 text-sm font-semibold text-violet-700">
                No venue photo provided
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-800 shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSaved((s) => !s)}
                aria-label="Favorite"
                aria-pressed={saved}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
              >
                <Heart className={`h-4 w-4 ${saved ? 'fill-[#7c3aed] text-[#7c3aed]' : ''}`} />
              </button>
              <button
                type="button"
                onClick={share}
                aria-label="Share"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>
            {listing.isVerified && (
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-[#7c3aed] px-2.5 py-1 text-[10px] font-bold text-white">
                <ShieldCheck className="h-3 w-3" /> Verified venue
              </span>
            )}
            {images.length > 1 && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {images.slice(0, 5).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setImgIdx(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={`h-1.5 w-1.5 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/60'}`}
                  />
                ))}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {images.slice(0, 6).map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setImgIdx(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border ${i === imgIdx ? 'border-[#7c3aed]' : 'border-transparent'}`}
                >
                  <SafeImage src={src} alt={`${listing.title} venue photo`} className="h-full w-full object-cover" category="venues" sizes="120px" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title card */}
        <div className="relative -mt-4 px-3 sm:px-4">
          <div className="rounded-2xl bg-white p-4 shadow-[0_6px_22px_rgba(91,33,182,0.10)]">
            <h1 id="venue-detail-title" className="text-[17px] font-black leading-6 text-[#1e1b4b] sm:text-[20px]">
              {listing.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {listing.location.area}, {listing.location.city}</span>
              {typeof listing.providerRating === 'number' && Number.isFinite(listing.providerRating) && listing.reviewCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {listing.providerRating.toFixed(1)} · {listing.reviewCount} {listing.reviewCount === 1 ? 'review' : 'reviews'}
                </span>
              )}
              {listing.location.distanceKm !== undefined && (
                <span>· {listing.location.distanceKm} km away</span>
              )}
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Starting from</p>
                <p className="text-[22px] font-black text-[#1e1b4b]">
                  {money(listing.price)}<span className="text-[11px] font-semibold text-slate-500">{listing.priceUnit || '/day'}</span>
                </p>
              </div>
              <span className="rounded-full bg-[#f5f3ff] px-2.5 py-1 text-[10px] font-bold text-[#6d28d9]">
                {listing.subcategory || 'Venue'}
              </span>
            </div>
          </div>
        </div>

        {/* Amenities strip */}
        {strip.length > 0 && (
          <div className="mt-3 grid grid-cols-5 gap-1.5 px-3 sm:px-4">
            {strip.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col items-center rounded-xl bg-white px-1 py-2 text-center shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
                <Icon className="h-3.5 w-3.5 text-[#7c3aed]" />
                <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                <span className="line-clamp-2 text-[9px] font-bold leading-tight text-slate-700">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="mt-3 px-3 sm:px-4">
          <div className="flex gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-selected={tab === t}
                className={`flex-1 shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition ${tab === t ? 'bg-[#7c3aed] text-white' : 'text-slate-600'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-2 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            {tab === 'Overview' && (
              <div className="space-y-2">
                <p className="text-[12.5px] leading-5 text-slate-600">{listing.description}</p>
                <div className="pt-1">
                  {rows([
                    { label: 'Venue type', value: field(listing, 'venueType') },
                    { label: 'Ownership', value: ownership },
                    { label: 'Approvals', value: approval },
                  ])}
                </div>
              </div>
            )}

            {tab === 'Amenities' && (
              <div>
                {rows([
                  { label: 'Capacity / seating', value: capacity },
                  { label: 'Air conditioning', value: acType },
                  { label: 'Parking', value: parking },
                  { label: 'Power backup', value: power },
                  { label: 'Stage', value: stage },
                  { label: 'Sound & lighting', value: sound },
                  { label: 'Decoration', value: decor },
                ])}
                {[capacity, acType, parking, power, stage, sound, decor].every((v) => !v) && (
                  <p className="text-[12px] text-slate-500">No amenities have been published for this venue yet.</p>
                )}
              </div>
            )}

            {tab === 'Timings' && (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#7c3aed]">
                  <Clock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12.5px] font-bold text-slate-800">Operating hours</p>
                  <p className="text-[12px] text-slate-600">{operatingHours || 'Not published yet.'}</p>
                  <p className="mt-1 text-[10.5px] text-slate-400">Timings are confirmed by the venue when you request availability.</p>
                </div>
              </div>
            )}

            {tab === 'Policies' && (
              <div>
                {rows([
                  { label: 'Catering policy', value: catering },
                  { label: 'Cancellation policy', value: cancellation },
                  { label: 'Approvals required', value: approval },
                ])}
                {[catering, cancellation, approval].every((v) => !v) && (
                  <p className="text-[12px] text-slate-500">No policies have been published for this venue yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-[96] border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-2 px-3 py-2.5 sm:grid-cols-4">
          <a
            href={BOS_CALL_HREF}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-600 text-[11.5px] font-bold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300"
          >
            <Phone className="h-4 w-4" /> Call Now
          </a>
          <a
            href={whatsappHref(`Hi, I am interested in ${listing.title}. Please share availability and pricing.`)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 text-[11.5px] font-bold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          <button
            type="button"
            onClick={onChat}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#7c3aed] text-[11.5px] font-bold text-[#6d28d9] transition hover:bg-[#f5f3ff] dark:text-violet-300"
          >
            <MessageSquare className="h-4 w-4" /> Chat
          </button>
          <button
            type="button"
            onClick={onRequestAvailability}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#7c3aed] text-[11.5px] font-bold text-white transition hover:bg-[#6d28d9]"
          >
            Book Hall
          </button>
        </div>
      </div>
    </div>
  );
}
