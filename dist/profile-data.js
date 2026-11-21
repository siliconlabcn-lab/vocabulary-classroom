// Shared by the browser and the cloud API. Only learning data is accepted here.
export const emptyProfile = () => ({ auto: true, grade: 2, lesson: null, history: [], pending: [], learned: [] });
const stages = new Set(['check','checkReport','screen','screenReady','chooseBank','learn','groupReview','listen','box','mixed','all','post','plan','report','daily']);
const strings = value => Array.isArray(value) && value.length <= 20000 && value.every(v => typeof v === 'string' && v.length <= 500);
export function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('档案格式不正确。');
  const p = JSON.parse(JSON.stringify(value));
  if (!Number.isInteger(p.grade) || p.grade < 0 || p.grade > 3 || typeof p.auto !== 'boolean' ||
      !strings(p.pending) || !strings(p.learned) || !Array.isArray(p.history) || p.history.length > 2000) throw new Error('档案格式不正确。');
  for (const lesson of [p.lesson, ...p.history].filter(Boolean)) {
    if (!stages.has(lesson.stage) || !Number.isInteger(lesson.grade) || lesson.grade < 0 || lesson.grade > 3 ||
        !Number.isFinite(lesson.startedAt) || !Number.isInteger(lesson.pos) || lesson.pos < 0 ||
        !['queue','picked','trained','starred','deferred'].every(key => strings(lesson[key])) ||
        !Array.isArray(lesson.groups) || !lesson.groups.every(strings) ||
        !lesson.box || !strings(lesson.box.green) || !strings(lesson.box.red) ||
        !Array.isArray(lesson.daily) || lesson.daily.length > 3 || !lesson.daily.every(day=>day && Number.isFinite(day.due) && strings(day.missed)) ||
        !['diagnostic','seen','post'].every(key => lesson[key] && typeof lesson[key] === 'object' && !Array.isArray(lesson[key]) && Object.values(lesson[key]).every(value=>typeof value==='boolean'))) throw new Error('课堂记录格式不正确。');
  }
  return { auto: p.auto, grade: p.grade, lesson: p.lesson || null, history: p.history,
    pending: [...new Set(p.pending)], learned: [...new Set(p.learned)],
    ...(typeof p.preferredBank === 'string' || typeof p.preferredBank === 'number' ? { preferredBank: p.preferredBank } : {}) };
}

export function lessonId(lesson) { return lesson?.id || `legacy_${lesson?.startedAt}_${lesson?.grade}`; }

export function mergeProfiles(values) {
  const profiles = values.filter(Boolean);
  if (!profiles.length) return emptyProfile();
  const lessons = new Map();
  const pending = new Set();
  const learned = new Set();
  for (const p of profiles) {
    for (const word of p.learned) learned.add(word);
    for (const word of p.pending) pending.add(word);
    for (const lesson of [...p.history, p.lesson].filter(Boolean)) {
      const key = lessonId(lesson);
      const previous = lessons.get(key);
      const stamp = item => item.updatedAt || item.completedAt || item.startedAt;
      if (!previous || stamp(lesson) >= stamp(previous)) lessons.set(key, structuredClone(lesson));
    }
  }
  const ordered = [...lessons.values()].sort((a,b) => b.startedAt - a.startedAt || lessonId(a).localeCompare(lessonId(b)));
  const last = profiles.at(-1);
  return { ...emptyProfile(), auto: last.auto, grade: last.grade,
    ...(last.preferredBank !== undefined ? {preferredBank:last.preferredBank} : {}),
    lesson: ordered[0] || null, history: ordered.slice(1), learned: [...learned],
    pending: [...pending].filter(word => !learned.has(word)) };
}
