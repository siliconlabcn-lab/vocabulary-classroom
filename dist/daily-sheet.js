import { lessonId } from './profile-data.js';

const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export const classroomDay = (timestamp=Date.now()) => {
  const parts=Object.fromEntries(dayFormat.formatToParts(timestamp).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export function dailyVocabulary(profile, day=classroomDay(), words={}) {
  const unique=new Map();
  for(const lesson of [profile.lesson,...profile.history].filter(Boolean)){
    const id=lessonId(lesson),previous=unique.get(id);
    if(!previous || (lesson.updatedAt || lesson.completedAt || 0)>=(previous.updatedAt || previous.completedAt || 0))unique.set(id,lesson);
  }
  const lessons=[...unique.values()].filter(lesson=>Number.isFinite(lesson.completedAt) && classroomDay(lesson.completedAt)===day).sort((a,b)=>a.completedAt-b.completedAt);
  const rows=new Map();
  for(const lesson of lessons)for(const word of lesson.trained){
    const en=word.normalize('NFKC').trim();
    if(!en)continue;
    if(!rows.has(en))rows.set(en,{en,meanings:[]});
    const meaning=lesson.definitions?.[word] || words[word]?.zh || '';
    if(meaning && !rows.get(en).meanings.includes(meaning))rows.get(en).meanings.push(meaning);
  }
  return {day,lessonCount:lessons.length,rows:[...rows.values()].map(({en,meanings})=>({en,zh:meanings.join(' / ')}))};
}
