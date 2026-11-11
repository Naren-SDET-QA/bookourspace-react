import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  Shirt,
  Sparkles,
  Users,
  UserRound,
  Utensils,
  Wifi,
  Wind,
} from 'lucide-react';
import SafeImage from '../SafeImage';
import { BOS_CONTACT_PHONE, BOS_CALL_HREF, whatsappHref } from '../../lib/contactNumbers';
import { PgBookingPanel } from '../PgBookingPanel';
import { formatInr, pgGenderLabel, type PgCard } from '../../lib/sectionExperiences';

type DetailTab = 'about' | 'owner';

interface PgStyleThreeDetailProps {
  card: PgCard;
  initialTab?: DetailTab;
  onClose: () => void;
  canCall: boolean;
  canWhatsapp: boolean;
  ownerBusy: boolean;
  ownerState: string;
  contactNote: string;
  onCall: () => void;
  onWhatsapp: () => void;
}

const SECTION_LINKS: Array<[string, string]> = [
  ['pg-style3-overview', 'Property Details'],
  ['pg-style3-occupancy', 'Occupancy'],
  ['pg-style3-charges', 'Charges'],
  ['pg-style3-amenities', 'Amenities'],
  ['pg-style3-rules', 'House Rules'],
  ['pg-style3-location', 'Location'],
  ['pg-style3-reviews', 'Reviews'],
];

function amenityIcon(label: string) {
  const text = label.toLowerCase();
  if (/wifi|internet|broadband/.test(text)) return <Wifi className="h-4 w-4" aria-hidden="true" />;
  if (/\bac\b|air|cooling/.test(text)) return <Wind className="h-4 w-4" aria-hidden="true" />;
  if (/food|meal|mess|breakfast|lunch|dinner/.test(text)) return <Utensils className="h-4 w-4" aria-hidden="true" />;
  if (/laundry|wash|iron/.test(text)) return <Shirt className="h-4 w-4" aria-hidden="true" />;
  if (/bath|toilet|geyser/.test(text)) return <Bath className="h-4 w-4" aria-hidden="true" />;
  if (/parking|bike|car/.test(text)) return <Car className="h-4 w-4" aria-hidden="true" />;
  if (/power|backup|generator|inverter/.test(text)) return <Sparkles className="h-4 w-4" aria-hidden="true" />;
  if (/bed|room|sharing/.test(text)) return <BedDouble className="h-4 w-4" aria-hidden="true" />;
  return <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;
}

function infoIcon(label: string) {
  const text = label.toLowerCase();
  if (/available for|gender/.test(text)) return <Users className="h-4 w-4" aria-hidden="true" />;
  if (/preferred/.test(text)) return <UserRound className="h-4 w-4" aria-hidden="true" />;
  if (/available from/.test(text)) return <CalendarDays className="h-4 w-4" aria-hidden="true" />;
  if (/food|meal/.test(text)) return <Utensils className="h-4 w-4" aria-hidden="true" />;
  if (/ac|air/.test(text)) return <Wind className="h-4 w-4" aria-hidden="true" />;
  if (/parking/.test(text)) return <Car className="h-4 w-4" aria-hidden="true" />;
  if (/laundry/.test(text)) return <Shirt className="h-4 w-4" aria-hidden="true" />;
  if (/cleaning|housekeeping/.test(text)) return <Sparkles className="h-4 w-4" aria-hidden="true" />;
  return <Clock className="h-4 w-4" aria-hidden="true" />;
}

export function PgStyleThreeDetail({
  card,
  initialTab = 'about',
  onClose,
  canCall,
  canWhatsapp,
  ownerBusy,
  ownerState,
  contactNote,
  onCall,
  onWhatsapp,
}: PgStyleThreeDetailProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const ownerSectionRef = useRef<HTMLElement | null>(null);

  const photos = useMemo(() => {
    const list = [...card.photos];
    if (card.photo && !list.includes(card.photo)) list.unshift(card.photo);
    return list.slice(0, 8);
  }, [card]);
  const visiblePhotos = photos.length > 0 ? photos : [''];
  const mainPhoto = visiblePhotos[photoIndex % visiblePhotos.length];
  const totalPhotos = Math.max(card.photoCount || 0, visiblePhotos.length);

  const location = [card.locality, card.city].filter(Boolean).join(', ') || 'Location not provided';
  const price = card.rentRupees !== null ? formatInr(card.rentRupees) : 'Rent on request';
  const fallbackWhatsapp = whatsappHref(`Hi, I am interested in ${card.title} at ${location}. Is it available?`);
  const laundry = card.facilities.find((row) => row.label === 'Laundry')?.value || '';
  const infoTiles: Array<[string, string]> = [
    ['Available for', card.availableFor || pgGenderLabel(card.gender)],
    ['Preferred tenant', card.preferredTenant],
    ['Available from', card.availableFrom || 'Ask owner'],
    ['Food included', card.food || 'Not published'],
    ['AC room', card.acText || (card.hasAc ? 'Available' : 'Not published')],
    ['Parking', card.parking || 'Not published'],
    ['Laundry', laundry || 'Not published'],
    ['Room cleaning', card.roomCleaning || 'Not published'],
    ['Notice period', card.noticePeriod || 'Not published'],
  ];
  const extraDetails: Array<[string, string]> = [
    ['Total capacity', card.totalCapacity !== null ? `${card.totalCapacity} residents` : ''],
    ['Gate timing', card.gateClosingTime],
    ['Power backup', card.powerBackup],
    ['Wi-Fi', card.wifi],
    ['Bathroom', card.bathroom],
    ['Housekeeping', card.housekeeping],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  useEffect(() => {
    setPhotoIndex(0);
    setShowAllAmenities(false);
  }, [card.id]);

  useEffect(() => {
    if (initialTab !== 'owner') return;
    const timer = window.setTimeout(() => {
      ownerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [initialTab, card.id]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="fixed inset-0 z-[72] overflow-y-auto bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="pg-style3-detail-title">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to all PGs"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-black">{card.title}</p>
          {card.verified && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verified
            </span>
          )}
        </div>
      </header>

      <nav aria-label="PG detail sections" className="sticky top-[49px] z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 py-1.5 no-scrollbar">
          {SECTION_LINKS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black text-slate-600 transition hover:bg-slate-100 hover:text-orange-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-3 pb-28 pt-3">
        <div className={`grid gap-1.5 ${visiblePhotos.length > 1 ? 'grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : 'grid-cols-1'}`}>
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800">
            <SafeImage category="pg" src={mainPhoto || null} alt={card.title} priority className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-slate-950/75 px-2 py-0.5 text-[10px] font-black text-white">
              {(photoIndex % visiblePhotos.length) + 1}/{totalPhotos}
            </span>
            {visiblePhotos.length > 1 && (
              <button
                type="button"
                onClick={() => setPhotoIndex((index) => (index + 1) % visiblePhotos.length)}
                className="absolute bottom-2 right-2 rounded-lg bg-slate-950/80 px-2.5 py-1 text-[10px] font-black text-white"
              >
                +{Math.max(0, totalPhotos - 1)} Photos
              </button>
            )}
          </div>
          {visiblePhotos.length > 1 && (
            <div className="grid grid-rows-2 gap-1.5">
              {[1, 2].map((offset) => {
                const index = (photoIndex + offset) % visiblePhotos.length;
                return (
                  <button
                    key={`${offset}-${index}`}
                    type="button"
                    onClick={() => setPhotoIndex(index)}
                    className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 dark:bg-slate-800"
                    aria-label={`Show photo ${index + 1}`}
                  >
                    <SafeImage category="pg" src={visiblePhotos[index] || null} alt={`${card.title} photo ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="pg-style3-detail-title" className="text-xl font-black leading-tight sm:text-2xl">{card.title}</h1>
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {location}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-black">
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {pgGenderLabel(card.gender)}
            </span>
            {card.verified && <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-white">Verified</span>}
          </div>
        </div>

        <section id="pg-style3-overview" className="mt-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {infoTiles.map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
                <p className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wide text-slate-400">
                  <span className="text-orange-600 dark:text-orange-400">{infoIcon(label)}</span>
                  {label}
                </p>
                <p className="mt-1 line-clamp-3 text-[10px] font-black leading-4 text-slate-700 dark:text-slate-200">{value || 'Not published'}</p>
              </div>
            ))}
          </div>
          {extraDetails.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              {extraDetails.map(([label, value]) => (
                <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {label}: <strong>{value}</strong>
                </span>
              ))}
            </div>
          )}
        </section>

        <section id="pg-style3-occupancy" className="mt-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Occupancy</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Available for', card.availableFor || pgGenderLabel(card.gender)],
              ['Preferred tenant', card.preferredTenant || 'Not published'],
              ['Available from', card.availableFrom || 'Ask owner'],
              ['Total capacity', card.totalCapacity !== null ? `${card.totalCapacity} residents` : 'Not published'],
              ['Notice period', card.noticePeriod || 'Not published'],
              ['Gate timing', card.gateClosingTime || 'Not published'],
              ['Beds available', card.bedsAvailable !== null ? `${card.bedsAvailable}` : 'Checked live'],
              ['Deposit', card.deposit || 'As listed'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/50">
                <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-0.5 line-clamp-2 text-[10px] font-black leading-4 text-slate-700 dark:text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="space-y-3">
            <section id="pg-style3-charges" className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Room Types &amp; Pricing</h2>
              <div className={`mt-2 grid gap-2 ${card.roomTypes.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                {card.roomTypes.map((room, index) => (
                  <div key={`${room.label}-${index}`} className={`rounded-xl border p-2.5 ${index === 0 ? 'border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <p className="flex items-center gap-1 truncate text-[11px] font-black">
                      <BedDouble className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" /> {room.label}
                    </p>
                    <p className="mt-1 text-base font-black text-orange-600 dark:text-orange-400">
                      {room.price !== null ? formatInr(room.price) : 'Ask owner'}
                      {room.price !== null && <span className="ml-0.5 text-[9px] font-bold text-slate-500">{card.rentUnit || '/month'}</span>}
                    </p>
                    <p className="text-[9px] font-semibold text-slate-500">Deposit {room.deposit || 'as listed'}</p>
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-200/70 pt-1.5 dark:border-slate-700">
                      {card.facilities.slice(0, 4).map((facility) => (
                        <span key={facility.label} className="text-slate-500 dark:text-slate-400" title={`${facility.label}: ${facility.value}`}>
                          {amenityIcon(facility.label)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="pg-style3-about" className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">About this PG</h2>
              <p className="mt-1.5 whitespace-pre-line text-[11px] leading-5 text-slate-700 dark:text-slate-300">{card.description || 'The owner has not added a description yet.'}</p>
            </section>

            <section id="pg-style3-amenities" className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Amenities</h2>
                {card.facilities.length > 8 && (
                  <button type="button" onClick={() => setShowAllAmenities((value) => !value)} className="text-[10px] font-black text-orange-700 dark:text-orange-300">
                    {showAllAmenities ? 'Less' : `+${card.facilities.length - 8} More`}
                  </button>
                )}
              </div>
              {card.facilities.length > 0 ? (
                <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {(showAllAmenities ? card.facilities : card.facilities.slice(0, 8)).map((facility) => (
                    <div key={`${facility.label}-${facility.value}`} className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-slate-50 px-1 py-2 text-center dark:bg-slate-800/50">
                      <span className="text-orange-600 dark:text-orange-400">{amenityIcon(facility.label)}</span>
                      <span className="line-clamp-2 text-[8px] font-bold leading-tight text-slate-600 dark:text-slate-300">{facility.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-3 text-[10px] text-slate-500 dark:border-slate-700">The owner has not published amenities for this PG yet.</p>
              )}
            </section>

            <section id="pg-style3-rules" className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">PG Rules</h2>
              {card.rules.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {card.rules.map((rule) => (
                    <span key={`${rule.label}-${rule.value}`} className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                      {rule.label}: <strong className="text-slate-800 dark:text-slate-100">{rule.value}</strong>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-slate-500">The owner has not published separate PG rules yet.</p>
              )}
            </section>

            <section id="pg-style3-location" className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Location</h2>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <MapPin className="h-3.5 w-3.5 text-orange-600" aria-hidden="true" /> {location}
              </p>
              {card.lat !== null && card.lng !== null ? (
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <iframe
                    title={`Map for ${card.title}`}
                    loading="lazy"
                    className="h-56 w-full border-0"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${card.lng - 0.008}%2C${card.lat - 0.008}%2C${card.lng + 0.008}%2C${card.lat + 0.008}&layer=mapnik&marker=${card.lat}%2C${card.lng}`}
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${card.lat}&mlon=${card.lng}#map=16/${card.lat}/${card.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block border-t border-slate-200 bg-white px-2 py-1.5 text-[9px] font-black text-orange-700 dark:border-slate-700 dark:bg-slate-900 dark:text-orange-300"
                  >
                    Open larger map
                  </a>
                </div>
              ) : (
                <p className="mt-2 rounded-xl border border-dashed border-slate-300 p-2.5 text-[10px] text-slate-500 dark:border-slate-700">
                  Map coordinates are not published. The owner shares the exact address after a visit request or call.
                </p>
              )}
            </section>

        <section id="pg-style3-reviews" className="mt-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Reviews</h2>
          {card.rating !== null ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-2xl font-black text-orange-600 dark:text-orange-400">{card.rating.toFixed(1)}</p>
              <div>
                <p className="text-[11px] font-black text-slate-800 dark:text-slate-100">{card.reviewCount} verified review{card.reviewCount === 1 ? '' : 's'}</p>
                <p className="text-[9px] text-slate-500">Individual review text is not published on this listing preview.</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-slate-500">No reviews have been published for this PG yet.</p>
          )}
        </section>

            <section id="pg-style3-owner" ref={ownerSectionRef} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <h2 className="text-[11px] font-black uppercase tracking-wide text-slate-500">Owner &amp; Booking</h2>
              <p className="mt-1 text-[11px] font-black">{card.providerName || 'Owner details not listed'}</p>
              <p className="text-[9px] text-slate-500">Owner contact uses BookOurSpace's authorised flow when available; otherwise the BookOurSpace desk number is shown.</p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {canCall ? (
                  <button
                    type="button"
                    onClick={onCall}
                    disabled={ownerBusy}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-orange-600 px-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                  >
                    <Phone className="h-3 w-3" aria-hidden="true" /> Call Owner
                  </button>
                ) : (
                  <a href={BOS_CALL_HREF} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl bg-orange-600 px-2 text-[10px] font-black text-white">
                    <Phone className="h-3 w-3" aria-hidden="true" /> Call Owner · {BOS_CONTACT_PHONE}
                  </a>
                )}
                {canWhatsapp ? (
                  <button
                    type="button"
                    onClick={onWhatsapp}
                    disabled={ownerBusy}
                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-orange-300 px-2 text-[10px] font-black text-orange-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:border-orange-900 dark:text-orange-300"
                  >
                    WhatsApp
                  </button>
                ) : (
                  <a href={fallbackWhatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center justify-center rounded-xl border border-orange-300 px-2 text-[10px] font-black text-orange-700 dark:border-orange-900 dark:text-orange-300">
                    WhatsApp · {BOS_CONTACT_PHONE}
                  </a>
                )}
              </div>
              {(ownerState === 'loading' || contactNote) && (
                <p role="status" className="mt-2 text-[9px] leading-4 text-slate-500 dark:text-slate-400">
                  {ownerState === 'loading'
                    ? 'Checking owner contact permissions…'
                    : (canCall || canWhatsapp
                      ? contactNote
                      : 'Owner contact is unavailable right now, so the BookOurSpace desk number is shown.')}
                </p>
              )}
              <div className="mt-3">
                <PgBookingPanel listingId={card.id} />
              </div>
            </section>
          </div>

          <aside className="space-y-2 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-3 dark:border-orange-900 dark:bg-orange-950/20">
              <p className="text-[8px] font-black uppercase tracking-wide text-orange-700 dark:text-orange-300">Starting from</p>
              <p className="mt-0.5 text-2xl font-black text-orange-600 dark:text-orange-400">
                {price}
                {card.rentRupees !== null && <span className="ml-1 text-[9px] font-bold text-slate-500">{card.rentUnit || '/month'}</span>}
              </p>
              <div className="mt-2 space-y-1.5 border-t border-orange-200/70 pt-2 text-[10px] font-semibold text-slate-600 dark:border-orange-900/60 dark:text-slate-300">
                <p className="flex items-center gap-1"><Users className="h-3 w-3 text-orange-600" aria-hidden="true" /> For {pgGenderLabel(card.gender)}</p>
                <p className="flex items-center gap-1"><Clock className="h-3 w-3 text-orange-600" aria-hidden="true" /> Notice: {card.noticePeriod || 'As per owner'}</p>
                <p className="flex items-center gap-1"><Utensils className="h-3 w-3 text-orange-600" aria-hidden="true" /> {card.food || 'Food not published'}</p>
                <p className="flex items-center gap-1"><UserRound className="h-3 w-3 text-orange-600" aria-hidden="true" /> {card.preferredTenant || 'Tenant preference not published'}</p>
                <p className="flex items-center gap-1"><BedDouble className="h-3 w-3 text-orange-600" aria-hidden="true" /> Deposit: {card.deposit || 'As listed'}</p>
              </div>
              {canCall ? (
                <button
                  type="button"
                  onClick={onCall}
                  disabled={ownerBusy}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-600 text-[11px] font-black text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Contact Owner
                </button>
              ) : (
                <a href={BOS_CALL_HREF} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-600 text-[11px] font-black text-white">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Contact Owner · {BOS_CONTACT_PHONE}
                </a>
              )}
            </div>
          </aside>
        </div>
      </main>

      <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-2">
          {canCall ? (
            <button
              type="button"
              onClick={onCall}
              disabled={ownerBusy}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-orange-300 text-xs font-black text-orange-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 dark:border-orange-900 dark:text-orange-300"
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> Call Owner
            </button>
          ) : (
            <a href={BOS_CALL_HREF} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-orange-300 text-xs font-black text-orange-700 dark:border-orange-900 dark:text-orange-300">
              <Phone className="h-4 w-4" aria-hidden="true" /> Call Owner · {BOS_CONTACT_PHONE}
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              ownerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-orange-600 text-xs font-black text-white transition hover:bg-orange-700"
          >
            Book Visit
          </button>
        </div>
      </div>
    </div>
  );
}
