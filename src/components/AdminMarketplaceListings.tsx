import React, { useCallback, useEffect, useState } from 'react';
import {
  archiveServerProviderListing,
  fetchAdminProviderRegistrations,
  fetchServerProviderListingOwners,
  fetchServerProviderListings,
  reviewServerProviderRegistration,
  reviewServerProviderListing,
  saveServerProviderListing,
} from '../lib/supabaseClient';
import { FORMER_LOCAL_SERVICE_CATEGORY_IDS } from '../lib/formerLocalServices';
import { LiveEditEntryButton } from './liveEdit/LiveEditEntryButton';

type ListingStatus = 'pending_approval' | 'active' | 'expired' | 'archived' | 'rejected';
type ListingRow = {
  id: string;
  owner_id: string;
  title: string;
  category_id: string;
  subcategory: string;
  entity_type: string;
  price: number;
  price_unit: string;
  status: ListingStatus;
  payload: Record<string, unknown>;
  provider_availability_status: 'not_reported' | 'available' | 'unavailable';
  is_verified: boolean;
  created_at: string;
  updated_at: string;
};
type Provider = { id: string; fullName: string; email: string };
type ProviderRegistration = {
  id: string; userId: string; providerType: string; businessName: string; contactPhone: string;
  city: string; area: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string;
};

const PAGE_SIZE = 20;
const needsStayInventory = (row: Pick<ListingRow, 'category_id' | 'entity_type'>) =>
  row.entity_type === 'stay' || /^(hotels?|stays?)(-|$)/i.test(row.category_id);
const isFormerLocalService = (row: Pick<ListingRow, 'category_id'>) =>
  FORMER_LOCAL_SERVICE_CATEGORY_IDS.includes(row.category_id as (typeof FORMER_LOCAL_SERVICE_CATEGORY_IDS)[number]);
const BLANK = {
  ownerId: '', title: '', categoryId: '', subcategory: '', entityType: 'service',
  price: '', priceUnit: 'Fixed', description: '', city: '', area: '',
};

/** Supabase/RLS-backed CRUD for marketplace listings. This does not manage the
 * separate stay room/unit inventory, bookings, payments, or global content. */
export function AdminMarketplaceListings() {
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(true);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [registrations, setRegistrations] = useState<ProviderRegistration[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const { ok, httpStatus, listings, source, error: apiError } = await fetchServerProviderListings(true);
      if (!ok || source !== 'postgres') {
        setAuthorized(false);
        throw new Error(httpStatus === 401 ? 'Sign in with an active administrator account.' : apiError || 'PostgreSQL listing administration is unavailable.');
      }
      const term = search.trim();
      // The server projection is structurally a listing row; the status
      // union is narrowed by the API contract, not by trusting client state.
      const typedListings = listings as unknown as ListingRow[];
      const filtered = typedListings.filter((row) => !term || `${row.title} ${row.category_id} ${row.subcategory}`.toLowerCase().includes(term.toLowerCase()));
      const owners = await fetchServerProviderListingOwners();
      if (!owners.ok || owners.data.source !== 'postgres') throw new Error(owners.data.error || 'Active provider accounts could not be loaded.');
      const applications = await fetchAdminProviderRegistrations();
      if (!applications.ok || applications.data.source !== 'postgres') throw new Error(applications.data.error || 'Provider applications could not be loaded.');
      setAuthorized(true);
      setRows(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
      setTotal(filtered.length);
      setProviders(owners.providers);
      setRegistrations(applications.registrations as ProviderRegistration[]);
    } catch (reason) {
      setRows([]);
      setError(reason instanceof Error ? reason.message : 'Listing records could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  const beginEdit = (row: ListingRow) => {
    const payload = row.payload ?? {};
    const location = (payload.location && typeof payload.location === 'object' ? payload.location : {}) as Record<string, unknown>;
    setEditingId(row.id);
    setFormOpen(true);
    setForm({
      ownerId: row.owner_id,
      title: row.title,
      categoryId: row.category_id,
      subcategory: row.subcategory,
      entityType: row.entity_type,
      price: String(row.price),
      priceUnit: row.price_unit,
      description: String(payload.description ?? ''),
      city: String(location.city ?? ''),
      area: String(location.area ?? ''),
    });
    setMessage('');
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const price = Number(form.price);
    if (!authorized) { setError('An active server-verified administrator session is required.'); return; }
    if (!form.ownerId || !form.title.trim() || !form.categoryId.trim() || !form.subcategory.trim() || !Number.isFinite(price) || price < 0) {
      setError('Choose an active provider and enter a title, category, subcategory, and valid non-negative price.');
      return;
    }
    if (needsStayInventory({ category_id: form.categoryId.trim(), entity_type: form.entityType }) ) {
      setError('Hotels & Stays require a linked stay property, room types, and units. Use the stay inventory workflow; this general listing form is disabled for stays.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const existing = editingId ? rows.find((row) => row.id === editingId) : undefined;
      const listingId = editingId ?? `admin-${crypto.randomUUID()}`;
      const payload = {
        ...(existing?.payload ?? {}),
        id: listingId,
        title: form.title.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId.trim(),
        subcategory: form.subcategory.trim(),
        entityType: form.entityType.trim(),
        price,
        priceUnit: form.priceUnit.trim() || 'Fixed',
        currency: '₹',
        location: { ...((existing?.payload?.location ?? {}) as Record<string, unknown>), city: form.city.trim(), area: form.area.trim() },
        providerId: form.ownerId,
        images: Array.isArray(existing?.payload?.images) ? existing?.payload?.images : [],
        status: existing?.status ?? 'pending_approval',
      };
      const values = {
        ownerId: form.ownerId,
        title: form.title.trim(),
        categoryId: form.categoryId.trim(),
        subcategory: form.subcategory.trim(),
        entityType: form.entityType.trim(),
        price,
        priceUnit: form.priceUnit.trim() || 'Fixed',
        expectedUpdatedAt: existing?.updated_at,
        requestId: editingId ? undefined : crypto.randomUUID(),
        payload,
      };
      const result = await saveServerProviderListing(editingId, { id: listingId, ...values });
      if (!result.ok || result.data.source !== 'postgres') throw new Error(result.data.error || 'PostgreSQL did not confirm the listing write.');
      setMessage(editingId ? 'Listing changes saved to PostgreSQL.' : 'Pending draft saved to PostgreSQL for admin review.');
      setEditingId(null);
      setFormOpen(false);
      setForm(BLANK);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Listing changes could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (row: ListingRow, status: ListingStatus) => {
    if (!authorized) { setError('An active server-verified administrator session is required.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    const result = status === 'active' || status === 'rejected'
      ? await reviewServerProviderListing(row.id, status)
      : await archiveServerProviderListing(row.id);
    if (!result.ok || result.data.source !== 'postgres') {
      setError(result.data.error || 'The PostgreSQL status transition was not confirmed.');
    } else {
      setMessage(status === 'expired' || status === 'archived' ? 'Listing safely archived; its row and references remain intact.' : `Admin review saved as ${status}.`);
      window.dispatchEvent(new Event('bos-marketplace-listings-updated'));
      await load();
    }
    setBusy(false);
  };

  const setVerified = async (row: ListingRow, isVerified: boolean) => {
    if (!authorized) { setError('An active server-verified administrator session is required.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    const result = await saveServerProviderListing(row.id, { isVerified });
    if (!result.ok || result.data.source !== 'postgres') {
      setError(result.data.error || 'Verification status was not changed.');
    } else {
      setMessage(isVerified ? 'Listing marked verified by the active administrator.' : 'Listing verification was removed.');
      await load();
    }
    setBusy(false);
  };

  const setAvailability = async (row: ListingRow, availability: ListingRow['provider_availability_status']) => {
    if (!authorized) { setError('An active server-verified administrator session is required.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    const result = await saveServerProviderListing(row.id, { providerAvailabilityStatus: availability });
    if (!result.ok || result.data.source !== 'postgres') setError(result.data.error || 'Availability status was not changed.');
    else { setMessage('Provider-reported availability saved.'); await load(); }
    setBusy(false);
  };

  const reviewProviderApplication = async (registration: ProviderRegistration, decision: 'approved' | 'rejected') => {
    if (!authorized) { setError('An active server-verified administrator session is required.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await reviewServerProviderRegistration(registration.id, decision);
      if (!result.ok || result.data.source !== 'postgres') throw new Error(result.data.error || 'The provider application review was not persisted.');
      setMessage(decision === 'approved'
        ? 'Provider access was activated in PostgreSQL. The provider must refresh their account before creating a listing.'
        : 'Provider application was rejected in PostgreSQL.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Provider application review failed.');
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="admin-marketplace-listings-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Transactional PostgreSQL with RLS</p><h4 id="admin-marketplace-listings-title" className="text-lg font-black">Marketplace listings</h4><p className="text-xs text-slate-500">PG, services, halls, classes and general listings. Hotels require a linked property and room inventory; this tool does not create that inventory.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveEditEntryButton initialModule="pg_hostels" />
          <button type="button" onClick={() => { setEditingId(null); setFormOpen(true); setForm({ ...BLANK, ownerId: providers[0]?.id ?? '' }); }} disabled={!authorized || busy} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50">Create draft</button>
        </div>
      </div>
      {!authorized && !busy && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900" role="status">Management requires an active, server-verified administrator session with a matching active PostgreSQL profile.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-900">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{message}</p>}
      {authorized && (
        <>
          <section aria-labelledby="provider-applications-title" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex items-center justify-between gap-2"><h5 id="provider-applications-title" className="font-black text-slate-900">Provider applications</h5><span className="text-xs text-slate-600">{registrations.filter((item) => item.status === 'pending').length} pending</span></div>
            {registrations.filter((item) => item.status === 'pending').length === 0 ? <p className="text-xs text-slate-600">No pending provider applications.</p> : registrations.filter((item) => item.status === 'pending').map((registration) => (
              <article key={registration.id} className="grid gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0"><h6 className="truncate text-sm font-bold">{registration.businessName}</h6><p className="text-xs text-slate-600">{registration.providerType.replaceAll('_', ' ')} · {registration.area}, {registration.city}</p><p className="text-xs text-slate-600">Applicant contact: <a href={`tel:${registration.contactPhone}`} className="underline">{registration.contactPhone}</a></p><p className="break-all text-[10px] text-slate-400">Auth profile {registration.userId}</p></div>
                <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void reviewProviderApplication(registration, 'approved')} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-50">Activate provider</button><button type="button" disabled={busy} onClick={() => void reviewProviderApplication(registration, 'rejected')} className="min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-800 disabled:opacity-50">Reject</button></div>
              </article>
            ))}
            <p className="text-[11px] text-slate-500">Activation changes the PostgreSQL profile role only after server-side Admin authorization. Listing publication remains a separate review.</p>
          </section>
          <input aria-label="Search listings" value={search} onChange={(event) => { setPage(0); setSearch(event.target.value); }} placeholder="Search title or category" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm sm:max-w-sm" />
          {formOpen && <form onSubmit={save} className="grid gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <select aria-label="Listing owner" value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} required disabled={Boolean(editingId)} className="rounded-lg border p-2 text-xs"><option value="">Choose active provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.fullName || provider.email || provider.id}</option>)}</select>
            <input aria-label="Listing title" placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required className="rounded-lg border p-2 text-xs" />
            <input aria-label="Category ID" placeholder="Category ID (for example hotel-budget)" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} required className="rounded-lg border p-2 text-xs" />
            <input aria-label="Subcategory" placeholder="Subcategory" value={form.subcategory} onChange={(event) => setForm({ ...form, subcategory: event.target.value })} required className="rounded-lg border p-2 text-xs" />
            <select aria-label="Entity type" value={form.entityType} onChange={(event) => setForm({ ...form, entityType: event.target.value })} className="rounded-lg border p-2 text-xs"><option value="service">Home Service</option><option value="property">Property / PG / Stay</option><option value="event">Function Hall</option><option value="school">Class / Institute</option></select>
            <input aria-label="Price" type="number" min="0" step="0.01" placeholder="Price in rupees" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required className="rounded-lg border p-2 text-xs" />
            <input aria-label="Price unit" placeholder="Price unit" value={form.priceUnit} onChange={(event) => setForm({ ...form, priceUnit: event.target.value })} className="rounded-lg border p-2 text-xs" />
            <input aria-label="City" placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="rounded-lg border p-2 text-xs" />
            <input aria-label="Area" placeholder="Area" value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} className="rounded-lg border p-2 text-xs" />
            <textarea aria-label="Description" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-10 rounded-lg border p-2 text-xs sm:col-span-2" />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create draft'}</button><button type="button" onClick={() => { setEditingId(null); setForm(BLANK); setFormOpen(false); }} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button></div>
            <p className="text-[11px] text-slate-600 sm:col-span-2 lg:col-span-4">New records start as pending drafts. A hotel listing alone does not create stay room inventory or enable online booking.</p>
          </form>}
          {busy && <p role="status" className="text-xs text-slate-500">Loading listings…</p>}
          {!busy && rows.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No database listings match this page and search.</p>}
          <div className="space-y-2">{rows.map((row) => <article key={row.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-bold">{row.title}</p><p className="text-xs text-slate-500">{row.category_id} · {row.subcategory} · {row.entity_type} · ₹{Number(row.price).toLocaleString('en-IN')} {row.price_unit}</p><p className="text-[10px] text-slate-400">Owner {row.owner_id} · {row.status}{isFormerLocalService(row) ? ` · ${row.is_verified ? 'Verified' : 'Not verified'} · availability: ${row.provider_availability_status.replace('_', ' ')}` : ''}</p></div>
            <div className="flex flex-wrap items-center gap-1.5">{isFormerLocalService(row) && <><select aria-label={`Availability for ${row.title}`} value={row.provider_availability_status} disabled={busy} onChange={(event) => void setAvailability(row, event.target.value as ListingRow['provider_availability_status'])} className="rounded-lg border px-2 py-1.5 text-xs"><option value="not_reported">Not reported</option><option value="available">Provider reports available</option><option value="unavailable">Provider reports unavailable</option></select><button type="button" onClick={() => void setVerified(row, !row.is_verified)} disabled={busy} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">{row.is_verified ? 'Remove verification' : 'Verify'}</button></>}
              <button type="button" onClick={() => beginEdit(row)} disabled={busy || needsStayInventory(row)} title={needsStayInventory(row) ? 'Stay properties need the separate inventory workflow.' : undefined} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-40">Edit</button>
              {row.status === 'pending_approval' && <><button type="button" onClick={() => void setStatus(row, 'active')} disabled={busy} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Approve listing</button><button type="button" onClick={() => void setStatus(row, 'rejected')} disabled={busy} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-800">Reject</button></>}
              {row.status === 'active' && <button type="button" onClick={() => void setStatus(row, 'archived')} disabled={busy} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">Unpublish</button>}
              {row.status !== 'archived' && row.status !== 'expired' && <button type="button" onClick={() => void setStatus(row, 'archived')} disabled={busy} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800">Archive</button>}
              {needsStayInventory(row) && <span className="self-center text-[10px] text-amber-800">Stay inventory workflow unavailable</span>}</div>
          </article>)}</div>
          <div className="flex items-center justify-between text-xs"><span>{total} database listing{total === 1 ? '' : 's'}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || busy} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span className="self-center">Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * PAGE_SIZE >= total || busy} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
        </>
      )}
    </section>
  );
}
