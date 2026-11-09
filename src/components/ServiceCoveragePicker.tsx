import React, { useMemo, useState } from 'react';

type Directory = {
  state: string;
  districts: Array<{ name: string; mandals: Array<{ name: string; villages: string[] }> }>;
};

type Coverage = { state: string; district: string; mandal: string; village: string; path: string };

const STATE_OPTIONS = [
  { name: 'Telangana', key: 'telangana' },
  { name: 'Andhra Pradesh', key: 'andhra_pradesh' },
  { name: 'Karnataka', key: 'karnataka' },
  { name: 'Maharashtra', key: 'maharashtra' },
  { name: 'Delhi (NCT/UT)', key: 'delhi' },
  { name: 'Tamil Nadu', key: 'tamil_nadu' },
];

const directoryLoaders: Record<string, () => Promise<{ default: Directory }>> = {
  telangana: () => import('../data/serviceCoverage/telangana.json'),
  andhra_pradesh: () => import('../data/serviceCoverage/andhra_pradesh.json'),
  karnataka: () => import('../data/serviceCoverage/karnataka.json'),
  maharashtra: () => import('../data/serviceCoverage/maharashtra.json'),
  delhi: () => import('../data/serviceCoverage/delhi.json'),
  tamil_nadu: () => import('../data/serviceCoverage/tamil_nadu.json'),
};

const cache = new Map<string, Promise<Directory>>();

async function loadDirectory(key: string): Promise<Directory> {
  let pending = cache.get(key);
  if (!pending) {
    const loader = directoryLoaders[key];
    if (!loader) throw new Error('LOCATION_STATE_UNAVAILABLE');
    pending = loader().then((module) => module.default);
    cache.set(key, pending);
  }
  return pending;
}

function nameMatches(names: string[], query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return names.filter((name) => name.toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(needle)) - Number(!b.toLocaleLowerCase().startsWith(needle)) || a.localeCompare(b))
    .slice(0, 40);
}

function exactName(names: string[], value: string): string {
  return names.find((name) => name.toLocaleLowerCase() === value.trim().toLocaleLowerCase()) || '';
}

export function ServiceCoveragePicker({ onChange }: { onChange: (coverage: Coverage | null) => void }) {
  const [stateQuery, setStateQuery] = useState('');
  const [districtQuery, setDistrictQuery] = useState('');
  const [mandalQuery, setMandalQuery] = useState('');
  const [villageQuery, setVillageQuery] = useState('');
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Coverage | null>(null);

  const stateSuggestions = useMemo(() => nameMatches(STATE_OPTIONS.map((item) => item.name), stateQuery), [stateQuery]);
  const districtNames = useMemo(() => directory?.districts.map((item) => item.name) || [], [directory]);
  const district = directory?.districts.find((item) => item.name === selected?.district);
  const mandalNames = district?.mandals.map((item) => item.name) || [];
  const mandal = district?.mandals.find((item) => item.name === selected?.mandal);
  const villageNames = mandal?.villages || [];

  const update = (next: Coverage | null) => {
    setSelected(next);
    onChange(next);
  };

  const chooseState = async (value: string) => {
    setStateQuery(value);
    const name = exactName(STATE_OPTIONS.map((item) => item.name), value);
    setDistrictQuery(''); setMandalQuery(''); setVillageQuery(''); setDirectory(null); update(null); setLoadError('');
    if (!name) return;
    const item = STATE_OPTIONS.find((option) => option.name === name);
    if (!item) return;
    setLoading(true);
    try {
      setDirectory(await loadDirectory(item.key));
      update({ state: name, district: '', mandal: '', village: '', path: '' });
    }
    catch { setLoadError('This location directory could not be loaded. Please retry.'); }
    finally { setLoading(false); }
  };

  const chooseDistrict = (value: string) => {
    setDistrictQuery(value); setMandalQuery(''); setVillageQuery('');
    const name = exactName(districtNames, value);
    if (!selected) { update(null); return; }
    if (!name) { update({ state: selected.state, district: '', mandal: '', village: '', path: '' }); return; }
    update({ state: selected.state, district: name, mandal: '', village: '', path: '' });
  };

  const chooseMandal = (value: string) => {
    setMandalQuery(value); setVillageQuery('');
    const name = exactName(mandalNames, value);
    if (!selected) { update(null); return; }
    if (!name) { update({ state: selected.state, district: selected.district, mandal: '', village: '', path: '' }); return; }
    update({ state: selected.state, district: selected.district, mandal: name, village: '', path: '' });
  };

  const chooseVillage = (value: string) => {
    setVillageQuery(value);
    const name = exactName(villageNames, value);
    if (!selected) { update(null); return; }
    if (!name) { update({ state: selected.state, district: selected.district, mandal: selected.mandal, village: '', path: '' }); return; }
    const next = { ...selected, village: name, path: `${selected.state} / ${selected.district} / ${selected.mandal} / ${name}` };
    update(next);
  };

  return (
    <fieldset className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      <legend className="px-1 text-sm font-bold text-slate-900">Service coverage location</legend>
      <p className="text-xs text-slate-600">Search names in order across five states and Delhi (NCT/UT). The directory is stored in the app and loads only when you choose a state. No PIN codes or paid maps are used.</p>
      <label className="block text-sm font-semibold">State
        <input value={stateQuery} onChange={(event) => void chooseState(event.target.value)} list="bos-coverage-states" autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" placeholder="Type a state name" />
        <datalist id="bos-coverage-states">{stateSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
      </label>
      {loading && <p role="status" className="text-xs text-slate-600">Loading this state’s local directory…</p>}
      {loadError && <p role="alert" className="text-xs text-rose-700">{loadError}</p>}
      {directory && <label className="block text-sm font-semibold">District
        <input value={districtQuery} onChange={(event) => chooseDistrict(event.target.value)} list="bos-coverage-districts" autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" placeholder="Type a district name" />
        <datalist id="bos-coverage-districts">{nameMatches(districtNames, districtQuery).map((name) => <option key={name} value={name} />)}</datalist>
      </label>}
      {district && <label className="block text-sm font-semibold">Mandal / Taluk
        <input value={mandalQuery} onChange={(event) => chooseMandal(event.target.value)} list="bos-coverage-mandals" autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" placeholder="Type a mandal or taluk name" />
        <datalist id="bos-coverage-mandals">{nameMatches(mandalNames, mandalQuery).map((name) => <option key={name} value={name} />)}</datalist>
      </label>}
      {mandal && <label className="block text-sm font-semibold">Village / Area
        <input value={villageQuery} onChange={(event) => chooseVillage(event.target.value)} list="bos-coverage-villages" autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" placeholder="Type a village or area name" />
        <datalist id="bos-coverage-villages">{nameMatches(villageNames, villageQuery).map((name) => <option key={name} value={name} />)}</datalist>
      </label>}
      {selected?.path && <p role="status" className="break-words rounded-xl bg-white p-3 text-xs font-semibold text-indigo-900">Selected: {selected.path}</p>}
      <p className="text-[11px] text-slate-500">Source: Local Government Directory, Government of India · export dated 25 May 2026.</p>
    </fieldset>
  );
}
