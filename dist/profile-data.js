import { reconcileVocabulary, vocabularyState } from './vocabulary.js?v=banks-20261124';
// Shared by the browser and the cloud API. Only learning data is accepted here.
export const emptyProfile = () => ({ auto: true, grade: 2, lesson: null, history: [], pending: [], learned: [], review: [], vocabulary: vocabularyState(), reviewSession: null });
const stages = new Set(['check','checkReport','screen','screenReady','chooseBank','learn','groupReview','listen','box','mixed','all','post','plan','report','daily','reviewDone']);
const strings = value => Array.isArray(value) && value.length <= 20000 && value.every(v => typeof v === 'string' && v.length <= 500);
export function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('档案格式不正确。');
  const p = JSON.parse(JSON.stringify(value));
  if (!Number.isInteger(p.grade) || p.grade < 0 || p.grade > 3 || typeof p.auto !== 'boolean' ||
      !strings(p.pending) || !strings(p.learned) || !Array.isArray(p.history) || p.history.length > 2000) throw new Error('档案格式不正确。');
  if (p.vocabulary !== undefined && (!p.vocabulary || p.vocabulary.version !== 1 ||
      !strings(p.vocabulary.known) || !strings(p.vocabulary.banks) ||
      (p.vocabulary.unfamiliar !== undefined && !strings(p.vocabulary.unfamiliar)) ||
      !p.vocabulary.rounds || typeof p.vocabulary.rounds !== 'object' || Array.isArray(p.vocabulary.rounds) ||
      Object.keys(p.vocabulary.rounds).length > 20000 || !Object.entries(p.vocabulary.rounds).every(([word, ids]) => word.length <= 500 && strings(ids) && ids.length <= 10))) throw new Error('词汇小金库格式不正确。');
  for (const lesson of [p.lesson, ...p.history, p.reviewSession].filter(Boolean)) {
    if (!stages.has(lesson.stage) || !Number.isInteger(lesson.grade) || lesson.grade < 0 || lesson.grade > 3 ||
        !Number.isFinite(lesson.startedAt) || !Number.isInteger(lesson.pos) || lesson.pos < 0 ||
        !['queue','picked','trained','starred','deferred'].every(key => strings(lesson[key])) ||
        (lesson.bankScopes !== undefined && !strings(lesson.bankScopes)) ||
        !Array.isArray(lesson.groups) || !lesson.groups.every(strings) ||
        !lesson.box || !strings(lesson.box.green) || !strings(lesson.box.red) ||
        !Array.isArray(lesson.daily) || lesson.daily.length > 3 || !lesson.daily.every(day=>day && Number.isFinite(day.due) && strings(day.missed) && (day.skipped === undefined || strings(day.skipped))) ||
        !['diagnostic','seen','post'].every(key => lesson[key] && typeof lesson[key] === 'object' && !Array.isArray(lesson[key]) && Object.values(lesson[key]).every(value=>typeof value==='boolean'))) throw new Error('课堂记录格式不正确。');
  }
  if (p.reviewSession && (p.reviewSession.kind !== 'vaultReview' || !['daily','reviewDone'].includes(p.reviewSession.stage) || p.reviewSession.day !== 1 || p.reviewSession.daily.length !== 1)) throw new Error('复习记录格式不正确。');
  return reconcileVocabulary({ auto: p.auto, grade: p.grade, lesson: p.lesson || null, history: p.history,
    pending: [...new Set(p.pending)], learned: [...new Set(p.learned)],
    ...(p.vocabulary ? {vocabulary:p.vocabulary} : {}), reviewSession:p.reviewSession || null,
    ...(typeof p.preferredBank === 'string' || typeof p.preferredBank === 'number' ? { preferredBank: p.preferredBank } : {}) });
}

export function lessonId(lesson) { return lesson?.id || `legacy_${lesson?.startedAt}_${lesson?.grade}`; }

export function mergeProfiles(values) {
  const profiles = values.filter(Boolean).map(p => reconcileVocabulary(structuredClone(p)));
  if (!profiles.length) return emptyProfile();
  const lessons = new Map();
  const pending = new Set();
  const learned = new Set();
  const vocabulary = vocabularyState();
  const rounds = new Map();
  let reviewSession = null;
  for (const p of profiles) {
    for (const word of p.learned) learned.add(word);
    for (const word of p.pending) pending.add(word);
    vocabulary.known.push(...p.vocabulary.known);
    vocabulary.unfamiliar.push(...p.vocabulary.unfamiliar);
    vocabulary.banks.push(...p.vocabulary.banks);
    for (const [word, ids] of Object.entries(p.vocabulary.rounds)) {
      if (!rounds.has(word)) rounds.set(word, new Set());
      for (const id of ids) rounds.get(word).add(id);
    }
    if (p.reviewSession && (!reviewSession || (p.reviewSession.updatedAt || p.reviewSession.startedAt) >= (reviewSession.updatedAt || reviewSession.startedAt))) reviewSession = structuredClone(p.reviewSession);
    for (const lesson of [...p.history, p.lesson].filter(Boolean)) {
      const key = lessonId(lesson);
      const previous = lessons.get(key);
      const stamp = item => item.updatedAt || item.completedAt || item.startedAt;
      if (!previous || stamp(lesson) >= stamp(previous)) lessons.set(key, structuredClone(lesson));
    }
  }
  const ordered = [...lessons.values()].sort((a,b) => b.startedAt - a.startedAt || lessonId(a).localeCompare(lessonId(b)));
  const last = profiles.at(-1);
  vocabulary.known = [...new Set(vocabulary.known)];
  vocabulary.unfamiliar = [...new Set(vocabulary.unfamiliar)];
  vocabulary.banks = [...new Set(vocabulary.banks)];
  vocabulary.rounds = Object.fromEntries([...rounds].map(([word, ids])=>[word,[...ids].sort().slice(0,10)]));
  return reconcileVocabulary({ ...emptyProfile(), auto: last.auto, grade: last.grade, vocabulary, reviewSession,
    ...(last.preferredBank !== undefined ? {preferredBank:last.preferredBank} : {}),
    lesson: ordered[0] || null, history: ordered.slice(1), learned: [...learned],
    pending: [...pending] });
}
