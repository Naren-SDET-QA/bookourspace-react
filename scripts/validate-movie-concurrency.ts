import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const quote=(value:string)=>`'${value.replace(/'/g,"''")}'`;
const query=async(sql:string)=>{
  const args=['db','query','--linked','--workdir',process.cwd(),'--output-format','json',sql];
  const {stdout}=process.platform==='win32'
    ? await exec('powershell.exe',['-NoProfile','-Command',`& supabase ${args.map(quote).join(' ')}`],{timeout:60000,maxBuffer:2_000_000})
    : await exec('supabase',args,{timeout:60000,maxBuffer:2_000_000});
  return JSON.parse(stdout).rows;
};
// Same database advisory lock used by visibility edits and permission revocation.
// Two independent remote connections contend; all locks are transaction-scoped.
const holder=query('begin; select pg_advisory_xact_lock(98471,1); select pg_sleep(18); rollback; select true as holder_completed;');
await new Promise(resolve=>setTimeout(resolve,2000));
const contention=await query('select not pg_try_advisory_xact_lock(98471,1) as was_blocked;');
await holder;
assert.equal(contention[0].was_blocked,true,'Second connection must contend with the first.');
const released=await query('select pg_try_advisory_xact_lock(98471,1) as acquired_after_release;');
assert.equal(released[0].acquired_after_release,true);
console.log('PASS: independent remote connections contend for the visibility lock and release it after rollback; no records written.');
