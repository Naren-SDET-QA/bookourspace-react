import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export interface MovieGateway {
  publicRpc(name: string, args: Record<string, unknown>): Promise<any>;
  verifyToken(token: string): Promise<boolean>;
  userRpc(token: string, name: string, args: Record<string, unknown>): Promise<any>;
}

export function createMovieGateway(): MovieGateway | null {
  const url = process.env.MOVIES_SUPABASE_URL || process.env.VITE_MOVIES_SUPABASE_URL;
  const key = process.env.MOVIES_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_MOVIES_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || key.startsWith('sb_secret_')) return null;
  if (key.startsWith('eyJ')) {
    try { if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon') return null; }
    catch { return null; }
  }
  const client = (token?: string) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  return {
    publicRpc: async (name, args) => client().rpc(name, args),
    verifyToken: async (token) => {
      const { data, error } = await client().auth.getUser(token);
      return !error && Boolean(data.user);
    },
    userRpc: async (token, name, args) => client(token).rpc(name, args),
  };
}

export const movieStates = ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu'] as const;
const kinds = ['theatre','movie','showtime'];
const numberParam = (value: unknown, fallback: number, max: number) => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0 ? Math.min(num,max) : fallback;
};

export function createMovieRouter(gateway: MovieGateway | null = createMovieGateway()) {
  const router = Router();
  const replyError = (res: any, error: any) => {
    const status = error?.code === '40001' ? 409 : error?.code === '42501' ? 403 : error?.code === '22023' ? 400 : error?.code === 'P0002' ? 404 : 503;
    res.status(status).json({ ok:false, error: status === 409 ? 'VISIBILITY_CONFLICT' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'INVALID_REQUEST' : 'MOVIES_UNAVAILABLE', message: status === 409 ? 'This record changed. Refresh before retrying.' : 'Movies request could not be completed.' });
  };
  router.use(['/api/public/movies','/api/admin/movies','/api/movies/inventory'], (_req,res,next) => {
    res.set('Cache-Control','no-store, max-age=0');
    if (!gateway) { res.status(503).json({ok:false,error:'MOVIES_NOT_CONFIGURED'}); return; }
    next();
  });
  const feed = async (req: any,res: any) => {
    try {
      const state=String(req.query.state || '');
      if (state && !movieStates.includes(state as any)) { res.status(400).json({ok:false,error:'INVALID_STATE'}); return; }
      const args={ p_state:state,p_city:String(req.query.city||'').slice(0,100),p_query:String(req.query.q||'').slice(0,120),p_offset:numberParam(req.query.offset,0,100000),p_limit:Math.max(1,numberParam(req.query.limit,30,100)) };
      // Always use an anonymous database client, even when an Admin opens the public endpoint.
      const {data,error}=await gateway!.publicRpc('movies_now_showing',args);
      if(error) { replyError(res,error); return; }
      res.json({ok:true,showtimes:data||[],states:movieStates});
    } catch { replyError(res,null); }
  };
  router.get('/api/public/movies',feed);
  // Retire the legacy unfiltered inventory response (which exposed customer/audit data).
  router.get('/api/movies/inventory',feed);

  router.use('/api/admin/movies',async (req,res,next) => {
    try {
      const token=req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if(!token || !(await gateway!.verifyToken(token))) { res.status(401).json({ok:false,error:'SUPABASE_SIGN_IN_REQUIRED'}); return; }
      const {data,error}=await gateway!.userRpc(token,'movie_admin_access',{});
      if(error) { replyError(res,error); return; }
      res.locals.movieToken=token; res.locals.movieAccess=data;
      if(req.path !== '/access' && !data?.canManageVisibility) { res.status(403).json({ok:false,error:'FORBIDDEN'}); return; }
      next();
    } catch { replyError(res,null); }
  });
  router.get('/api/admin/movies/access',(_req,res) => { res.json({ok:true,access:res.locals.movieAccess}); });
  const rpc = async (res: any,name: string,args: Record<string,unknown>) => {
    try {
      const {data,error}=await gateway!.userRpc(res.locals.movieToken,name,args);
      if(error) { replyError(res,error); return; }
      res.json({ok:true,data});
    } catch { replyError(res,null); }
  };
  router.get('/api/admin/movies/catalog',(req,res) => {
    const kind=String(req.query.kind||'theatre');
    if(!kinds.includes(kind)) { res.status(400).json({ok:false,error:'INVALID_KIND'}); return; }
    void rpc(res,'movie_admin_catalog',{p_kind:kind,p_state:String(req.query.state||''),p_city:String(req.query.city||'').slice(0,100),p_status:String(req.query.status||''),p_query:String(req.query.q||'').slice(0,120),p_offset:numberParam(req.query.offset,0,100000),p_limit:30});
  });
  router.patch('/api/admin/movies/visibility/:kind',(req,res) => {
    const changes=req.body?.changes;
    const reason=String(req.body?.reason||'').trim();
    if(!kinds.includes(String(req.params.kind)) || !Array.isArray(changes) || changes.length<1 || changes.length>100 || reason.length<3 || reason.length>500 || changes.some((c:any)=> typeof c.id!=='string' || typeof c.visible!=='boolean' || !Number.isInteger(c.version) || c.version<0)) {
      res.status(400).json({ok:false,error:'INVALID_VISIBILITY_CHANGE'}); return;
    }
    void rpc(res,'manage_movie_visibility',{p_kind:req.params.kind,p_changes:changes,p_reason:reason});
  });
  router.get('/api/admin/movies/audit',(req,res) => { void rpc(res,'movie_visibility_audit',{p_offset:numberParam(req.query.offset,0,100000),p_limit:50}); });
  router.get('/api/admin/movies/permissions',(_req,res) => {
    if(res.locals.movieAccess?.role!=='super_admin') { res.status(403).json({ok:false,error:'SUPER_ADMIN_REQUIRED'}); return; }
    void rpc(res,'movie_admin_permissions',{});
  });
  router.put('/api/admin/movies/permissions/:userId',(req,res) => {
    if(res.locals.movieAccess?.role!=='super_admin') { res.status(403).json({ok:false,error:'SUPER_ADMIN_REQUIRED'}); return; }
    const {role,allowed,version,reason}=req.body||{};
    if(!/^[a-f0-9-]{36}$/i.test(String(req.params.userId)) || !['admin','super_admin'].includes(role) || typeof allowed!=='boolean' || !Number.isInteger(version) || version < -1 || typeof reason!=='string' || reason.trim().length<3 || reason.length>500) { res.status(400).json({ok:false,error:'INVALID_PERMISSION_CHANGE'}); return; }
    void rpc(res,'manage_movie_admin_permission',{p_user_id:req.params.userId,p_role:role,p_allowed:allowed,p_version:version,p_reason:reason.trim()});
  });
  return router;
}
