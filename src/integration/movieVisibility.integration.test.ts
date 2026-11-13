import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {createMovieRouter,type MovieGateway} from '../server/movieRoutes';

test('Movies HTTP API uses anonymous public reads and authenticated permission-checked mutations',async()=>{
  let visible=true;let version=0;const calls:Array<{name:string;token?:string}>=[];
  const gateway:MovieGateway={
    publicRpc:async(name)=>{calls.push({name});return {data:visible?[{showtime_id:'s1',title:'Test movie'}]:[]};},
    verifyToken:async token=>['admin','super','customer','owner'].includes(token),
    userRpc:async(token,name,args)=>{
      calls.push({name,token});
      if(name==='movie_admin_access')return {data:{role:token==='super'?'super_admin':token==='admin'?'admin':'none',canManageVisibility:token==='admin'||token==='super'}};
      if(name==='manage_movie_visibility'){
        const change=(args.p_changes as any[])[0];
        if(change.version!==version)return {error:{code:'40001'}};
        visible=change.visible;version++;return {data:1};
      }
      if(name==='movie_admin_permissions')return {data:[]};
      return {data:[]};
    },
  };
  const app=express();app.use(express.json());app.use(createMovieRouter(gateway));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const port=(server.address() as any).port;
  const request=(route:string,token?:string,init:RequestInit={})=>fetch(`http://127.0.0.1:${port}${route}`,{...init,headers:{'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  try{
    assert.equal((await request('/api/admin/movies/catalog')).status,401);
    assert.equal((await request('/api/admin/movies/catalog','forged-local-admin')).status,401);
    assert.equal((await request('/api/admin/movies/catalog','customer')).status,403);
    assert.equal((await request('/api/admin/movies/catalog','owner')).status,403);
    assert.equal((await request('/api/admin/movies/permissions','admin')).status,403);
    assert.equal((await request('/api/admin/movies/permissions','super')).status,200);
    const publicResponse=await request('/api/public/movies','admin');
    assert.match(publicResponse.headers.get('cache-control')||'',/no-store/);
    assert.equal((await publicResponse.json()).showtimes.length,1);
    assert.deepEqual(calls.filter(call=>call.name==='movies_now_showing'),[{name:'movies_now_showing'}]);
    assert.equal((await request('/api/public/movies?state=Invalid')).status,400);
    assert.equal((await request('/api/admin/movies/visibility/theatre','admin',{method:'PATCH',body:JSON.stringify({changes:[{id:'t1',visible:false,version:0}],reason:''})})).status,400);
    const race=await Promise.all([0,1].map(()=>request('/api/admin/movies/visibility/theatre','admin',{method:'PATCH',body:JSON.stringify({changes:[{id:'t1',visible:false,version:0}],reason:'Maintenance closure'})})));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    assert.deepEqual((await (await request('/api/public/movies')).json()).showtimes,[]);
    assert.deepEqual((await (await request('/api/movies/inventory')).json()).showtimes,[]);
    assert.equal((await request('/api/public/movies',undefined,{method:'POST'})).status,404);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('Movies fails closed when the database is not configured',async()=>{
  const app=express();app.use(createMovieRouter(null));const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try{const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/public/movies`);assert.equal(response.status,503);assert.equal((await response.json()).error,'MOVIES_NOT_CONFIGURED');}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
