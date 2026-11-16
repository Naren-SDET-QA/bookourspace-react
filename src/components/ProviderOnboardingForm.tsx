import React, { useEffect, useState } from 'react';
import { fetchOwnProviderRegistration, submitServerProviderRegistration } from '../lib/supabaseClient';
import type { MarketSectionType } from '../data/servicesStayMoviesData';
import { ServiceCoveragePicker } from './ServiceCoveragePicker';
import { nearestCatalogLocation } from '../lib/locationSearch';

type ProviderType = MarketSectionType;

// Provider registration is a five-module application. Movies is a discovery-only
// directory with no provider onboarding, so a movies context registers under the
// services application (the same mapping used when a rejected registration is
// restored) instead of widening the API contract.
type RegistrationProviderType = 'pg_hostels' | 'classes' | 'venues' | 'services' | 'hotel_stay';

function toRegistrationProviderType(value: ProviderType): RegistrationProviderType {
  return value === 'movies' ? 'services' : value;
}
type AuthUser = { name?: string; email?: string; role: string };

const PROVIDER_TYPES: Array<{ id: ProviderType; label: string }> = [
  { id: 'pg_hostels', label: 'PGs & Hostels' },
  { id: 'classes', label: 'Classes & Training' },
  { id: 'venues', label: 'Function Halls & Venues' },
  { id: 'services', label: 'Home & Local Services' },
  { id: 'hotel_stay', label: 'Hotels & Stays' },
  { id: 'movies', label: 'Movies & Cinema' },
];

export function ProviderOnboardingForm({
  authUser,
  defaultSection,
  onClose,
}: {
  authUser: AuthUser | null;
  defaultSection: MarketSectionType;
  onClose: () => void;
}) {
  const [providerType, setProviderType] = useState<ProviderType>(defaultSection);
  const [businessName, setBusinessName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [pgAddress, setPgAddress] = useState('');
  const [pgPincode, setPgPincode] = useState('');
  const [pgGender, setPgGender] = useState('any');
  const [pgRoomType, setPgRoomType] = useState('single');
  const [pgBeds, setPgBeds] = useState('1');
  const [pgRent, setPgRent] = useState('');
  const [pgDeposit, setPgDeposit] = useState('');
  const [pgPhotos, setPgPhotos] = useState(['', '', '']);
  const [pgAmenities, setPgAmenities] = useState('');
  const [pgRules, setPgRules] = useState('');
  const [pgDescription, setPgDescription] = useState('');
  const [formLanguage, setFormLanguage] = useState('en-IN');
  const [locationBusy, setLocationBusy] = useState(false);
  const [voiceField, setVoiceField] = useState('');
  const [serviceCoverage, setServiceCoverage] = useState<{ state: string; district: string; mandal: string; village: string; path: string } | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const speakInto = (field: string, setter: (value: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Voice input is not supported in this browser. You can type the same details instead.'); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = formLanguage;
    recognition.interimResults = false;
    recognition.onstart = () => setVoiceField(field);
    recognition.onend = () => setVoiceField('');
    recognition.onerror = () => { setVoiceField(''); setError('Voice input was not clear. Please try again or type the value.'); };
    recognition.onresult = (event: any) => setter(String(event.results?.[0]?.[0]?.transcript || '').trim());
    recognition.start();
  };

  const useGpsForProperty = () => {
    if (!navigator.geolocation) { setError('Location is not available on this device. Please enter the address manually.'); return; }
    setLocationBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const location = await nearestCatalogLocation(coords.latitude, coords.longitude);
        setCity(location.name || location.district || '');
        setArea(location.name || location.district || '');
        if (location.pincode) setPgPincode(location.pincode);
        setPgAddress([location.name, location.district, location.state].filter(Boolean).join(', '));
      } catch {
        setError('GPS found your position, but the address could not be resolved. Please enter the address manually.');
      } finally { setLocationBusy(false); }
    }, () => { setLocationBusy(false); setError('Location permission was denied. Please enter the address manually.'); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  useEffect(() => {
    if (!authUser) { setBusy(false); return; }
    let mounted = true;
    void fetchOwnProviderRegistration().then((result) => {
      if (!mounted) return;
      if (result.ok && result.data.source === 'postgres') {
        setExisting(result.registration);
        if (result.registration?.status === 'rejected') {
          setBusinessName(result.registration.businessName || '');
          setContactPhone(result.registration.contactPhone || '');
          setCity(result.registration.city || '');
          setArea(result.registration.area || '');
          setProviderType(result.registration.providerType || (defaultSection === 'movies' ? 'services' : defaultSection));
          setRequestId(crypto.randomUUID());
        }
      }
      else setError(result.data.error || 'Provider registration is unavailable until the database profile is ready.');
    }).catch(() => {
      if (mounted) setError('Provider registration could not be loaded. Try again after signing in.');
    }).finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [authUser]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!authUser || authUser.role !== 'customer') {
      setError('Sign in with your Google account as a customer to submit a provider application.');
      return;
    }
    const selectedCity = providerType === 'services' ? serviceCoverage?.district || '' : city.trim();
    const selectedArea = providerType === 'services' ? serviceCoverage?.village || '' : area.trim();
    const photos = pgPhotos.map((photo) => photo.trim()).filter(Boolean);
    if (businessName.trim().length < 2 || !/^\+?[0-9][0-9\s().-]{5,22}$/.test(contactPhone.trim()) || selectedCity.length < 2 || selectedArea.length < 2 || (providerType === 'services' && !serviceCoverage?.path)) {
      setError('Enter a business name, valid contact phone, city and area.');
      return;
    }
    if (providerType === 'pg_hostels' && (photos.length < 1 || pgAddress.trim().length < 8 || !/^\d{6}$/.test(pgPincode.trim()) || Number(pgRent) <= 0 || Number(pgBeds) < 1 || !pgGender || !pgRoomType)) {
      setError('For a PG, add at least one photo URL, full address, 6-digit PIN, rent, beds, room type and occupancy.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitServerProviderRegistration({
        requestId,
        providerType: toRegistrationProviderType(providerType),
        businessName: businessName.trim(),
        contactPhone: contactPhone.trim(),
        city: selectedCity,
        area: selectedArea,
        ...(providerType === 'services' && serviceCoverage?.path ? { serviceArea: serviceCoverage.path } : {}),
        ...(providerType === 'pg_hostels' ? { availability: {
          photos, address: pgAddress.trim(), pincode: pgPincode.trim(), gender: pgGender, roomType: pgRoomType,
          totalBeds: Number(pgBeds), monthlyRent: Number(pgRent), securityDeposit: Number(pgDeposit) || 0,
          amenities: pgAmenities.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 30),
          houseRules: pgRules.trim(), description: pgDescription.trim(),
        } } : {}),
      });
      if (!result.ok || result.data.source !== 'postgres' || !result.registration) {
        throw new Error(result.data.error || 'PostgreSQL did not confirm your registration.');
      }
      setExisting(result.registration);
      setMessage('Your provider application was saved for administrator review. You cannot publish or approve your own account.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Provider registration failed. No listing was created.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = existing?.status === 'approved'
    ? 'Approved — refresh your account to continue as a provider.'
    : existing?.status === 'rejected'
      ? 'This application was rejected. You may submit a new application.'
      : existing?.status === 'pending'
        ? 'Pending administrator review.'
        : '';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="provider-onboarding-title">
      <section className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Provider account</p>
            <h2 id="provider-onboarding-title" className="mt-1 text-xl font-black text-slate-900">Register your business</h2>
            <p className="mt-1 text-sm text-slate-600">A verified Google sign-in is required. An administrator must activate the provider profile before you can submit listings.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close provider registration" className="rounded-full border px-3 py-1 text-lg">×</button>
        </div>

        {!authUser ? (
          <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Sign in with Google before registering as a provider.</p>
        ) : busy ? (
          <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Loading your saved application…</p>
        ) : existing?.status === 'pending' || existing?.status === 'approved' ? (
          <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <p role="status" className="font-bold text-indigo-950">{statusLabel}</p>
            <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Business</dt><dd className="font-semibold">{existing.businessName}</dd><dt>Module</dt><dd className="font-semibold">{PROVIDER_TYPES.find((item) => item.id === existing.providerType)?.label || existing.providerType}</dd><dt>Location</dt><dd className="font-semibold">{existing.area}, {existing.city}</dd></dl>
            {existing.status === 'approved' && <button type="button" onClick={() => window.location.reload()} className="min-h-11 w-full rounded-xl bg-indigo-700 px-4 font-bold text-white">Refresh provider access</button>}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-800">Provider module
              <select value={providerType} onChange={(event) => setProviderType(event.target.value as ProviderType)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" required>
                {PROVIDER_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-800">Business name
              <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={120} autoComplete="organization" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
            </label>
            <label className="block text-sm font-semibold text-slate-800">Business contact phone
              <input type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} maxLength={24} autoComplete="tel" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
            </label>
            {providerType === 'services' ? (
              <ServiceCoveragePicker onChange={setServiceCoverage} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-800">City<input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} autoComplete="address-level2" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
                <label className="block text-sm font-semibold text-slate-800">Area / locality<input value={area} onChange={(event) => setArea(event.target.value)} maxLength={120} autoComplete="address-level3" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
              </div>
            )}
            {providerType === 'pg_hostels' && <fieldset className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
              <legend className="px-1 text-sm font-black text-indigo-950">PG listing details</legend>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-600">Use GPS, type the address, or dictate it in your language.</p><div className="flex gap-2"><select aria-label="Voice input language" value={formLanguage} onChange={(event) => setFormLanguage(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"><option value="en-IN">English</option><option value="hi-IN">हिन्दी</option><option value="te-IN">తెలుగు</option><option value="ta-IN">தமிழ்</option><option value="kn-IN">ಕನ್ನಡ</option><option value="ml-IN">മലയാളം</option><option value="mr-IN">मराठी</option></select><button type="button" onClick={useGpsForProperty} disabled={locationBusy} className="rounded-lg border border-indigo-200 bg-white px-3 py-1 text-xs font-bold text-indigo-700">{locationBusy ? 'Finding…' : 'Use GPS'}</button></div></div>
              <label className="block text-sm font-semibold text-slate-800">Full property address *<div className="flex gap-2"><textarea value={pgAddress} onChange={(event) => setPgAddress(event.target.value)} maxLength={400} required rows={2} className="mt-1 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2" /><button type="button" aria-label="Speak property address" onClick={() => speakInto('address', setPgAddress)} className={`mt-1 self-start rounded-xl border px-3 py-3 text-lg ${voiceField === 'address' ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'}`}>🎙️</button></div></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-800">PIN code *<input inputMode="numeric" pattern="[0-9]{6}" value={pgPincode} onChange={(event) => setPgPincode(event.target.value.replace(/\D/g, '').slice(0, 6))} required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
                <label className="block text-sm font-semibold text-slate-800">For *<select value={pgGender} onChange={(event) => setPgGender(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="any">Everyone</option><option value="boys">Boys</option><option value="girls">Girls</option></select></label>
                <label className="block text-sm font-semibold text-slate-800">Room type *<select value={pgRoomType} onChange={(event) => setPgRoomType(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="single">Single</option><option value="double">Double sharing</option><option value="triple">Triple sharing</option><option value="dormitory">Dormitory</option></select></label>
                <label className="block text-sm font-semibold text-slate-800">Total beds *<input type="number" min="1" max="10000" value={pgBeds} onChange={(event) => setPgBeds(event.target.value)} required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
                <label className="block text-sm font-semibold text-slate-800">Monthly rent (₹) *<input type="number" min="1" value={pgRent} onChange={(event) => setPgRent(event.target.value)} required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
                <label className="block text-sm font-semibold text-slate-800">Security deposit (₹)<input type="number" min="0" value={pgDeposit} onChange={(event) => setPgDeposit(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
              </div>
              <div className="space-y-2"><p className="text-sm font-semibold text-slate-800">Property photo URL (at least 1 required)</p>{pgPhotos.map((photo, index) => <input key={index} type="url" value={photo} onChange={(event) => setPgPhotos((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`Photo ${index + 1} URL`} required={index === 0} className="min-h-11 w-full rounded-xl border border-slate-300 px-3" />)}</div>
              <label className="block text-sm font-semibold text-slate-800">Amenities <input value={pgAmenities} onChange={(event) => setPgAmenities(event.target.value)} placeholder="Wi-Fi, food, AC, laundry, parking" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" /></label>
              <label className="block text-sm font-semibold text-slate-800">House rules <textarea value={pgRules} onChange={(event) => setPgRules(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
              <label className="block text-sm font-semibold text-slate-800">Description <div className="flex gap-2"><textarea value={pgDescription} onChange={(event) => setPgDescription(event.target.value)} maxLength={2000} rows={3} className="mt-1 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2" /><button type="button" aria-label="Speak property description" onClick={() => speakInto('description', setPgDescription)} className={`mt-1 self-start rounded-xl border px-3 py-3 text-lg ${voiceField === 'description' ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'}`}>🎙️</button></div></label>
            </fieldset>}
            {authUser.email && <p className="text-xs text-slate-500">Application identity: {authUser.email}</p>}
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Your contact details are visible to the applicant and authorized administrators. Approval only activates provider access; each listing still requires separate Admin approval.</p>
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
            <button type="submit" disabled={submitting} className="min-h-12 w-full rounded-xl bg-indigo-700 px-4 font-bold text-white disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit provider application'}</button>
          </form>
        )}
        <button type="button" onClick={onClose} className="mt-4 min-h-10 w-full rounded-xl border border-slate-300 px-4 font-semibold text-slate-700">Close</button>
      </section>
    </div>
  );
}
