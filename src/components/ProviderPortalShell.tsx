import React, { useState } from 'react';
import {
  BarChart3,
  BedDouble,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Menu,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react';

export type ProviderPortalModule = 'pg' | 'stays' | 'services' | 'institute' | 'team' | 'listings' | 'analytics' | 'enquiries' | 'bookings' | 'plans' | 'visiting_card';

interface ProviderPortalShellProps {
  activeModule: ProviderPortalModule;
  onNavigate?: (module: ProviderPortalModule) => void;
  role?: string | null;
  title: string;
  subtitle?: string;
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

const MODULE_LABELS: Record<ProviderPortalModule, string> = NAV.reduce(
  (labels, item) => ({ ...labels, [item.key]: item.label }),
  {} as Record<ProviderPortalModule, string>,
);

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

export default function ProviderPortalShell({ activeModule, onNavigate, role, title, subtitle, allowedModules, onOpenMarketplace, children }: ProviderPortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = allowedModules ? NAV.filter((item) => allowedModules.includes(item.key)) : NAV;
  const sectionLabel = MODULE_LABELS[activeModule] || 'Workspace';
  const roleLabel = String(role || 'provider').replaceAll('_', ' ');

  const navigate = (module: ProviderPortalModule) => {
    setMobileOpen(false);
    onNavigate?.(module);
  };

  const Sidebar = () => (
    <aside className={`flex h-full flex-col text-white transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-[232px]'}`} style={{ backgroundColor: PROVIDER_TOKENS.rail }}>
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-black" style={{ backgroundColor: PROVIDER_TOKENS.primary, color: PROVIDER_TOKENS.primaryInk }}>B</div>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-black">BookOurSpace</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Provider portal</p></div>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Provider portal navigation">
        {navItems.map(({ key, label, icon: Icon }) => {
          const active = key === activeModule;
          return <button key={key} type="button" onClick={() => navigate(key)} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${active ? 'shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} style={active ? { backgroundColor: PROVIDER_TOKENS.primary, color: PROVIDER_TOKENS.primaryInk } : undefined}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </button>;
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        {!collapsed && <div className="mb-3 rounded-xl bg-white/5 p-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: PROVIDER_TOKENS.primary }} aria-hidden="true" /><span className="text-xs font-bold capitalize">{roleLabel} access</span></div><p className="mt-1 text-[10px] leading-4 text-white/45">Server-authorized workspace</p></div>}
        <button type="button" onClick={() => setCollapsed(value => !value)} className="hidden min-h-10 w-full items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white md:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
      </div>
    </aside>
  );

  return <div className="min-h-[680px] overflow-x-clip rounded-2xl border border-[#E3E9F2] bg-[#F4F7FB] text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
    <div className="flex min-h-[680px]">
      <div className="hidden md:block"><Sidebar /></div>
      {mobileOpen && <div className="fixed inset-0 z-50 flex md:hidden"><button type="button" className="flex-1 bg-black/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><div className="h-full"><Sidebar /></div></div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-[#E3E9F2] bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[#E3E9F2] md:hidden dark:border-slate-700" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <span>Provider</span>
                <span aria-hidden="true">›</span>
                <span className="truncate text-slate-600 dark:text-slate-300">{sectionLabel}</span>
              </nav>
              <h1 className="truncate text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl">{title}</h1>
              {subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {onOpenMarketplace && <button type="button" onClick={onOpenMarketplace} className="hidden min-h-10 items-center gap-2 rounded-xl border border-[#E3E9F2] bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#12C2A0] hover:text-[#0B8F76] sm:inline-flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />View app
              </button>}
              <span className="hidden items-center gap-1.5 rounded-full border border-[#12C2A0]/30 bg-[#12C2A0]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#0B8F76] md:inline-flex dark:text-[#5FE3CB]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PROVIDER_TOKENS.primary }} />Live
              </span>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-[#E3E9F2] bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" aria-label="Notifications"><Bell className="h-4 w-4" /></button>
              <span className="grid h-10 w-10 place-items-center rounded-full text-xs font-black capitalize" style={{ backgroundColor: PROVIDER_TOKENS.primary, color: PROVIDER_TOKENS.primaryInk }} aria-label={`${roleLabel} account`}>{roleLabel.slice(0, 1)}</span>
            </div>
          </div>
        </header>
        <main className="min-w-0 overflow-x-clip p-4 sm:p-6">{children}</main>
      </div>
    </div>
  </div>;
}
