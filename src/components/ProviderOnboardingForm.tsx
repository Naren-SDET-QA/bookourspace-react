import React, { useEffect, useState } from 'react';
import { fetchOwnProviderRegistration, submitServerProviderRegistration } from '../lib/supabaseClient';
import type { MarketSectionType } from '../data/servicesStayMoviesData';
import { ServiceCoveragePicker } from './ServiceCoveragePicker';

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
  const [serviceCoverage, setServiceCoverage] = useState<{ state: string; district: string; mandal: string; village: string; path: string } | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
    if (businessName.trim().length < 2 || !/^\+?[0-9][0-9\s().-]{5,22}$/.test(contactPhone.trim()) || selectedCity.length < 2 || selectedArea.length < 2 || (providerType === 'services' && !serviceCoverage?.path)) {
      setError('Enter a business name, valid contact phone, city and area.');
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
