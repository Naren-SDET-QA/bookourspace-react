import React from 'react';
import {
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  LockKeyhole,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { MarketplaceListing } from '../types/marketplace';
import { buildStayDetailContent } from '../features/stays/stayDetails';

interface StayAirbnbDetailsProps {
  listing: MarketplaceListing;
  currentLang: string;
}

const textField = (listing: MarketplaceListing, ...keys: string[]) => {
  for (const key of keys) {
    const value = listing.customFieldValues?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
};

export const StayAirbnbDetails: React.FC<StayAirbnbDetailsProps> = ({ listing, currentLang }) => {
  const isTelugu = currentLang === 'te';
  const content = buildStayDetailContent(
    listing,
    currentLang === 'te' ? 'te' : currentLang === 'hi' ? 'hi' : 'en',
  );
  const city = listing.location.city;
  const propertyType = listing.categoryId.includes('service-apt')
    ? (isTelugu ? 'మొత్తం సర్వీస్ అపార్ట్‌మెంట్' : 'Entire serviced apartment')
    : listing.categoryId.includes('homestay') || listing.categoryId.includes('resort')
    ? (isTelugu ? 'మొత్తం ప్రైవేట్ స్టే' : 'Entire private stay')
    : (isTelugu ? 'వెరిఫైడ్ హోటల్ స్టే' : 'Verified hotel stay');
  const hostStatus = textField(listing, isTelugu ? 'hostStatusTe' : 'hostStatus', 'hostStatusEn') || (listing.isVerified ? (isTelugu ? 'వెరిఫైడ్ హోస్ట్' : 'Verified host') : (isTelugu ? 'ప్రొవైడర్' : 'Provider'));
  const hostingDuration = textField(listing, isTelugu ? 'hostingDurationTe' : 'hostingDuration', 'hostingMonths');
  const responseRate = textField(listing, 'responseRate');
  const responseTime = textField(listing, 'responseTime');
  const languages = textField(listing, isTelugu ? 'languagesTe' : 'languages', 'languagesEn');
  const hostBio = textField(listing, isTelugu ? 'hostBioTe' : 'hostBio', 'hostBioEn');

  return (
    <div className="space-y-8 border-t border-slate-200 pt-6 dark:border-slate-800">
      <section id="stay-summary" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{propertyType} · {city}, India</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-500"><Users className="h-3.5 w-3.5" /> {content.guestSummary} · {content.roomSummary}</p>
          </div>
          <div className="flex items-center gap-1 text-sm font-black text-slate-900 dark:text-white"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {listing.providerRating.toFixed(1)} <span className="font-bold text-slate-500">· {listing.reviewCount} reviews</span></div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">⭐ {isTelugu ? 'గెస్ట్ ఫేవరెట్' : 'Guest favourite'}</span>
          {listing.isVerified && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"><ShieldCheck className="h-3.5 w-3.5" /> {isTelugu ? 'వెరిఫైడ్ ప్రొవైడర్' : 'Verified provider'}</span>}
        </div>
      </section>

      <section id="stay-highlights" className="space-y-3">
        <h3 className="text-base font-black text-slate-900 dark:text-white">{isTelugu ? 'లిస్టింగ్ హైలైట్స్' : 'Listing highlights'}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {content.highlights.map((highlight) => (
            <div key={highlight.label} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xl">{highlight.emoji}</div>
              <p className="mt-1 text-xs font-black text-slate-900 dark:text-white">{highlight.label}</p>
              {highlight.value && <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{highlight.value}</p>}
            </div>
          ))}
        </div>
      </section>

      <section id="stay-space" className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white"><Home className="h-4 w-4 text-rose-500" /> {isTelugu ? 'ది స్పేస్' : 'The space'}</h3>
        <p className="whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-300">{isTelugu ? listing.descriptionTe || listing.description : listing.description}</p>
        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
          <p className="text-xs font-black text-slate-900 dark:text-white">{isTelugu ? 'నిద్ర ఏర్పాట్లు' : "Where you'll sleep"}</p>
          <div className="mt-3 flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300"><BedDouble className="mt-0.5 h-5 w-5 text-rose-500" /><span>{content.roomSummary}</span></div>
        </div>
      </section>

      <section id="stay-amenities" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-black text-slate-900 dark:text-white">{isTelugu ? 'ఈ ప్రదేశంలో ఏముంది' : 'What this place offers'}</h3>
          <span className="text-[11px] font-bold text-slate-500">{content.amenities.length} {isTelugu ? 'సౌకర్యాలు' : 'amenities'}</span>
        </div>
        {content.amenities.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {content.amenities.map((amenity) => (
              <div key={amenity.label} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                <span className="text-base">{amenity.emoji}</span>
                <span><span className="block font-black text-slate-800 dark:text-slate-100">{amenity.label}</span>{amenity.value && <span className="mt-0.5 block text-[10px] text-slate-500">{amenity.value}</span>}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-xs text-slate-500 dark:border-slate-700">{isTelugu ? 'ప్రొవైడర్ సౌకర్యాల జాబితా త్వరలో ప్రచురించబడుతుంది.' : 'The provider has not published an amenity list yet.'}</p>
        )}
      </section>

      <section id="stay-rules" className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{isTelugu ? 'హౌస్ రూల్స్' : 'House rules'}</h3>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {content.houseRules.map((rule) => <li key={rule} className="flex gap-2"><span className="text-slate-400">•</span><span>{rule}</span></li>)}
          </ul>
          {!content.houseRulesPublished && <p className="mt-3 text-[10px] font-bold text-amber-700 dark:text-amber-300">{isTelugu ? 'తుది నియమాలు ప్రొవైడర్‌తో నిర్ధారించండి.' : 'Confirm final rules with the provider before payment.'}</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">{isTelugu ? 'చెక్-ఇన్ & పాలసీ' : 'Check-in & policy'}</h3>
          <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-500" /><strong>{isTelugu ? 'చెక్-ఇన్:' : 'Check-in:'}</strong> {content.checkIn}</p>
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-500" /><strong>{isTelugu ? 'చెక్-అవుట్:' : 'Checkout:'}</strong> {content.checkOut}</p>
            <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-emerald-500" /><span>{content.cancellationPolicy}</span></p>
            {content.securityDeposit && <p className="flex items-start gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 text-amber-500" /><span>{content.securityDeposit}</span></p>}
          </div>
        </div>
      </section>

      <section id="stay-location" className="space-y-3">
        <h3 className="text-base font-black text-slate-900 dark:text-white">{isTelugu ? 'మీరు ఎక్కడ ఉంటారు' : "Where you'll be"}</h3>
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><MapPin className="h-4 w-4 text-rose-500" /> {listing.location.area}, {listing.location.city}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{isTelugu ? 'ఖచ్చితమైన లొకేషన్ బుకింగ్ తర్వాత అందించబడుతుంది.' : 'Exact location and access instructions are provided after booking.'}</p>
          <div className="mt-3 h-24 rounded-xl bg-slate-100 [background-image:linear-gradient(25deg,transparent_48%,#cbd5e1_49%,#cbd5e1_51%,transparent_52%),linear-gradient(110deg,transparent_46%,#e2e8f0_47%,#e2e8f0_53%,transparent_54%)] [background-size:100px_75px,130px_90px] dark:bg-slate-800" aria-label="Approximate location map" />
        </div>
      </section>

      <section id="stay-host" className="space-y-3">
        <h3 className="text-base font-black text-slate-900 dark:text-white">{isTelugu ? 'మీ హోస్ట్‌ను కలవండి' : 'Meet your host'}</h3>
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center dark:border-slate-800">
          <img src={listing.providerAvatar} alt={listing.providerName} className="h-16 w-16 rounded-2xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white">{listing.providerName} {listing.isVerified && <ShieldCheck className="h-4 w-4 text-emerald-600" />}</p>
            <p className="mt-1 text-xs text-slate-500">{hostStatus}{hostingDuration ? ` · ${hostingDuration}` : ''}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              <span>⭐ {listing.providerRating.toFixed(2)} · {listing.reviewCount} reviews</span>
              {responseRate && <span>{responseRate} response rate</span>}
              {responseTime && <span>Responds {responseTime}</span>}
              {languages && <span>Speaks {languages}</span>}
            </div>
            {hostBio && <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{hostBio}</p>}
          </div>
          <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 dark:border-slate-700 dark:text-slate-200"><MessageCircle className="h-3.5 w-3.5" /> {isTelugu ? 'హోస్ట్‌కు మెసేజ్' : 'Message host'}</button>
        </div>
      </section>

      <section id="stay-reviews" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /> {isTelugu ? 'సమీక్షలు' : 'Reviews'}</h3>
          <span className="text-sm font-black text-slate-900 dark:text-white">{listing.providerRating.toFixed(1)} / 5 · {listing.reviewCount} {isTelugu ? 'సమీక్షలు' : 'reviews'}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{isTelugu ? 'బుకింగ్ తర్వాత ధృవీకరించబడిన అతిథులు సమీక్షను సమర్పించగలరు.' : 'Verified guests can submit a review after a completed booking.'}</p>
        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {isTelugu ? 'బుకింగ్ మరియు పేమెంట్ స్టేటస్ సర్వర్ ద్వారా ధృవీకరించబడుతుంది' : 'Booking and payment status are verified server-side'}</div>
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-slate-200 p-3 text-[11px] leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>{isTelugu ? 'పేమెంట్ కోసం BookOurSpace వెలుపల డబ్బు పంపవద్దు. చెల్లింపు మరియు బుకింగ్ ధృవీకరణ సర్వర్ ద్వారా మాత్రమే జరుగుతుంది.' : 'For your protection, keep payment inside BookOurSpace. Booking and payment confirmation are server-verified.'}</span>
      </div>
    </div>
  );
};
