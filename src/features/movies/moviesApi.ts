import { createClient } from '@supabase/supabase-js';
import { assertLocalHttpUrl } from '../../lib/localDemoSafety';

const url = import.meta.env.VITE_MOVIES_SUPABASE_URL;
if (import.meta.env.VITE_LOCAL_DEMO === 'true') assertLocalHttpUrl(url || '');
const key = import.meta.env.VITE_MOVIES_SUPABASE_PUBLISHABLE_KEY;
export const moviesAuth = url && key ? createClient(url,key,{auth:{storageKey:'bos_movies_auth_v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;

export const supportedMovieStates = ['Andhra Pradesh','Telangana','Karnataka','Tamil Nadu'];
export interface PublicShowtime {
  showtime_id:string; theatre_id:string; theatre_name:string; state:string; city:string; area:string;
  movie_id:string; title:string; language:string; poster_url:string; starts_at:string; screen_name:string; format:string;
}
export interface MovieAdminRow {id:string;name:string;state:string;city:string;is_visible:boolean;version:number;parent_visible:boolean;total_count:number;}
export interface MovieAdminAccess { role:'none'|'admin'|'super_admin';canManageVisibility:boolean; }
export interface MoviePermission {user_id:string;role:'admin'|'super_admin';can_manage_visibility:boolean;version:number;}
export interface MovieAudit {id:number;actor_id:string;changed_at:string;target_kind:string;target_id:string;previous_value:string;new_value:string;reason:string;}

export async function moviesAdminRequest(path:string,init:RequestInit={}) {
  const session=await moviesAuth?.auth.getSession();
  const token=session?.data.session?.access_token;
  if(!token) throw new Error('Sign in to your verified Supabase account to manage theatres.');
  const response=await fetch(`/api/admin/movies/${path}`,{...init,cache:'no-store',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`}});
  const body=await response.json();
  if(!response.ok) throw new Error(response.status===409?'Another admin changed this record. Refresh and retry.':body.error||'Movies request failed');
  return body;
}
