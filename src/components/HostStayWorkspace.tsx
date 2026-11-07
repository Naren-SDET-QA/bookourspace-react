import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BedDouble, CalendarDays, CircleAlert, Hotel, ImagePlus, LoaderCircle, Plus, RefreshCw, Save, X } from 'lucide-react';
import UniversalMediaManager, { type MediaManagerItem } from './UniversalMediaManager';
import SafeImage from './SafeImage';
import { createMediaUploadHandler } from '../lib/media/uploadMediaAsset';
import { buildAuthHeaders } from '../lib/supabaseClient';
import { cancelStayBooking, type ApiFailure } from '../lib/stayCheckoutClient';

type HostListing = { listing_id: string; title: string; status: string; property_id: string | null; name?: string; city?: string; area?: string; property_type?: string; is_active?: boolean };
type Property = Record<string, any>;
type RoomType = { id: string; property_id: string; name: string; max_adults: number; max_children: number; base_price_paise: number; bedrooms: number; beds: number; bathrooms: number; amenities: string[]; is_active: boolean; units: Array<{ id: string; label: string; floor: string | null; isActive: boolean }> };
type HostBooking = { booking_id: string; status: string; check_in: string; check_out: string; total_paise: number | null; payment_status: string | null; property_name: string; room_type: string; unit_label: string };
type HostDetail = { listing: HostListing; property: Property | null; roomTypes: RoomType[]; blocks: Array<{ id: string; unit_id: string; starts_on: string; ends_on: string; reason: string | null }>; media: Array<{ id: string; reference: string; display_order: number; alt_text: string; caption: string; isCover?: boolean }> };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: buildAuthHeaders({ 'Content-Type': 'application/json', ...(init.headers as Record<string, string> || {}) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(body?.error || `HTTP_${response.status}`);
  return body as T;
}

const emptyProperty = { name: '', propertyType: 'hotel', placeType: 'entire_home', city: '', area: '', address: '', description: '', basePricePaise: 0, taxPercent: 12, bedrooms: 0, beds: 0, bathrooms: 0, maxGuests: 0, checkInTime: '14:00', checkOutTime: '11:00', instantBook: false, selfCheckIn: false, petsAllowed: false, amenities: '', hostLanguages: '', accessibility: '', cancellationPolicy: 'moderate', cancellationFreeHours: 48 };

/** Database backed host inventory workspace. Every mutation is checked again
 * by the host API and PostgreSQL RLS, independently of this UI state. */
export default function HostStayWorkspace() {
  const [listings, setListings] = useState<HostListing[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<HostDetail | null>(null);
  const [bookings, setBookings] = useState<HostBooking[]>([]);
  const [propertyForm, setPropertyForm] = useState<any>(emptyProperty);
  const [roomForm, setRoomForm] = useState({ name: '', maxAdults: 2, maxChildren: 0, basePricePaise: 10000, bedrooms: 1, beds: 1, bathrooms: 1, amenities: '' });
  const [editingRoomId, setEditingRoomId] = useState('');
  const [unitForm, setUnitForm] = useState({ roomTypeId: '', label: '', floor: '' });
  const [blockForm, setBlockForm] = useState({ unitId: '', startsOn: '', endsOn: '', reason: '' });
  const [mediaItems, setMediaItems] = useState<MediaManagerItem[]>([]);
  const [savedMedia, setSavedMedia] = useState<HostDetail['media']>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshListings = useCallback(async (preserveId = '') => {
    const result = await api<{ listings: HostListing[] }>('/api/stays/host/listings');
    setListings(result.listings || []);
    const nextId = preserveId && result.listings.some(item => item.listing_id === preserveId) ? preserveId : result.listings[0]?.listing_id || '';
    setSelectedId(nextId);
    return nextId;
  }, []);
  const refresh = useCallback(async (listingId = selectedId) => {
    if (!listingId) { setDetail(null); return; }
    const [result, bookingResult] = await Promise.all([
      api<HostDetail>(`/api/stays/host/listings/${encodeURIComponent(listingId)}`),
      api<{ bookings: HostBooking[] }>('/api/stays/host/bookings'),
    ]);
    setDetail(result);
    setSavedMedia((result.media || []).map((item, index) => ({ ...item, isCover: index === 0 })));
    setBookings(bookingResult.bookings || []);
    setPropertyForm({ ...emptyProperty, ...(result.property ? {
      name: result.property.name, propertyType: result.property.property_type, placeType: result.property.place_type,
      city: result.property.city, area: result.property.area || '', address: result.property.address || '',
      description: result.property.description || '', basePricePaise: result.property.base_price_paise,
      taxPercent: result.property.tax_percent, bedrooms: result.property.bedrooms, beds: result.property.beds,
      bathrooms: result.property.bathrooms, maxGuests: result.property.max_guests,
      checkInTime: String(result.property.check_in_time || '14:00').slice(0, 5), checkOutTime: String(result.property.check_out_time || '11:00').slice(0, 5),
      instantBook: result.property.instant_book, selfCheckIn: result.property.self_check_in, petsAllowed: result.property.pets_allowed,
      amenities: (result.property.amenities || []).join(', '), hostLanguages: (result.property.host_languages || []).join(', '),
      accessibility: (result.property.accessibility || []).join(', '), cancellationPolicy: result.property.cancellation_policy,
      cancellationFreeHours: result.property.cancellation_free_hours,
    } : {}) });
    setUnitForm(current => ({ ...current, roomTypeId: result.roomTypes[0]?.id || '' }));
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    void refreshListings().then(id => id ? refresh(id) : undefined).catch(e => { if (active) setError(String(e?.message || 'HOST_WORKSPACE_UNAVAILABLE')); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (selectedId) void refresh(selectedId).catch(e => setError(String(e?.message || 'HOST_WORKSPACE_UNAVAILABLE'))); }, [selectedId]);

  const save = async (path: string, body: unknown, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await api(path, { method: path.includes('properties') ? 'PUT' : 'POST', body: JSON.stringify(body) }); await refresh(selectedId); setNotice(success); }
    catch (e) { setError(String((e as Error)?.message || 'SAVE_FAILED')); }
    finally { setBusy(false); }
  };
  const saveProperty = () => save('/api/stays/host/properties', {
    ...propertyForm, listingId: selectedId,
    amenities: propertyForm.amenities.split(',').map((v: string) => v.trim()).filter(Boolean),
    hostLanguages: propertyForm.hostLanguages.split(',').map((v: string) => v.trim()).filter(Boolean),
    accessibility: propertyForm.accessibility.split(',').map((v: string) => v.trim()).filter(Boolean),
  }, 'Property details saved. Public visibility still follows listing approval.');
  const saveRoom = () => save('/api/stays/host/room-types', { ...roomForm, roomTypeId: editingRoomId || undefined, propertyId: detail?.property?.id, amenities: roomForm.amenities.split(',').map(v => v.trim()).filter(Boolean) }, 'Room type saved.');
  const editRoom = (room: RoomType) => {
    setEditingRoomId(room.id);
    setRoomForm({ name: room.name, maxAdults: room.max_adults, maxChildren: room.max_children, basePricePaise: room.base_price_paise, bedrooms: room.bedrooms, beds: room.beds, bathrooms: room.bathrooms, amenities: (room.amenities || []).join(', ') });
  };
  const addUnit = () => save('/api/stays/host/units', unitForm, 'Bookable unit added.');
  const addBlock = () => save('/api/stays/host/blocks', blockForm, 'Calendar dates blocked.');

  const saveMediaOrder = async () => {
    const uploaded = mediaItems.filter(item => item.status === 'uploaded' && item.result?.id);
    const newOrdered = [...uploaded].sort((a, b) => Number(b.isCover) - Number(a.isCover) || mediaItems.indexOf(a) - mediaItems.indexOf(b));
    const uploadedCover = newOrdered.some(item => item.isCover);
    const orderedIds = uploadedCover
      ? [...newOrdered.map(item => item.result!.id), ...savedMedia.map(item => item.id)]
      : [...savedMedia.map(item => item.id), ...newOrdered.map(item => item.result!.id)];
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/stays/host/media-order', { method: 'PUT', body: JSON.stringify({ listingId: selectedId, mediaIds: orderedIds }) });
      const refreshed = await api<HostDetail>(`/api/stays/host/listings/${encodeURIComponent(selectedId)}`);
      setSavedMedia((refreshed.media || []).map((item,index) => ({...item,isCover:index===0})));
      setMediaItems([]);
      setNotice('Photo order and cover saved. Photos are visible to customers only when the listing is published.');
    } catch (e) { setError(String((e as Error)?.message || 'MEDIA_ORDER_FAILED')); }
    finally { setBusy(false); }
  };
  const removeBlock = async (block: HostDetail['blocks'][number]) => {
    const unitId = block.unit_id;
    setBusy(true); setError('');
    try { await api('/api/stays/host/blocks', { method: 'POST', body: JSON.stringify({ blockId: block.id, unitId, startsOn: block.starts_on, endsOn: block.ends_on, isActive: false }) }); await refresh(); setNotice('Blackout removed. Availability is restored unless another booking or blackout overlaps.'); }
    catch (e) { setError(String((e as Error)?.message || 'BLOCK_REMOVE_FAILED')); }
    finally { setBusy(false); }
  };
  const moveSavedMedia = (index: number, delta: number) => setSavedMedia(current => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
    return next.map((item, position) => ({ ...item, isCover: position === 0 }));
  });
  const selectSavedCover = (id: string) => setSavedMedia(current => {
    const next = [...current].sort((a,b) => a.id === id ? -1 : b.id === id ? 1 : current.indexOf(a) - current.indexOf(b));
    return next.map((item,index) => ({ ...item, isCover:index === 0 }));
  });
  const hostBookings = useMemo(() => bookings.filter(item => detail?.property && item.property_name === detail.property.name), [bookings, detail]);

  return <section className="space-y-5 rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6" aria-label="Stay host workspace">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-black uppercase tracking-wider text-indigo-600">Stay hosting</p><h2 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white"><Hotel aria-hidden="true"/> Property and inventory</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Manage verified listing inventory, room rates, availability, bookings and photos. Changes are saved to PostgreSQL.</p></div>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void refreshListings(selectedId).then(id => refresh(id)).catch(e => setError(String(e?.message || 'REFRESH_FAILED'))).finally(() => setBusy(false)); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-50 dark:border-slate-700"><RefreshCw className="h-4 w-4"/>Refresh</button>
    </header>
    {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><CircleAlert className="h-4 w-4 shrink-0"/>{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</p>}
    {busy && !detail && <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin"/>Loading your stay listings…</div>}
    {!busy && listings.length === 0 && <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"><b>No stay listing is linked to this active provider account.</b><p className="mt-1">Use “Register as Provider & Submit Listing Request” above and choose Hotels & Stays. Inventory tools unlock after the provider role is approved and the listing request is submitted.</p></div>}
    {listings.length > 0 && <>
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Stay listing<select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">{listings.map(item => <option key={item.listing_id} value={item.listing_id}>{item.title} · {item.status}</option>)}</select></label>
      {detail && <>
        <form onSubmit={e => { e.preventDefault(); void saveProperty(); }} className="grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 md:grid-cols-2">
          <h3 className="md:col-span-2 flex items-center gap-2 font-black"><Hotel className="h-4 w-4 text-indigo-600"/>Property registration and details</h3>
          {([['name','Property name'],['city','City'],['area','Area / locality'],['address','Street address'],['description','Description'],['basePricePaise','Base nightly price (paise)'],['taxPercent','Tax %'],['bedrooms','Bedrooms'],['beds','Beds'],['bathrooms','Bathrooms'],['maxGuests','Maximum guests'],['checkInTime','Check-in time'],['checkOutTime','Check-out time'],['cancellationFreeHours','Free cancellation hours'],['amenities','Amenities (comma separated)'],['hostLanguages','Host languages'],['accessibility','Accessibility features']] as const).map(([key,label]) => <label key={key} className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}<input value={propertyForm[key] ?? ''} onChange={e => setPropertyForm((v: any) => ({...v,[key]: ['basePricePaise','taxPercent','bedrooms','beds','bathrooms','maxGuests','cancellationFreeHours'].includes(key) ? Number(e.target.value) : e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"/></label>)}
          <label className="text-xs font-bold">Property type<select value={propertyForm.propertyType} onChange={e => setPropertyForm((v: any) => ({...v,propertyType:e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-950">{['hotel','resort','homestay','apartment','villa','guesthouse','guest_house','house','flat','lodge','temple_stay'].map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="text-xs font-bold">Place type<select value={propertyForm.placeType} onChange={e => setPropertyForm((v: any) => ({...v,placeType:e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-950"><option value="entire_home">Entire place</option><option value="private_room">Private room</option><option value="shared_room">Shared room</option></select></label>
          <label className="text-xs font-bold">Cancellation policy<select value={propertyForm.cancellationPolicy} onChange={e => setPropertyForm((v: any) => ({...v,cancellationPolicy:e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-950">{['flexible','moderate','strict','non_refundable'].map(v=><option key={v}>{v}</option>)}</select></label>
          <div className="md:col-span-2 flex flex-wrap gap-4 text-sm">{(['instantBook','selfCheckIn','petsAllowed'] as const).map(key=><label key={key} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={propertyForm[key]} onChange={e=>setPropertyForm((v:any)=>({...v,[key]:e.target.checked}))}/>{key === 'instantBook' ? 'Instant Book' : key === 'selfCheckIn' ? 'Self check-in' : 'Pets allowed'}</label>)}</div>
          <button type="submit" disabled={busy} className="md:col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Save property</button>
        </form>

        {detail.property && <>
          <div className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={e=>{e.preventDefault();void saveRoom();}} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="flex items-center gap-2 font-black"><BedDouble className="h-4 w-4 text-indigo-600"/>Room type and nightly rate</h3>
              <input required aria-label="Room type name" placeholder="Room type name" value={roomForm.name} onChange={e=>setRoomForm(v=>({...v,name:e.target.value}))} className="min-h-11 w-full rounded-xl border px-3 dark:bg-slate-950"/>
              <div className="grid grid-cols-2 gap-2">{([['maxAdults','Adults'],['maxChildren','Children'],['basePricePaise','Price per night (paise)'],['bedrooms','Bedrooms'],['beds','Beds'],['bathrooms','Bathrooms']] as const).map(([key,label])=><label key={key} className="text-xs font-bold">{label}<input type="number" min="0" value={roomForm[key]} onChange={e=>setRoomForm(v=>({...v,[key]:Number(e.target.value)}))} className="mt-1 min-h-11 w-full rounded-xl border px-3 dark:bg-slate-950"/></label>)}</div>
              <input aria-label="Room amenities" placeholder="Room amenities (comma separated)" value={roomForm.amenities} onChange={e=>setRoomForm(v=>({...v,amenities:e.target.value}))} className="min-h-11 w-full rounded-xl border px-3 dark:bg-slate-950"/>
              <div className="flex flex-wrap gap-2"><button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{editingRoomId ? 'Save room type' : 'Add room type'}</button>{editingRoomId && <button type="button" onClick={()=>{setEditingRoomId('');setRoomForm({name:'',maxAdults:2,maxChildren:0,basePricePaise:10000,bedrooms:1,beds:1,bathrooms:1,amenities:''});}} className="min-h-11 rounded-xl border px-4 text-sm font-bold">Cancel edit</button>}</div>
              <ul className="space-y-2">{detail.roomTypes.map(room=><li key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span><b>{room.name}</b> · ₹{(room.base_price_paise/100).toLocaleString('en-IN')}/night · {room.units.filter(x=>x.isActive).length} active units<br/><span className="text-xs text-slate-500">{room.max_adults} adults · {room.beds} beds · {room.bathrooms} bathrooms</span></span><button type="button" onClick={()=>editRoom(room)} className="min-h-10 rounded-lg border px-3 text-xs font-bold">Edit</button></li>)}</ul>
            </form>
            <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="flex items-center gap-2 font-black"><Plus className="h-4 w-4 text-indigo-600"/>Bookable rooms / units</h3>
              <form onSubmit={e=>{e.preventDefault();void addUnit();}} className="grid gap-2 sm:grid-cols-3"><select required value={unitForm.roomTypeId} onChange={e=>setUnitForm(v=>({...v,roomTypeId:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"><option value="">Choose room type</option>{detail.roomTypes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><input required aria-label="Unit label" placeholder="Unit label" value={unitForm.label} onChange={e=>setUnitForm(v=>({...v,label:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"/><input aria-label="Floor" placeholder="Floor" value={unitForm.floor} onChange={e=>setUnitForm(v=>({...v,floor:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"/><button disabled={busy} className="min-h-11 rounded-xl bg-indigo-600 px-4 font-bold text-white sm:col-span-3">Add unit</button></form>
              <ul className="max-h-64 space-y-2 overflow-auto">{detail.roomTypes.flatMap(room=>room.units.filter(unit=>unit.isActive).map(unit=><li key={unit.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span><b>{unit.label}</b> · {room.name}{unit.floor ? ` · ${unit.floor}` : ''}</span><button type="button" onClick={()=>void save('/api/stays/host/units',{unitId:unit.id,roomTypeId:room.id,label:unit.label,floor:unit.floor,isActive:false},'Unit deactivated.')} className="min-h-10 rounded-lg border px-3 text-xs font-bold">Deactivate</button></li>))}</ul>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="flex items-center gap-2 font-black"><CalendarDays className="h-4 w-4 text-indigo-600"/>Availability and blackout dates</h3>
              <p className="text-xs text-slate-500">Guest bookings and owner blackouts are checked transactionally by PostgreSQL. Checkout is inclusive of the start date and exclusive of the end date.</p>
              <form onSubmit={e=>{e.preventDefault();void addBlock();}} className="grid gap-2 sm:grid-cols-2"><select required value={blockForm.unitId} onChange={e=>setBlockForm(v=>({...v,unitId:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"><option value="">Choose unit</option>{detail.roomTypes.flatMap(r=>r.units.filter(u=>u.isActive).map(u=><option key={u.id} value={u.id}>{r.name} · {u.label}</option>))}</select><input required type="date" aria-label="Blackout start date" value={blockForm.startsOn} onChange={e=>setBlockForm(v=>({...v,startsOn:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"/><input required type="date" aria-label="Blackout end date" value={blockForm.endsOn} onChange={e=>setBlockForm(v=>({...v,endsOn:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"/><input aria-label="Blackout reason" placeholder="Reason (optional)" value={blockForm.reason} onChange={e=>setBlockForm(v=>({...v,reason:e.target.value}))} className="min-h-11 rounded-xl border px-3 dark:bg-slate-950"/><button disabled={busy} className="min-h-11 rounded-xl bg-indigo-600 px-4 font-bold text-white sm:col-span-2">Block dates</button></form>
              <ul className="space-y-2">{detail.blocks.map(block=><li key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30"><span>{block.starts_on} → {block.ends_on}{block.reason ? ` · ${block.reason}` : ''}</span><button type="button" onClick={()=>void removeBlock(block)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-amber-300 px-3 text-xs font-bold"><X className="h-3.5 w-3.5"/>Restore dates</button></li>)}</ul>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="flex items-center gap-2 font-black"><ImagePlus className="h-4 w-4 text-indigo-600"/>Photos, cover and order</h3>
              <p className="text-xs text-slate-500">Uploads use the existing quarantine, byte validation and finalization flow. Originals remain preserved; responsive variants are generated by the shared media manager.</p>
              {savedMedia.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{savedMedia.map((photo,index)=><li key={photo.id} className="flex gap-3 rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><SafeImage src={photo.reference} alt={photo.alt_text || `Stay photo ${index+1}`} category="stays" className="h-24 w-28 shrink-0 rounded-lg object-cover" sizes="112px"/><div className="min-w-0 flex-1"><b className="text-xs">{photo.isCover ? 'Cover photo' : `Photo ${index+1}`}</b><div className="mt-2 flex flex-wrap gap-1"><button type="button" disabled={index===0} onClick={()=>moveSavedMedia(index,-1)} className="min-h-9 rounded-lg border px-2 text-xs">Move up</button><button type="button" disabled={index===savedMedia.length-1} onClick={()=>moveSavedMedia(index,1)} className="min-h-9 rounded-lg border px-2 text-xs">Move down</button><button type="button" disabled={photo.isCover} onClick={()=>selectSavedCover(photo.id)} className="min-h-9 rounded-lg border px-2 text-xs">Set cover</button></div></div></li>)}</ul>}
              <UniversalMediaManager key={selectedId} moduleKey="stays" parentType="provider_listing" maxFiles={20} title="Upload stay photos" onUpload={createMediaUploadHandler('stays','provider_listing',selectedId)} onChange={setMediaItems}/>
              <button type="button" disabled={busy || (!savedMedia.length && !mediaItems.some(item=>item.status==='uploaded'))} onClick={()=>void saveMediaOrder()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>Save cover and order</button>
            </div>
          </div>
        </>}
      </>}
      <section className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-black">Stay bookings</h3><p className="text-xs text-slate-500">Guest contact details are not shown here. Cancellations use the server cancellation policy; any refund is a quote until the payment provider confirms settlement.</p>{hostBookings.length ? <ul className="space-y-2">{hostBookings.map(item=><li key={item.booking_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800"><span><b>{item.property_name} · {item.room_type} · {item.unit_label}</b><br/>{item.check_in} → {item.check_out} · {item.status} · payment {item.payment_status || 'unknown'}</span><span className="font-bold">{item.total_paise == null ? '—' : `₹${(item.total_paise/100).toLocaleString('en-IN')}`}{['held','confirmed'].includes(item.status) && <button type="button" onClick={async()=>{if(!window.confirm('Cancel this booking? Any refund remains subject to payment-provider confirmation.'))return;setBusy(true);try{const outcome=await cancelStayBooking(item.booking_id);if((outcome as ApiFailure)?.ok===false)throw new Error((outcome as ApiFailure).error);await refresh();setNotice('Booking cancelled. Refund settlement has not been claimed by this app.');}catch(e){setError(String((e as Error).message));}finally{setBusy(false);}}} className="ml-2 min-h-10 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-700">Cancel</button>}</span></li>)}</ul> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">No stay bookings to manage.</p>}</section>
    </>}
  </section>;
}
