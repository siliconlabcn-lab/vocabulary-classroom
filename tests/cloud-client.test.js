import test from 'node:test';
import assert from 'node:assert/strict';
import { openCloudProfile } from '../dist/cloud-client.js';
import { emptyProfile } from '../dist/profile-data.js';

test('failed save remains recoverable; retry serializes newer progress and logout stops stale writes',async()=>{
  const values=new Map(),listeners=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  globalThis.window={addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
  const nativeFetch=globalThis.fetch;
  let offline=true,release,gate=null;const writes=[];
  globalThis.fetch=async(url,options)=>{
    if(offline)throw new Error('offline');
    if(gate)await gate;
    writes.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
  };
  const user={id:'synthetic-user',name:'测试'};
  const first=openCloudProfile(user,emptyProfile(),()=>{});
  const local=emptyProfile();local.pending=['apple'];first.save(local);
  await assert.rejects(first.flush());
  assert.equal(JSON.parse(values.get(first.key)).pending,true);first.close();
  const resumed=openCloudProfile(user,emptyProfile(),()=>{});
  assert.deepEqual(resumed.profile.pending,['apple']);offline=false;
  gate=new Promise(resolve=>{release=resolve;});const writing=resumed.flush();
  const newer=structuredClone(resumed.profile);newer.pending.push('friend');resumed.save(newer);
  release();gate=null;await writing;
  assert.deepEqual(writes.at(-1).profile.pending,['apple','friend']);
  assert.equal(resumed.pending,false);assert.equal(JSON.parse(values.get(resumed.key)).pending,false);
  resumed.close();assert.equal(listeners.size,0);
  globalThis.fetch=nativeFetch;delete globalThis.window;delete globalThis.localStorage;
});
