import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Coins,
  Image as ImageIcon,
  LogIn,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { buildAuthHeaders } from '../../lib/supabaseClient';
import { BookingQrCameraScanner } from './BookingQrCameraScanner';
import SafeImage from '../SafeImage';
import {
  ACCESSIBILITY_OPTIONS,
  AMENITY_OPTIONS,
  LANGUAGE_OPTIONS,
  PLACE_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  amenityLabel,
} from '../../lib/stayFilters';
import { fetchStayPaymentCapabilities, formatPaise, scanStayBookingQr } from '../../lib/stayCheckoutClient';

type HostListing = {
  listing_id: string;
  title: string;
  status: string;
  payload?: Record<string, unknown> | null;
  property_id: string | null;
  name: string | null;
  city: string | null;
  area: string | null;
  property_type: string | null;
  is_active: boolean | null;
};

type HostRoom = {
  id: string;
  name: string;
  max_adults: number;
  max_children: number;
  base_price_paise: number;
  amenities: string[];
  bedrooms: number;
  beds: number;
  bathrooms: number;
  is_active: boolean;
  units: Array<{ id: string; label: string; floor: string | null; isActive: boolean }>;
};

type HostDetail = {
  listing: {
    id: string;
    title: string;
    status: string;
    stayLifecycle?: string;
    demo?: boolean;
    review?: { action?: string; reason?: string } | null;
    verificationDocuments?: Array<{ kind: string; reference: string; fileName?: string }>;
    gstin?: string;
    legalName?: string;
  };
  property: Record<string, any> | null;
  roomTypes: HostRoom[];
  blocks: Array<{ id: string; unit_id: string; starts_on: string; ends_on: string; reason: string | null }>;
  media: Array<{ id: string; reference: string; alt_text: string }>;
};

type HostBooking = {
  booking_id: string;
  status: string;
  payment_status: string;
  payment_mode: string;
  total_paise: number;
  check_in: string;
  check_out: string;
  customer_name: string;
  customer_phone: string;
  request_expires_at?: string;
  listing_id: string;
  property_name: string;
  room_type: string;
  unit_label: string;
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#717171] dark:text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[#717171] dark:text-slate-400">{hint}</span>}
    </label>
  );
}

const inputClass = 'h-10 w-full rounded-lg border border-[#b0b0b0] bg-white px-2.5 text-sm outline-none focus:border-[#222222] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

export function StayHostWorkspace({
  open,
  role,
  onClose,
  onStartHosting,
  onSignIn,
}: {
  open: boolean;
  role: 'customer' | 'provider' | 'admin' | null;
  onClose: () => void;
  onStartHosting?: () => void;
  onSignIn?: () => void;
}) {
  const [tab, setTab] = useState<'inventory' | 'bookings'>('inventory');
  const [listings, setListings] = useState<HostListing[]>([]);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<HostDetail | null>(null);
  const detailRequestSequence = useRef(0);
  const [bookings, setBookings] = useState<HostBooking[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanToken, setScanToken] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [roomDraft, setRoomDraft] = useState({ name: '', maxAdults: 2, maxChildren: 0, priceRupees: '', bedrooms: 1, beds: 1, bathrooms: 1 });
  const [unitDrafts, setUnitDrafts] = useState<Record<string, string>>({});
  const [blockDraft, setBlockDraft] = useState({ unitId: '', startsOn: todayIso(), endsOn: '', reason: '' });
  const [roomEdits, setRoomEdits] = useState<Record<string, Record<string, any>>>({});
  const roomEditsRef = useRef<Record<string, Record<string, any>>>({});
  const [sandboxSettlement, setSandboxSettlement] = useState(false);
  const [createDraft, setCreateDraft] = useState({ name: '', city: '', area: '', propertyType: 'hotel' });
  const [docs, setDocs] = useState({
    gstCertificate: '',
    ownership: '',
    governmentId: '',
    gstin: '',
    legalName: '',
    photo: '',
  });

  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: buildAuthHeaders(init.headers as Record<string, string> | undefined),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      throw Object.assign(new Error(body?.message || body?.error || `HTTP_${response.status}`), { code: body?.error });
    }
    return body;
  };

  const loadListings = async () => {
    try {
      const body = await request('/api/stays/host/listings');
      const rows = Array.isArray(body.listings) ? body.listings : [];
      setListings(rows);
      return rows as HostListing[];
    } catch (caught) {
      const code = (caught as { code?: string }).code;
      if (code === 'ACTIVE_PROVIDER_REQUIRED') {
        setListings([]);
        return [];
      }
      throw caught;
    }
  };

  const loadDetail = async (listingId: string) => {
    const requestSequence = ++detailRequestSequence.current;
    const body = await request(`/api/stays/host/listings/${encodeURIComponent(listingId)}`);
    if (requestSequence !== detailRequestSequence.current) return;
    const nextRoomEdits: Record<string, Record<string, any>> = {};
    for (const room of body.roomTypes || []) {
      nextRoomEdits[room.id] = {
        name: room.name,
        priceRupees: String(Math.round(room.base_price_paise / 100)),
        maxAdults: room.max_adults,
        maxChildren: room.max_children,
        bedrooms: room.bedrooms,
        beds: room.beds,
        bathrooms: room.bathrooms,
        isActive: room.is_active,
      };
    }
    roomEditsRef.current = nextRoomEdits;
    setRoomEdits(nextRoomEdits);
    setDetail(body);
    const property = body.property || {};
    setForm({
      listingId,
      name: property.name || body.listing?.title || '',
      propertyType: property.property_type || 'hotel',
      placeType: property.place_type || 'entire_home',
      city: property.city || '',
      area: property.area || '',
      address: property.address || '',
      latitude: property.latitude ?? '',
      longitude: property.longitude ?? '',
      basePriceRupees: property.base_price_paise ? String(Math.round(Number(property.base_price_paise) / 100)) : '',
      taxPercent: property.tax_percent ?? 12,
      cleaningFeeRupees: property.cleaning_fee_paise ? String(Math.round(Number(property.cleaning_fee_paise) / 100)) : '0',
      serviceFeeBps: property.service_fee_bps ?? 0,
      description: property.description || '',
      amenities: Array.isArray(property.amenities) ? property.amenities : [],
      bedrooms: property.bedrooms ?? 0,
      beds: property.beds ?? 0,
      bathrooms: property.bathrooms ?? 0,
      maxGuests: property.max_guests ?? 0,
      instantBook: property.instant_book === true,
      selfCheckIn: property.self_check_in === true,
      petsAllowed: property.pets_allowed === true,
      hostLanguages: Array.isArray(property.host_languages) ? property.host_languages : [],
      accessibility: Array.isArray(property.accessibility) ? property.accessibility : [],
      cancellationPolicy: property.cancellation_policy || 'moderate',
      cancellationFreeHours: property.cancellation_free_hours ?? 48,
      checkInTime: property.check_in_time ? String(property.check_in_time).slice(0, 5) : '14:00',
      checkOutTime: property.check_out_time ? String(property.check_out_time).slice(0, 5) : '11:00',
      isActive: property.is_active !== false,
    });
    const listingDocs = Array.isArray(body.listing?.verificationDocuments) ? body.listing.verificationDocuments : [];
    const byKind = (kind: string) => listingDocs.find((doc: { kind: string }) => doc.kind === kind)?.reference || '';
    setDocs({
      gstCertificate: byKind('gst_certificate'),
      ownership: byKind('property_ownership'),
      governmentId: byKind('government_id'),
      gstin: body.listing?.gstin || '',
      legalName: body.listing?.legalName || '',
      photo: Array.isArray((body.listing as { payload?: { images?: string[] } })?.payload?.images)
        ? String((body.listing as { payload?: { images?: string[] } }).payload?.images?.[0] || '')
        : '',
    });
    setBlockDraft((current) => ({
      ...current,
      unitId: current.unitId || body.roomTypes?.[0]?.units?.[0]?.id || '',
    }));
  };

  const selectListing = async (listingId: string) => {
    setSelected(listingId);
    setDetail(null);
    setLoading(true);
    setError('');
    try {
      await loadDetail(listingId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    const body = await request('/api/stays/host/bookings');
    setBookings(Array.isArray(body.bookings) ? body.bookings : []);
    const caps = await fetchStayPaymentCapabilities();
    setSandboxSettlement(Boolean(caps.ok && (caps as { sandbox?: boolean }).sandbox));
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await loadListings();
      const first = selected || rows[0]?.listing_id || '';
      if (first) {
        setSelected(first);
        await loadDetail(first);
      }
      await loadBookings();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setNotice('');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const createProperty = async () => {
    setSaving(true);
    setError('');
    try {
      const body = await request('/api/stays/host/onboard', {
        method: 'POST',
        body: JSON.stringify(createDraft),
      });
      setNotice('Draft property created. Add rooms, photos and verification documents, then submit for Super Admin approval.');
      const listingId = String(body.listingId || '');
      const rows = await loadListings();
      const next = listingId || rows[0]?.listing_id || '';
      if (next) {
        setSelected(next);
        await loadDetail(next);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveDocuments = async () => {
    if (!form.listingId) return;
    setSaving(true);
    setError('');
    try {
      await request(`/api/stays/host/listings/${encodeURIComponent(form.listingId)}/documents`, {
        method: 'PUT',
        body: JSON.stringify({
          gstin: docs.gstin,
          legalName: docs.legalName,
          images: docs.photo ? [docs.photo] : [],
          documents: [
            docs.gstCertificate ? { kind: 'gst_certificate', reference: docs.gstCertificate, fileName: 'GST certificate' } : null,
            docs.ownership ? { kind: 'property_ownership', reference: docs.ownership, fileName: 'Property ownership' } : null,
            docs.governmentId ? { kind: 'government_id', reference: docs.governmentId, fileName: 'Government ID' } : null,
          ].filter(Boolean),
        }),
      });
      setNotice('Verification documents saved on the draft.');
      await loadDetail(form.listingId);
    } catch (caught) {
      setError((caught as Error).message);
      throw caught;
    } finally {
      setSaving(false);
    }
  };

  const submitListing = async () => {
    if (!form.listingId) return;
    setSaving(true);
    setError('');
    try {
      await saveDocuments();
      await request(`/api/stays/host/listings/${encodeURIComponent(form.listingId)}/submit`, { method: 'POST' });
      setNotice('Submitted for Super Admin approval. The hotel will not appear in public search until it is approved.');
      await loadDetail(form.listingId);
      await loadListings();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveProperty = async () => {
    if (!form.listingId) return;
    setSaving(true);
    setError('');
    try {
      await request('/api/stays/host/properties', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          basePricePaise: Math.max(0, Math.round(Number(form.basePriceRupees || 0) * 100)),
          taxPercent: Number(form.taxPercent || 0),
          cleaningFeePaise: Math.max(0, Math.round(Number(form.cleaningFeeRupees || 0) * 100)),
          serviceFeeBps: Number(form.serviceFeeBps || 0),
          latitude: form.latitude === '' ? null : Number(form.latitude),
          longitude: form.longitude === '' ? null : Number(form.longitude),
        }),
      });
      setNotice('Stay details saved.');
      await loadDetail(form.listingId);
      await loadListings();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveRoom = async (room?: HostRoom) => {
    if (!detail?.property) { setError('Save the stay details before adding rooms.'); return; }
    setSaving(true);
    setError('');
    try {
      await request('/api/stays/host/room-types', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: detail.property.id,
          roomTypeId: room?.id,
          name: room?.name || roomDraft.name,
          maxAdults: room?.max_adults ?? roomDraft.maxAdults,
          maxChildren: room?.max_children ?? roomDraft.maxChildren,
          basePricePaise: room ? room.base_price_paise : Math.round(Number(roomDraft.priceRupees || 0) * 100),
          amenities: room?.amenities || [],
          bedrooms: room?.bedrooms ?? roomDraft.bedrooms,
          beds: room?.beds ?? roomDraft.beds,
          bathrooms: room?.bathrooms ?? roomDraft.bathrooms,
          isActive: room?.is_active !== false,
        }),
      });
      setNotice(room ? 'Room type saved.' : 'Room type added.');
      if (!room) setRoomDraft({ name: '', maxAdults: 2, maxChildren: 0, priceRupees: '', bedrooms: 1, beds: 1, bathrooms: 1 });
      await loadDetail(form.listingId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateRoom = async (room: HostRoom) => {
    const edit = roomEditsRef.current[room.id];
    if (!edit) return;
    setSaving(true);
    setError('');
    try {
      await request('/api/stays/host/room-types', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: detail?.property?.id,
          roomTypeId: room.id,
          name: edit.name,
          maxAdults: Number(edit.maxAdults),
          maxChildren: Number(edit.maxChildren),
          basePricePaise: Math.max(0, Math.round(Number(edit.priceRupees || 0) * 100)),
          amenities: room.amenities,
          bedrooms: Number(edit.bedrooms),
          beds: Number(edit.beds),
          bathrooms: Number(edit.bathrooms),
          isActive: edit.isActive !== false,
        }),
      });
      setNotice('Room type updated.');
      await loadDetail(form.listingId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateRoomEdit = (roomId: string, key: string, value: unknown) => {
    const next = {
      ...roomEditsRef.current,
      [roomId]: { ...roomEditsRef.current[roomId], [key]: value },
    };
    roomEditsRef.current = next;
    setRoomEdits(next);
  };

  const addUnit = async (room: HostRoom) => {
    const label = (unitDrafts[room.id] || '').trim();
    if (!label) return;
    setSaving(true);
    setError('');
    try {
      await request('/api/stays/host/units', {
        method: 'POST',
        body: JSON.stringify({ roomTypeId: room.id, label }),
      });
      setUnitDrafts((current) => ({ ...current, [room.id]: '' }));
      setNotice('Unit added.');
      await loadDetail(form.listingId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async () => {
    if (!blockDraft.unitId || !blockDraft.endsOn) { setError('Choose a unit and an end date to block availability.'); return; }
    setSaving(true);
    setError('');
    try {
      await request('/api/stays/host/blocks', {
        method: 'POST',
        body: JSON.stringify(blockDraft),
      });
      setNotice('Dates blocked.');
      setBlockDraft((current) => ({ ...current, startsOn: todayIso(), endsOn: '', reason: '' }));
      await loadDetail(form.listingId);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const bookingAction = async (bookingId: string, action: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await request(`/api/stays/host/bookings/${encodeURIComponent(bookingId)}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === 'approve_request' ? 'Request approved. The guest can now pay or is confirmed for pay-at-property.'
          : action === 'reject_request' ? 'Request declined. No money was collected.'
          : action === 'check_in' ? 'Guest checked in.'
          : action === 'check_out' ? 'Stay completed. The guest can now review.'
          : action === 'collect_payment' ? 'Payment recorded as collected at the property.'
          : action === 'approve_online' ? 'Settlement manually approved and recorded with an audit event.'
          : 'Booking cancelled.',
      );
      await loadBookings();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const units = useMemo(
    () => (detail?.roomTypes || []).flatMap((room) => room.units.map((unit) => ({ ...unit, room: room.name }))),
    [detail],
  );
  const visibleBookings = useMemo(
    () => bookings.filter((booking) => !selected || booking.listing_id === selected),
    [bookings, selected],
  );
  const payout = useMemo(() => {
    const verified = visibleBookings.filter((booking) => booking.payment_status === 'verified').reduce((sum, booking) => sum + Number(booking.total_paise), 0);
    const collected = visibleBookings.filter((booking) => booking.payment_status === 'collected_offline').reduce((sum, booking) => sum + Number(booking.total_paise), 0);
    const awaiting = visibleBookings.filter((booking) => ['pending_verification', 'pay_later'].includes(booking.payment_status)).reduce((sum, booking) => sum + Number(booking.total_paise), 0);
    return { verified, collected, awaiting };
  }, [visibleBookings]);

  if (!open) return null;

  const isHost = role === 'provider' || role === 'admin' || role === 'customer';
  const lifecycle = detail?.listing.stayLifecycle || 'draft';
  const reviewReason = detail?.listing.review && typeof detail.listing.review === 'object'
    ? String(detail.listing.review.reason || '')
    : '';

  return (
    <div className="fixed inset-0 z-[115] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="host-workspace-heading" className="flex h-[94vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-t-2xl bg-white text-[#222222] shadow-2xl sm:h-[90vh] sm:rounded-2xl dark:bg-slate-950 dark:text-slate-100">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#ebebeb] px-4 dark:border-slate-800">
          <div>
            <h2 id="host-workspace-heading" className="text-base font-semibold">Host workspace</h2>
            <p className="text-[11px] text-[#717171] dark:text-slate-400">Rooms, pricing, calendar, bookings and payments</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void load()} aria-label="Refresh host workspace" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={onClose} aria-label="Close host workspace" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f7f7f7] dark:hover:bg-slate-800">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {!isHost ? (
            <div className="mx-auto max-w-md rounded-2xl border border-[#ebebeb] p-8 text-center dark:border-slate-800">
              <ShieldCheck className="mx-auto h-8 w-8 text-[#717171]" aria-hidden="true" />
              <p className="mt-3 text-lg font-semibold">Become a host</p>
              <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Sign in with Google to create a hotel profile. Incomplete properties stay as Draft until you submit them for Super Admin approval.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {onSignIn && !role && <button type="button" onClick={onSignIn} className="min-h-[44px] rounded-xl bg-[#f97316] px-4 text-sm font-semibold text-white">Sign in with Google</button>}
              </div>
            </div>
          ) : loading && !detail ? (
            <p className="text-sm text-[#717171]" aria-busy="true">Loading your stay workspace…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-[#dddddd] p-1 dark:border-slate-700">
                  {(['inventory', 'bookings'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      aria-pressed={tab === value}
                      className={`min-h-[36px] rounded-full px-4 text-sm font-semibold transition ${tab === value ? 'bg-[#222222] text-white dark:bg-white dark:text-slate-900' : 'text-[#717171]'}`}
                    >
                      {value === 'inventory' ? 'Inventory' : `Bookings (${visibleBookings.length})`}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Choose a stay listing"
                  value={selected}
                  onChange={(event) => { void selectListing(event.target.value); }}
                  className="min-h-[40px] max-w-full rounded-xl border border-[#dddddd] bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
                >
                  {listings.map((listing) => (
                    <option key={listing.listing_id} value={listing.listing_id}>
                      {listing.name || listing.title} {listing.property_id ? '' : '· not published'}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setSelected('')} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#dddddd] px-3 text-sm font-semibold dark:border-slate-700">
                  <Plus className="h-4 w-4" aria-hidden="true" /> New listing
                </button>
              </div>

              {notice && <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{notice}</p>}
              {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}

              {tab === 'inventory' && (
                <div className="mt-4 space-y-6 pb-8">
                  {(listings.length === 0 || !selected) && (
                    <div className="rounded-2xl border border-[#ebebeb] p-6 dark:border-slate-800">
                      <p className="font-semibold">Create a hotel profile</p>
                      <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Saved as Draft. Public search and bookings stay closed until Super Admin approval.</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Field label="Hotel name"><input className={inputClass} value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} /></Field>
                        <Field label="City"><input className={inputClass} value={createDraft.city} onChange={(event) => setCreateDraft({ ...createDraft, city: event.target.value })} /></Field>
                        <Field label="Area"><input className={inputClass} value={createDraft.area} onChange={(event) => setCreateDraft({ ...createDraft, area: event.target.value })} /></Field>
                        <Field label="Property type">
                          <select className={inputClass} value={createDraft.propertyType} onChange={(event) => setCreateDraft({ ...createDraft, propertyType: event.target.value })}>
                            {PROPERTY_TYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                          </select>
                        </Field>
                      </div>
                      <button type="button" onClick={() => void createProperty()} disabled={saving || !createDraft.name || !createDraft.city} className="mt-4 min-h-[44px] rounded-xl bg-[#f97316] px-5 text-sm font-semibold text-white disabled:opacity-50">Save draft</button>
                    </div>
                  )}

                  {detail && (
                    <>
                      <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="flex items-center gap-2 text-sm font-bold"><BedDouble className="h-4 w-4" aria-hidden="true" /> Stay details</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${lifecycle === 'approved' && detail.listing.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                            {lifecycle.replace(/_/g, ' ')} · listing {detail.listing.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {lifecycle !== 'approved' && (
                          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            {lifecycle === 'submitted'
                              ? 'Waiting for Super Admin review. The hotel is hidden from public search and cannot take bookings.'
                              : lifecycle === 'changes_requested'
                                ? `Super Admin requested changes${reviewReason ? `: ${reviewReason}` : '.'} Update the profile and submit again.`
                                : lifecycle === 'rejected'
                                  ? `This hotel was rejected${reviewReason ? `: ${reviewReason}` : '.'}`
                                  : lifecycle === 'suspended'
                                    ? `This hotel is suspended${reviewReason ? `: ${reviewReason}` : '.'} Bookings are closed.`
                                    : 'Draft only. Complete details, photos, rooms, pricing and verification documents, then submit for Super Admin approval.'}
                          </p>
                        )}
                        {detail.listing.demo && (
                          <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">Demo hotel. Real bookings are refused.</p>
                        )}
                        {!detail.property ? (
                          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            This listing has no stay profile yet. Fill in the name, city and price, then save to publish rooms.
                          </p>
                        ) : null}
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Field label="Stay name"><input className={inputClass} value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                          <Field label="Property type">
                            <select className={inputClass} value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })}>
                              {PROPERTY_TYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </select>
                          </Field>
                          <Field label="Place type">
                            <select className={inputClass} value={form.placeType} onChange={(event) => setForm({ ...form, placeType: event.target.value })}>
                              {PLACE_TYPE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </select>
                          </Field>
                          <Field label="City"><input className={inputClass} value={form.city || ''} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
                          <Field label="Area"><input className={inputClass} value={form.area || ''} onChange={(event) => setForm({ ...form, area: event.target.value })} /></Field>
                          <Field label="Address"><input className={inputClass} value={form.address || ''} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
                          <Field label="Latitude"><input className={inputClass} value={form.latitude ?? ''} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></Field>
                          <Field label="Longitude"><input className={inputClass} value={form.longitude ?? ''} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></Field>
                          <Field label="Nightly price (₹)"><input type="number" min="0" className={inputClass} value={form.basePriceRupees ?? ''} onChange={(event) => setForm({ ...form, basePriceRupees: event.target.value })} /></Field>
                          <Field label="Tax %"><input type="number" min="0" max="50" className={inputClass} value={form.taxPercent ?? 0} onChange={(event) => setForm({ ...form, taxPercent: event.target.value })} /></Field>
                          <Field label="Cleaning fee (₹)"><input type="number" min="0" className={inputClass} value={form.cleaningFeeRupees ?? 0} onChange={(event) => setForm({ ...form, cleaningFeeRupees: event.target.value })} /></Field>
                          <Field label="Service fee (bps)" hint="100 = 1%, 500 = 5%"><input type="number" min="0" max="3000" className={inputClass} value={form.serviceFeeBps ?? 0} onChange={(event) => setForm({ ...form, serviceFeeBps: event.target.value })} /></Field>
                          <Field label="Bedrooms"><input type="number" min="0" className={inputClass} value={form.bedrooms ?? 0} onChange={(event) => setForm({ ...form, bedrooms: event.target.value })} /></Field>
                          <Field label="Beds"><input type="number" min="0" className={inputClass} value={form.beds ?? 0} onChange={(event) => setForm({ ...form, beds: event.target.value })} /></Field>
                          <Field label="Bathrooms"><input type="number" min="0" step="0.5" className={inputClass} value={form.bathrooms ?? 0} onChange={(event) => setForm({ ...form, bathrooms: event.target.value })} /></Field>
                          <Field label="Max guests"><input type="number" min="0" className={inputClass} value={form.maxGuests ?? 0} onChange={(event) => setForm({ ...form, maxGuests: event.target.value })} /></Field>
                          <Field label="Check-in"><input type="time" className={inputClass} value={form.checkInTime} onChange={(event) => setForm({ ...form, checkInTime: event.target.value })} /></Field>
                          <Field label="Checkout"><input type="time" className={inputClass} value={form.checkOutTime} onChange={(event) => setForm({ ...form, checkOutTime: event.target.value })} /></Field>
                        </div>
                        <div className="mt-3">
                          <Field label="Description"><textarea rows={3} className="w-full rounded-lg border border-[#b0b0b0] bg-white p-2.5 text-sm outline-none dark:border-slate-600 dark:bg-slate-900" value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {AMENITY_OPTIONS.map((amenity) => {
                            const active = (form.amenities || []).some((value: string) => value.toLowerCase() === amenity.id || value.toLowerCase() === amenity.label.toLowerCase());
                            return (
                              <button
                                key={amenity.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => {
                                  const current: string[] = form.amenities || [];
                                  const label = amenityLabel(amenity.id);
                                  setForm({ ...form, amenities: active ? current.filter((value) => value.toLowerCase() !== amenity.id && value.toLowerCase() !== label.toLowerCase()) : [...current, label] });
                                }}
                                className={`min-h-[34px] rounded-full border px-2.5 text-xs font-medium ${active ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800' : 'border-[#dddddd] dark:border-slate-700'}`}
                              >
                                {amenity.label}
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Host languages">
                            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#dddddd] p-2 dark:border-slate-700">
                              {LANGUAGE_OPTIONS.map((language) => {
                                const active = (form.hostLanguages || []).includes(language.id);
                                return (
                                  <button key={language.id} type="button" aria-pressed={active} onClick={() => setForm({ ...form, hostLanguages: active ? form.hostLanguages.filter((value: string) => value !== language.id) : [...(form.hostLanguages || []), language.id] })} className={`rounded-full border px-2 py-1 text-[11px] font-medium ${active ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800' : 'border-[#dddddd] dark:border-slate-700'}`}>
                                    {language.label}
                                  </button>
                                );
                              })}
                            </div>
                          </Field>
                          <Field label="Accessibility">
                            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-[#dddddd] p-2 dark:border-slate-700">
                              {ACCESSIBILITY_OPTIONS.map((option) => {
                                const active = (form.accessibility || []).includes(option.id);
                                return (
                                  <button key={option.id} type="button" aria-pressed={active} onClick={() => setForm({ ...form, accessibility: active ? form.accessibility.filter((value: string) => value !== option.id) : [...(form.accessibility || []), option.id] })} className={`rounded-full border px-2 py-1 text-[11px] font-medium ${active ? 'border-[#222222] bg-[#f7f7f7] dark:border-white dark:bg-slate-800' : 'border-[#dddddd] dark:border-slate-700'}`}>
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </Field>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                          <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#f97316]" checked={form.instantBook === true} onChange={(event) => setForm({ ...form, instantBook: event.target.checked })} /> Instant Book</label>
                          <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#f97316]" checked={form.selfCheckIn === true} onChange={(event) => setForm({ ...form, selfCheckIn: event.target.checked })} /> Self check-in</label>
                          <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#f97316]" checked={form.petsAllowed === true} onChange={(event) => setForm({ ...form, petsAllowed: event.target.checked })} /> Pets</label>
                          <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#f97316]" checked={form.isActive !== false} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Accept guests after approval</label>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Cancellation policy">
                            <select className={inputClass} value={form.cancellationPolicy} onChange={(event) => setForm({ ...form, cancellationPolicy: event.target.value })}>
                              <option value="flexible">Flexible</option>
                              <option value="moderate">Moderate</option>
                              <option value="strict">Strict</option>
                              <option value="non_refundable">Non-refundable</option>
                            </select>
                          </Field>
                          <Field label="Free-cancellation hours"><input type="number" min="0" max="720" className={inputClass} value={form.cancellationFreeHours ?? 48} onChange={(event) => setForm({ ...form, cancellationFreeHours: event.target.value })} /></Field>
                        </div>
                        <button type="button" onClick={() => void saveProperty()} disabled={saving} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#222222] px-5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900">
                          <Save className="h-4 w-4" aria-hidden="true" /> {detail.property ? 'Save stay details' : 'Create stay inventory'}
                        </button>
                      </section>

                      <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                        <h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Verification and policies</h3>
                        <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">GST certificate, property ownership and a government ID are required before Super Admin can approve the hotel. Use HTTPS or storage:// references.</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <Field label="Legal name"><input className={inputClass} value={docs.legalName} onChange={(event) => setDocs({ ...docs, legalName: event.target.value })} /></Field>
                          <Field label="GSTIN"><input className={inputClass} value={docs.gstin} onChange={(event) => setDocs({ ...docs, gstin: event.target.value })} /></Field>
                          <Field label="GST certificate URL"><input className={inputClass} value={docs.gstCertificate} onChange={(event) => setDocs({ ...docs, gstCertificate: event.target.value })} /></Field>
                          <Field label="Ownership document URL"><input className={inputClass} value={docs.ownership} onChange={(event) => setDocs({ ...docs, ownership: event.target.value })} /></Field>
                          <Field label="Government ID URL"><input className={inputClass} value={docs.governmentId} onChange={(event) => setDocs({ ...docs, governmentId: event.target.value })} /></Field>
                          <Field label="Cover photo URL"><input className={inputClass} value={docs.photo} onChange={(event) => setDocs({ ...docs, photo: event.target.value })} /></Field>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void saveDocuments()} disabled={saving} className="min-h-[44px] rounded-xl border border-[#222222] px-4 text-sm font-semibold disabled:opacity-60 dark:border-white">Save documents</button>
                          {['draft', 'changes_requested'].includes(lifecycle) && (
                            <button type="button" onClick={() => void submitListing()} disabled={saving} className="min-h-[44px] rounded-xl bg-[#f97316] px-4 text-sm font-semibold text-white disabled:opacity-60">Submit for Super Admin approval</button>
                          )}
                        </div>
                      </section>

                      {detail.property && (
                        <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                          <h3 className="flex items-center gap-2 text-sm font-bold"><BedDouble className="h-4 w-4" aria-hidden="true" /> Room types and units</h3>
                          <div className="mt-3 space-y-3">
                            {detail.roomTypes.map((room) => (
                              <div key={room.id} className="rounded-xl border border-[#ebebeb] p-3 dark:border-slate-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-semibold">{roomEdits[room.id]?.name || room.name}</p>
                                  <span className="text-[11px] text-[#717171]">{room.units.length} unit{room.units.length === 1 ? '' : 's'} · {formatPaise(Math.round(Number(roomEdits[room.id]?.priceRupees || 0) * 100))}/night</span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                  <input aria-label={`Room name ${room.name}`} className={inputClass} value={roomEdits[room.id]?.name ?? ''} onChange={(event) => updateRoomEdit(room.id, 'name', event.target.value)} />
                                  <input aria-label={`Nightly price rupees ${room.name}`} type="number" min="0" className={inputClass} value={roomEdits[room.id]?.priceRupees ?? ''} onChange={(event) => updateRoomEdit(room.id, 'priceRupees', event.target.value)} />
                                  <input aria-label={`Max adults ${room.name}`} type="number" min="1" className={inputClass} value={roomEdits[room.id]?.maxAdults ?? 1} onChange={(event) => updateRoomEdit(room.id, 'maxAdults', event.target.value)} />
                                  <input aria-label={`Bedrooms ${room.name}`} type="number" min="0" className={inputClass} value={roomEdits[room.id]?.bedrooms ?? 0} onChange={(event) => updateRoomEdit(room.id, 'bedrooms', event.target.value)} />
                                  <input aria-label={`Beds ${room.name}`} type="number" min="0" className={inputClass} value={roomEdits[room.id]?.beds ?? 0} onChange={(event) => updateRoomEdit(room.id, 'beds', event.target.value)} />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                                  <button type="button" onClick={() => void updateRoom(room)} disabled={saving} className="min-h-[34px] rounded-lg border border-[#222222] px-3 font-semibold disabled:opacity-60 dark:border-white">Save room</button>
                                  <label className="inline-flex items-center gap-1.5"><input type="checkbox" className="h-3.5 w-3.5 accent-[#f97316]" checked={roomEdits[room.id]?.isActive !== false} onChange={(event) => updateRoomEdit(room.id, 'isActive', event.target.checked)} /> Active</label>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {room.units.map((unit) => (
                                    <span key={unit.id} className="rounded-md bg-[#f7f7f7] px-2 py-1 text-[11px] dark:bg-slate-800">Unit {unit.label}{unit.floor ? ` · ${unit.floor}` : ''}</span>
                                  ))}
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <input aria-label={`New unit label for ${room.name}`} className={inputClass} placeholder="Unit label, e.g. 201" value={unitDrafts[room.id] || ''} onChange={(event) => setUnitDrafts({ ...unitDrafts, [room.id]: event.target.value })} />
                                  <button type="button" onClick={() => void addUnit(room)} disabled={saving} className="min-h-[40px] shrink-0 rounded-lg border border-[#222222] px-3 text-xs font-semibold disabled:opacity-60 dark:border-white">Add unit</button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 grid gap-2 sm:grid-cols-3">
                            <input aria-label="New room name" className={inputClass} placeholder="Room name" value={roomDraft.name} onChange={(event) => setRoomDraft({ ...roomDraft, name: event.target.value })} />
                            <input aria-label="New room price rupees" type="number" min="0" className={inputClass} placeholder="Nightly ₹" value={roomDraft.priceRupees} onChange={(event) => setRoomDraft({ ...roomDraft, priceRupees: event.target.value })} />
                            <input aria-label="New room max adults" type="number" min="1" className={inputClass} placeholder="Max adults" value={roomDraft.maxAdults} onChange={(event) => setRoomDraft({ ...roomDraft, maxAdults: Number(event.target.value) })} />
                          </div>
                          <button type="button" onClick={() => void saveRoom()} disabled={saving || !roomDraft.name || !roomDraft.priceRupees} className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#222222] px-4 text-xs font-semibold disabled:opacity-50 dark:border-white">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add room type
                          </button>
                        </section>
                      )}

                      {detail.property && (
                        <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                          <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Block dates</h3>
                          <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">Blocked dates disappear from the public availability calendar and cannot be booked.</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-5">
                            <select aria-label="Unit to block" className={inputClass} value={blockDraft.unitId} onChange={(event) => setBlockDraft({ ...blockDraft, unitId: event.target.value })}>
                              <option value="">Choose unit</option>
                              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.room} · {unit.label}</option>)}
                            </select>
                            <input aria-label="Block starts on" type="date" className={inputClass} value={blockDraft.startsOn} onChange={(event) => setBlockDraft({ ...blockDraft, startsOn: event.target.value })} />
                            <input aria-label="Block ends on" type="date" className={inputClass} value={blockDraft.endsOn} onChange={(event) => setBlockDraft({ ...blockDraft, endsOn: event.target.value })} />
                            <input aria-label="Block reason" className={inputClass} placeholder="Maintenance" value={blockDraft.reason} onChange={(event) => setBlockDraft({ ...blockDraft, reason: event.target.value })} />
                            <button type="button" onClick={() => void addBlock()} disabled={saving || !blockDraft.unitId || !blockDraft.endsOn} className="min-h-[40px] rounded-lg bg-[#222222] px-3 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">Block</button>
                          </div>
                          {detail.blocks.length > 0 && (
                            <ul className="mt-3 space-y-1 text-xs text-[#717171] dark:text-slate-400">
                              {detail.blocks.map((block) => <li key={block.id}>{block.starts_on} → {block.ends_on}{block.reason ? ` · ${block.reason}` : ''}</li>)}
                            </ul>
                          )}
                        </section>
                      )}

                      <section className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                        <h3 className="flex items-center gap-2 text-sm font-bold"><ImageIcon className="h-4 w-4" aria-hidden="true" /> Photos</h3>
                        <p className="mt-1 text-xs text-[#717171] dark:text-slate-400">Existing published media only. Upload and ordering use the same owned-media pipeline as the listing wizard; no new storage is created here.</p>
                        {detail.media.length === 0 ? (
                          <p className="mt-2 text-xs text-[#717171] dark:text-slate-400">No published photos for this stay yet.</p>
                        ) : (
                          <ul className="mt-2 grid grid-cols-3 gap-2">
                            {detail.media.map((asset) => (
                              <li key={asset.id} className="rounded-lg border border-[#ebebeb] p-2 text-[11px] dark:border-slate-800">
                                <SafeImage
                                  category="stays"
                                  src={asset.reference}
                                  alt={asset.alt_text || 'Stay photo'}
                                  className="mb-1.5 h-20 w-full rounded object-cover"
                                  sizes="180px"
                                />
                                <span className="block truncate font-mono">{asset.reference.split('/').pop()}</span>
                                <span className="block truncate text-[#717171] dark:text-slate-400">{asset.alt_text || 'No alt text'}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </>
                  )}
                </div>
              )}

              {tab === 'bookings' && (
                <div className="mt-4 space-y-4 pb-8">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-[#ebebeb] p-3 dark:border-slate-800">
                      <p className="text-[11px] font-bold uppercase text-[#717171]">Verified online</p>
                      <p className="mt-1 text-lg font-semibold">{formatPaise(payout.verified)}</p>
                      <p className="text-[11px] text-[#717171]">Pending payout (no payout rail configured)</p>
                    </div>
                    <div className="rounded-xl border border-[#ebebeb] p-3 dark:border-slate-800">
                      <p className="text-[11px] font-bold uppercase text-[#717171]">Collected at property</p>
                      <p className="mt-1 text-lg font-semibold">{formatPaise(payout.collected)}</p>
                      <p className="text-[11px] text-[#717171]">Recorded by the host, not online</p>
                    </div>
                    <div className="rounded-xl border border-[#ebebeb] p-3 dark:border-slate-800">
                      <p className="text-[11px] font-bold uppercase text-[#717171]">Awaiting confirmation</p>
                      <p className="mt-1 text-lg font-semibold">{formatPaise(payout.awaiting)}</p>
                      <p className="text-[11px] text-[#717171]">Never treated as paid</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-dashed border-[#222222]/30 p-3 dark:border-white/30">
                    <p className="flex items-center gap-1.5 text-xs font-bold"><QrCode className="h-4 w-4" aria-hidden="true" /> Scan booking QR to check in</p>
                    <p className="mt-1 text-[11px] text-[#717171] dark:text-slate-400">Scan the guest&apos;s My Trips QR with a scanner, or paste the server-issued token. A token cannot be replayed after check-in.</p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input value={scanToken} onChange={(event) => setScanToken(event.target.value)} placeholder="bos1.… booking QR token" aria-label="Booking QR token" className={inputClass} />
                      <button type="button" onClick={() => setScannerOpen(true)} className="min-h-[40px] shrink-0 rounded-lg border border-[#222222] px-3 text-xs font-semibold dark:border-white">Scan camera</button>
                      <button
                        type="button"
                        disabled={scanBusy || scanToken.trim().length < 10}
                        onClick={async () => {
                          setScanBusy(true); setError(''); setNotice('');
                          const result = await scanStayBookingQr(scanToken.trim());
                          setScanBusy(false);
                          if (!result.ok) { setError((result as { message?: string }).message || 'The QR could not be verified.'); return; }
                          setNotice(`${result.customerName || 'Guest'} checked in for ${result.propertyName || 'the stay'}.`);
                          setScanToken('');
                          await loadBookings();
                        }}
                        className="min-h-[40px] shrink-0 rounded-lg bg-[#222222] px-4 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                      >
                        {scanBusy ? 'Verifying…' : 'Verify QR & check in'}
                      </button>
                    </div>
                  </div>

                  {visibleBookings.length === 0 ? (
                    <div className="rounded-2xl border border-[#ebebeb] p-8 text-center dark:border-slate-800">
                      <CalendarDays className="mx-auto h-8 w-8 text-[#717171]" aria-hidden="true" />
                      <p className="mt-2 font-semibold">No bookings yet</p>
                      <p className="mt-1 text-sm text-[#717171] dark:text-slate-400">Confirmed reservations appear here with check-in, checkout and payment actions.</p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {visibleBookings.map((booking) => (
                        <li key={booking.booking_id} className="rounded-2xl border border-[#ebebeb] p-4 dark:border-slate-800">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{booking.property_name} · {booking.room_type || 'Room'} {booking.unit_label ? `(${booking.unit_label})` : ''}</p>
                              <p className="text-sm text-[#717171] dark:text-slate-400">{booking.customer_name} · {booking.check_in} → {booking.check_out}</p>
                            </div>
                            <span className="rounded-full bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold dark:bg-slate-800">{booking.status.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span>Total {formatPaise(booking.total_paise)}</span>
                            <span className={`inline-flex items-center gap-1 font-semibold ${booking.payment_status === 'verified' || booking.payment_status === 'collected_offline' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>
                              {booking.payment_status === 'verified' || booking.payment_status === 'collected_offline' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                              {booking.payment_status.replace(/_/g, ' ')} · {booking.payment_mode.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {booking.status === 'pending_approval' && (
                            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                              Guest requested these dates. No payment has been taken.
                              {booking.request_expires_at ? ` Respond before ${new Date(booking.request_expires_at).toLocaleString('en-IN')}.` : ''}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {booking.status === 'pending_approval' && (
                              <>
                                <button type="button" onClick={() => void bookingAction(booking.booking_id, 'approve_request')} disabled={saving} className="min-h-[36px] rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60">Approve request</button>
                                <button type="button" onClick={() => void bookingAction(booking.booking_id, 'reject_request')} disabled={saving} className="min-h-[36px] rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-600 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300">Decline</button>
                              </>
                            )}
                            {booking.status === 'confirmed' && (
                              <button type="button" onClick={() => void bookingAction(booking.booking_id, 'check_in')} disabled={saving} className="min-h-[36px] rounded-lg border border-[#222222] px-3 text-xs font-semibold disabled:opacity-60 dark:border-white">Check in</button>
                            )}
                            {booking.status === 'checked_in' && (
                              <button type="button" onClick={() => void bookingAction(booking.booking_id, 'check_out')} disabled={saving} className="min-h-[36px] rounded-lg border border-[#222222] px-3 text-xs font-semibold disabled:opacity-60 dark:border-white">Check out</button>
                            )}
                            {booking.payment_mode === 'pay_after_service' && !['verified', 'collected_offline'].includes(booking.payment_status) && (
                              <button type="button" onClick={() => void bookingAction(booking.booking_id, 'collect_payment')} disabled={saving} className="min-h-[36px] rounded-lg border border-emerald-600 px-3 text-xs font-semibold text-emerald-700 disabled:opacity-60 dark:text-emerald-300">Record property payment</button>
                            )}
                            {sandboxSettlement && booking.payment_mode === 'upi' && booking.payment_status === 'pending_verification' && (
                              <button type="button" onClick={() => void bookingAction(booking.booking_id, 'approve_online')} disabled={saving} className="min-h-[36px] rounded-lg border border-indigo-500 px-3 text-xs font-semibold text-indigo-700 disabled:opacity-60 dark:text-indigo-300">Approve settlement</button>
                            )}
                            {['confirmed', 'checked_in'].includes(booking.status) && (
                              <button type="button" onClick={() => void bookingAction(booking.booking_id, 'cancel')} disabled={saving} className="min-h-[36px] rounded-lg border border-rose-300 px-3 text-xs font-semibold text-rose-600 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300">Cancel</button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {scannerOpen && <BookingQrCameraScanner onResult={(value) => { setScanToken(value); setScannerOpen(false); }} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}
