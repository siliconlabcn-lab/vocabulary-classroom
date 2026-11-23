import {readFileSync,writeFileSync} from 'node:fs';
import {WORDS} from '../dist/words.js';
const data=JSON.parse(readFileSync(new URL('../data/curriculum-2022.json',import.meta.url)));
const additions={empress:'女皇',lab:'实验室',Olympic:'奥林匹克的','per cent':'百分之',
 sixth:'第六',seventh:'第七',tenth:'第十',eleventh:'第十一',thirteenth:'第十三',fourteenth:'第十四',fifteenth:'第十五',sixteenth:'第十六',seventeenth:'第十七',eighteenth:'第十八',nineteenth:'第十九',fortieth:'第四十',fiftieth:'第五十',sixtieth:'第六十',seventieth:'第七十',eightieth:'第八十',ninetieth:'第九十',hundredth:'第一百'};
const folded=new Map(Object.entries(WORDS).map(([en,word])=>[en.toLowerCase(),word]));
function entries(words){return words.map(en=>{
  const zh=additions[en] || WORDS[en]?.zh || folded.get(en.toLowerCase())?.zh;
  if(!zh)throw new Error(`Missing definition: ${en}`);
  return [en,zh];
});}
const banks=[
 ['pep-primary-all-2022','人教版新课标小学全阶段必备词汇',data.primary],
 ['curriculum-zhongkao-all-2022','新课标中考全阶段必备词汇',data.middle],
].map(([id,label,core])=>({id,label,group:'新课标全阶段',source:data.publisher,official:data.official,
  note:id.startsWith('pep-')?'按2022课标二级基础词汇整理，供人教版小学全阶段学习；含数词、月份和星期。':'按2022课标三级词表整理，包含小学基础词汇及初中阶段词汇，另含数词、月份和星期。',
  units:{'课标基础词汇':core,'数词、月份和星期':data.supplement},entries:entries([...new Set([...core,...data.supplement])])}));
writeFileSync(new URL('../dist/curriculum-banks.js',import.meta.url),'export const CURRICULUM_BANKS = '+JSON.stringify(banks)+';\n');
console.log(banks.map(b=>({id:b.id,count:b.entries.length})));
