import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, MapPin, Search, ShieldCheck, Tractor, X } from 'lucide-react';
import {
  filterFormerLocalServices,
  FORMER_LOCAL_SERVICE_CATEGORY_IDS,
  formerLocalServiceCategories,
  parseFormerLocalServiceRow,
} from '../lib/formerLocalServices';
import type {
  FormerLocalServiceCard,
  FormerLocalServiceCategoryId,
  ProviderAvailabilityStatus,
} from '../lib/formerLocalServices';
import {
  fetchFormerLocalServicesPage,
} from '../lib/stayDiscoveryData';
import { useOwnerContact } from '../lib/useOwnerContact';
import SafeImage from './SafeImage';
import { fetchPlatformModuleFlags, subscribeToPlatformModuleFlags } from '../lib/stayDiscoveryData';
import { resolveServicesModuleAccess } from '../lib/servicesStayRules';
import { supabase } from '../lib/supabaseClient';

interface FormerLocalServicesSectionProps {
  onClose: () => void;
  initialCategoryId?: string;
}

const availabilityLabel: Record<ProviderAvailabilityStatus, string> = {
  not_reported: 'Confirm availability with provider',
  available: 'Provider reports available',
  unavailable: 'Provider reports unavailable',
};

const inr = (value: number | null, unit: string) => value === null
  ? 'Ask provider for a price'
  : `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)}${unit ? ` ${unit}` : ''}`;

export function FormerLocalServicesSection({ onClose, initialCategoryId }: FormerLocalServicesSectionProps) {
  const [rows, setRows] = useState<FormerLocalServiceCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moduleLoading, setModuleLoading] = useState(true);
  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [moduleError, setModuleError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<FormerLocalServiceCard | null>(null);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<FormerLocalServiceCategoryId | 'all'>(() =>
    FORMER_LOCAL_SERVICE_CATEGORY_IDS.includes(initialCategoryId as FormerLocalServiceCategoryId)
      ? initialCategoryId as FormerLocalServiceCategoryId
      : 'all',
  );
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationSubmitted, setRegistrationSubmitted] = useState(false);
  const owner = useOwnerContact('services');

  const loadModule = useCallback(async () => {
    setModuleLoading(true);
    setModuleError(false);
    try {
      const flags = await fetchPlatformModuleFlags();
      setModuleEnabled(resolveServicesModuleAccess(flags, 'services').enabled);
    } catch {
      setModuleEnabled(false);
      setModuleError(true);
    } finally {
      setModuleLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (targetPage: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);
    try {
      const result = await fetchFormerLocalServicesPage(targetPage);
      const parsed = result.rows.flatMap((row) => {
        const card = parseFormerLocalServiceRow(row);
        return card ? [card] : [];
      });
      setRows((previous) => append
        ? [...previous.filter((item) => !parsed.some((newItem) => newItem.id === item.id)), ...parsed]
        : parsed);
      setTotal(result.total);
      setPage(targetPage);
    } catch {
      setError(true);
      if (!append) setRows([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadModule();
    const unsubscribe = subscribeToPlatformModuleFlags(() => { void loadModule(); });
    return unsubscribe;
  }, [loadModule]);

  useEffect(() => {
    if (moduleEnabled) void loadPage(0, false);
    else if (!moduleLoading) {
      setRows([]);
      setTotal(0);
      setLoading(false);
    }
  }, [moduleEnabled, moduleLoading, loadPage]);

  const filtered = useMemo(() => filterFormerLocalServices(rows, {
    categoryId,
    query,
    verifiedOnly,
    availableOnly,
    maxPrice,
  }), [rows, categoryId, query, verifiedOnly, availableOnly, maxPrice]);

  const selectListing = (card: FormerLocalServiceCard) => {
    setSelected(card);
    setRegistrationOpen(false);
    void owner.open(card.id);
  };

  const submitRegistration = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const providerName = String(data.get('providerName') ?? '').trim();
    const category = String(data.get('category') ?? '') as FormerLocalServiceCategoryId;
    const subcategory = String(data.get('subcategory') ?? '').trim();
    const city = String(data.get('city') ?? '').trim();
    const area = String(data.get('area') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const rawPrice = String(data.get('price') ?? '').trim();
    const rawAvailability = String(data.get('availability') ?? 'not_reported');
    const availability: ProviderAvailabilityStatus = rawAvailability === 'available' || rawAvailability === 'unavailable'
      ? rawAvailability
      : 'not_reported';
    const price = rawPrice ? Number(rawPrice) : 0;

    if (!title || !providerName || !category || !subcategory || !city || !area || (rawPrice && (!Number.isFinite(price) || price < 0))) {
      setError(true);
      return;
    }
    if (!moduleEnabled || !supabase) {
      setError(true);
      return;
    }

    setLoadingMore(true);
    setError(false);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error('SUPABASE_AUTH_REQUIRED');
      const { data: profile, error: profileError } = await supabase.from('profiles')
        .select('account_status').eq('id', auth.user.id).maybeSingle();
      if (profileError || profile?.account_status !== 'active') throw new Error('ACTIVE_ACCOUNT_REQUIRED');

      const id = `rural-${crypto.randomUUID()}`;
      const payload = {
        id,
        description,
        providerName,
        location: { city, area },
        images: [],
        customFieldValues: { sectionType: 'services' },
      };
      const { error: insertError } = await supabase.from('listings').insert({
        id,
        owner_id: auth.user.id,
        title,
        category_id: category,
        subcategory,
        entity_type: 'service',
        price,
        price_unit: rawPrice ? String(data.get('priceUnit') ?? '').trim() || 'INR' : 'Quote on request',
        status: 'pending_approval',
        payload,
        provider_availability_status: availability,
        is_verified: false,
      });
      if (insertError) throw new Error('LISTING_SAVE_FAILED');

      setRegistrationOpen(false);
      setRegistrationSubmitted(true);
      form.reset();
      await loadPage(0, false);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const availabilityText = selected ? availabilityLabel[selected.availability] : '';

  return (
    <div className="fixed inset-0 z-[72] overflow-y-auto bg-[#f7f8f7] text-slate-900 dark:bg-slate-950 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="former-local-services-title">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={onClose} aria-label="Back to Services" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /></button>
          <span className="font-black tracking-tight">BookOurSpace <span className="text-emerald-700 dark:text-emerald-300">Farm & Village</span></span>
          <button type="button" onClick={() => { setSelected(null); setRegistrationOpen((open) => !open); }} disabled={moduleLoading || !moduleEnabled} className="ml-auto min-h-10 rounded-full bg-emerald-800 px-4 text-xs font-bold text-white hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{registrationOpen ? 'Browse providers' : 'Register as a provider'}</button>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
        <section className="rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 sm:p-9 dark:border-emerald-950 dark:from-emerald-950/35 dark:via-slate-900 dark:to-amber-950/20">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-800 text-white"><Tractor className="h-7 w-7" aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-300">Local providers, published by the marketplace</p>
              <h1 id="former-local-services-title" className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Farm & Village Services</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Only published Supabase listings appear here. Availability is provider-reported, prices appear only when listed, and verification is controlled by an active administrator.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="flex min-h-12 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search service, provider or village" className="w-full bg-transparent text-sm outline-none" aria-label="Search providers and locations" />
            </label>
            <button type="button" onClick={() => void loadPage(0, false)} disabled={loading} className="min-h-12 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold hover:border-emerald-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">Refresh listings</button>
          </div>
        </section>

        <section className="mt-7" aria-label="Farm and village service categories">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCategoryId('all')} aria-pressed={categoryId === 'all'} className={`min-h-10 rounded-full border px-4 text-xs font-bold ${categoryId === 'all' ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>All Farm & Village</button>
            {formerLocalServiceCategories.map((category) => (
              <button key={category.id} type="button" onClick={() => setCategoryId(category.id as FormerLocalServiceCategoryId)} aria-pressed={categoryId === category.id} className={`min-h-10 rounded-full border px-4 text-xs font-bold ${categoryId === category.id ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                <span aria-hidden="true" className="mr-1.5">{category.emoji}</span>{category.id === 'rural-dairy' ? 'Milk & Dairy' : category.id === 'rural-farm-support' ? 'Farm Equipment & Help' : 'Livestock & Supplies'}
              </button>
            ))}
          </div>
        </section>

        {moduleEnabled && registrationOpen && (
          <section className="mt-7 rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm dark:border-emerald-900 dark:bg-slate-900" aria-labelledby="provider-registration-title">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="provider-registration-title" className="text-xl font-black">Submit a provider listing</h2><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Requires an active Supabase-authenticated account. New listings stay pending until an administrator reviews them. No provider details, price or verification are prefilled.</p></div><button type="button" onClick={() => setRegistrationOpen(false)} aria-label="Close registration" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 dark:border-slate-700"><X className="h-4 w-4" /></button></div>
            <form onSubmit={(event) => void submitRegistration(event)} className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Service category<select name="category" required className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">{formerLocalServiceCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="text-xs font-semibold">Provider or business name<input name="providerName" required maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">Listing title<input name="title" required maxLength={140} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">Service type<input name="subcategory" required maxLength={100} placeholder="Enter what you provide" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">City or village<input name="city" required maxLength={100} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">Area / locality<input name="area" required maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">Your listed price (₹)<input name="price" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Leave blank to request a quote" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">Price unit<input name="priceUnit" maxLength={40} placeholder="Per litre, per visit, etc." className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <label className="text-xs font-semibold">Availability (your report)<select name="availability" defaultValue="not_reported" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"><option value="not_reported">Not reported</option><option value="available">I report that I am available</option><option value="unavailable">I report that I am unavailable</option></select></label>
              <label className="text-xs font-semibold sm:col-span-2">Description<textarea name="description" rows={3} maxLength={2000} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-950" /></label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Contact details are not collected here. Contact appears only when existing secure contact settings and verification are present.</p>
              <div className="sm:col-span-2"><button type="submit" disabled={loadingMore} className="min-h-11 rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white disabled:opacity-50">{loadingMore ? 'Submitting…' : 'Submit for admin review'}</button></div>
            </form>
          </section>
        )}

        {moduleLoading && <p className="mt-6 rounded-2xl bg-white p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300" role="status">Checking Services availability…</p>}
        {!moduleLoading && (moduleError || !moduleEnabled) && <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="alert">{moduleError ? 'Services availability settings could not be loaded. Farm & Village listings and registration remain unavailable until settings can be confirmed.' : 'Farm & Village services are currently disabled by an administrator.'}</div>}
        {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200" role="alert">{registrationOpen ? 'The listing was not submitted. Sign in with an active Supabase account and verify the DEV schema migration and RLS policies.' : 'Provider listings could not be loaded from Supabase. Try again after checking the development backend configuration.'}</div>}
        {registrationSubmitted && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" role="status">Your listing was saved to Supabase as a pending draft. It will appear after an administrator publishes it; it is not marked as verified.</div>}

        {moduleEnabled && !registrationOpen && <section className="mt-7" aria-label="Provider filters">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setVerifiedOnly((value) => !value)} aria-pressed={verifiedOnly} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${verifiedOnly ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Verified providers</button>
            <button type="button" onClick={() => setAvailableOnly((value) => !value)} aria-pressed={availableOnly} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${availableOnly ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>Provider reports available</button>
            {[500, 1000, 5000].map((limit) => <button key={limit} type="button" aria-pressed={maxPrice === limit} onClick={() => setMaxPrice(maxPrice === limit ? null : limit)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${maxPrice === limit ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>Under ₹{limit.toLocaleString('en-IN')}</button>)}
          </div>
        </section>}

        {moduleEnabled && !registrationOpen && <section className="mt-7" aria-label="Published rural provider listings">
          <p className="mb-4 text-sm font-semibold text-slate-600 dark:text-slate-300" role="status" aria-live="polite">{loading ? 'Loading published providers…' : `${filtered.length} matching published provider${filtered.length === 1 ? '' : 's'}${total > rows.length ? ` · ${total} total` : ''}`}</p>
          {!loading && !error && filtered.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900"><div className="text-4xl" aria-hidden="true">🌾</div><h2 className="mt-3 text-xl font-black">{total > rows.length ? 'No matches in loaded listings' : verifiedOnly ? 'No verified providers yet' : 'No verified providers or published listings yet'}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-300">{total > rows.length ? 'Filters and search cover the listings loaded so far. Load more to include older listings.' : 'We only show listings stored in Supabase and published by an administrator. Register as a provider or check back after a verified listing is published.'}</p><button type="button" onClick={() => { setSelected(null); setRegistrationOpen(true); }} className="mt-5 min-h-10 rounded-full bg-emerald-800 px-4 text-xs font-bold text-white">Submit a provider listing</button></div>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => <article key={card.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="relative grid aspect-[16/9] place-items-center bg-gradient-to-br from-emerald-50 to-amber-50 dark:from-emerald-950/50 dark:to-slate-800">
                <SafeImage src={card.image} alt="Provider supplied listing" category="services" className="h-full w-full object-cover" sizes="(max-width: 640px) 92vw, 360px" />
                {card.verified && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-emerald-800"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span>}
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{card.categoryName} · {card.subcategory}</p>
                <h2 className="mt-1 text-lg font-extrabold leading-snug">{card.title}</h2>
                {card.providerName && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{card.providerName}</p>}
                {(card.city || card.area) && <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{[card.area, card.city].filter(Boolean).join(', ')}</p>}
                <p className="mt-3 text-sm font-extrabold">{inr(card.price, card.priceUnit)}</p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{availabilityLabel[card.availability]}</p>
                <button type="button" onClick={() => selectListing(card)} className="mt-4 min-h-10 w-full rounded-xl border border-emerald-800 text-sm font-bold text-emerald-900 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40">View details & contact</button>
              </div>
            </article>)}
          </div>
          {rows.length < total && <div className="mt-6 text-center"><button type="button" disabled={loadingMore} onClick={() => void loadPage(page + 1, true)} className="min-h-11 rounded-full border border-slate-300 bg-white px-5 text-sm font-bold disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900">{loadingMore ? 'Loading…' : 'Load more providers'}</button></div>}
        </section>}

        <section className="mt-10 grid gap-3 sm:grid-cols-2" aria-label="Coming soon village features">
          {[
            ['Buy, Sell & Rent', 'Village marketplace listings are not available yet.'],
            ['Village Announcements', 'Community announcements are not available yet.'],
          ].map(([title, message]) => <article key={title} className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 dark:border-slate-700 dark:bg-slate-900/60"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Coming soon</p><h2 className="mt-1 text-lg font-extrabold">{title}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{message}</p></article>)}
        </section>
      </main>

      {selected && <div className="fixed inset-0 z-[80] grid place-items-end bg-slate-950/50 p-0 sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-slate-900 sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="rural-provider-detail-title">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{selected.categoryName} · {selected.subcategory}</p><h2 id="rural-provider-detail-title" className="mt-1 text-2xl font-black">{selected.title}</h2></div><button type="button" aria-label="Close listing details" onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 dark:border-slate-700"><X className="h-4 w-4" /></button></div>
          {selected.providerName && <p className="mt-3 text-sm font-semibold">{selected.providerName}</p>}
          {(selected.city || selected.area) && <p className="mt-2 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300"><MapPin className="h-4 w-4" />{[selected.area, selected.city].filter(Boolean).join(', ')}</p>}
          <p className="mt-3 text-lg font-black">{inr(selected.price, selected.priceUnit)}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Availability: {availabilityText}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{selected.description || 'The provider has not added a description.'}</p>
          {selected.verified && <p className="mt-4 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><BadgeCheck className="h-4 w-4" /> Verified by BookOurSpace administration</p>}
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-sm font-bold">Contact the provider</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Contact details are shown only after the provider has consented, verified the contact channel and the Services contact setting allows it.</p>
            {owner.state === 'loading' && <p className="mt-3 text-xs" role="status">Checking authorized contact options…</p>}
            {(owner.state === 'unavailable' || owner.state === 'error') && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300" role="status">{owner.message || 'Contact information is unavailable for this listing.'}</p>}
            {!owner.isSignedIn && owner.state === 'ready' && <p className="mt-3 text-xs text-amber-800" role="status">Sign in to contact this provider.</p>}
            {owner.state === 'ready' && owner.isSignedIn && <div className="mt-3 flex gap-2">{owner.details?.phone && <button type="button" onClick={() => void owner.contact('call')} disabled={owner.busy} className="min-h-10 rounded-xl bg-emerald-800 px-4 text-xs font-bold text-white disabled:opacity-50">Call provider</button>}{owner.details?.whatsapp && <button type="button" onClick={() => void owner.contact('whatsapp')} disabled={owner.busy} className="min-h-10 rounded-xl border border-emerald-800 px-4 text-xs font-bold text-emerald-900 disabled:opacity-50 dark:text-emerald-200">WhatsApp</button>}</div>}
            {owner.message && owner.state === 'ready' && <p className="mt-2 text-xs text-rose-700" role="alert">{owner.message}</p>}
          </div>
        </section>
      </div>}
    </div>
  );
}
