import {createClient} from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

dotenv.config({path:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.env.local'),quiet:true});
const url=process.env.MOVIES_SUPABASE_URL||process.env.VITE_MOVIES_SUPABASE_URL;
const key=process.env.MOVIES_SYNC_SERVICE_KEY;
const feedUrl=process.env.MOVIES_FEED_URL;
if(!url || !key || !feedUrl) throw new Error('Configure MOVIES_SUPABASE_URL, MOVIES_SYNC_SERVICE_KEY and MOVIES_FEED_URL on the sync worker.');
if(new URL(url).hostname!=='ezrxykyocgbolpaebnqx.supabase.co') throw new Error('Unexpected Movies project.');
if(new URL(feedUrl).protocol!=='https:') throw new Error('The authorized movie feed must use HTTPS.');
const response=await fetch(feedUrl,{signal:AbortSignal.timeout(30000),redirect:'error',headers:process.env.MOVIES_FEED_TOKEN?{Authorization:`Bearer ${process.env.MOVIES_FEED_TOKEN}`}:{}});
if(!response.ok) throw new Error(`Movie feed returned HTTP ${response.status}. No database changes were made.`);
const text=await response.text();
if(text.length>5_000_000) throw new Error('Movie feed exceeds the allowed batch size.');
const data=JSON.parse(text);
for(const name of ['theatres','movies','showtimes']) if(!Array.isArray(data[name])||data[name].length>1000) throw new Error(`Invalid ${name} batch.`);
// Feed flags are ignored by the SQL function; only metadata columns may be updated.
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {error}=await db.rpc('sync_movie_catalog',{p_theatres:data.theatres,p_movies:data.movies,p_showtimes:data.showtimes});
if(error) throw new Error(`Movie sync failed (${error.code}). The entire batch was rolled back.`);
console.log(JSON.stringify({ok:true,theatres:data.theatres.length,movies:data.movies.length,showtimes:data.showtimes.length,visibilitySettingsPreserved:true}));
