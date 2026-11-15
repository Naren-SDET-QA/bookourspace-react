import React, { useEffect, useState } from 'react';
import { Award, MapPin, ShieldCheck, Star, X } from 'lucide-react';
import { fetchStayHostProfile, formatInr, type StayHostProfile } from '../../lib/staySearchClient';
import { languageLabel, propertyTypeLabel } from '../../lib/stayFilters';
import SafeImage from '../SafeImage';

export function StayHostProfileModal({ hostId, onClose }: { hostId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<StayHostProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetchStayHostProfile(hostId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setProfile(result);
      else setError(result.message || 'The host profile could not be loaded.');
    });
    return () => controller.abort();
  }, [hostId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[108] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="host-profile-heading" className="flex h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[80vh] sm:rounded-2xl dark:bg-slate-950">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#ebebeb] px-4 dark:border-slate-800">
          <h2 id="host-profile-heading" className="text-base font-semibold">Host profile</h2>
          <button type="button" onClick={onClose} aria-label="Close host profile" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
          {!profile && !error && <p className="text-sm text-[#717171]" aria-busy="true">Loading host profile…</p>}
          {profile && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f7f7f7] text-xl font-bold text-[#717171] dark:bg-slate-800">
                  {profile.host.avatarUrl ? <SafeImage category="general" src={profile.host.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : profile.host.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-semibold">{profile.host.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-[#717171] dark:text-slate-400">
                    {profile.host.verified && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified host</span>}
                    {profile.host.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {profile.host.city}</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                    {profile.host.reviewCount > 0 ? (
                      <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#222222] dark:fill-slate-100" aria-hidden="true" /> {profile.host.rating.toFixed(2)} · {profile.host.reviewCount} review{profile.host.reviewCount === 1 ? '' : 's'}</span>
                    ) : <span className="text-[#717171] dark:text-slate-400">New host</span>}
                    <span className="inline-flex items-center gap-1"><Award className="h-3.5 w-3.5" aria-hidden="true" /> {profile.host.activeStays} active stay{profile.host.activeStays === 1 ? '' : 's'}</span>
                  </p>
                  {profile.host.languages.length > 0 && <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Speaks {profile.host.languages.map((value) => languageLabel(value)).join(', ')}</p>}
                </div>
              </div>

              <h3 className="mt-6 text-lg font-semibold">Stays hosted by {profile.host.name.split(' ')[0]}</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {profile.listings.map((listing) => (
                  <li key={listing.listingId} className="overflow-hidden rounded-xl border border-[#ebebeb] dark:border-slate-800">
                    <div className="relative aspect-[4/3] bg-[#f2f0ee] dark:bg-slate-800">
                      <SafeImage category="stays" src={listing.images[0]} alt={listing.name} className="h-full w-full object-cover" loading="lazy" />
                      {listing.guestFavourite && <span className="absolute left-2 top-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#222222]">Guest favourite</span>}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-semibold">{listing.name}</p>
                      <p className="truncate text-xs text-[#717171] dark:text-slate-400">{propertyTypeLabel(listing.propertyType)} · {[listing.area, listing.city].filter(Boolean).join(', ')}</p>
                      <p className="mt-1 text-sm font-semibold">{formatInr(listing.priceFromPaise)} <span className="text-xs font-normal text-[#717171]">night</span></p>
                    </div>
                  </li>
                ))}
              </ul>
              {profile.listings.length === 0 && <p className="mt-3 text-sm text-[#717171] dark:text-slate-400">No published stays right now.</p>}
              <p className="mt-5 text-[11px] leading-5 text-[#717171] dark:text-slate-400">Only verified public profile fields are shown. Contact details are never exposed before a confirmed booking.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
