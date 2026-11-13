import React, { useCallback, useEffect, useState } from 'react';
import { moviesAuth, moviesAdminRequest, supportedMovieStates, type MovieAdminAccess, type MovieAdminRow, type MoviePermission, type MovieAudit } from '../features/movies/moviesApi';
import { getTheatreCardMeta } from '../features/movies/adminTheatrePresentation';
import { demoTheatreAdminRows } from '../features/movies/movieDemoData';

const field = 'rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
const localDemoMode=import.meta.env.DEV&&import.meta.env.VITE_MOVIES_DEMO_MODE!=='false';
export function AdminTheatreManagement() {
  const [access,setAccess]=useState<MovieAdminAccess|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [kind,setKind]=useState('theatre');
  const [state,setState]=useState('');
  const [city,setCity]=useState('');
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('');
  const [page,setPage]=useState(0);
  const [rows,setRows]=useState<MovieAdminRow[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [reason,setReason]=useState('');
  const [audit,setAudit]=useState<MovieAudit[]>([]);
  const [auditPage,setAuditPage]=useState(0);
  const [permissions,setPermissions]=useState<MoviePermission[]>([]);
  const [userId,setUserId]=useState('');
  const [newRole,setNewRole]=useState('admin');
  const [allow,setAllow]=useState(true);

  const checkAccess=useCallback(async()=>{
    if(localDemoMode){setAccess(null);setError('');return;}
    try { const body=await moviesAdminRequest('access'); setAccess(body.access); setError(''); }
    catch(err) { setAccess(null); setRows([]); setError((err as Error).message); }
  },[]);
  useEffect(()=>{
    void checkAccess();
    const subscription=moviesAuth?.auth.onAuthStateChange(()=>{ window.setTimeout(()=>void checkAccess(),0); });
    return ()=>subscription?.data.subscription.unsubscribe();
  },[checkAccess]);
  const load=useCallback(async()=>{
    if(!access?.canManageVisibility) { setRows([]); return; }
    const params=new URLSearchParams({kind,state,city,q:query,status,offset:String(page*30)});
    const response=await moviesAdminRequest(`catalog?${params}`);
    setRows(response.data||[]); setSelected([]);
  },[access,kind,state,city,query,status,page]);
  useEffect(()=>{
    let cancelled=false;
    const timer=window.setTimeout(()=> { void load().catch(err=>{if(!cancelled){setRows([]);setError(err.message);}}); },250);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[load]);
  const loadAudit=useCallback(async()=>{
    const body=await moviesAdminRequest(`audit?offset=${auditPage*50}`); setAudit(body.data||[]);
  },[auditPage]);
  useEffect(()=>{if(access?.canManageVisibility) void loadAudit().catch(err=>setError(err.message));},[access,loadAudit]);
  const loadPermissions=useCallback(async()=>{
    const body=await moviesAdminRequest('permissions'); setPermissions(body.data||[]);
  },[]);
  useEffect(()=>{if(access?.role==='super_admin') void loadPermissions().catch(err=>setError(err.message));},[access,loadPermissions]);

  const changeVisibility=async(targets:MovieAdminRow[],visible:boolean)=>{
    if(reason.trim().length<3) {setError('Enter a reason before changing visibility.');return;}
    setBusy(true);setError('');setNotice('');
    try {
      await moviesAdminRequest(`visibility/${kind}`,{method:'PATCH',body:JSON.stringify({reason,changes:targets.map(row=>({id:row.id,visible,version:row.version}))})});
      window.dispatchEvent(new Event('bos-movies-changed'));
      await Promise.all([load(),loadAudit()]); setNotice('Visibility saved. The public feed has been invalidated.');
    } catch(err) {setError((err as Error).message);await load().catch(()=>{});}
    finally {setBusy(false);}
  };
  const savePermission=async()=>{
    if(reason.trim().length<3 || !userId) {setError('Enter a user UUID and a reason.');return;}
    setBusy(true);setError('');
    try {
      const existing=permissions.find(item=>item.user_id===userId);
      await moviesAdminRequest(`permissions/${encodeURIComponent(userId)}`,{method:'PUT',body:JSON.stringify({role:newRole,allowed:allow,version:existing?.version??-1,reason})});
      await Promise.all([loadPermissions(),loadAudit(),checkAccess()]);setNotice('Admin permission saved and audited.');
    } catch(err) {setError((err as Error).message);}
    finally {setBusy(false);}
  };

  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
    <div><h2 className="text-xl font-semibold">Theatre Management</h2><p className="mt-1 text-sm text-slate-500">Live public visibility · Andhra Pradesh · Telangana · Karnataka · Tamil Nadu</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {!access?.canManageVisibility ? <div className="space-y-3">
      <p className="text-sm">{localDemoMode?'Demo preview is available below. Live switches require a verified Movies Admin or Super Admin session.':'Sign in with a verified Supabase account that has Movies administration permission.'}</p>
      {localDemoMode?<div className="space-y-3 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/70 p-3 dark:border-indigo-800 dark:bg-indigo-950/30"><p className="text-xs font-medium text-indigo-900 dark:text-indigo-100">Sample theatre cards · read-only demo data</p><div className="grid gap-3 sm:grid-cols-2">{demoTheatreAdminRows.map(row=>{const meta=getTheatreCardMeta(row);return <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-lg dark:bg-indigo-950">🏛️</div><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{row.name}</p><p className="text-xs text-slate-500">{row.city} · {row.state}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.is_visible?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-700'}`}>{meta.statusLabel}</span></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{meta.statusDescription}</span><button type="button" role="switch" aria-checked={row.is_visible} aria-label={`${row.name} demo visibility`} disabled className={`relative h-7 w-12 shrink-0 rounded-full p-1 opacity-60 ${row.is_visible?'bg-emerald-600':'bg-slate-400'}`}><span className={`block h-5 w-5 rounded-full bg-white shadow ${row.is_visible?'translate-x-5':'translate-x-0'}`} /></button></div></article>})}</div><p className="text-xs text-indigo-800 dark:text-indigo-200">Set <code>VITE_MOVIES_DEMO_MODE=false</code> and restart the dev server to use live Supabase admin controls.</p></div>:<form className="flex flex-wrap gap-2" onSubmit={async event=>{
        event.preventDefault();setBusy(true);setError('');
        try {
          if(!moviesAuth) throw new Error('Movies authentication is not configured.');
          const {error}=await moviesAuth.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin}});
          if(error) throw error;setNotice('Check your email for the sign-in link.');
        } catch(err){setError((err as Error).message);} finally {setBusy(false);}
      }}>
        <input aria-label="Movies admin email" required type="email" value={email} onChange={e=>setEmail(e.target.value)} className={field} placeholder="Your verified email" />
        <button disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send sign-in link</button>
        <button type="button" onClick={()=>void checkAccess()} className={field}>Check access</button>
      </form>}
      {access?.role==='none' && <p className="text-sm text-slate-500">Signed in. A Movies Super Admin must grant your account access.</p>}
    </div> : <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Visibility level">{['theatre','movie','showtime'].map(value=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>{setKind(value);setPage(0);setSelected([]);}} className={`${field} ${kind===value?'ring-2 ring-indigo-600':''}`}>{value==='theatre'?'Theatres':value==='movie'?'Movies':'Individual showtimes'}</button>)}<button type="button" onClick={()=>void load().catch(err=>setError(err.message))} className={field}>Refresh</button></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className={field} aria-label="Search theatres movies or showtimes" placeholder="Search name or ID" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} />
        <select className={field} aria-label="Theatre state" value={state} onChange={e=>{setState(e.target.value);setPage(0);}}><option value="">All states</option>{supportedMovieStates.map(item=><option key={item}>{item}</option>)}</select>
        <input className={field} aria-label="Theatre city" placeholder="City" value={city} onChange={e=>{setCity(e.target.value);setPage(0);}} />
        <select className={field} aria-label="Visibility status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">All statuses</option><option value="active">ON</option><option value="disabled">OFF</option></select>
      </div>
      <label className="block text-sm font-medium">Reason for change<input className={`${field} mt-1 w-full`} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Required for every live ON/OFF edit, e.g. maintenance" /></label>
      <div className="flex flex-wrap gap-2 text-sm"><button className={field} type="button" onClick={()=>setSelected(rows.map(row=>row.id))}>Select this page</button><button className={field} type="button" onClick={()=>setSelected([])}>Clear selection</button><button disabled={busy||!selected.length||reason.trim().length<3} className={`${field} disabled:opacity-40`} onClick={()=>void changeVisibility(rows.filter(row=>selected.includes(row.id)),true)}>Bulk ON</button><button disabled={busy||!selected.length||reason.trim().length<3} className={`${field} disabled:opacity-40`} onClick={()=>void changeVisibility(rows.filter(row=>selected.includes(row.id)),false)}>Bulk OFF</button></div>
      <div className={kind==='theatre'?'grid gap-4 sm:grid-cols-2 lg:grid-cols-3':'space-y-2'}>{rows.map(row=>{const meta=kind==='theatre'?getTheatreCardMeta(row):{statusLabel:row.is_visible?'ON':'OFF',actionLabel:row.is_visible?'Disable':'Enable',statusDescription:row.is_visible?'Visible to the public feed':'Hidden from the public feed'};return kind==='theatre'?<article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-950" key={row.id}>
        <div className={`h-2 ${row.is_visible?'bg-emerald-500':'bg-slate-400'}`} />
        <div className="space-y-4 p-4"><div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-xl dark:bg-indigo-950">🏛️</div><div className="min-w-0 flex-1"><p className="break-words text-base font-semibold">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.city} · {row.state}</p><p className="mt-1 text-[11px] text-slate-400">ID: {row.id} · version {row.version}</p></div></div><div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${row.is_visible?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-700'}`}>{meta.statusLabel}</span><span className="text-right text-xs text-slate-500">{meta.statusDescription}</span></div>{!row.parent_visible&&<p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Source feed inactive; public publishing stays blocked.</p>}<div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><span><span className="block text-sm font-semibold">Live edit visibility</span><span className="block text-xs text-slate-500">{meta.actionLabel} immediately after the protected save</span></span><button type="button" role="switch" aria-checked={row.is_visible} aria-label={`${row.name} visibility`} disabled={busy||reason.trim().length<3} onClick={()=>void changeVisibility([row],!row.is_visible)} className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${row.is_visible?'bg-emerald-600':'bg-slate-400'}`}><span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${row.is_visible?'translate-x-5':'translate-x-0'}`} /></button></div><label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.includes(row.id)} onChange={e=>setSelected(values=>e.target.checked?[...values,row.id]:values.filter(id=>id!==row.id))} />Select for bulk action</label></div>
      </article>:<div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700" key={row.id}>
        <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.includes(row.id)} onChange={e=>setSelected(values=>e.target.checked?[...values,row.id]:values.filter(id=>id!==row.id))} />
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{row.name}</p><p className="text-xs text-slate-500">{row.city} · {row.state} · v{row.version}</p>{!row.parent_visible&&<p className="text-xs text-amber-700">A parent record or source feed is inactive.</p>}</div>
        <button role="switch" aria-checked={row.is_visible} aria-label={`${row.name} visibility`} disabled={busy||reason.trim().length<3} onClick={()=>void changeVisibility([row],!row.is_visible)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold text-white disabled:opacity-40 ${row.is_visible?'bg-emerald-600':'bg-slate-500'}`}>{row.is_visible?'ON':'OFF'}</button>
      </div>})}{!rows.length&&<p className="py-6 text-center text-sm text-slate-500">No records match these filters. Import an authorized movie feed to populate the catalogue.</p>}</div>
      <div className="flex items-center justify-center gap-3"><button disabled={!page} className={field} onClick={()=>setPage(p=>p-1)}>Previous</button><span className="text-sm">Page {page+1} · {rows[0]?.total_count||0} results</span><button disabled={(page+1)*30>=Number(rows[0]?.total_count||0)} className={field} onClick={()=>setPage(p=>p+1)}>Next</button></div>
      {access.role==='super_admin'&&<details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">Admin permissions</summary><p className="mt-2 text-xs text-slate-500">Use an existing Supabase Auth UUID. Changes require the reason above and are audited.</p><div className="mt-3 flex flex-wrap gap-2"><input className={field} aria-label="Admin user UUID" placeholder="Supabase Auth user UUID" value={userId} onChange={e=>setUserId(e.target.value.trim())}/><select className={field} aria-label="Admin permission role" value={newRole} onChange={e=>setNewRole(e.target.value)}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/>Allow visibility edits</label><button className={field} disabled={busy} onClick={()=>void savePermission()}>Save permission</button></div><div className="mt-3 space-y-2">{permissions.map(p=><button type="button" key={p.user_id} className="block w-full break-all rounded-lg bg-slate-100 p-2 text-left text-xs dark:bg-slate-800" onClick={()=>{setUserId(p.user_id);setNewRole(p.role);setAllow(p.can_manage_visibility);}}>{p.user_id} · {p.role} · {p.can_manage_visibility?'Allowed':'Revoked'}</button>)}</div></details>}
      <details className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">Protected visibility audit</summary><div className="mt-3 space-y-3">{audit.map(item=><div key={item.id} className="break-words border-b pb-2 text-xs"><p>{item.target_kind} {item.target_id}: {item.previous_value} → {item.new_value}</p><p>{item.reason}</p><p className="text-slate-500">{item.actor_id} · {new Date(item.changed_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p></div>)}</div><div className="mt-3 flex gap-2"><button className={field} disabled={!auditPage} onClick={()=>setAuditPage(p=>p-1)}>Previous audit</button><button className={field} disabled={audit.length<50} onClick={()=>setAuditPage(p=>p+1)}>Next audit</button></div></details>
    </>}
  </section>;
}
