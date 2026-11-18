import { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation, ShieldCheck, Users } from 'lucide-react';
import {
  fetchAdminGpsCapacity,
  fetchAdminGpsPolicy,
  saveAdminCategoryGps,
  saveAdminGpsGlobal,
  type GpsAdminPolicy,
} from '../../lib/gpsPolicyClient';
import { estimateGpsLoad, gpsCapacityVerdict } from '../../lib/gpsCapacity';

function Toggle({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 min-w-[3.5rem] items-center justify-center rounded-full px-3 text-[10px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
      }`}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  );
}

export function AdminGpsTrackingPanel() {
  const [policy, setPolicy] = useState<GpsAdminPolicy | null>(null);
  const [capacity, setCapacity] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setPolicy(await fetchAdminGpsPolicy());
      try {
        setCapacity(await fetchAdminGpsCapacity());
      } catch {
        setCapacity(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GPS_POLICY_UNAVAILABLE');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, work: () => Promise<GpsAdminPolicy>) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const next = await work();
      setPolicy(next);
      setNotice('GPS settings saved. Live bookings pick this up without a redeploy.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GPS_POLICY_SAVE_FAILED');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-gps-tracking-panel">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <span className="text-[10px] font-black uppercase tracking-wider text-violet-700">GPS engine</span>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-black text-slate-900 dark:text-white">
          <Navigation className="h-5 w-5 text-violet-700" /> Universal GPS tracking
        </h3>
        <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">
          One GPS engine for every assigned booking. Enable or disable it globally or per service category.
          Changes persist in PostgreSQL and apply immediately. Assigned providers still grant location permission
          before sharing. Customers only see their own booking.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-semibold text-emerald-800">
            {notice}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900 dark:bg-violet-950/30">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-violet-700">Global GPS</p>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {policy?.globalEnabled === false ? 'Disabled for every category' : 'Enabled (category toggles still apply)'}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">
              Last saved {policy?.updatedAt ? new Date(policy.updatedAt).toLocaleString() : 'never'}
            </p>
          </div>
          <Toggle
            on={policy?.globalEnabled !== false}
            disabled={!policy || Boolean(busy)}
            label="Global GPS tracking"
            onClick={() => void run('global', () => saveAdminGpsGlobal(policy?.globalEnabled === false))}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900" data-testid="admin-gps-capacity">
        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-violet-700" /> Capacity (no personal coordinates)
        </h4>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          Counts of active GPS sessions and recent updates. The Global GPS toggle above is the emergency kill switch.
          1,000-device support stays unproven until a staging load test passes.
        </p>
        <dl className="mt-3 grid gap-2 text-[11px] font-semibold text-slate-700 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <dt className="text-[9px] uppercase tracking-wide text-slate-400">Active sessions</dt>
            <dd className="text-lg font-black">{Number(capacity?.activeSessions || 0)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <dt className="text-[9px] uppercase tracking-wide text-slate-400">Updates last hour</dt>
            <dd className="text-lg font-black">{Number(capacity?.updatesLastHour || 0)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <dt className="text-[9px] uppercase tracking-wide text-slate-400">Updates last day</dt>
            <dd className="text-lg font-black">{Number(capacity?.updatesLastDay || 0)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[10px] font-semibold text-slate-500">
          Planning load for {estimateGpsLoad().devices} devices / {estimateGpsLoad().intervalSeconds}s is {Math.round(estimateGpsLoad().updatesPerSecond)} writes/s.
          Verdict: {gpsCapacityVerdict(null)}.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
          <MapPin className="h-4 w-4 text-violet-700" /> Per-category GPS
        </h4>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          Off hides Share live GPS and customer Track live for that category, including bookings already assigned.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">GPS</th>
                <th className="py-2">Live map</th>
              </tr>
            </thead>
            <tbody>
              {(policy?.categories || []).map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3">
                    <p className="font-black text-slate-900 dark:text-white">{row.name}</p>
                    <p className="font-semibold text-slate-400">{row.id}</p>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-slate-500">{row.source.replace('_', ' ')}</td>
                  <td className="py-2 pr-3">
                    <Toggle
                      on={row.gpsTracking}
                      disabled={!policy || Boolean(busy) || policy.globalEnabled === false}
                      label={`GPS tracking for ${row.id}`}
                      onClick={() => void run(row.id, () => saveAdminCategoryGps(row.id, !row.gpsTracking, !row.gpsTracking))}
                    />
                  </td>
                  <td className="py-2">
                    <Toggle
                      on={row.liveMap && row.gpsTracking}
                      disabled={!policy || Boolean(busy) || !row.gpsTracking || policy.globalEnabled === false}
                      label={`Live map for ${row.id}`}
                      onClick={() => void run(`${row.id}-map`, () => saveAdminCategoryGps(row.id, true, !row.liveMap))}
                    />
                  </td>
                </tr>
              ))}
              {policy && policy.categories.length === 0 && (
                <tr><td colSpan={4} className="py-3 font-semibold text-slate-500">No service categories found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6 dark:border-amber-900 dark:bg-amber-950/20">
        <h4 className="flex items-center gap-2 text-sm font-black text-amber-950 dark:text-amber-100">
          <Users className="h-4 w-4" /> Manual test mode
        </h4>
        <p className="mt-1 text-[11px] font-semibold text-amber-900/80 dark:text-amber-100/80">
          Local DEV accounts and the seeded GPS booking. Sign in with local-dev session. Leaflet + OpenStreetMap stay unchanged.
        </p>
        <dl className="mt-3 grid gap-2 text-[11px] font-semibold text-amber-950 dark:text-amber-100 sm:grid-cols-2">
          <div><dt className="text-[10px] uppercase tracking-wide text-amber-800/70">Customer</dt><dd>{policy?.manualTest.customerEmail}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wide text-amber-800/70">Provider</dt><dd>{policy?.manualTest.providerEmail}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wide text-amber-800/70">Admin</dt><dd>{policy?.manualTest.adminEmail}</dd></div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-amber-800/70">Test booking</dt>
            <dd>{policy?.manualTest.listingTitle} · {policy?.manualTest.bookingRef || policy?.manualTest.bookingId}</dd>
          </div>
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-amber-900 dark:text-amber-100">
          <ShieldCheck className="h-3.5 w-3.5" />
          Seeded: {policy?.manualTest.seeded ? 'yes' : 'run scripts/seed-local-gps-booking.ts'} · States: Disabled, Waiting, Live, Stale, Stopped
        </p>
      </div>
    </div>
  );
}

export default AdminGpsTrackingPanel;
