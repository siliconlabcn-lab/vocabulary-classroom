export const NAV_ITEMS = [
  {id:'prepare',label:'准备上课',icon:'book'},
  {id:'vault',label:'词汇小金库',icon:'star'},
  {id:'pending',label:'待学习词库',icon:'library'},
  {id:'review',label:'待复习巩固',icon:'clock'},
  {id:'print',label:'课程打印',icon:'print'},
  {id:'records',label:'学习记录',icon:'records'},
];
const pages=new Set(['home','classroom',...NAV_ITEMS.map(item=>item.id)]);
export function readRoute(hash='') {
  const [page='home',bank] = hash.replace(/^#/,'').split('/');
  let decoded=null;try{decoded=bank?decodeURIComponent(bank):null;}catch{}
  return {page:pages.has(page)?page:'home',bank:page==='pending'?decoded:null};
}
export function routeHash(page,bank=null) {
  const name=pages.has(page)?page:'home';
  return `#${name}${name==='pending' && bank?`/${encodeURIComponent(bank)}`:''}`;
}
