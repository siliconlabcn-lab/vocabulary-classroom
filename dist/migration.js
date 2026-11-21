import { verifyPassword } from './accounts.js';
import { emptyProfile, validateProfile } from './profile-data.js';
const select=document.querySelector('#old-account');
const status=document.querySelector('#migration-status');
const entries=[];
const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);
  if(!key.startsWith('vocabulary-classroom-registered-v1:'))continue;
  const entry=read(key);
  if(entry?.name && entry.profile)entries.push({name:entry.name,profile:entry.profile,credentials:entry.credentials});
}
const original=read('vocabulary-classroom-profiles-v1');
for(const name of 'ABCDEFG'){
  const profile=read(`vocabulary-classroom-profiles-v1:${name}`) || original?.accounts?.[name];
  if(profile && !entries.some(e=>e.name.toUpperCase()===name))entries.push({name,profile});
}
const oldest=read('vocabulary-classroom-v1');
if(oldest?.s && !entries.some(e=>e.name.toUpperCase()==='A'))entries.push({name:'A',profile:{...emptyProfile(),auto:oldest.auto??true,grade:oldest.grade??2,lesson:oldest.s}});
select.replaceChildren();
for(const [index,entry] of entries.entries()){
  const option=document.createElement('option');option.value=String(index);option.textContent=entry.name;select.append(option);
}
if(!entries.length){const option=document.createElement('option');option.value='';option.textContent='当前网址下未找到本机旧档案';select.append(option);status.textContent='请在原浏览器、原临时网址打开此页面。';}
const password=document.querySelector('#old-password');
const setMode=()=>{password.required=Boolean(entries[Number(select.value)]?.credentials);password.disabled=!password.required;password.value='';};
select.addEventListener('change',setMode);setMode();
document.querySelector('#migration-form').addEventListener('submit',async event=>{
  event.preventDefault();const entry=entries[Number(select.value)];if(!entry)return;
  const submit=event.target.querySelector('button');submit.disabled=true;
  try{
    if(entry.credentials && !await verifyPassword(password.value,entry.credentials))throw new Error('原账户密码不正确。');
    const profile=structuredClone(entry.profile);
    for(const lesson of [profile.lesson,...profile.history].filter(Boolean))lesson.deferred??=[];
    const data={format:'wordclassroom-profile-v1',name:entry.name,exportedAt:Date.now(),profile:validateProfile(profile)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`单词课堂-${entry.name.replace(/[^\p{L}\p{N}]/gu,'_')}-学习档案.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    status.textContent='档案已导出。请在正式网址登录同名账户，选择“导入旧记录”。';
  }catch(error){status.textContent=error.message || '导出失败。';}
  finally{submit.disabled=false;password.value='';}
});
