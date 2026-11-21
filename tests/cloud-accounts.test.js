import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClassroomApi } from '../server/classroom-api.js';
import { emptyProfile, mergeProfiles, validateProfile } from '../dist/profile-data.js';
import { startLesson } from '../dist/lesson.js';

function memoryStore(){
  const data=new Map();return {data,async get(key){return structuredClone(data.get(key)??null);},async setJSON(key,value){data.set(key,structuredClone(value));},async delete(key){data.delete(key);},async list({prefix,limit=Infinity}){return {blobs:[...data.keys()].filter(key=>key.startsWith(prefix)).sort().slice(0,limit).map(key=>({key}))};}};
}
function client(api,cookie=''){
  return async (action,body,origin='https://wordclassroom.cn')=>{
    const response=await api({clientIp:'test-device',request:new Request(`https://wordclassroom.cn/api/classroom/${action}`,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
}
const password='Synthetic-only-Account-9876';
test('two independent browser sessions share lessons; stale device cannot erase other records',async()=>{
  const store=memoryStore(),api=createClassroomApi(store),a=client(api),b=client(api);
  assert.equal((await a('register',{name:'共享测试',password})).status,201);
  assert.equal((await b('login',{name:'共享测试',password})).status,200);
  const first=emptyProfile();first.lesson=startLesson(2);first.lesson.startedAt=100;first.lesson.diagnostic.apple=true;first.learned=['apple'];
  assert.equal((await a('profile',{writer:randomUUID(),profile:first})).status,200);
  assert.equal((await b('session')).data.profile.lesson.diagnostic.apple,true);
  const second=emptyProfile();second.lesson=startLesson(2);second.lesson.startedAt=200;second.pending=['apple','friend'];
  assert.equal((await b('profile',{writer:randomUUID(),profile:second})).status,200);
  const all=(await a('session')).data.profile;
  assert.equal(all.lesson.startedAt,200);assert.equal(all.history[0].startedAt,100);
  assert.deepEqual(all.learned,['apple']);assert.deepEqual(all.pending,['friend']);
  assert.equal((await a('session')).headers.get('cache-control'),'private, no-store, max-age=0');
});
test('account isolation, incorrect passwords, forged user IDs, logout, CSRF and duplicate names',async()=>{
  const api=createClassroomApi(memoryStore()),a=client(api),b=client(api),anonymous=client(api);
  const one=await a('register',{name:'A学员',password});
  assert.match(one.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await b('register',{name:'B学员',password})).status,201);
  assert.equal((await anonymous('register',{name:'A学员',password})).status,409);
  assert.equal((await anonymous('login',{name:'A学员',password:'wrong-password'})).status,401);
  assert.equal((await anonymous('profile',{writer:randomUUID(),profile:emptyProfile()})).status,401);
  const p=emptyProfile();p.learned=['apple'];
  assert.equal((await a('profile',{writer:randomUUID(),uid:'B学员',profile:p})).status,200);
  assert.deepEqual((await b('session')).data.profile.learned,[]);
  assert.equal((await a('profile',{writer:randomUUID(),profile:p},'https://attacker.invalid')).status,403);
  assert.equal((await a('logout',{})).status,200);assert.equal((await a('session')).status,401);
});
test('invalid migration cannot leave an unusable account; expired sessions are rejected',async()=>{
  let now=100000;const api=createClassroomApi(memoryStore(),{now:()=>now}),a=client(api);
  assert.equal((await a('register',{name:'迁移测试',password,profile:{}})).status,400);
  assert.equal((await a('register',{name:'迁移测试',password,profile:emptyProfile()})).status,201);
  now+=31*86400000;assert.equal((await a('session')).status,401);
});
test('repeated import deduplicates historical lessons and keeps original scores',()=>{
  const old=emptyProfile();old.lesson=startLesson(2);old.lesson.post.apple=false;old.lesson.updatedAt=100;
  const advanced=structuredClone(old);advanced.lesson.updatedAt=200;advanced.lesson.post.friend=true;
  const merged=mergeProfiles([old,advanced,old]);
  assert.equal(merged.history.length,0);assert.equal(merged.lesson.post.apple,false);assert.equal(merged.lesson.post.friend,true);
  assert.throws(()=>validateProfile({...old,grade:-1}));
});
test('simultaneous same-name registrations never overwrite another account credentials or profile',async()=>{
  const api=createClassroomApi(memoryStore()),a=client(api),b=client(api);
  const results=await Promise.all([a('register',{name:'并发测试',password}),b('register',{name:'并发测试',password:password+'B'})]);
  const successful=results.filter(result=>result.status===201);
  assert.equal(new Set(successful.map(r=>r.data.user.id)).size,successful.length);
  if(successful.length===2){
    const p=emptyProfile();p.learned=['apple'];await a('profile',{writer:randomUUID(),profile:p});
    assert.deepEqual((await b('session')).data.profile.learned,[]);
    assert.equal((await client(api)('login',{name:'并发测试',password})).data.user.id,results[0].data.user.id);
    assert.equal((await client(api)('login',{name:'并发测试',password:password+'B'})).data.user.id,results[1].data.user.id);
  }
});
