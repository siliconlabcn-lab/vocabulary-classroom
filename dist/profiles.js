import { WORDS } from './words.js?v=20261123';

export const ACCOUNT_IDS = [...'ABCDEFG'];
export const PROFILE_STORAGE = 'vocabulary-classroom-profiles-v1';
export const LEGACY_STORAGE = 'vocabulary-classroom-v1';

export const newProfile = () => ({ auto: true, grade: 2, lesson: null, history: [], pending: [], learned: [] });

export function recordVocabulary(profile, lesson) {
  if (!lesson) return;
  const learned = new Set(profile.learned);
  if (lesson.completedAt) for (const word of lesson.trained) learned.add(word);
  const pending = new Set([...profile.pending, ...lesson.picked, ...lesson.trained]);
  profile.learned = [...learned].filter(word => Object.hasOwn(WORDS, word));
  profile.pending = [...pending].filter(word => !learned.has(word) && Object.hasOwn(WORDS, word));
}

export function openProfiles(saved, legacy) {
  if (saved?.accounts && ACCOUNT_IDS.every(id => saved.accounts[id])) return saved;
  const database = { accounts: Object.fromEntries(ACCOUNT_IDS.map(id => [id, newProfile()])) };
  if (!legacy) return database;
  const account = database.accounts.A;
  account.auto = legacy.auto ?? account.auto;
  account.grade = legacy.grade ?? account.grade;
  account.lesson = legacy.s ?? null;
  if (account.lesson) {
    account.lesson.deferred ??= [];
    recordVocabulary(account, account.lesson);
  }
  return database;
}
