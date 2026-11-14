import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BedDouble,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Globe,
  Menu,
  MessageSquare,
  Search,
  Sparkles,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { allIndianLanguages, type AppLanguage } from '../utils/translations';

/** A single actionable item surfaced in the top-bar bell. */
export interface ProviderNotification {
  id: string;
  title: string;
  detail?: string;
  module: ProviderPortalModule;
}

export type ProviderPortalModule = 'pg' | 'stays' | 'services' | 'institute' | 'team' | 'listings' | 'analytics' | 'enquiries' | 'bookings' | 'plans' | 'visiting_card';

interface ProviderPortalShellProps {
  activeModule: ProviderPortalModule;
  onNavigate?: (module: ProviderPortalModule) => void;
  role?: string | null;
  title: string;
  subtitle?: string;
  /** Display name for the account chip in the top bar. */
  userName?: string | null;
  /** Real workspace items behind the bell badge. */
  notifications?: ProviderNotification[];
  /** Current UI language, shown in the globe menu. */
  currentLang?: AppLanguage;
  onChangeLanguage?: (lang: AppLanguage) => void;
  /** Modules this viewer may open. Omitted means every module is allowed. */
  allowedModules?: ProviderPortalModule[];
  /** Optional marketplace escape hatch, rendered as "View app" in the top bar. */
  onOpenMarketplace?: () => void;
  children: React.ReactNode;
}

const NAV: Array<{ key: ProviderPortalModule; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'pg', label: 'PG inventory', icon: BedDouble },
  { key: 'stays', label: 'Stays', icon: Building2 },
  { key: 'services', label: 'Home services', icon: BriefcaseBusiness },
  { key: 'institute', label: 'Institute', icon: Users },
  { key: 'team', label: 'Team & access', icon: ShieldCheck },
  { key: 'listings', label: 'Listings', icon: ClipboardList },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'enquiries', label: 'Enquiries', icon: MessageSquare },
  { key: 'bookings', label: 'Bookings', icon: CalendarDays },
  { key: 'plans', label: 'Plans & upgrades', icon: WalletCards },
  { key: 'visiting_card', label: 'Visiting card', icon: Sparkles },
];

/** Page heading per module, so the top bar matches the section being viewed. */
export const PROVIDER_MODULE_LABELS: Record<ProviderPortalModule, string> = NAV.reduce(
  (labels, item) => ({ ...labels, [item.key]: item.label }),
  {} as Record<ProviderPortalModule, string>,
);

/** Grouped rail: the reference console splits day-to-day work from growth tools. */
const NAV_GROUPS: Array<{ label: string; keys: ProviderPortalModule[] }> = [
  { label: 'Workspace', keys: ['pg', 'stays', 'services', 'institute', 'team'] },
  { label: 'Growth', keys: ['listings', 'analytics', 'enquiries', 'bookings', 'plans', 'visiting_card'] },
];

/** Navy rail, teal primary, light canvas — shared by every provider module. */
export const PROVIDER_TOKENS = {
  rail: '#0B1526',
  railHover: '#132238',
  primary: '#12C2A0',
  primaryInk: '#04241C',
  canvas: '#F4F7FB',
  border: '#E3E9F2',
} as const;

/**
 * One metric tile. The provider dashboard composes four of these into the
 * stat strip that sits directly under the breadcrumb.
 */
export function ProviderStatCard({ icon: Icon, label, value, tone = 'teal' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: 'teal' | 'violet' | 'amber' | 'sky';
}) {
  const tones: Record<string, string> = {
    teal: 'bg-[#12C2A0]/12 text-[#0B8F76] dark:bg-[#12C2A0]/15 dark:text-[#5FE3CB]',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  };
  return <div data-testid="provider-stat-card" className="flex items-center gap-3 rounded-2xl border border-[#E3E9F2] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-slate-800 dark:bg-slate-900">
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
    <div className="min-w-0">
      <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  </div>;
}

export default function ProviderPortalShell({ activeModule, onNavigate, role, title, subtitle, userName, notifications = [], currentLang = 'en', onChangeLanguage, allowedModules, onOpenMarketplace, children }: ProviderPortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'notifications' | 'language' | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);

  // Close the bell / language menus on Escape or an outside click.
  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(null); };
    const onPointer = (event: MouseEvent) => {
      if (headerRef.current && event.target instanceof Node && !headerRef.current.contains(event.target)) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onPointer); };
  }, [panel]);

  const allowed = allowedModules ? NAV.filter((item) => allowedModules.includes(item.key)) : NAV;
  const sectionLabel = PROVIDER_MODULE_LABELS[activeModule] || 'Workspace';
  const roleLabel = String(role || 'provider').replaceAll('_', ' ');
  const accountName = String(userName || '').trim() || 'Provider account';
  const initial = (String(userName || '').trim() || roleLabel).slice(0, 1).toUpperCase();
  const activeLanguage = allIndianLanguages.find((language) => language.code === currentLang)
    || { code: 'en' as AppLanguage, label: 'English', englishName: 'English' };
  const notificationCount = notifications.length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allowed;
    return allowed.filter((item) => item.label.toLowerCase().includes(needle));
  }, [allowed, query]);

  const navigate = (module: ProviderPortalModule) => {
    setMobileOpen(false);
    setQuery('');
    onNavigate?.(module);
  };

  const NavButton = ({ item }: { item: (typeof NAV)[number] }) => {
    const active = item.key === activeModule;
    const Icon = item.icon;
    return <button
      type="button"
      onClick={() => navigate(item.key)}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${active ? 'shadow-sm' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
      style={active ? { backgroundColor: PROVIDER_TOKENS.primary, color: PROVIDER_TOKENS.primaryInk } : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>;
  };

  const Sidebar = () => (
    <aside className={`flex h-full flex-col text-white transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-[240px]'}`} style={{ backgroundColor: PROVIDER_TOKENS.rail }}>
      <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-black" style={{ backgroundColor: PROVIDER_TOKENS.primary, color: PROVIDER_TOKENS.primaryInk }}>B</div>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-black leading-tight">BookOurSpace</p><p className="truncate text-[10px] tracking-[0.08em] text-white/45">Spaces for every moment</p></div>}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Provider portal navigation">
        {query.trim() ? (
          <div className="space-y-1">
            {!collapsed && <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Results · {filtered.length}</p>}
            {filtered.length === 0 && !collapsed && <p className="px-3 py-6 text-xs text-white/50">No section matches “{query.trim()}”.</p>}
            {filtered.map((item) => <NavButton key={item.key} item={item} />)}
          </div>
        ) : NAV_GROUPS.map((group) => {
          const items = group.keys.map((key) => allowed.find((entry) => entry.key === key)).filter(Boolean) as typeof NAV;
          if (!items.length) return null;
          return <div key={group.label} className="mb-5 last:mb-0">
            {!collapsed && <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{group.label}</p>}
            <div className="space-y-1">{items.map((item) => <NavButton key={item.key} item={item} />)}</div>
          </div>;
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        {!collapsed && (
          <>
            <div className="mb-3 rounded-xl p-3" style={{ background: 'linear-gradient(135deg, #12C2A0 0%, #0B8F76 100%)', color: PROVIDER_TOKENS.primaryInk }}>
              <p className="text-xs font-black">Your changes are live</p>
              <p className="mt-0.5 text-[10px] leading-4 opacity-80">Updates reflect immediately in the app</p>
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/5 p-3">
              <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: PROVIDER_TOKENS.primary }} aria-hidden="true" />
              <div className="min-w-0"><p className="truncate text-xs font-bold capitalize">{roleLabel} access</p><p className="truncate text-[10px] text-white/45">Server-authorized workspace</p></div>
            </div>
          </>
        )}
        <button type="button" onClick={() => setCollapsed((value) => !value)} className="hidden min-h-10 w-full items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white md:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
        {!collapsed && <p className="mt-2 px-1 text-[10px] text-white/30">Provider portal · v1.0</p>}
      </div>
    </aside>
  );

  return <div className="min-h-[680px] overflow-x-clip rounded-2xl border border-[#E3E9F2] bg-[#F4F7FB] text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
    <div className="flex min-h-[680px]">
      <div className="hidden md:block"><Sidebar /></div>
      {mobileOpen && <div className="fixed inset-0 z-50 flex md:hidden"><button type="button" className="flex-1 bg-black/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><div className="h-full"><Sidebar /></div></div>}
      <div className="min-w-0 flex-1">
        <header ref={headerRef} className="sticky top-0 z-20 border-b border-[#E3E9F2] bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex h-[64px] items-center gap-3 px-3 sm:px-5">
            <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#E3E9F2] md:hidden dark:border-slate-700" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <label className="relative flex min-w-0 flex-1 items-center sm:max-w-sm">
              <span className="sr-only">Search provider sections</span>
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search anything…"
                className="h-10 w-full min-w-0 rounded-xl border border-[#E3E9F2] bg-[#F7F9FC] pl-9 pr-8 text-sm text-slate-700 outline-none transition focus:border-[#12C2A0] focus:ring-2 focus:ring-[#12C2A0]/25 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 grid h-6 w-6 place-items-center rounded-lg text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
            </label>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {onOpenMarketplace && <button type="button" onClick={onOpenMarketplace} className="hidden min-h-10 items-center gap-2 rounded-xl border border-[#E3E9F2] bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#12C2A0] hover:text-[#0B8F76] sm:inline-flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />View app
              </button>}

              {onChangeLanguage && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPanel((value) => value === 'language' ? null : 'language')}
                    aria-haspopup="menu"
                    aria-expanded={panel === 'language'}
                    className="hidden min-h-10 items-center gap-2 rounded-xl border border-[#E3E9F2] bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#12C2A0] hover:text-[#0B8F76] sm:inline-flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    <span className="max-w-[92px] truncate">{activeLanguage.englishName}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                  </button>
                  {panel === 'language' && (
                    <div role="menu" aria-label="Language" className="absolute right-0 top-full z-30 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-[#E3E9F2] bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                      {allIndianLanguages.map((language) => {
                        const active = language.code === currentLang;
                        return <button
                          key={language.code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => { onChangeLanguage(language.code as AppLanguage); setPanel(null); }}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${active ? 'bg-[#12C2A0]/12 text-[#0B8F76]' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                        >
                          <span className="truncate">{language.label}</span>
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{language.englishName}</span>
                        </button>;
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPanel((value) => value === 'notifications' ? null : 'notifications')}
                  aria-haspopup="menu"
                  aria-expanded={panel === 'notifications'}
                  aria-label={notificationCount ? `${notificationCount} notifications` : 'Notifications'}
                  className="relative grid h-10 w-10 place-items-center rounded-full border border-[#E3E9F2] bg-white text-slate-500 transition hover:border-[#12C2A0] hover:text-[#0B8F76] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <Bell className="h-4 w-4" />
                  {notificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#F04438] px-1 text-[10px] font-black leading-none text-white" aria-hidden="true">{notificationCount > 9 ? '9+' : notificationCount}</span>
                  )}
                </button>
                {panel === 'notifications' && (
                  <div role="menu" aria-label="Notifications" className="absolute right-0 top-full z-30 mt-2 w-[300px] overflow-hidden rounded-2xl border border-[#E3E9F2] bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-[#E3E9F2] px-4 py-2.5 dark:border-slate-800">
                      <p className="text-xs font-black text-slate-900 dark:text-white">Notifications</p>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{notificationCount} open</span>
                    </div>
                    {notificationCount === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-500">Nothing needs your attention.</p>
                    ) : (
                      <div className="max-h-72 overflow-y-auto p-1.5">
                        {notifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            onClick={() => { setPanel(null); navigate(item.module); }}
                            className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: PROVIDER_TOKENS.primary }} aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{item.title}</span>
                              {item.detail && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{item.detail}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="hidden items-center gap-2 lg:flex">
                <span className="grid h-10 w-10 place-items-center rounded-full text-xs font-black" style={{ backgroundColor: PROVIDER_TOKENS.primary, color: PROVIDER_TOKENS.primaryInk }} aria-hidden="true">{initial}</span>
                <div className="min-w-0">
                  <p className="max-w-[140px] truncate text-xs font-black text-slate-900 dark:text-white">{accountName}</p>
                  <p className="max-w-[140px] truncate text-[10px] font-semibold capitalize text-slate-500 dark:text-slate-400">{roleLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="min-w-0 overflow-x-clip p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <span>Provider</span>
                <span aria-hidden="true">›</span>
                <span className="truncate text-slate-600 dark:text-slate-300">{sectionLabel}</span>
              </nav>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">{title}</h1>
              {subtitle && <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-[#12C2A0]/30 bg-[#12C2A0]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#0B8F76] sm:inline-flex dark:text-[#5FE3CB]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PROVIDER_TOKENS.primary }} />Live data
              </span>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  </div>;
}
