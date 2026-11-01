import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type ListingStatus = 'pending_approval' | 'active' | 'expired' | 'rejected';
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
  created_at: string;
};
type Provider = { id: string; full_name: string | null; email: string | null };

const PAGE_SIZE = 20;
const needsStayInventory = (row: Pick<ListingRow, 'category_id' | 'entity_type'>) =>
  row.entity_type === 'stay' || /^(hotels?|stays?)(-|$)/i.test(row.category_id);
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
    const client = supabase;
    if (!client) {
      setAuthorized(false);
      setRows([]);
      setError('Supabase is not configured. Listing data is not available for administration.');
      setBusy(false);
      return;
    }
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error('Sign in with a Supabase admin account to manage listings.');
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('role, account_status').eq('id', auth.user.id).maybeSingle();
      if (profileError || profile?.role !== 'admin' || profile.account_status !== 'active') {
        setAuthorized(false);
        throw new Error('An active Supabase admin profile is required.');
      }
      setAuthorized(true);
      const start = page * PAGE_SIZE;
      let query = client.from('listings')
        .select('id, owner_id, title, category_id, subcategory, entity_type, price, price_unit, status, payload, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(start, start + PAGE_SIZE - 1);
      const term = search.trim();
      if (term) query = query.ilike('title', `%${term}%`);
      const [{ data, error: listError, count }, { data: providerRows, error: providerError }] = await Promise.all([
        query,
        client.from('profiles').select('id, full_name, email').eq('role', 'provider').eq('account_status', 'active').order('full_name').limit(500),
      ]);
      if (listError) throw new Error('Listing records could not be loaded. Check database permissions.');
      if (providerError) throw new Error('Provider ownership options could not be loaded.');
      setRows((data ?? []) as ListingRow[]);
      setTotal(count ?? 0);
      setProviders((providerRows ?? []) as Provider[]);
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
    const client = supabase;
    const price = Number(form.price);
    if (!client || !authorized) { setError('Supabase admin authorization is required.'); return; }
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
        owner_id: form.ownerId,
        title: form.title.trim(),
        category_id: form.categoryId.trim(),
        subcategory: form.subcategory.trim(),
        entity_type: form.entityType.trim(),
        price,
        price_unit: form.priceUnit.trim() || 'Fixed',
        status: existing?.status ?? 'pending_approval',
        payload,
        updated_at: new Date().toISOString(),
      };
      const result = editingId
        ? await client.from('listings').update(values).eq('id', listingId).select('id').maybeSingle()
        : await client.from('listings').insert({ id: listingId, ...values }).select('id').maybeSingle();
      if (result.error || result.data?.id !== listingId) throw new Error('The listing was not saved. Verify Supabase RLS and try again.');
      setMessage(editingId ? 'Listing changes saved to Supabase.' : 'Draft listing created in Supabase. Publish it only after reviewing its details.');
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
    const client = supabase;
    if (!client || !authorized) { setError('Supabase admin authorization is required.'); return; }
    setBusy(true);
    setError('');
    setMessage('');
    const payload = { ...(row.payload ?? {}), status };
    const { data, error: updateError } = await client.from('listings')
      .update({ status, payload, updated_at: new Date().toISOString() })
      .eq('id', row.id).select('id').maybeSingle();
    if (updateError || data?.id !== row.id) {
      setError('The status was not changed. Verify database permissions and retry.');
    } else {
      setMessage(status === 'expired' ? 'Listing safely deactivated; related records remain intact.' : `Listing status saved as ${status}.`);
      await load();
    }
    setBusy(false);
  };

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="admin-marketplace-listings-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Supabase and RLS backed</p><h4 id="admin-marketplace-listings-title" className="text-lg font-black">Marketplace listings</h4><p className="text-xs text-slate-500">PG, services, halls, classes and general listings. Hotels require a linked property and room inventory; this tool does not create that inventory.</p></div>
        <button type="button" onClick={() => { setEditingId(null); setFormOpen(true); setForm({ ...BLANK, ownerId: providers[0]?.id ?? '' }); }} disabled={!authorized || busy} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50">Create draft</button>
      </div>
      {!authorized && !busy && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900" role="status">Management requires a Supabase-authenticated active admin profile. The app server session alone is not sufficient.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-900">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{message}</p>}
      {authorized && (
        <>
          <input aria-label="Search listings" value={search} onChange={(event) => { setPage(0); setSearch(event.target.value); }} placeholder="Search title or category" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm sm:max-w-sm" />
          {formOpen && <form onSubmit={save} className="grid gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <select aria-label="Listing owner" value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} required className="rounded-lg border p-2 text-xs"><option value="">Choose active provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.full_name || provider.email || provider.id}</option>)}</select>
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
            <div className="min-w-0"><p className="truncate text-sm font-bold">{row.title}</p><p className="text-xs text-slate-500">{row.category_id} · {row.subcategory} · {row.entity_type} · ₹{Number(row.price).toLocaleString('en-IN')} {row.price_unit}</p><p className="text-[10px] text-slate-400">Owner {row.owner_id} · {row.status}</p></div>
            <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => beginEdit(row)} disabled={busy || needsStayInventory(row)} title={needsStayInventory(row) ? 'Stay properties need the separate inventory workflow.' : undefined} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-40">Edit</button>{row.status !== 'active' && <button type="button" onClick={() => void setStatus(row, 'active')} disabled={busy || needsStayInventory(row)} title={needsStayInventory(row) ? 'A stay cannot be published until it has linked property and room inventory.' : undefined} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Publish</button>}{row.status === 'active' && <button type="button" onClick={() => void setStatus(row, 'expired')} disabled={busy} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">Unpublish</button>}{row.status !== 'expired' && row.status !== 'active' && <button type="button" onClick={() => void setStatus(row, 'expired')} disabled={busy} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800">Deactivate</button>}{needsStayInventory(row) && <span className="self-center text-[10px] text-amber-800">Stay inventory workflow unavailable</span>}</div>
          </article>)}</div>
          <div className="flex items-center justify-between text-xs"><span>{total} database listing{total === 1 ? '' : 's'}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || busy} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span className="self-center">Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * PAGE_SIZE >= total || busy} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
        </>
      )}
    </section>
  );
}
