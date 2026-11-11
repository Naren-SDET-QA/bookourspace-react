import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  IndianRupee,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Plus,
  ReceiptText,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  Star,
  UserCog,
  UserPlus,
  Users,
  Utensils,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { Booking, Enquiry, MarketplaceListing } from '../../types/marketplace';
import { PgMyBookingsPanel } from '../PgBookingPanel';
import PgProviderWorkspace from '../PgProviderWorkspace';

type Page =
  | 'dashboard' | 'dues' | 'collections' | 'expenses' | 'disputes'
  | 'leads' | 'bookings' | 'tenants' | 'staff'
  | 'rooms' | 'properties' | 'listings'
  | 'complaints' | 'requests' | 'food' | 'notices' | 'reviews' | 'community'
  | 'reports' | 'billing' | 'settings';

const SIDEBAR: Array<{ group: string; items: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> }> = [
  { group: '', items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Money',
    items: [
      { id: 'dues', label: 'Dues', icon: IndianRupee },
      { id: 'collections', label: 'Collections', icon: Wallet },
      { id: 'expenses', label: 'Expenses', icon: ReceiptText },
      { id: 'disputes', label: 'Disputes', icon: Scale },
    ],
  },
  {
    group: 'People',
    items: [
      { id: 'leads', label: 'Leads', icon: UserPlus },
      { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
      { id: 'tenants', label: 'Tenants', icon: Users },
      { id: 'staff', label: 'Staff', icon: UserCog },
    ],
  },
  {
    group: 'Property',
    items: [
      { id: 'rooms', label: 'Rooms & Beds', icon: BedDouble },
      { id: 'properties', label: 'Properties', icon: Building2 },
      { id: 'listings', label: 'Listings', icon: Megaphone },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'complaints', label: 'Complaints', icon: Wrench },
      { id: 'requests', label: 'Requests', icon: Inbox },
      { id: 'food', label: 'Food menu', icon: Utensils },
      { id: 'notices', label: 'Notices', icon: Bell },
      { id: 'reviews', label: 'Reviews', icon: Star },
      { id: 'community', label: 'Community', icon: MessageSquare },
      { id: 'reports', label: 'Reports', icon: BarChart3 },
      { id: 'billing', label: 'Plan & billing', icon: CreditCard },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const TITLES: Record<Page, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'A simple view of your PG business.' },
  dues: { title: 'Dues', subtitle: 'Rent and pending collections.' },
  collections: { title: 'Collections', subtitle: 'Money collected this month.' },
  expenses: { title: 'Expenses', subtitle: 'Track salaries, food, electricity and maintenance.' },
  disputes: { title: 'Disputes', subtitle: 'Resolve tenant questions with a clear record.' },
  leads: { title: 'Leads', subtitle: 'People interested in your PG.' },
  bookings: { title: 'Bookings', subtitle: 'Approve requests and manage bed reservations.' },
  tenants: { title: 'Tenants', subtitle: 'Current residents and their beds.' },
  staff: { title: 'Staff', subtitle: 'People who work at your property.' },
  rooms: { title: 'Rooms & Beds', subtitle: 'What is empty, what is occupied and what it is worth.' },
  properties: { title: 'Properties', subtitle: 'Your PG buildings and addresses.' },
  listings: { title: 'Listings', subtitle: 'What customers see on BookOurSpace.' },
  complaints: { title: 'Complaints', subtitle: 'Maintenance issues raised by residents.' },
  requests: { title: 'Requests', subtitle: 'Leave, late passes, guests and bed changes.' },
  food: { title: 'Food menu', subtitle: 'What is served each day.' },
  notices: { title: 'Notices', subtitle: 'Messages for all residents.' },
  reviews: { title: 'Reviews', subtitle: 'What tenants say after their stay.' },
  community: { title: 'Community', subtitle: 'Your PG private resident board.' },
  reports: { title: 'Reports', subtitle: 'Occupancy, revenue and dues at a glance.' },
  billing: { title: 'Plan & billing', subtitle: 'Your BookOurSpace plan and usage.' },
  settings: { title: 'Settings', subtitle: 'Business details and verification.' },
};

function money(value: number): string {
  return `₹${Math.max(0, Math.round(value)).toLocaleString('en-IN')}`;
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof Inbox; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-800 dark:text-slate-500"><Icon className="h-6 w-6" /></span>
      <h3 className="mt-3 text-[15px] font-black text-slate-900 dark:text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-slate-500 dark:text-slate-400">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PgOwnerDashboard({
  listings,
  bookings,
  enquiries,
  onOpenPostWizard,
  onRefresh,
  profileName,
}: {
  listings: MarketplaceListing[];
  bookings: Booking[];
  enquiries: Enquiry[];
  onOpenPostWizard?: () => void;
  onRefresh?: () => void;
  profileName?: string;
}) {
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileMenu, setMobileMenu] = useState(false);
  const pgListings = useMemo(() => listings.filter((listing) => String(listing.categoryId || '').toLowerCase().startsWith('pg-')), [listings]);
  const activeListings = pgListings.filter((listing) => listing.status === 'active');
  const pendingListings = pgListings.filter((listing) => listing.status === 'pending_approval');
  const confirmedBookings = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed');
  const collected = confirmedBookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0);
  const openEnquiries = enquiries.filter((enquiry) => enquiry.status === 'new');
  const meta = TITLES[page];

  const go = (next: Page) => { setPage(next); setMobileMenu(false); };

  const sidebar = (
    <aside className="w-full shrink-0 rounded-2xl bg-[#0b1b3a] p-2 text-white lg:w-60">
      <div className="flex items-center justify-between px-2 py-2 lg:block">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-[#0b1b3a]"><Building2 className="h-5 w-5" /></span>
          <div>
            <p className="text-[13px] font-black leading-4">BookOurSpace</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-300">PG Owner</p>
          </div>
        </div>
        <button type="button" onClick={() => setMobileMenu((value) => !value)} className="rounded-lg p-2 text-white lg:hidden" aria-label="Toggle PG owner menu">{mobileMenu ? '×' : '☰'}</button>
      </div>
      <nav className={`${mobileMenu ? 'block' : 'hidden'} mt-1 max-h-[65vh] overflow-y-auto lg:block lg:max-h-none`} aria-label="PG owner sections">
        {SIDEBAR.map((section) => (
          <div key={section.group || 'main'} className="mb-2">
            {section.group && <p className="px-3 pb-1 pt-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">{section.group}</p>}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = page === item.id;
              return (
                <button key={item.id} type="button" onClick={() => go(item.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-bold transition ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-200 hover:bg-white/10'}`}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );

  const stat = (label: string, value: string, icon: typeof IndianRupee, tone: 'violet' | 'emerald' | 'amber' = 'violet') => {
    const Icon = icon;
    const tones = {
      violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
      emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
      amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    };
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold text-slate-500">{label}</p>
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span>
        </div>
        <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      </div>
    );
  };

  return (
    <section aria-label="PG owner dashboard" className="flex flex-col gap-3 lg:flex-row">
      {sidebar}
      <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{meta.title}</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">{meta.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && <button type="button" onClick={onRefresh} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>}
            {onOpenPostWizard && <button type="button" onClick={onOpenPostWizard} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white"><Plus className="h-3.5 w-3.5" /> Add listing</button>}
          </div>
        </header>

        <div className="mt-4">
          {page === 'dashboard' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-r from-blue-700 to-violet-700 p-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-100">Welcome back</p>
                <h3 className="mt-1 text-lg font-black">{profileName || 'PG Owner'}</h3>
                <p className="mt-1 text-[11px] font-semibold text-blue-100">Manage your properties, beds, tenants and bookings from one place.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {stat('Properties', String(pgListings.length), Building2)}
                {stat('Active listings', String(activeListings.length), Megaphone)}
                {stat('Bookings', String(confirmedBookings.length), CalendarCheck)}
                {stat('Collected', money(collected), Wallet, 'emerald')}
              </div>
              {pendingListings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">{pendingListings.length} listing{pendingListings.length === 1 ? '' : 's'} waiting for admin approval.</div>}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <h3 className="text-[13px] font-black text-slate-900 dark:text-white">Quick actions</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => go('rooms')} className="rounded-xl bg-violet-50 p-3 text-left text-[11px] font-black text-violet-800 dark:bg-violet-950/30 dark:text-violet-200"><BedDouble className="mb-1 h-4 w-4" /> Rooms & Beds</button>
                    <button type="button" onClick={() => go('bookings')} className="rounded-xl bg-blue-50 p-3 text-left text-[11px] font-black text-blue-800 dark:bg-blue-950/30 dark:text-blue-200"><CalendarCheck className="mb-1 h-4 w-4" /> Bookings</button>
                    <button type="button" onClick={() => go('properties')} className="rounded-xl bg-emerald-50 p-3 text-left text-[11px] font-black text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><Building2 className="mb-1 h-4 w-4" /> Properties</button>
                    <button type="button" onClick={() => go('leads')} className="rounded-xl bg-amber-50 p-3 text-left text-[11px] font-black text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><UserPlus className="mb-1 h-4 w-4" /> Leads</button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <h3 className="text-[13px] font-black text-slate-900 dark:text-white">Recent listings</h3>
                  {pgListings.slice(0, 3).map((listing) => <div key={listing.id} className="mt-2 flex items-center justify-between gap-2 text-[11px]"><span className="truncate font-bold text-slate-700 dark:text-slate-200">{listing.title}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{listing.status.replace('_', ' ')}</span></div>)}
                  {pgListings.length === 0 && <p className="mt-2 text-[11px] text-slate-500">No PG listings yet. Add your first listing.</p>}
                </div>
              </div>
            </div>
          )}

          {page === 'rooms' && <PgProviderWorkspace />}
          {page === 'bookings' && <PgMyBookingsPanel open />}
          {page === 'properties' && (
            pgListings.length ? <div className="space-y-2">{pgListings.map((listing) => <div key={listing.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="min-w-0"><p className="truncate text-[13px] font-black">{listing.title}</p><p className="text-[10px] text-slate-500">{listing.location?.area || listing.location?.city || 'Location not set'} · {listing.isVerified ? 'Verified' : 'Not verified'}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black dark:bg-slate-800">{listing.status.replace('_', ' ')}</span></div>)}</div> : <EmptyState icon={Building2} title="No properties yet" body="Add a PG listing and its property, rooms and beds will appear here." action={onOpenPostWizard && <button type="button" onClick={onOpenPostWizard} className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white">Add property</button>} />
          )}
          {page === 'listings' && (
            pgListings.length ? <div className="space-y-2">{pgListings.map((listing) => <div key={listing.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><span className="truncate text-[13px] font-bold">{listing.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black dark:bg-slate-800">{listing.status.replace('_', ' ')}</span></div>)}</div> : <EmptyState icon={Megaphone} title="No listings published" body="Publish a PG listing to start receiving leads and bookings." />
          )}
          {page === 'leads' && (openEnquiries.length ? <div className="space-y-2">{openEnquiries.map((enquiry) => <div key={enquiry.id} className="rounded-xl border border-slate-200 p-3 text-[12px] dark:border-slate-800"><p className="font-black">{enquiry.customerName}</p><p className="text-[10px] text-slate-500">{enquiry.listingTitle || 'PG enquiry'} · {enquiry.status}</p></div>)}</div> : <EmptyState icon={UserPlus} title="No new leads" body="When a customer enquires about your PG, their request appears here." action={<button type="button" onClick={onOpenPostWizard} className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white">Add a listing</button>} />)}
          {page === 'dues' && <div className="grid grid-cols-2 gap-2">{stat('Billed this month', money(0), IndianRupee)}{stat('Outstanding', money(0), Wallet, 'amber')}{stat('1–15 days overdue', money(0), Clock3)}{stat('30+ days overdue', money(0), AlertCircle)}<div className="col-span-2"><EmptyState icon={CheckCircle2} title="Nothing outstanding" body="Rent dues and reminders will appear here once you add tenants and raise rent." /></div></div>}
          {page === 'collections' && <div className="grid grid-cols-2 gap-2">{stat('Collected', money(collected), Wallet, 'emerald')}{stat('Outstanding', money(0), IndianRupee, 'amber')}{stat('Deposits held', money(0), ShieldCheck)}{stat('Collection efficiency', '—', BarChart3)}<div className="col-span-2"><EmptyState icon={Wallet} title="Collections are ready" body="Collected rent and payment history will appear here. No money is shown unless it is recorded in a booking." /></div></div>}
          {page === 'expenses' && <div className="grid grid-cols-2 gap-2">{stat('Spent this month', money(0), ReceiptText)}{stat('Against budget', money(0), Wallet, 'emerald')}{stat('Cost per occupied bed', '—', BedDouble)}{stat('Expense ratio', '—', BarChart3)}<div className="col-span-2"><EmptyState icon={ReceiptText} title="No expenses recorded" body="Track salaries, food, electricity and maintenance here." /></div></div>}
          {page === 'reports' && <div className="grid grid-cols-2 gap-2">{stat('Total beds', '0', BedDouble)}{stat('Occupied', '0', Users, 'emerald')}{stat('Contracted rent', money(0), IndianRupee)}{stat('Lost to vacancy', money(0), IndianRupee, 'amber')}<div className="col-span-2"><EmptyState icon={BarChart3} title="Reports are built per property" body="Add rooms and beds to see occupancy and revenue reports." /></div></div>}
          {page === 'tenants' && <EmptyState icon={Users} title="No tenants yet" body="Approved bookings and walk-in tenants will appear here." />}
          {page === 'staff' && <EmptyState icon={UserCog} title="No staff on payroll" body="Add employees and run payroll from this section." />}
          {page === 'disputes' && <EmptyState icon={Scale} title="No open disputes" body="Tenant payment and deposit disputes will appear here with a clear record." />}
          {page === 'complaints' && <EmptyState icon={Wrench} title="No open complaints" body="Maintenance issues raised by residents will appear here." />}
          {page === 'requests' && <EmptyState icon={Inbox} title="Nothing waiting on you" body="Leave, late pass, guest visit and bed-change requests will appear here." />}
          {page === 'food' && <EmptyState icon={Utensils} title="No food menu yet" body="Publish today's menu so residents know what is being served." />}
          {page === 'notices' && <EmptyState icon={Bell} title="No notices yet" body="Send a notice to all residents from here." />}
          {page === 'reviews' && <EmptyState icon={Star} title="No reviews yet" body="Reviews from tenants will appear here after their stay." />}
          {page === 'community' && <EmptyState icon={MessageSquare} title="No community posts" body="Your PG's private resident board will appear here." />}
          {page === 'billing' && <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-[13px] font-black">BookOurSpace PG plan</p><p className="mt-1 text-[11px] text-slate-500">Plan and usage details are managed by BookOurSpace. Contact support for billing changes.</p></div>}
          {page === 'settings' && <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="text-[13px] font-black">Business details</p><p className="mt-1 text-[11px] text-slate-500">Update your PG business name, contact number, address and verification documents from your provider profile.</p><button type="button" onClick={() => go('properties')} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white">Go to properties <ArrowRight className="h-3.5 w-3.5" /></button></div>}
        </div>
      </div>
    </section>
  );
}

export default PgOwnerDashboard;
