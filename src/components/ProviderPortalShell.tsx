import React, { useState } from 'react';
import {
  BarChart3,
  BedDouble,
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

export type ProviderPortalModule = 'overview' | 'pg' | 'stays' | 'services' | 'institute' | 'listings' | 'reports' | 'settings';

interface ProviderPortalShellProps {
  activeModule: ProviderPortalModule;
  onNavigate?: (module: ProviderPortalModule) => void;
  role?: string | null;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const NAV: Array<{ key: ProviderPortalModule; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'pg', label: 'PG inventory', icon: BedDouble },
  { key: 'stays', label: 'Stays', icon: Building2 },
  { key: 'services', label: 'Home services', icon: BriefcaseBusiness },
  { key: 'institute', label: 'Institute', icon: Users },
  { key: 'listings', label: 'Listings', icon: ClipboardList },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Portal settings', icon: Settings2 },
];

export default function ProviderPortalShell({ activeModule, onNavigate, role, title, subtitle, children }: ProviderPortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = (module: ProviderPortalModule) => {
    setMobileOpen(false);
    onNavigate?.(module);
  };

  const Sidebar = () => (
    <aside className={`flex h-full flex-col bg-[#17231f] text-white transition-[width] duration-200 ${collapsed ? 'w-[76px]' : 'w-[228px]'}`}>
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#c7e86b] font-black text-[#17231f]">B</div>
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-black">BookOurSpace</p><p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Provider portal</p></div>}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Provider portal navigation">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = key === activeModule;
          return <button key={key} type="button" onClick={() => navigate(key)} title={collapsed ? label : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${active ? 'bg-[#c7e86b] text-[#17231f]' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </button>;
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        {!collapsed && <div className="mb-3 rounded-xl bg-white/5 p-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#c7e86b]" aria-hidden="true" /><span className="text-xs font-bold capitalize">{role || 'provider'} access</span></div><p className="mt-1 text-[10px] leading-4 text-white/45">Server-authorized workspace</p></div>}
        <button type="button" onClick={() => setCollapsed(value => !value)} className="hidden min-h-10 w-full items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white md:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
      </div>
    </aside>
  );

  return <div className="min-h-[680px] overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f8f5] text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
    <div className="flex min-h-[680px]">
      <div className="hidden md:block"><Sidebar /></div>
      {mobileOpen && <div className="fixed inset-0 z-50 flex md:hidden"><button type="button" className="flex-1 bg-black/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><div className="h-full"><Sidebar /></div></div>}
      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 md:hidden dark:border-slate-700" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0"><h1 className="truncate text-base font-black sm:text-lg">{title}</h1>{subtitle && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}</div>
          <div className="ml-auto hidden items-center gap-2 text-xs font-semibold text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live data only</div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 md:hidden dark:border-slate-700" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="h-4 w-4" /></button>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  </div>;
}
