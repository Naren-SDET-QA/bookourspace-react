import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { moviesAuth, supportedMovieStates, type PublicShowtime } from '../features/movies/moviesApi';
import { getMovieDisplayCopy } from '../features/movies/movieDisplayCopy';
import { filterDemoMovieShowtimes } from '../features/movies/movieDemoData';
const AdminTheatreManagement=lazy(()=>import('./AdminTheatreManagement').then(m=>({default:m.AdminTheatreManagement})));
const localDemoMode=import.meta.env.DEV&&import.meta.env.VITE_MOVIES_DEMO_MODE!=='false';

export function MoviesNowShowing({searchQuery=''}:{searchQuery?:string}) {
  const [rows,setRows]=useState<PublicShowtime[]>([]);
  const [state,setState]=useState('');const [city,setCity]=useState('');const [language,setLanguage]=useState('');const [query,setQuery]=useState(searchQuery);
  const [page,setPage]=useState(0);const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [admin,setAdmin]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{setQuery(searchQuery);setPage(0);},[searchQuery]);
  const load=useCallback(async()=>{
    const current=++generation.current;setLoading(true);
    try {
      if(localDemoMode){
        const filtered=filterDemoMovieShowtimes({query,state,city,language});
        if(current===generation.current){setRows(filtered.slice(page*30,(page+1)*30));setError('');}
        return;
      }
      const params=new URLSearchParams({state,city,q:query,offset:String(page*30),limit:'30'});
      const response=await fetch(`/api/public/movies?${params}`,{cache:'no-store'});
      const data=await response.json();
      if(!response.ok) throw new Error('Now Showing is temporarily unavailable. Please refresh.');
      if(current===generation.current){setRows((data.showtimes||[]).filter((row: PublicShowtime) => !language || row.language.toLocaleLowerCase('en-IN') === language.toLocaleLowerCase('en-IN')));setError('');}
    }catch(err){if(current===generation.current){setRows([]);setError((err as Error).message);}}
    finally{if(current===generation.current)setLoading(false);}
  },[state,city,language,query,page]);
  useEffect(()=>{
    setRows([]);
    const timer=window.setTimeout(()=>void load(),250);
    const invalidate=()=>{setRows([]);void load();};
    window.addEventListener('bos-movies-changed',invalidate);window.addEventListener('focus',invalidate);
    const polling=localDemoMode?undefined:window.setInterval(()=>void load(),15000);
    const channel=localDemoMode?undefined:moviesAuth?.channel('bos-public-movies').on('broadcast',{event:'invalidate'},invalidate).subscribe(status=>{if(status==='SUBSCRIBED')invalidate();});
    return ()=>{generation.current++;window.clearTimeout(timer);if(polling)window.clearInterval(polling);window.removeEventListener('bos-movies-changed',invalidate);window.removeEventListener('focus',invalidate);if(channel)void moviesAuth?.removeChannel(channel);};
  },[load]);
  const groups=new Map<string,PublicShowtime[]>();
  rows.forEach(row=>{const key=`${row.movie_id}:${row.theatre_id}`;groups.set(key,[...(groups.get(key)||[]),row]);});
  const field='rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
  return <section aria-labelledby="now-showing-title" className="space-y-5">
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#db2777] px-5 py-6 text-white shadow-[0_16px_36px_rgba(109,40,217,0.24)] sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-8 -top-12 text-[9rem] leading-none opacity-20">🍿</div>
      <div className="relative max-w-xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">BookOurSpace</p>
        <h2 id="movies-hero-title" className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Movies <span aria-hidden="true">🎬</span></h2>
        <p className="mt-2 text-sm font-semibold text-white/85">Now Running · Telugu · Hindi · English</p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-3 py-1.5 text-xs font-black text-slate-950 shadow-sm"><span aria-hidden="true">▶</span> Now Running</span>
      </div>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Movie categories">
      {[['', 'Now Running'], ['Telugu', 'Telugu'], ['Hindi', 'Hindi'], ['English', 'English']].map(([value,label])=><button key={label} type="button" aria-pressed={language===value} onClick={()=>{setLanguage(value);setPage(0);}} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition-colors ${language===value?'border-indigo-600 bg-indigo-600 text-white shadow-sm':'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{label}</button>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-indigo-600">BookOurSpace Movies</p><h2 id="now-showing-title" className="text-2xl font-semibold text-slate-900 dark:text-white">Now Showing</h2><p className="mt-1 text-sm text-slate-500">Movie names, theatres and show timings.</p></div><button type="button" className={field} onClick={()=>setAdmin(true)}>Theatre administration</button></div>
    {localDemoMode&&<p role="note" className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">Local demo catalogue: original sample movies and theatre timings for preview only. No booking or payment is enabled.</p>}
    <div className="grid gap-2 sm:grid-cols-3"><input aria-label="Search movies or theatres" className={field} value={query} placeholder="Search movies" onChange={e=>{setQuery(e.target.value);setPage(0);}}/><select aria-label="Movie state" className={field} value={state} onChange={e=>{setState(e.target.value);setPage(0);}}><option value="">All states</option>{supportedMovieStates.map(s=><option key={s}>{s}</option>)}</select><input aria-label="Movie city" className={field} value={city} placeholder="Location / city" onChange={e=>{setCity(e.target.value);setPage(0);}}/></div>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {loading&&<p role="status" className="text-sm text-slate-500">Updating Now Showing…</p>}
    {!loading&&!error&&!rows.length&&<div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-600 dark:text-slate-300">No published screenings match your search.</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">{[...groups].map(([id,shows])=>{const first=shows[0];const copy=getMovieDisplayCopy({title:first.title,theatreName:first.theatre_name,language:first.language});return <article key={id} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(30,41,59,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(79,70,229,0.18)] sm:rounded-[24px] dark:border-slate-700 dark:bg-slate-900">
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-700 sm:h-52">
        {first.poster_url?<img src={first.poster_url} alt={first.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/>:<div className="flex h-full items-center justify-center text-5xl" aria-hidden="true">🎬</div>}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/85 to-transparent" />
        <span className="absolute left-2 top-2 rounded-full border border-white/30 bg-white/15 px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-white backdrop-blur-md sm:left-4 sm:top-4 sm:px-3 sm:text-[10px]">{localDemoMode ? 'Local demo' : 'Now showing'}</span>
        <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-indigo-950 shadow-sm sm:bottom-4 sm:left-4 sm:px-3 sm:text-xs">{copy.language}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-5">
        <div>
          <h3 className="text-sm font-black leading-tight tracking-tight text-slate-950 sm:text-xl dark:text-white">{copy.title}</h3>
          <p className="mt-1 truncate text-[10px] font-bold text-indigo-700 sm:text-sm dark:text-indigo-300">{copy.theatre}</p>
          <p className="mt-1 text-[9px] font-medium leading-tight text-slate-500 sm:mt-2 sm:text-xs dark:text-slate-400">{first.city}, {first.state} · {first.area}</p>
        </div>
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-[9px] font-semibold leading-snug text-amber-950 sm:rounded-2xl sm:px-3.5 sm:py-3 sm:text-xs sm:leading-relaxed dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">{copy.notice}</p>
        <div className="mt-auto">
          <div className="mb-2 flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 sm:text-[11px] sm:tracking-[0.14em] dark:text-slate-400">{copy.timingsLabel}</p><span className="text-[9px] font-bold text-indigo-600 sm:text-[11px] dark:text-indigo-300">{shows.length} options</span></div>
          <ul className="grid gap-1.5 sm:gap-2" aria-label={`${copy.title} show timings`}>{shows.map(show=><li key={show.showtime_id} className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-2 py-2 text-[9px] text-slate-800 transition-colors group-hover:border-indigo-200 sm:rounded-2xl sm:px-3.5 sm:py-2.5 sm:text-xs dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"><time className="font-black" dateTime={show.starts_at}>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(show.starts_at))}</time><span className="mt-0.5 block truncate text-slate-500 sm:whitespace-normal dark:text-slate-400">{show.screen_name} · {show.format}</span></li>)}</ul>
        </div>
      </div>
    </article>;})}</div>
    <div className="flex justify-center gap-3"><button className={field} disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><button className={field} onClick={()=>void load()}>Refresh</button><button className={field} disabled={rows.length<30} onClick={()=>setPage(p=>p+1)}>Next</button></div>
    {admin&&<div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 p-3"><div className="mx-auto my-5 max-w-6xl"><button className={`${field} mb-2`} type="button" onClick={()=>setAdmin(false)}>Close theatre administration</button><Suspense fallback={<p className="p-4 text-white">Loading theatre management…</p>}><AdminTheatreManagement/></Suspense></div></div>}
  </section>;
}
