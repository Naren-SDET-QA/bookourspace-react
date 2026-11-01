import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type StayUnitDraft = { id?: string; label: string; floor: string; is_active: boolean };
type RoomTypeDraft = {
  id?: string;
  name: string;
  max_adults: number;
  max_children: number;
  base_price_paise: number;
  amenities: string[];
  is_active: boolean;
  units: StayUnitDraft[];
};
type StayDraft = {
  listingId: string;
  ownerId: string;
  title: string;
  categoryId: string;
  subcategory: string;
  listingStatus: 'pending_approval' | 'active' | 'expired';
  existingPayload: Record<string, unknown>;
  name: string;
  propertyType: string;
  city: string;
  area: string;
  address: string;
  description: string;
  basePriceRupees: string;
  taxPercent: string;
  amenities: string;
  isActive: boolean;
  roomTypes: RoomTypeDraft[];
};
type Provider = { id: string; full_name: string | null; email: string | null };
type StayRow = StayDraft & { propertyId: string; listingTitle: string };

const PAGE_SIZE = 20;
const blankRoom = (): RoomTypeDraft => ({
  name: '', max_adults: 2, max_children: 0, base_price_paise: 0,
  amenities: [], is_active: true, units: [{ label: '', floor: '', is_active: true }],
});
const blankStay = (ownerId = ''): StayDraft => ({
  listingId: '', ownerId, title: '', categoryId: 'hotels', subcategory: 'hotel',
  listingStatus: 'pending_approval', existingPayload: {}, name: '', propertyType: 'hotel',
  city: '', area: '', address: '', description: '', basePriceRupees: '0', taxPercent: '12',
  amenities: '', isActive: true, roomTypes: [blankRoom()],
});

function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }

/** Supabase/RLS admin manager. All linked listing/inventory writes use one RPC transaction. */
export function AdminStayInventory() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [rows, setRows] = useState<StayRow[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<StayDraft | null>(null);

  const load = useCallback(async () => {
    const client = supabase;
    setLoading(true);
    setError('');
    if (!client) {
      setAuthorized(false);
      setRows([]);
      setError('Supabase is not configured; stay records are unavailable.');
      setLoading(false);
      return;
    }
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error('Sign in with a Supabase admin account to manage stays.');
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('role, account_status').eq('id', auth.user.id).maybeSingle();
      if (profileError || profile?.role !== 'admin' || profile.account_status !== 'active') {
        setAuthorized(false);
        throw new Error('An active Supabase admin profile is required.');
      }
      setAuthorized(true);
      const start = page * PAGE_SIZE;
      let propertyQuery = client.from('stay_properties')
        .select('id, listing_id, owner_user_id, name, property_type, city, area, address, description, base_price_paise, tax_percent, amenities, is_active', { count: 'exact' })
        .order('updated_at', { ascending: false }).range(start, start + PAGE_SIZE - 1);
      const term = query.trim();
      if (term) propertyQuery = propertyQuery.ilike('name', `%${term}%`);
      const [{ data: propertyRows, count, error: propertiesError }, { data: providersData, error: providersError }] = await Promise.all([
        propertyQuery,
        client.from('profiles').select('id, full_name, email').eq('role', 'provider').eq('account_status', 'active').order('full_name').limit(500),
      ]);
      if (propertiesError) throw new Error('Stay properties could not be loaded. Verify the stay inventory migration and RLS.');
      if (providersError) throw new Error('Active provider options could not be loaded.');
      const properties = propertyRows ?? [];
      const listingIds = properties.map((item) => String(item.listing_id ?? '')).filter(Boolean);
      const propertyIds = properties.map((item) => String(item.id));
      const [{ data: listingRows, error: listingsError }, { data: roomRows, error: roomsError }] = await Promise.all([
        listingIds.length ? client.from('listings').select('id, title, category_id, subcategory, status, payload').in('id', listingIds) : Promise.resolve({ data: [], error: null }),
        propertyIds.length ? client.from('stay_room_types').select('id, property_id, name, max_adults, max_children, base_price_paise, amenities, is_active').in('property_id', propertyIds).order('name') : Promise.resolve({ data: [], error: null }),
      ]);
      if (listingsError || roomsError) throw new Error('Stay listing or room data could not be loaded.');
      const roomIds = (roomRows ?? []).map((item) => String(item.id));
      const { data: unitRows, error: unitsError } = roomIds.length
        ? await client.from('stay_units').select('id, room_type_id, label, floor, is_active').in('room_type_id', roomIds).order('label')
        : { data: [], error: null };
      if (unitsError) throw new Error('Stay unit inventory could not be loaded.');
      const listingsById = new Map((listingRows ?? []).map((item) => [String(item.id), item]));
      const unitsByRoom = new Map<string, StayUnitDraft[]>();
      for (const unit of unitRows ?? []) {
        const key = String(unit.room_type_id);
        unitsByRoom.set(key, [...(unitsByRoom.get(key) ?? []), {
          id: String(unit.id), label: String(unit.label), floor: stringValue(unit.floor), is_active: Boolean(unit.is_active),
        }]);
      }
      const roomsByProperty = new Map<string, RoomTypeDraft[]>();
      for (const room of roomRows ?? []) {
        const key = String(room.property_id);
        roomsByProperty.set(key, [...(roomsByProperty.get(key) ?? []), {
          id: String(room.id), name: String(room.name), max_adults: Number(room.max_adults),
          max_children: Number(room.max_children), base_price_paise: Number(room.base_price_paise),
          amenities: Array.isArray(room.amenities) ? room.amenities as string[] : [],
          is_active: Boolean(room.is_active), units: unitsByRoom.get(String(room.id)) ?? [],
        }]);
      }
      setRows(properties.flatMap((property) => {
        const listing = listingsById.get(String(property.listing_id));
        if (!listing) return [];
        const payload = listing.payload && typeof listing.payload === 'object' ? listing.payload as Record<string, unknown> : {};
        return [{
          propertyId: String(property.id), listingId: String(property.listing_id), ownerId: String(property.owner_user_id),
          title: String(listing.title), listingTitle: String(listing.title), categoryId: String(listing.category_id),
          subcategory: String(listing.subcategory), listingStatus: listing.status as StayDraft['listingStatus'], existingPayload: payload,
          name: String(property.name), propertyType: String(property.property_type), city: String(property.city),
          area: stringValue(property.area), address: stringValue(property.address), description: stringValue(property.description),
          basePriceRupees: String(Number(property.base_price_paise) / 100), taxPercent: String(property.tax_percent),
          amenities: Array.isArray(property.amenities) ? property.amenities.join(', ') : '', isActive: Boolean(property.is_active),
          roomTypes: roomsByProperty.get(String(property.id)) ?? [],
        }];
      }));
      setTotal(count ?? 0);
      setProviders((providersData ?? []) as Provider[]);
    } catch (reason) {
      setRows([]);
      setError(reason instanceof Error ? reason.message : 'Stay inventory could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => { void load(); }, [load]);

  const edit = (row?: StayRow) => {
    if (!row) {
      setDraft(blankStay(providers[0]?.id ?? ''));
      setNotice('');
      setError('');
      return;
    }
    const { propertyId: _propertyId, listingTitle: _listingTitle, ...form } = row;
    setDraft(form);
    setNotice('');
    setError('');
  };

  const updateRoom = (index: number, patch: Partial<RoomTypeDraft>) => {
    setDraft((current) => current ? ({ ...current, roomTypes: current.roomTypes.map((room, i) => i === index ? { ...room, ...patch } : room) }) : current);
  };
  const updateUnit = (roomIndex: number, unitIndex: number, patch: Partial<StayUnitDraft>) => {
    setDraft((current) => current ? ({ ...current, roomTypes: current.roomTypes.map((room, ri) => ri === roomIndex ? { ...room, units: room.units.map((unit, ui) => ui === unitIndex ? { ...unit, ...patch } : unit) } : room) }) : current);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const client = supabase;
    if (!client || !authorized || !draft) { setError('A Supabase-authenticated active admin session is required.'); return; }
    const basePricePaise = Math.round(Number(draft.basePriceRupees) * 100);
    if (!draft.ownerId || !draft.title.trim() || !draft.categoryId.trim() || !draft.name.trim() || !draft.city.trim() || !Number.isInteger(basePricePaise) || basePricePaise < 0 || draft.roomTypes.length === 0) {
      setError('Choose an active provider and enter a listing title, property name, city, valid price and at least one room type.');
      return;
    }
    if (draft.roomTypes.some((room) => !room.name.trim() || !Number.isInteger(room.base_price_paise) || room.base_price_paise < 0 || room.units.some((unit) => !unit.label.trim()))) {
      setError('Each room type needs a name, non-negative price and unit labels.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const listingId = draft.listingId || `admin-stay-${crypto.randomUUID()}`;
      const propertyActive = draft.listingStatus !== 'expired' && draft.isActive;
      const roomTypes = draft.roomTypes.map((room) => ({
        ...(room.id ? { id: room.id } : {}), name: room.name.trim(), max_adults: room.max_adults,
        max_children: room.max_children, base_price_paise: room.base_price_paise,
        amenities: room.amenities, is_active: room.is_active,
        units: room.units.map((unit) => ({ ...(unit.id ? { id: unit.id } : {}), label: unit.label.trim(), floor: unit.floor.trim(), is_active: unit.is_active })),
      }));
      const { data, error: rpcError } = await client.rpc('admin_upsert_stay_inventory', {
        p_listing_id: listingId,
        p_owner_id: draft.ownerId,
        p_listing: {
          title: draft.title.trim(), category_id: draft.categoryId.trim(), subcategory: draft.subcategory.trim() || 'hotel',
          price: Number(draft.basePriceRupees), price_unit: 'per night',
          status: draft.listingStatus,
          payload: { ...draft.existingPayload, description: draft.description.trim(), location: { city: draft.city.trim(), area: draft.area.trim() } },
        },
        p_property: {
          name: draft.name.trim(), property_type: draft.propertyType, city: draft.city.trim(),
          area: draft.area.trim(), address: draft.address.trim(), description: draft.description.trim(),
          base_price_paise: basePricePaise, tax_percent: Number(draft.taxPercent),
          amenities: draft.amenities.split(',').map((item) => item.trim()).filter(Boolean), is_active: propertyActive,
        },
        p_room_types: roomTypes,
      });
      if (rpcError || !data || typeof data !== 'object') throw new Error('Stay inventory transaction failed. No changes were confirmed. Check active-admin RLS and the stay inventory migration.');
      setNotice(`Stay inventory saved in Supabase (${draft.listingStatus}).`);
      setDraft(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Stay inventory could not be saved.');
    } finally { setSaving(false); }
  };

  const setInput = (patch: Partial<StayDraft>) => setDraft((current) => current ? { ...current, ...patch } : current);

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="admin-stays-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Atomic Supabase RPC · RLS protected</p><h4 id="admin-stays-title" className="text-lg font-black">Hotels & stays inventory</h4><p className="text-xs text-slate-500">Properties, room types and physical units save in one transaction. Deactivation preserves linked booking records.</p></div>
        <button type="button" onClick={() => edit()} disabled={!authorized || saving} className="min-h-10 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white disabled:opacity-50">Create property</button>
      </div>
      {!authorized && !loading && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Management requires a Supabase-authenticated active admin profile. The separate server admin session is not sufficient.</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{notice}</p>}
      {authorized && <>
        <div className="flex flex-wrap gap-2"><input aria-label="Search stay properties" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value); }} placeholder="Search property name" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm sm:max-w-sm" /><button type="button" onClick={() => void load()} disabled={loading} className="min-h-10 rounded-xl border px-3 text-xs font-bold">Refresh</button></div>
        {loading && <p role="status" className="text-xs text-slate-500">Loading stay inventory…</p>}
        {!loading && rows.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No stay properties match this page.</p>}
        <div className="space-y-2">{rows.map((row) => <article key={row.propertyId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div className="min-w-0"><p className="truncate text-sm font-bold">{row.name}</p><p className="text-xs text-slate-500">{row.city}{row.area ? ` · ${row.area}` : ''} · ₹{Number(row.basePriceRupees).toLocaleString('en-IN')} per night</p><p className="text-[10px] text-slate-400">{row.roomTypes.length} room types · {row.roomTypes.reduce((sum, room) => sum + room.units.length, 0)} units · {row.listingStatus}</p></div>
          <button type="button" onClick={() => edit(row)} className="rounded-lg border px-3 py-2 text-xs font-bold">Manage inventory</button>
        </article>)}</div>
        <div className="flex items-center justify-between text-xs"><span>{total} property records</span><div className="flex items-center gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={!page || loading} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span><button type="button" onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * PAGE_SIZE >= total || loading} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></div>
      </>}
      {draft && <form onSubmit={save} className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
        <div className="flex items-center justify-between gap-3"><h5 className="font-bold">{draft.listingId ? 'Edit property & inventory' : 'Create property'}</h5><button type="button" onClick={() => setDraft(null)} className="rounded-lg border px-3 py-1.5 text-xs">Close</button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select aria-label="Stay provider" value={draft.ownerId} onChange={(event) => setInput({ ownerId: event.target.value })} required className="rounded-lg border p-2 text-xs"><option value="">Choose active provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.full_name || provider.email || provider.id}</option>)}</select>
          <input aria-label="Listing title" placeholder="Listing title" value={draft.title} onChange={(event) => setInput({ title: event.target.value })} required className="rounded-lg border p-2 text-xs" />
          <input aria-label="Category ID" placeholder="Category ID" value={draft.categoryId} onChange={(event) => setInput({ categoryId: event.target.value })} required className="rounded-lg border p-2 text-xs" />
          <input aria-label="Property name" placeholder="Property name" value={draft.name} onChange={(event) => setInput({ name: event.target.value })} required className="rounded-lg border p-2 text-xs" />
          <select aria-label="Property type" value={draft.propertyType} onChange={(event) => setInput({ propertyType: event.target.value })} className="rounded-lg border p-2 text-xs">{['hotel','resort','homestay','apartment','villa','guesthouse'].map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <input aria-label="City" placeholder="City" value={draft.city} onChange={(event) => setInput({ city: event.target.value })} required className="rounded-lg border p-2 text-xs" />
          <input aria-label="Area" placeholder="Area" value={draft.area} onChange={(event) => setInput({ area: event.target.value })} className="rounded-lg border p-2 text-xs" />
          <input aria-label="Address" placeholder="Address" value={draft.address} onChange={(event) => setInput({ address: event.target.value })} className="rounded-lg border p-2 text-xs" />
          <input aria-label="Base price in rupees" type="number" min="0" step="0.01" placeholder="Price per night ₹" value={draft.basePriceRupees} onChange={(event) => setInput({ basePriceRupees: event.target.value })} required className="rounded-lg border p-2 text-xs" />
          <input aria-label="Tax percent" type="number" min="0" step="0.01" value={draft.taxPercent} onChange={(event) => setInput({ taxPercent: event.target.value })} className="rounded-lg border p-2 text-xs" />
          <input aria-label="Amenities" placeholder="Amenities, comma separated" value={draft.amenities} onChange={(event) => setInput({ amenities: event.target.value })} className="rounded-lg border p-2 text-xs sm:col-span-2" />
          <select aria-label="Listing status" value={draft.listingStatus} onChange={(event) => setInput({ listingStatus: event.target.value as StayDraft['listingStatus'], isActive: event.target.value !== 'expired' })} className="rounded-lg border p-2 text-xs"><option value="pending_approval">Draft</option><option value="active">Published</option><option value="expired">Deactivated</option></select>
          <textarea aria-label="Description" placeholder="Description" value={draft.description} onChange={(event) => setInput({ description: event.target.value })} className="min-h-10 rounded-lg border p-2 text-xs sm:col-span-2 lg:col-span-4" />
        </div>
        <div className="space-y-3">{draft.roomTypes.map((room, roomIndex) => <fieldset key={room.id ?? `new-room-${roomIndex}`} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><legend className="px-1 text-xs font-bold">Room type {roomIndex + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input aria-label={`Room type ${roomIndex + 1} name`} placeholder="Room type name" value={room.name} onChange={(event) => updateRoom(roomIndex, { name: event.target.value })} className="rounded-lg border p-2 text-xs" /><input aria-label="Maximum adults" type="number" min="1" value={room.max_adults} onChange={(event) => updateRoom(roomIndex, { max_adults: Number(event.target.value) })} className="rounded-lg border p-2 text-xs" /><input aria-label="Maximum children" type="number" min="0" value={room.max_children} onChange={(event) => updateRoom(roomIndex, { max_children: Number(event.target.value) })} className="rounded-lg border p-2 text-xs" /><input aria-label="Room price in paise" type="number" min="0" value={room.base_price_paise} onChange={(event) => updateRoom(roomIndex, { base_price_paise: Number(event.target.value) })} className="rounded-lg border p-2 text-xs" /><input aria-label="Room amenities" placeholder="Room amenities, comma separated" value={room.amenities.join(', ')} onChange={(event) => updateRoom(roomIndex, { amenities: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} className="rounded-lg border p-2 text-xs sm:col-span-2" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={room.is_active} onChange={(event) => updateRoom(roomIndex, { is_active: event.target.checked })} /> Active</label></div>
          <div className="space-y-2">{room.units.map((unit, unitIndex) => <div key={unit.id ?? `new-unit-${roomIndex}-${unitIndex}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"><input aria-label={`Unit ${unitIndex + 1} label`} placeholder="Unit / room label" value={unit.label} onChange={(event) => updateUnit(roomIndex, unitIndex, { label: event.target.value })} className="rounded-lg border p-2 text-xs" /><input aria-label={`Unit ${unitIndex + 1} floor`} placeholder="Floor (optional)" value={unit.floor} onChange={(event) => updateUnit(roomIndex, unitIndex, { floor: event.target.value })} className="rounded-lg border p-2 text-xs" /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={unit.is_active} onChange={(event) => updateUnit(roomIndex, unitIndex, { is_active: event.target.checked })} /> Active</label><button type="button" onClick={() => updateRoom(roomIndex, { units: [...room.units, { label: '', floor: '', is_active: true }] })} className="rounded-lg border px-2 text-xs font-bold">Add unit</button></div>)}</div>
        </fieldset>)}<button type="button" onClick={() => setDraft({ ...draft, roomTypes: [...draft.roomTypes, blankRoom()] })} className="rounded-lg border border-dashed px-3 py-2 text-xs font-bold">Add room type</button></div>
        <p className="text-[11px] text-slate-600">Omitted inventory rows are retained. Use inactive toggles for safe deactivation; physical deletion is intentionally unavailable. Publishing requires at least one active room type and one active unit. Online booking remains disabled until its complete workflow is verified.</p>
        <div className="flex gap-2"><button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving transaction…' : 'Save inventory'}</button><button type="button" disabled={saving} onClick={() => setDraft(null)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button></div>
      </form>}
    </section>
  );
}
