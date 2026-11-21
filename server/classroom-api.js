import { createHash, randomBytes, randomUUID, pbkdf2 as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { accountName, validAccountName } from '../dist/accounts.js';
import { emptyProfile, mergeProfiles, validateProfile } from '../dist/profile-data.js';

const pbkdf2 = promisify(derive);
const digest = value => createHash('sha256').update(value).digest('hex');
const cookieName = '__Host-classroom';
const privateWrite = { cacheControl: 'private, no-store' };
const sessionLife = 30 * 86400;
class ApiError extends Error { constructor(status,message) { super(message); this.status=status; } }
const fail = (status,message) => { throw new ApiError(status,message); };
const json = (value,status=200,cookie) => new Response(JSON.stringify(value), {status, headers:{
  'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff', 'Vary':'Cookie', ...(cookie ? {'Set-Cookie':cookie} : {}),
}});
const sessionCookie = (token,age=sessionLife) => `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;

export function createClassroomApi(store, { now=Date.now }={}) {
  const get = key => store.get(key,{type:'json',consistency:'strong'});
  const put = (key,value) => store.setJSON(key,value,privateWrite);
  const list = async (prefix,limit=1000) => (await store.list({prefix,limit,consistency:'strong'})).blobs.map(item=>item.key);

  async function users(name) {
    const keys = await list(`users/${digest(name.toLowerCase())}/`,20);
    return (await Promise.all(keys.map(get))).filter(Boolean);
  }
  async function credentials(password, salt=randomBytes(16).toString('hex')) {
    return {salt,verifier:(await pbkdf2(password,Buffer.from(salt,'hex'),600000,32,'sha256')).toString('hex')};
  }
  async function matches(password, saved) {
    if (!saved || !/^[a-f0-9]{32}$/.test(saved.salt) || !/^[a-f0-9]{64}$/.test(saved.verifier)) return false;
    const candidate=await credentials(password,saved.salt);
    return timingSafeEqual(Buffer.from(candidate.verifier,'hex'),Buffer.from(saved.verifier,'hex'));
  }
  async function throttle(ip,kind,limit,period) {
    // Immutable attempts avoid a read/modify/write counter losing simultaneous attempts.
    const bucket=Math.floor(now()/period);
    const prefix=`limits/${digest(ip || 'unknown')}/${kind}/${bucket}/`;
    if ((await list(prefix,limit)).length>=limit) fail(429,'尝试次数较多，请稍后再试。');
    await put(prefix+randomUUID(),{expiresAt:(bucket+1)*period});
  }
  async function readProfile(uid) {
    const keys=await list(`profiles/${uid}/`,2000);
    const records=(await Promise.all(keys.map(get))).filter(Boolean).sort((a,b)=>a.savedAt-b.savedAt);
    return mergeProfiles(records.map(item=>item.profile));
  }
  async function startSession(user) {
    const token=randomBytes(32).toString('hex');
    await put(`sessions/${digest(token)}`,{uid:user.id,name:user.name,expiresAt:now()+sessionLife*1000});
    return {token,user:{id:user.id,name:user.name},profile:await readProfile(user.id)};
  }
  async function authenticate(request) {
    const token=(request.headers.get('Cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) fail(401,'请先登录云端账户。');
    const key=`sessions/${digest(token)}`;
    const session=await get(key);
    if (!session || session.expiresAt<=now()) fail(401,'登录已过期，请重新登录。');
    return {...session,key};
  }
  return async function handle({request,clientIp}) {
    try {
      const url=new URL(request.url);
      const action=url.pathname.split('/').filter(Boolean).at(-1);
      if (request.method==='GET' && action==='health') return json({cloud:true,version:1});
      if (request.method==='GET' && action==='session') {
        const session=await authenticate(request);
        return json({user:{id:session.uid,name:session.name},profile:await readProfile(session.uid)});
      }
      if (request.method!=='POST') fail(405,'请求方式不支持。');
      const origin=request.headers.get('Origin');
      // Makers replaces Host with its internal origin. Fetch Metadata preserves browser same-origin intent.
      // Cross-site JSON is also blocked by the absent CORS/preflight permission and Strict session cookie.
      const fetchSite=request.headers.get('Sec-Fetch-Site');
      const sameSiteOrigin=!origin || origin==='https://wordclassroom.cn' || fetchSite==='same-origin' || origin===url.origin;
      if (!sameSiteOrigin || fetchSite==='cross-site') fail(403,'请在当前网站内操作。');
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415,'请求格式不正确。');
      const text=await request.text();
      if (Buffer.byteLength(text)>1024*1024) fail(413,'档案超过大小限制，请联系老师处理。');
      let body; try { body=JSON.parse(text); } catch { fail(400,'请求格式不正确。'); }
      if (!body || typeof body!=='object' || Array.isArray(body)) fail(400,'请求格式不正确。');
      if (action==='register' || action==='login') {
        if (typeof body.name!=='string' || typeof body.password!=='string') fail(400,'请输入姓名和密码。');
        const name=accountName(body.name), password=body.password;
        if (!validAccountName(name) || password.length<8 || password.length>256) fail(400,'姓名最多 60 个字符，密码至少 8 个字符。');
        await throttle(clientIp,action,action==='register'?8:30,action==='register'?3600000:600000);
        const registered=await users(name);
        let user;
        if (action==='register') {
          if (registered.length) fail(409,'这个姓名已注册云端账户，请登录或使用其他姓名。');
          let initial=emptyProfile();
          if(body.profile)try{initial=validateProfile(body.profile);}catch(e){fail(400,e.message);}
          user={id:randomUUID(),name,credentials:await credentials(password),createdAt:now()};
          // Never overwrite a username key. Separate immutable IDs also isolate racing registrations.
          await put(`users/${digest(name.toLowerCase())}/${user.id}`,user);
          await put(`profiles/${user.id}/initial`,{profile:initial,savedAt:now()});
        } else {
          for (const candidate of registered) if (await matches(password,candidate.credentials)) { user=candidate;break; }
          if (!user) { if (!registered.length) await credentials(password,'0'.repeat(32));fail(401,'账户姓名或密码不正确。'); }
        }
        const session=await startSession(user);
        return json({user:session.user,profile:session.profile},action==='register'?201:200,sessionCookie(session.token));
      }
      const session=await authenticate(request);
      if (action==='logout') { await store.delete(session.key);return json({ok:true},200,sessionCookie('',0)); }
      if (action==='profile') {
        if (!/^[a-f0-9-]{36}$/.test(body.writer || '')) fail(400,'设备标识不正确，请刷新。');
        let profile;try {profile=validateProfile(body.profile);} catch(e) { fail(400,e.message); }
        // Each browser tab writes its own snapshot. A stale device cannot replace another device's data.
        await put(`profiles/${session.uid}/${body.writer}`,{profile,savedAt:now()});
        return json({ok:true,savedAt:now()});
      }
      fail(404,'接口不存在。');
    } catch(error) {
      if (error instanceof ApiError) return json({error:error.message},error.status);
      return json({error:'云端暂时不可用，未同步的记录仍保留在本机，请稍后重试。'},503);
    }
  };
}
