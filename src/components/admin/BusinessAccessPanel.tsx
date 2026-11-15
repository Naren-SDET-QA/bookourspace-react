import { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { buildAuthHeaders } from '../../lib/supabaseClient';

type AdminBusiness = {
  id: string;
  business_ref: string;
  name: string;
  module_type: string;
  approval_status: 'pending' | 'approved' | 'suspended' | 'revoked';
  is_enabled: boolean;
  owner_email: string;
  owner_name: string;
  module_enabled: boolean;
  module_approval_status: string;
  listing_count: number;
  member_count: number;
};

const MODULE_LABEL: Record<string, string> = {
  pg_hostels: 'PG & Hostels', classes: 'Classes', venues: 'Function Halls',
  services: 'Services', hotel_stay: 'Stays', movies: 'Movies',
};

export function BusinessAccessPanel() {
  const [rows, setRows] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/businesses', { headers: { ...buildAuthHeaders(), accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
      setRows(data.businesses || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'BUSINESS_LIST_UNAVAILABLE');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setAccess(id: string, approvalStatus: AdminBusiness['approval_status'], enabled: boolean) {
    setBusy(id); setError('');
    try {
      const response = await fetch(`/api/admin/businesses/${encodeURIComponent(id)}/access`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ accept: 'application/json' }),
        body: JSON.stringify({ approvalStatus, enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP_${response.status}`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ACCESS_UPDATE_FAILED'); }
    finally { setBusy(''); }
  }

  return (
    <section className="space-y-3" aria-label="Business ownership and module access">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white"><Building2 className="h-4 w-4 text-violet-600" /> Business access control</h2>
          <p className="mt-1 text-xs text-slate-500">Approve, suspend or revoke each independent business and its module access.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </header>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error.replaceAll('_', ' ').toLowerCase()}</p>}
      {loading ? <p className="text-sm text-slate-500">Loading businesses…</p> : rows.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No businesses found.</p> : (
        <div className="grid gap-2 lg:grid-cols-2">
          {rows.map((business) => {
            const active = business.approval_status === 'approved' && business.is_enabled && business.module_enabled;
            return (
              <article key={business.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[13px] font-black text-slate-900 dark:text-white">{business.name}</h3>
                    <p className="mt-0.5 text-[10px] text-slate-500">{business.business_ref} · {MODULE_LABEL[business.module_type] || business.module_type}</p>
                    <p className="text-[10px] text-slate-500">{business.owner_name || business.owner_email} · {business.listing_count} listings · {business.member_count} members</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{business.approval_status}{business.is_enabled ? '' : ' · disabled'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button type="button" disabled={busy === business.id} onClick={() => void setAccess(business.id, 'approved', true)} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[10px] font-black text-white disabled:opacity-50"><CheckCircle2 className="h-3 w-3" /> Approve</button>
                  <button type="button" disabled={busy === business.id} onClick={() => void setAccess(business.id, 'suspended', false)} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-[10px] font-black text-white disabled:opacity-50"><ShieldCheck className="h-3 w-3" /> Suspend</button>
                  <button type="button" disabled={busy === business.id} onClick={() => void setAccess(business.id, 'revoked', false)} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-rose-300 px-2.5 text-[10px] font-black text-rose-700 disabled:opacity-50"><XCircle className="h-3 w-3" /> Revoke</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
