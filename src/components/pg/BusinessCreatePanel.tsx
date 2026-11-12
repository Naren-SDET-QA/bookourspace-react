import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { createBusiness, BUSINESS_MODULE_LABELS, type BusinessMembership, type BusinessModule } from '../../lib/businessClient';

export function BusinessCreatePanel({ onCreated }: { onCreated: (business: BusinessMembership) => void }) {
  const [name, setName] = useState('');
  const [moduleType, setModuleType] = useState<BusinessModule>('pg_hostels');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function create() {
    if (name.trim().length < 2) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const business = await createBusiness(name.trim(), moduleType);
      setNotice('Business created. A Super Admin must approve it before protected data opens.');
      onCreated(business);
      setName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll('_', ' ').toLowerCase() : 'BUSINESS_CREATE_FAILED'); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900 dark:bg-violet-950/20" aria-label="Create a business">
      <h3 className="flex items-center gap-1.5 text-sm font-black text-violet-900 dark:text-violet-100"><Building2 className="h-4 w-4" /> Create your first business</h3>
      <p className="mt-1 text-[11px] font-semibold text-violet-800 dark:text-violet-200">Each business has independent listings, staff, bookings and payments. A Super Admin approves it.</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Business name" aria-label="Business name" className="min-h-9 flex-1 rounded-xl border border-violet-200 bg-white px-2.5 text-xs dark:border-violet-800 dark:bg-slate-900" />
        <select value={moduleType} onChange={(event) => setModuleType(event.target.value as BusinessModule)} aria-label="Business module" className="min-h-9 rounded-xl border border-violet-200 bg-white px-2 text-xs font-bold dark:border-violet-800 dark:bg-slate-900">
          {Object.entries(BUSINESS_MODULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" onClick={() => void create()} disabled={busy || name.trim().length < 2} className="min-h-9 rounded-xl bg-violet-700 px-3 text-[11px] font-black text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create business'}</button>
      </div>
      {notice && <p role="status" className="mt-2 text-[11px] font-semibold text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>}
    </section>
  );
}
