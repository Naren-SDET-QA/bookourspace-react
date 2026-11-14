import { ArrowRight, BedDouble, Building2, CalendarCheck2, CheckCircle2, CircleDollarSign, Plus, Users } from 'lucide-react';
import type { PgBooking, PgRoomType } from '../lib/pgBookingClient';

type PgOwnerListing = {
  id: string;
  title: string;
  status?: string;
};

type PgOwnerTotals = {
  rooms: PgRoomType[];
  beds: number;
  availableBeds: number;
  occupiedBeds: number;
  contractedRentPaise: number;
};

type PgOwnerSimpleDashboardProps = {
  ownerName: string;
  listings: PgOwnerListing[];
  totals: PgOwnerTotals;
  bookings: PgBooking[];
  pendingBookings: PgBooking[];
  onAddProperty?: () => void;
  onNavigate: (section: 'bookings' | 'rooms' | 'properties') => void;
};

const formatInr = (paise: number) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const formatStatus = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());

export default function PgOwnerSimpleDashboard({
  ownerName,
  listings,
  totals,
  bookings,
  pendingBookings,
  onAddProperty,
  onNavigate,
}: PgOwnerSimpleDashboardProps) {
  const occupancy = totals.beds ? Math.round((totals.occupiedBeds / totals.beds) * 100) : 0;
  const primaryProperty = listings[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
            <span>PG Management</span>
            <span className="text-slate-300">›</span>
            <span className="text-[#0B8F76]">Dashboard</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">PG Owner Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Good to see you, {ownerName}. Manage your properties, beds and bookings.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button type="button" onClick={() => onNavigate('properties')} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-2 text-[12px] font-black text-[#0B8F76] shadow-sm hover:bg-blue-50 sm:px-4 sm:text-sm dark:border-blue-900 dark:bg-slate-900 dark:hover:bg-blue-950/30">
            <Building2 className="h-4 w-4" /> Manage properties
          </button>
          {onAddProperty && (
            <button type="button" onClick={onAddProperty} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#0B8F76] px-2 text-[12px] font-black text-white shadow-lg shadow-blue-200/50 hover:bg-blue-700 sm:px-4 sm:text-sm dark:shadow-none">
              <Plus className="h-4 w-4" /> Add property
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Building2} label="Properties" value={String(listings.length)} helper="Active PG listings" tone="blue" />
        <SummaryCard icon={BedDouble} label="Total beds" value={String(totals.beds)} helper={`${totals.rooms.length} room types`} tone="purple" />
        <SummaryCard icon={Users} label="Available beds" value={String(totals.availableBeds)} helper={`${occupancy}% occupied`} tone="green" />
        <SummaryCard icon={CalendarCheck2} label="Needs attention" value={String(pendingBookings.length)} helper={pendingBookings.length ? 'Bookings to review' : 'All caught up'} tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">Properties</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Your connected PG listings</p>
            </div>
            <button type="button" onClick={() => onNavigate('properties')} className="text-xs font-black text-[#0B8F76]">View all</button>
          </div>
          <div className="mt-4 space-y-2">
            {listings.length === 0 ? (
              <EmptyPanel icon={Building2} title="No properties yet" text="Add your first PG property to start managing beds." action={onAddProperty} />
            ) : listings.map((listing, index) => (
              <button key={listing.id} type="button" onClick={() => onNavigate('rooms')} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-900 dark:hover:bg-blue-950/20 ${index === 0 ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0B8F76] shadow-sm dark:bg-slate-800"><Building2 className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900 dark:text-white">{listing.title}</span><span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{formatStatus(listing.status || 'active')} · PG listing</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-lg font-black text-slate-950 dark:text-white">Property overview</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Current occupancy and revenue snapshot</p></div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Live data</span>
          </div>
          {primaryProperty ? (
            <>
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#0B8F76] shadow-sm dark:bg-slate-900"><Building2 className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{primaryProperty.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{totals.rooms.length} room types · {totals.beds} beds</p></div></div>
              <div className="mt-5 grid grid-cols-3 gap-2"><MiniMetric label="Occupied" value={String(totals.occupiedBeds)} /><MiniMetric label="Available" value={String(totals.availableBeds)} /><MiniMetric label="Rent / month" value={formatInr(totals.contractedRentPaise)} /></div>
              <div className="mt-5"><div className="flex items-center justify-between text-xs font-bold text-slate-500"><span>Occupancy</span><span className="text-slate-900 dark:text-white">{occupancy}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-[#0B8F76] transition-all" style={{ width: `${occupancy}%` }} /></div></div>
              <button type="button" onClick={() => onNavigate('rooms')} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0B8F76] px-3.5 text-sm font-black text-white hover:bg-blue-700">Manage rooms & beds <ArrowRight className="h-4 w-4" /></button>
            </>
          ) : <EmptyPanel icon={Building2} title="Select a property" text="Your property overview will appear here after you add a PG listing." action={onAddProperty} />}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black text-slate-950 dark:text-white">Live inventory</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Room types and available beds</p></div><BedDouble className="h-5 w-5 text-[#0B8F76]" /></div>
          <div className="mt-4 space-y-3">
            {totals.rooms.length === 0 ? <EmptyPanel icon={BedDouble} title="No rooms configured" text="Add room types and beds to make inventory visible." action={() => onNavigate('rooms')} /> : totals.rooms.slice(0, 5).map((room) => { const roomOccupancy = room.totalBeds ? Math.round(((room.totalBeds - room.availableBeds) / room.totalBeds) * 100) : 0; return <div key={room.roomTypeId} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{room.name}</p><span className="shrink-0 text-xs font-black text-slate-500">{room.availableBeds}/{room.totalBeds} free</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, 100 - roomOccupancy)}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{formatInr(room.monthlyRentPaise)} / bed / month</p></div>; })}
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black text-slate-950 dark:text-white">Recent bookings</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest resident activity</p></div><button type="button" onClick={() => onNavigate('bookings')} className="text-xs font-black text-[#0B8F76]">View bookings</button></div>{bookings.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">No bookings yet</div> : <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{bookings.slice(0, 4).map((booking) => <div key={booking.bookingId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900 dark:text-white">{booking.listingTitle}</p><p className="mt-1 text-xs text-slate-500">{booking.moveIn} · {booking.beds} bed{booking.beds === 1 ? '' : 's'}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{formatStatus(booking.status)}</span></div>)}</div>}</section>
        <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 dark:border-blue-950 dark:bg-blue-950/30"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#0B8F76] shadow-sm dark:bg-slate-900"><CircleDollarSign className="h-5 w-5" /></span><div><h3 className="font-black text-slate-950 dark:text-white">Quick actions</h3><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Keep your PG records up to date.</p></div></div><div className="mt-4 grid gap-2"><button type="button" onClick={() => onNavigate('rooms')} className="flex min-h-10 items-center justify-between rounded-xl bg-white px-3.5 text-left text-sm font-black text-slate-800 shadow-sm hover:text-[#0B8F76] dark:bg-slate-900 dark:text-white"><span className="flex items-center gap-2"><BedDouble className="h-4 w-4 text-[#0B8F76]" /> Update room inventory</span><ArrowRight className="h-4 w-4 text-slate-400" /></button>{onAddProperty && <button type="button" onClick={onAddProperty} className="flex min-h-10 items-center justify-between rounded-xl bg-[#0B8F76] px-3.5 text-left text-sm font-black text-white hover:bg-blue-700"><span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add another property</span><ArrowRight className="h-4 w-4" /></button>}</div><div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {pendingBookings.length ? `${pendingBookings.length} booking${pendingBookings.length === 1 ? '' : 's'} need review` : 'Everything is up to date'}</div></section>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, helper, tone }: { icon: typeof Building2; label: string; value: string; helper: string; tone: 'blue' | 'purple' | 'green' | 'amber' }) {
  const toneClasses = { blue: 'bg-blue-100 text-[#0B8F76] dark:bg-blue-950 dark:text-blue-200', purple: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-200', green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200', amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200' }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${toneClasses}`}><Icon className="h-5 w-5" /></span></div><p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{helper}</p></article>;
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 truncate text-lg font-black text-slate-900 dark:text-white">{value}</p></div>; }

function EmptyPanel({ icon: Icon, title, text, action }: { icon: typeof Building2; title: string; text: string; action?: (() => void) | undefined }) { return <div className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center dark:border-slate-700"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Icon className="h-5 w-5" /></span><p className="mt-3 text-sm font-black text-slate-800 dark:text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>{action && <button type="button" onClick={action} className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0B8F76] px-3 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" /> Add property</button>}</div>; }
