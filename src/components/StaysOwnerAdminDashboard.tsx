import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, BarChart3, BedDouble, Building2, CalendarDays, CheckCircle2,
  ClipboardList, Clock3, FileText, IndianRupee, Loader2, RefreshCw,
  Save, Settings2, ShieldCheck, Tag, Users, WalletCards,
} from 'lucide-react';
import HostStayWorkspace from './HostStayWorkspace';
import { fetchProviderPortalOverview, type ProviderPortalOverview } from '../lib/providerOperationsClient';
import { saveServerProviderListing } from '../lib/supabaseClient';

export type StayOwnerSection = 'overview' | 'properties' | 'rooms' | 'calendar' | 'reservations' | 'payments' | 'sell_pg' | 'reports' | 'settings';

interface Props {
  role?: string | null;
  /** Section selected by the shared provider workspace navigation. */
  section?: StayOwnerSection;
  /** Lifts in-workspace navigation (e.g. "Manage inventory") to the shared rail. */
  onSectionChange?: (section: StayOwnerSection) => void;
  /** Sections this member may see. Omitted means every section. */
  sections?: StayOwnerSection[];
}

/** Section metadata rendered by the main provider workspace navigation. */
export const stayOwnerSections: Array<{ key: StayOwnerSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'properties', label: 'Properties', icon: Building2 },
  { key: 'rooms', label: 'Rooms & rates', icon: BedDouble },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'reservations', label: 'Reservations', icon: ClipboardList },
  { key: 'payments', label: 'Payments', icon: WalletCards },
  { key: 'sell_pg', label: 'Sell PG', icon: Tag },
  { key: 'reports', label: 'Reports', icon: FileText },
  { key: 'settings', label: 'Settings', icon: Settings2 },
];
const money = (value: number | null | undefined) => value == null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const statusTone: Record<string, string> = { confirmed: 'bg-emerald-50 text-emerald-800', completed: 'bg-emerald-50 text-emerald-800', held: 'bg-amber-50 text-amber-800', cancelled: 'bg-rose-50 text-rose-800', requested: 'bg-blue-50 text-blue-800' };
const stayControls: Array<{ label: string; text: string; icon: React.ComponentType<{ className?: string }> }> = [
  { label: 'Calendar', text: 'Hourly, overnight and multi-day availability', icon: CalendarDays },
  { label: 'Front desk', text: 'Check-in, checkout and extensions', icon: Clock3 },
  { label: 'Guest privacy', text: 'Identity documents stay restricted', icon: ShieldCheck },
  { label: 'Housekeeping', text: 'Tasks and maintenance queue', icon: Users },
];
const stayKpiLabels: Array<{ label: string; key: 'properties' | 'units' | 'occupiedUnits'; icon: React.ComponentType<{ className?: string }> }> = [
  { label: 'Properties', key: 'properties', icon: Building2 },
  { label: 'Bookable units', key: 'units', icon: BedDouble },
  { label: 'Occupied now', key: 'occupiedUnits', icon: Users },
];

function exportReservations(bookings: ProviderPortalOverview['stays']['bookings']) {
  const header = ['Guest', 'Property', 'Start', 'End', 'Status', 'Payment status', 'Amount'];
  const rows = bookings.map(booking => [booking.guestName || 'Guest', booking.listingTitle, booking.startsOn || '', booking.endsOn || '', booking.status, booking.paymentStatus || '', String(booking.amount ?? '')]);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'stay-reservations.csv'; link.click(); URL.revokeObjectURL(url);
}

type SellPgForm = {
  title: string;
  description: string;
  salePrice: string;
  propertyType: 'PG building' | 'Hostel building' | 'Co-living property';
  city: string;
  area: string;
  pincode: string;
  rooms: string;
  beds: string;
  builtUpArea: string;
  furnishing: 'Unfurnished' | 'Semi-furnished' | 'Fully furnished';
  ownershipStatus: 'Owner-operated' | 'Leased with transfer terms' | 'Vacant property ready to operate';
  facilities: string;
};

const emptySellPgForm: SellPgForm = {
  title: '', description: '', salePrice: '', propertyType: 'PG building', city: '', area: '',
  pincode: '', rooms: '', beds: '', builtUpArea: '', furnishing: 'Semi-furnished', ownershipStatus: 'Owner-operated', facilities: '',
};

function SellPgSection({ onSubmitted }: { onSubmitted: () => void }) {
  const [form, setForm] = useState<SellPgForm>(emptySellPgForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const update = <K extends keyof SellPgForm>(key: K, value: SellPgForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const numericValue = (value: string) => value.trim() === '' ? undefined : Number(value);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const salePrice = Number(form.salePrice);
    const rooms = numericValue(form.rooms);
    const beds = numericValue(form.beds);
    const builtUpArea = numericValue(form.builtUpArea);
    if (!form.title.trim() || !form.description.trim() || !form.city.trim() || !form.area.trim() || !Number.isFinite(salePrice) || salePrice <= 0) {
      setMessage({ tone: 'error', text: 'Enter a title, description, location and a sale price greater than ₹0.' });
      return;
    }
    if ([rooms, beds, builtUpArea].some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) {
      setMessage({ tone: 'error', text: 'Rooms, beds and built-up area must be zero or positive numbers.' });
      return;
    }
    setSaving(true);
    try {
      const response = await saveServerProviderListing(null, {
        id: `lst-${crypto.randomUUID()}`,
        requestId: crypto.randomUUID(),
        title: form.title.trim(),
        categoryId: 'pg-property-sale',
        subcategory: 'PG property for sale',
        entityType: 'property',
        price: salePrice,
        priceUnit: '/property',
        payload: {
          description: form.description.trim(),
          location: { city: form.city.trim(), area: form.area.trim(), pincode: form.pincode.trim() },
          images: [],
          saleType: 'pg_property',
          customFieldValues: {
            transactionType: 'For Sale', propertyType: form.propertyType, rooms: rooms ?? null, beds: beds ?? null,
            builtUpArea: builtUpArea ?? null, furnishingStatus: form.furnishing, ownershipStatus: form.ownershipStatus, facilities: form.facilities.trim(),
          },
        },
      });
      if (!response.ok || response.data.source !== 'postgres' || !response.listing || response.listing.status !== 'pending_approval') {
        throw new Error(response.data.error || 'The server did not confirm a pending PG sale listing.');
      }
      setMessage({ tone: 'success', text: 'PG sale listing submitted. It is pending admin review and will appear to customers only after approval.' });
      onSubmitted();
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : 'PG sale listing submission failed.' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-[#527a40] focus:ring-2 dark:border-slate-700 dark:bg-slate-950';
  const labelClass = 'space-y-1.5 text-sm font-bold text-slate-700 dark:text-slate-200';
  return <section id="stay-owner-sell-pg" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Tag className="h-5 w-5 text-[#527a40]" /><h3 className="font-black">Sell a PG property</h3></div><p className="mt-1 max-w-2xl text-sm text-slate-500">Submit verified PG property-sale information for admin review. Your owner identity and authorization come from the signed-in account.</p></div>
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Admin approval required</span>
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>Title<input className={inputClass} required value={form.title} onChange={event => update('title', event.target.value)} placeholder="e.g. 24-bed operational PG building for sale" /></label>
        <label className={`${labelClass} sm:col-span-2`}>Description<textarea className={`${inputClass} min-h-24 py-3`} required value={form.description} onChange={event => update('description', event.target.value)} placeholder="Explain the PG operation, documents, facilities and handover terms." /></label>
        <label className={labelClass}>Sale price (₹)<input className={inputClass} required min="1" step="0.01" type="number" value={form.salePrice} onChange={event => update('salePrice', event.target.value)} placeholder="e.g. 8500000" /></label>
        <label className={labelClass}>Property type<select className={inputClass} value={form.propertyType} onChange={event => update('propertyType', event.target.value as SellPgForm['propertyType'])}><option>PG building</option><option>Hostel building</option><option>Co-living property</option></select></label>
        <label className={labelClass}>City<input className={inputClass} required value={form.city} onChange={event => update('city', event.target.value)} placeholder="Hyderabad" /></label>
        <label className={labelClass}>Area / locality<input className={inputClass} required value={form.area} onChange={event => update('area', event.target.value)} placeholder="Madhapur" /></label>
        <label className={labelClass}>Pincode<input className={inputClass} inputMode="numeric" value={form.pincode} onChange={event => update('pincode', event.target.value)} placeholder="500081" /></label>
        <label className={labelClass}>Rooms<input className={inputClass} min="0" step="1" type="number" value={form.rooms} onChange={event => update('rooms', event.target.value)} placeholder="Optional" /></label>
        <label className={labelClass}>Beds<input className={inputClass} min="0" step="1" type="number" value={form.beds} onChange={event => update('beds', event.target.value)} placeholder="Optional" /></label>
        <label className={labelClass}>Built-up area (sq.ft)<input className={inputClass} min="0" step="0.01" type="number" value={form.builtUpArea} onChange={event => update('builtUpArea', event.target.value)} placeholder="Optional" /></label>
        <label className={labelClass}>Furnishing<select className={inputClass} value={form.furnishing} onChange={event => update('furnishing', event.target.value as SellPgForm['furnishing'])}><option>Unfurnished</option><option>Semi-furnished</option><option>Fully furnished</option></select></label>
        <label className={labelClass}>Ownership / handover<select className={inputClass} value={form.ownershipStatus} onChange={event => update('ownershipStatus', event.target.value as SellPgForm['ownershipStatus'])}><option>Owner-operated</option><option>Leased with transfer terms</option><option>Vacant property ready to operate</option></select></label>
        <label className={`${labelClass} sm:col-span-2`}>Facilities and documents<textarea className={`${inputClass} min-h-20 py-3`} value={form.facilities} onChange={event => update('facilities', event.target.value)} placeholder="Title deed, lift, parking, kitchen, approvals, occupancy status…" /></label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#527a40] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Submitting…' : 'Submit PG for sale'}</button>{message && <p role="status" className={`text-sm font-semibold ${message.tone === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}</div>
      </form>
      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70" aria-label="Customer preview"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#527a40]">Customer preview</p><h4 className="mt-2 text-lg font-black">{form.title.trim() || 'Your PG sale title'}</h4><p className="mt-1 text-sm text-slate-500">{form.city.trim() && form.area.trim() ? `${form.area.trim()}, ${form.city.trim()}` : 'Location will appear here'}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-white p-3 dark:bg-slate-900"><span className="text-slate-500">Sale price</span><strong className="mt-1 block text-base">{form.salePrice ? `₹${Number(form.salePrice).toLocaleString('en-IN')}` : 'Not set'}</strong></div><div className="rounded-xl bg-white p-3 dark:bg-slate-900"><span className="text-slate-500">Property</span><strong className="mt-1 block">{form.propertyType}</strong></div></div><p className="mt-4 text-xs leading-5 text-slate-500">Customers will see the approved listing in the PG marketplace. Owner contact details are not fabricated in this preview; enquiries use the authenticated listing owner record.</p></aside>
    </div>
  </section>;
}

export default function StaysOwnerAdminDashboard({ section, onSectionChange, sections }: Props) {
  const [data, setData] = useState<ProviderPortalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInventory, setShowInventory] = useState(false);
  // The shared provider navigation owns the section when provided; the local
  // copy keeps standalone rendering (tests, previews) working.
  const [localSection, setLocalSection] = useState<StayOwnerSection>('overview');
  const activeSection = section ?? localSection;
  // Section-level grants: a member limited to a few sections must not receive
  // the other blocks of this stacked owner view either.
  const canSee = (key: StayOwnerSection) => !sections || sections.includes(key);
  const navigateStaySection = (next: StayOwnerSection) => {
    setLocalSection(next);
    onSectionChange?.(next);
  };
  const lastSectionRef = useRef<StayOwnerSection | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await fetchProviderPortalOverview()); } catch (caught) { setError(caught instanceof Error ? caught.message : 'PROVIDER_PORTAL_OVERVIEW_FAILED'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    // Navigating from the shared rail moves the owner to that block, but the
    // first render must not scroll the page away from the workspace header.
    if (lastSectionRef.current === null) { lastSectionRef.current = activeSection; return; }
    if (lastSectionRef.current === activeSection) return;
    lastSectionRef.current = activeSection;
    if (activeSection === 'rooms' || activeSection === 'calendar') setShowInventory(true);
    const targetId = { overview: 'stay-owner-overview', properties: 'stay-owner-properties', rooms: 'stay-owner-inventory', calendar: 'stay-owner-inventory', reservations: 'stay-owner-reservations', payments: 'stay-owner-payments', sell_pg: 'stay-owner-sell-pg', reports: 'stay-owner-reports', settings: 'stay-owner-settings' }[activeSection];
    window.setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }, [activeSection]);
  const metrics = data?.stays.metrics;
  const bookings = data?.stays.bookings || [];
  const paidBookings = bookings.filter(booking => ['paid', 'partially_paid', 'settled'].includes(String(booking.paymentStatus || '').toLowerCase()));
  const confirmedBookings = bookings.filter(booking => ['confirmed', 'completed'].includes(booking.status));

  return <section className="space-y-4" aria-label="Stays owner workspace">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#527a40]">Stays operations</p><h2 className="mt-1 text-xl font-black">Property performance</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Only authorized PostgreSQL records appear here. Draft or unavailable data is never filled with placeholders.</p></div><button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900"><RefreshCw className="h-4 w-4" /> Refresh</button></div>
        {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><b>Live stay data is unavailable.</b><p className="mt-1 text-xs">{error === 'PROVIDER_PORTAL_SCHEMA_NOT_READY' ? 'The local migration set has not been applied yet.' : error}</p></div></div>}
        {loading && !data ? <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading authorized stay records…</div> : data && <>
{(canSee('overview')) && (          <section id="stay-owner-overview" className="scroll-mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Stay KPIs">{stayKpiLabels.map(({ label, key, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span><Icon className="h-4 w-4 text-[#527a40]" /></div><p className="mt-3 text-2xl font-black tabular-nums">{metrics?.[key] ?? 0}</p></div>)}<div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Month revenue</span><IndianRupee className="h-4 w-4 text-[#527a40]" /></div><p className="mt-3 text-2xl font-black tabular-nums">{money(metrics?.revenue)}</p></div></section>)}
{(canSee('overview')) && (          <section className="grid gap-3 sm:grid-cols-3" aria-label="Stay reporting"><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Occupancy</p><p className="mt-2 text-xl font-black">{metrics?.occupancyPct == null ? '—' : `${metrics.occupancyPct}%`}</p><p className="mt-1 text-xs text-slate-500">Confirmed allocations covering today</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">ADR</p><p className="mt-2 text-xl font-black">{money(metrics?.adr)}</p><p className="mt-1 text-xs text-slate-500">Derived from this month’s confirmed/completed bookings</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">RevPAR</p><p className="mt-2 text-xl font-black">{money(metrics?.revpar)}</p><p className="mt-1 text-xs text-slate-500">Revenue per active unit; unavailable when no units exist</p></div></section>)}
{(canSee('properties')) && (          <section id="stay-owner-properties" className="scroll-mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black">Properties</h3><p className="mt-1 text-xs text-slate-500">Verification and inventory health</p></div><button type="button" onClick={() => { setShowInventory(value => !value); navigateStaySection('rooms'); }} className="min-h-10 rounded-xl bg-[#527a40] px-3 text-xs font-bold text-white">{showInventory ? 'Hide inventory editor' : 'Manage inventory'}</button></div><div className="mt-4 space-y-2">{data.stays.properties.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No property records are linked to this account yet.</div> : data.stays.properties.map(property => <article key={property.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><div><p className="font-bold">{property.name}</p><p className="text-xs text-slate-500">{property.city} · {property.propertyType} · {property.roomTypes} room types · {property.units} units</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${property.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{property.isActive ? 'Active' : 'Inactive'}</span></article>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#527a40]" /><h3 className="font-black">Operational controls</h3></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{stayControls.map(({ label, text, icon: Icon }) => <div key={label} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#527a40]" /><div><p className="text-sm font-bold">{label}</p><p className="mt-0.5 text-xs text-slate-500">{text}</p></div></div>)}</div><p className="mt-4 text-[11px] leading-5 text-slate-500">Double-booking protection is enforced by the existing PostgreSQL allocation exclusion constraint; this portal does not attempt to reserve inventory in the browser.</p></div></section>)}
{(canSee('rooms') || canSee('calendar')) && (          <section id="stay-owner-inventory" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Rooms, rates & availability</h3><p className="mt-1 text-xs text-slate-500">Create properties, configure room types, label units, block dates and manage photos.</p></div><button type="button" onClick={() => setShowInventory(value => !value)} className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">{showInventory ? 'Close workspace' : 'Open workspace'}</button></div>{showInventory && <div className="mt-4 rounded-xl border border-slate-200 p-2 dark:border-slate-700"><HostStayWorkspace /></div>}</section>)}
{(canSee('reservations')) && (          <section id="stay-owner-reservations" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Reservations</h3><p className="mt-1 text-xs text-slate-500">Server-authorized reservations in the current provider scope.</p></div><button type="button" onClick={() => setShowInventory(true)} className="min-h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Open inventory</button></div><div className="mt-3 overflow-x-auto">{bookings.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No stay reservations found for the current access scope.</div> : <table className="w-full min-w-[680px] text-left text-sm"><thead className="text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="pb-2">Guest</th><th className="pb-2">Property</th><th className="pb-2">Dates</th><th className="pb-2">Status</th><th className="pb-2 text-right">Amount</th></tr></thead><tbody>{bookings.map(booking => <tr key={booking.id} className="border-t border-slate-100 dark:border-slate-800"><td className="py-3 font-semibold">{booking.guestName || 'Guest'}</td><td className="py-3">{booking.listingTitle}</td><td className="py-3 text-xs text-slate-500">{booking.startsOn || '—'}{booking.endsOn ? ` → ${booking.endsOn}` : ''}</td><td className="py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusTone[booking.status] || 'bg-slate-100 text-slate-700'}`}>{booking.status}</span></td><td className="py-3 text-right font-bold">{money(booking.amount)}</td></tr>)}</tbody></table>}</div></section>)}
{(canSee('payments')) && (          <section id="stay-owner-payments" className="scroll-mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Revenue this month</p><p className="mt-2 text-2xl font-black">{money(metrics?.revenue)}</p><p className="mt-1 text-xs text-slate-500">Verified from provider overview records</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Paid reservations</p><p className="mt-2 text-2xl font-black">{paidBookings.length}</p><p className="mt-1 text-xs text-slate-500">Payment status supplied by the server</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Confirmed stays</p><p className="mt-2 text-2xl font-black">{confirmedBookings.length}</p><p className="mt-1 text-xs text-slate-500">Includes confirmed and completed bookings</p></div></section>)}
{(canSee('sell_pg')) && (          <SellPgSection onSubmitted={() => void load()} />)}
{(canSee('reports')) && (          <section id="stay-owner-reports" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">Reports</h3><p className="mt-1 text-xs text-slate-500">Export the reservations visible to your authorized account.</p></div><button type="button" onClick={() => exportReservations(bookings)} disabled={bookings.length === 0} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#527a40] px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><FileText className="h-4 w-4" /> Export reservations CSV</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-slate-500">Properties in scope</p><p className="mt-1 text-lg font-black">{data.stays.properties.length}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-slate-500">Reservations in scope</p><p className="mt-1 text-lg font-black">{bookings.length}</p></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="text-xs text-slate-500">Report source</p><p className="mt-1 text-sm font-black">Authorized PostgreSQL</p></div></div></section>)}
{(canSee('settings')) && (          <section id="stay-owner-settings" className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#527a40]" /><div><h3 className="font-black">Stay settings & access</h3><p className="mt-1 text-sm text-slate-500">Property changes, booking mutations and guest data remain protected by the existing authenticated API and PostgreSQL authorization rules.</p><p className="mt-3 text-xs leading-5 text-slate-500">If your account has no linked stay properties, the dashboard will show an empty state. Ask an administrator to grant the required provider scope; this page does not invent access or records.</p></div></div></section>)}
        </>}
      </div>
  </section>;
}
