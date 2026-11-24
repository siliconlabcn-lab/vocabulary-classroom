import { mergeProfiles } from './profile-data.js?v=banks-20261124';

export async function cloudRequest(action, body, options={}) {
  let response;
  try {
    response=await fetch(`./api/classroom/${action}`,{
      method:body===undefined?'GET':'POST', credentials:'same-origin', cache:'no-store',
      headers:body===undefined?{}:{'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(20000), ...options,
    });
  } catch { throw Object.assign(new Error('暂时无法连接云端，记录已保存在本机，请联网后重试。'),{status:0}); }
  const data=await response.json().catch(()=>null);
  if (!response.ok || !data) throw Object.assign(new Error(data?.error || '此入口暂未提供云端服务，请打开 https://wordclassroom.cn/。'),{status:response.status});
  return data;
}

export function openCloudProfile(user, profile, onStatus) {
  const key=`vocabulary-classroom-cloud-v1:${user.id}`;
  let cached=null;
  try {cached=JSON.parse(localStorage.getItem(key));} catch {}
  let current=cached?.pending ? mergeProfiles([profile,cached.profile]) : profile;
  let pending=Boolean(cached?.pending), closed=false, timer, running=null;
  let lastSaved=pending?'':JSON.stringify(current);
  let version=0;
  const writer=crypto.randomUUID();
  const store=()=>{
    try {localStorage.setItem(key,JSON.stringify({profile:current,pending,updatedAt:Date.now()}));}
    catch {onStatus('本机空间不足，请立即同步或导出档案。',false);}
  };
  const status=(text,ok=false)=>{if(!closed)onStatus(text,ok);};
  async function flush() {
    clearTimeout(timer);
    if (running) {await running; if(pending && !closed)return flush();return;}
    if(!pending || closed)return;
    const sentVersion=version;
    const sent=JSON.stringify(current);
    status('正在同步…');
    running=(async()=>{
      try {
        await cloudRequest('profile',{writer,profile:JSON.parse(sent)});
        if(closed)return;
        lastSaved=sent;
        if(version===sentVersion){pending=false;store();status('已同步',true);}
      } catch(error){status(error.status===401?'登录已过期，记录留在本机，请重新登录。':'未同步 · 本机已保留，点击重试');throw error;}
      finally{running=null;}
    })();
    await running;
    if(pending && !closed)return flush();
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),500);};
  const online=()=>{if(pending)schedule();};
  const leaving=()=>{
    if(!pending || closed)return;
    const body=JSON.stringify({writer:crypto.randomUUID(),profile:current});
    if(new TextEncoder().encode(body).length<60000)fetch('./api/classroom/profile',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
  };
  window.addEventListener('online',online);
  window.addEventListener('pagehide',leaving);
  store();
  status(pending?'有本机记录待同步':'已同步',!pending);
  if(pending)schedule();
  return { key, get profile(){return current;}, get pending(){return pending;},
    save(profile,force=false){
      current=profile;
      if(!force && JSON.stringify(profile)===lastSaved && !pending)return;
      pending=true;version++;store();status('等待同步…');schedule();
    },
    async refresh(){
      await flush();
      const result=await cloudRequest('session');
      if(result.user.id!==user.id)throw new Error('当前账户已改变，请重新登录。');
      current=result.profile;lastSaved=JSON.stringify(current);store();status('已同步',true);
      return current;
    },
    flush,
    close(){closed=true;clearTimeout(timer);window.removeEventListener('online',online);window.removeEventListener('pagehide',leaving);},
  };
}
