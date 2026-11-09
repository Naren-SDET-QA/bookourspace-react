import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildAuthHeaders, fetchCurrentAuthSession } from '../lib/supabaseClient';
import { PgMoneyBadge, PgPaymentSection } from './PgPaymentPanel';
import { PgCollectionClaimPanel, PgDisputePanel, PgInvoicePanel } from './PgDisputePanel';
import {
  cancelPgBooking,
  fetchPgBookings,
  ownerPgBookingAction,
  pgErrorMessage,
  type PgBooking,
} from '../lib/pgBookingClient';

type PgRoomType = {
  roomTypeId: string;
  name: string;
  occupancyPerBed: number;
  monthlyRentPaise: number;
  securityDepositPaise: number;
  totalBeds: number;
  availableBeds: number;
  amenities: string[];
  beds: Array<{ id: string; label: string }>;
};

type PgDateBlock = {
  id: string;
  unit_id: string;
  unit_label?: string;
  room_name?: string;
  starts_on: string;
  ends_on: string;
  reason?: string | null;
};

function tomorrowLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inr(paise: number): string {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { ...buildAuthHeaders(), ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || `HTTP_${response.status}`);
  return body as T;
}

export function PgBookingPanel({ listingId }: { listingId: string }) {
  const [moveIn, setMoveIn] = useState(tomorrowLocal);
  const [months, setMonths] = useState(1);
  const [inventory, setInventory] = useState<PgRoomType[]>([]);
  const [roomTypeId, setRoomTypeId] = useState('');
  const [beds, setBeds] = useState(1);
  const [occupants, setOccupants] = useState(1);
  const [role, setRole] = useState<string>('customer');
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [roomName, setRoomName] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [deposit, setDeposit] = useState('0');
  const [occupancyPerBed, setOccupancyPerBed] = useState('1');
  const [bedLabelsText, setBedLabelsText] = useState('Bed 1');
  const [creatingRoomType, setCreatingRoomType] = useState(false);
  const [reservedBookingId, setReservedBookingId] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const session = await fetchCurrentAuthSession();
      setAuthenticated(session.authenticated && Boolean(session.user?.verified));
      setRole(session.user?.role || 'customer');
      const data = await api<{ roomTypes: PgRoomType[] }>(
        `/api/pg/listings/${encodeURIComponent(listingId)}/inventory?moveIn=${encodeURIComponent(moveIn)}&months=${months}`,
      );
      setInventory(data.roomTypes || []);
      const first = data.roomTypes?.[0];
      setRoomTypeId((current) => data.roomTypes?.some((item) => item.roomTypeId === current) ? current : first?.roomTypeId || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PG_INVENTORY_UNAVAILABLE');
    }
  }, [listingId, moveIn, months]);

  useEffect(() => { void load(); }, [load]);

  const selected = inventory.find((room) => room.roomTypeId === roomTypeId) || null;
  useEffect(() => {
    if (!selected) return;
    setRoomName(selected.name);
    setMonthlyRent(String(selected.monthlyRentPaise / 100));
    setDeposit(String(selected.securityDepositPaise / 100));
    setOccupancyPerBed(String(selected.occupancyPerBed));
    if (selected.beds.length) setBedLabelsText(selected.beds.map((bed) => bed.label).join(', '));
  }, [selected?.roomTypeId]);
  const quote = useMemo(() => selected
    ? selected.monthlyRentPaise * months * beds + selected.securityDepositPaise * beds
    : 0, [selected, months, beds]);

  async function saveInventory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const labels = bedLabelsText.split(',').map((label) => label.trim()).filter(Boolean);
      const result = await api<{ inventory: { roomTypeId: string } }>(`/api/provider/pg/listings/${encodeURIComponent(listingId)}/inventory`, {
        method: 'PUT', body: JSON.stringify({ roomTypeId: creatingRoomType ? null : selected?.roomTypeId || null, roomName: roomName || selected?.name || 'PG Beds', monthlyRentRupees: Number(monthlyRent || (selected?.monthlyRentPaise || 0) / 100), securityDepositRupees: Number(deposit), occupancyPerBed: Number(occupancyPerBed), bedLabels: labels, amenities: selected?.amenities || [] }),
      });
      setCreatingRoomType(false);
      setRoomTypeId(result.inventory.roomTypeId);
      setMessage('Room and bed inventory saved. Availability now comes from PostgreSQL.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PG_INVENTORY_SAVE_FAILED'); }
    finally { setBusy(false); }
  }

  async function book() {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ booking: { bookingId: string; status: string; paymentStatus: string; totalDuePaise: number; rentPaise: number; depositPaise: number; moveOut: string } }>('/api/pg/bookings', {
        method: 'POST', body: JSON.stringify({ listingId, roomTypeId: selected.roomTypeId, moveIn, months, beds, occupants, idempotencyKey: crypto.randomUUID() }),
      });
      const booking = result.booking;
      setReservedBookingId(booking.bookingId);
      setMessage(`Reservation ${booking.bookingId} confirmed for ${moveIn} through ${booking.moveOut}. Amount due: ${inr(booking.totalDuePaise)} (rent ${inr(booking.rentPaise)} + deposit ${inr(booking.depositPaise)}). Choose how you want to pay below.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PG_BOOKING_FAILED'); }
    finally { setBusy(false); }
  }

  const ownerMode = authenticated && ['provider', 'admin'].includes(role);
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60" aria-label="PG availability and booking">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Move-in date
          <input type="date" min={tomorrowLocal()} value={moveIn} onChange={(event) => setMoveIn(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Lease length
          <select value={months} onChange={(event) => setMonths(Number(event.target.value))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} month{index ? 's' : ''}</option>)}</select>
        </label>
        <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl border border-violet-700 px-4 text-sm font-bold text-violet-800 dark:text-violet-200">Check live availability</button>
      </div>

      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error.replaceAll('_', ' ').toLowerCase()}</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-purple-50 px-3 py-2 text-sm leading-6 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">{message}</p>}

      {inventory.length === 0 && !error && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No verified room inventory is configured for this listing yet.</p>}
      {inventory.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {inventory.map((room) => <label key={room.roomTypeId} className={`cursor-pointer rounded-2xl border p-4 ${roomTypeId === room.roomTypeId ? 'border-violet-700 bg-white dark:bg-slate-950' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'}`}>
          <input type="radio" name={`pg-room-${listingId}`} className="sr-only" checked={roomTypeId === room.roomTypeId} onChange={() => setRoomTypeId(room.roomTypeId)} />
          <span className="block font-bold">{room.name}</span>
          <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{inr(room.monthlyRentPaise)} / month · deposit {inr(room.securityDepositPaise)}</span>
          <span className="mt-1 block text-xs text-slate-500">{room.availableBeds} available of {room.totalBeds} beds · up to {room.occupancyPerBed} occupant(s) per bed</span>
        </label>)}
      </div>}

      {ownerMode && <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer font-bold">Manage room and bed inventory</summary>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="grid min-w-48 flex-1 gap-1 text-xs font-semibold">Room type to edit
            <select aria-label="Room type to edit" value={roomTypeId} disabled={creatingRoomType} onChange={(event) => setRoomTypeId(event.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              {inventory.map((room) => <option key={room.roomTypeId} value={room.roomTypeId}>{room.name} · {room.totalBeds} bed(s)</option>)}
            </select>
          </label>
          <button type="button" onClick={() => { setCreatingRoomType(true); setRoomTypeId(''); setRoomName(''); setMonthlyRent(''); setDeposit('0'); setOccupancyPerBed('1'); setBedLabelsText('Bed 1'); }} className="min-h-10 self-end rounded-xl border border-violet-300 px-3 text-xs font-bold text-violet-800 dark:border-violet-800 dark:text-violet-200">Add room type</button>
          {creatingRoomType && <button type="button" onClick={() => { setCreatingRoomType(false); setRoomTypeId(inventory[0]?.roomTypeId || ''); }} className="min-h-10 self-end rounded-xl border px-3 text-xs font-bold">Cancel new room</button>}
        </div>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void saveInventory(event)}>
          <label className="grid gap-1 text-xs font-semibold">Room / sharing type<input required maxLength={100} value={roomName || selected?.name || ''} onChange={(event) => setRoomName(event.target.value)} className="min-h-11 rounded-xl border px-3 text-sm dark:bg-slate-900" /></label>
          <label className="grid gap-1 text-xs font-semibold">Monthly rent (₹)<input required min="1" max="1000000" type="number" value={monthlyRent || (selected?.monthlyRentPaise ? String(selected.monthlyRentPaise / 100) : '')} onChange={(event) => setMonthlyRent(event.target.value)} className="min-h-11 rounded-xl border px-3 text-sm dark:bg-slate-900" /></label>
          <label className="grid gap-1 text-xs font-semibold">Security deposit (₹)<input required min="0" max="5000000" type="number" value={deposit} onChange={(event) => setDeposit(event.target.value)} className="min-h-11 rounded-xl border px-3 text-sm dark:bg-slate-900" /></label>
          <label className="grid gap-1 text-xs font-semibold">Occupants per bed<input required min="1" max="4" type="number" value={occupancyPerBed} onChange={(event) => setOccupancyPerBed(event.target.value)} className="min-h-11 rounded-xl border px-3 text-sm dark:bg-slate-900" /></label>
          <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Bed labels, comma-separated<input required maxLength={4096} value={bedLabelsText} onChange={(event) => setBedLabelsText(event.target.value)} placeholder="Bed 1, Bed 2, Bed 3" className="min-h-11 rounded-xl border px-3 text-sm dark:bg-slate-900" /></label>
          <button disabled={busy} className="min-h-11 self-end rounded-xl bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : creatingRoomType ? 'Create room type' : 'Save inventory'}</button>
        </form>
      </details>}

      {ownerMode && <PgDateBlocks listingId={listingId} rooms={inventory} onChanged={() => void load()} />}

      {selected && selected.availableBeds > 0 && !ownerMode && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-semibold">Beds<input type="number" min="1" max={Math.min(10, selected.availableBeds)} value={beds} onChange={(event) => setBeds(Number(event.target.value))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
        <label className="grid gap-1 text-xs font-semibold">Occupants<input type="number" min="1" max={Math.min(40, beds * selected.occupancyPerBed)} value={occupants} onChange={(event) => setOccupants(Number(event.target.value))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">Total for the selected term: <strong>{inr(quote)}</strong>. The server recomputes this price before anything is reserved or charged.</p>
        <button type="button" disabled={busy || !authenticated || beds < 1 || beds > selected.availableBeds || occupants < 1 || occupants > beds * selected.occupancyPerBed} onClick={() => void book()} className="min-h-11 rounded-xl bg-teal-700 px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400">{!authenticated ? 'Sign in to reserve' : busy ? 'Submitting…' : 'Reserve beds'}</button>
      </div>}
      {reservedBookingId && !ownerMode && <div className="mt-4 rounded-2xl border border-teal-200 p-4 dark:border-teal-900">
        <h4 className="text-sm font-black">Payment for reservation {reservedBookingId}</h4>
        <PgPaymentSection bookingId={reservedBookingId} totalDuePaise={quote} onChanged={() => void load()} />
      </div>}
      {selected && selected.availableBeds === 0 && !ownerMode && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No beds are available for these dates and lease term.</p>}
      {!authenticated && !ownerMode && <p className="mt-3 text-xs text-slate-500">Sign in with Google to reserve. Availability and prices are read from PostgreSQL.</p>}
    </section>
  );
}

function PgDateBlocks({ listingId, rooms, onChanged }: { listingId: string; rooms: PgRoomType[]; onChanged: () => void }) {
  const [unitId, setUnitId] = useState('');
  const [startsOn, setStartsOn] = useState(tomorrowLocal);
  const [endsOn, setEndsOn] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() + 2);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [reason, setReason] = useState('');
  const [blocks, setBlocks] = useState<PgDateBlock[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const beds = rooms.flatMap((room) => room.beds.map((bed) => ({ ...bed, roomName: room.name })));
  const url = `/api/provider/pg/listings/${encodeURIComponent(listingId)}/blocks`;

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ blocks: PgDateBlock[] }>(url);
      setBlocks(result.blocks || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PG_BLOCK_LIST_FAILED'); }
  }, [url]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!beds.some((bed) => bed.id === unitId)) setUnitId(beds[0]?.id || '');
  }, [unitId, beds.map((bed) => bed.id).join('|')]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api(url, { method: 'POST', body: JSON.stringify({ unitId, startsOn, endsOn, reason }) });
      setReason(''); await refresh(); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PG_BLOCK_CREATE_FAILED'); }
    finally { setBusy(false); }
  }

  async function remove(blockId: string) {
    setBusy(true); setError('');
    try {
      await api(`${url}/${encodeURIComponent(blockId)}`, { method: 'DELETE' });
      await refresh(); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PG_BLOCK_REMOVE_FAILED'); }
    finally { setBusy(false); }
  }

  return <section aria-label="Block PG bed dates" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
    <h4 className="font-bold text-slate-900 dark:text-slate-100">Block bed dates</h4>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Unavailable dates are stored in PostgreSQL. End date is exclusive. A block cannot overlap an existing reservation or another active block.</p>
    {error && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error.replaceAll('_', ' ').toLowerCase()}</p>}
    <form className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => void create(event)}>
      <label className="grid gap-1 text-xs font-semibold">Bed
        <select aria-label="Bed to block" required value={unitId} onChange={(event) => setUnitId(event.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-2 text-sm dark:bg-slate-900" disabled={!beds.length}>
          {beds.map((bed) => <option key={bed.id} value={bed.id}>{bed.roomName} · {bed.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold">Start date<input aria-label="Block start date" type="date" required min={tomorrowLocal()} value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="min-h-10 rounded-xl border px-2 text-sm dark:bg-slate-900" /></label>
      <label className="grid gap-1 text-xs font-semibold">End date (exclusive)<input aria-label="Block end date" type="date" required min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="min-h-10 rounded-xl border px-2 text-sm dark:bg-slate-900" /></label>
      <label className="grid gap-1 text-xs font-semibold">Reason (optional)<input aria-label="Block reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-10 rounded-xl border px-2 text-sm dark:bg-slate-900" /></label>
      <button type="submit" disabled={busy || !unitId || endsOn <= startsOn} className="min-h-10 self-end rounded-xl bg-amber-700 px-3 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Block dates'}</button>
    </form>
    <ul className="mt-3 space-y-2" aria-label="Current blocked dates">
      {blocks.map((block) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-xs dark:bg-slate-900">
        <span><strong>{block.room_name} · {block.unit_label}</strong> — {block.starts_on} to {block.ends_on}{block.reason ? ` · ${block.reason}` : ''}</span>
        <button type="button" disabled={busy} onClick={() => void remove(block.id)} aria-label={`Remove date block for ${block.unit_label}`} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">Restore availability</button>
      </li>)}
      {blocks.length === 0 && <li className="text-xs text-slate-500">No active date blocks.</li>}
    </ul>
  </section>;
}

/**
 * An owner may only declare money collected in person while the customer still
 * owes it and no online payment is in flight or already reconciled.
 * A pay-after-service reservation is stored as payment_mode='pay_after_service'
 * with payment_status='pay_later'; a failed online attempt is also settleable
 * in person. Verified, pending, refunded and already-collected bookings are not.
 */
function isOfflineCollectible(booking: PgBooking): boolean {
  if (!(Number(booking.totalDuePaise) > 0)) return false;
  if (!['pay_later', 'failed'].includes(booking.paymentStatus)) return false;
  return booking.paymentMode !== 'upi' || booking.paymentStatus === 'failed';
}

export function PgMyBookingsPanel({ open }: { open: boolean }) {
  const [bookings, setBookings] = useState<PgBooking[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [role, setRole] = useState('customer');
  const [busyId, setBusyId] = useState('');
  const [expanded, setExpanded] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await fetchPgBookings();
      setBookings(result.bookings || []); setError('');
    } catch (cause) { setError(pgErrorMessage(cause)); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    void fetchCurrentAuthSession().then((session) => setRole(session.user?.role || 'customer'));
  }, [open]);
  if (!open) return null;

  async function cancel(bookingId: string) {
    setBusyId(bookingId); setError(''); setNotice('');
    try {
      const result = await cancelPgBooking(bookingId);
      if (result.error === 'PG_REFUND_REQUIRED') {
        setNotice(`This reservation was paid, so it cannot simply be cancelled. The refund of ${inr(result.refundPaise)} (${result.refundPolicy.replaceAll('_', ' ').toLowerCase()}) has to be reconciled by the provider before the bed is released.`);
      } else {
        setNotice(`Reservation ${bookingId} cancelled. ${inr(result.refundPaise)} refunded (${result.refundPolicy.replaceAll('_', ' ').toLowerCase()}).`);
      }
      await load();
    } catch (cause) { setError(pgErrorMessage(cause)); }
    finally { setBusyId(''); }
  }

  async function ownerAction(bookingId: string, action: 'check_in' | 'check_out') {
    setBusyId(bookingId); setError(''); setNotice('');
    try {
      const result = await ownerPgBookingAction(bookingId, action);
      setNotice(`Reservation ${bookingId} is now ${String(result.booking?.status || '').replaceAll('_', ' ')}.`);
      await load();
    } catch (cause) { setError(pgErrorMessage(cause)); }
    finally { setBusyId(''); }
  }

  const isOwner = role === 'provider' || role === 'admin';
  return <section className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800" aria-label="PG bookings">
    <div className="flex items-center justify-between"><h4 className="font-extrabold">PG & Hostel reservations</h4><button type="button" onClick={() => void load()} className="text-xs font-bold text-violet-700">Refresh</button></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-violet-50 p-2 text-xs leading-5 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100">{notice}</p>}
    {!loaded && <p className="text-xs text-slate-500">Loading reservations…</p>}
    {loaded && !error && bookings.length === 0 && <p className="text-xs text-slate-500">No PostgreSQL-backed PG reservations found.</p>}
    {bookings.map((booking) => {
      const ownerSide = booking.party === 'owner';
      const canCancel = booking.status === 'confirmed' && new Date(`${booking.moveIn}T00:00:00`) > new Date(new Date().toDateString());
      return <article key={booking.bookingId} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{booking.listingTitle}</strong>
          <span className="flex items-center gap-2">
            <span className="text-xs capitalize">{String(booking.status).replaceAll('_', ' ')}</span>
            <PgMoneyBadge state={{ paymentStatus: booking.paymentStatus, paymentMode: booking.paymentMode }} />
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{booking.moveIn} – {booking.moveOut} · {booking.beds} bed(s) · {inr(booking.totalDuePaise)} · rent {inr(booking.rentPaise)} + deposit {inr(booking.depositPaise)}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {booking.paymentStatus === 'verified' && 'Payment verified by the provider.'}
          {booking.paymentStatus === 'refunded' && 'Payment refunded by the provider.'}
          {booking.paymentStatus === 'pending_verification' && 'Payment sent, awaiting provider confirmation. The bed stays reserved until then.'}
          {booking.paymentStatus === 'failed' && 'The last payment attempt failed. Nothing was collected.'}
          {(booking.paymentStatus === 'pay_later') && (booking.paymentMode === 'pay_after_service'
            ? 'Pay at the property on the move-in day. BookOurSpace does not collect this money.'
            : 'Unpaid. Choose UPI or pay at the property below.')}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => setExpanded(expanded === booking.bookingId ? '' : booking.bookingId)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {expanded === booking.bookingId ? 'Hide payment details' : 'Payment details'}
          </button>
          {canCancel && !ownerSide && <button disabled={busyId === booking.bookingId} type="button" onClick={() => void cancel(booking.bookingId)} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-700 disabled:opacity-50">{busyId === booking.bookingId ? 'Cancelling…' : 'Cancel reservation'}</button>}
          {ownerSide && isOwner && booking.status === 'confirmed' && <button disabled={busyId === booking.bookingId} type="button" onClick={() => void ownerAction(booking.bookingId, 'check_in')} className="min-h-9 rounded-lg border border-violet-300 px-3 text-xs font-bold text-violet-700 disabled:opacity-50">{busyId === booking.bookingId ? 'Working…' : 'Check in resident'}</button>}
          {ownerSide && isOwner && booking.status === 'checked_in' && <button disabled={busyId === booking.bookingId} type="button" onClick={() => void ownerAction(booking.bookingId, 'check_out')} className="min-h-9 rounded-lg border border-violet-300 px-3 text-xs font-bold text-violet-700 disabled:opacity-50">{busyId === booking.bookingId ? 'Working…' : 'Check out resident'}</button>}
        </div>

        {expanded === booking.bookingId && <div className="mt-3 space-y-4">
          <PgPaymentSection bookingId={booking.bookingId} totalDuePaise={booking.totalDuePaise} onChanged={() => void load()} compact={ownerSide} />
          <PgInvoicePanel bookingId={booking.bookingId} />
          <PgDisputePanel bookingId={booking.bookingId} role={ownerSide ? 'provider' : 'customer'} onChanged={() => void load()} />
          {ownerSide && isOwner && isOfflineCollectible(booking) && (
            <PgCollectionClaimPanel bookingId={booking.bookingId} totalDuePaise={booking.totalDuePaise} />
          )}
        </div>}
      </article>;
    })}
  </section>;
}
