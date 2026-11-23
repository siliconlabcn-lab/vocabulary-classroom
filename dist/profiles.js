import { bankFor } from './words.js?v=20261123';
import { emptyProfile } from './profile-data.js?v=vault-20261123';
import { reconcileVocabulary } from './vocabulary.js?v=vault-20261123';
import { beginScreen } from './lesson.js?v=vault-20261123';

export const ACCOUNT_IDS = [...'ABCDEFG'];
export const PROFILE_STORAGE = 'vocabulary-classroom-profiles-v1';
export const LEGACY_STORAGE = 'vocabulary-classroom-v1';

export const newProfile = emptyProfile;

export function recordVocabulary(profile, lesson) {
  reconcileVocabulary(profile);
  // Include old course selections once, so their untouched words also remain pending.
  for (const item of [lesson, profile.lesson, ...profile.history].filter(Boolean)) {
    if (item.kind === 'vaultReview' || !(Object.keys(item.seen).length || item.picked.length || item.trained.length)) continue;
    rememberBank(profile, item.bank, item.bankUnit);
  }
  reconcileVocabulary(profile);
}

function rememberBank(profile, reference, unit = '') {
  const bank = bankFor(reference);
  if (!bank) return;
  const key = JSON.stringify([bank.id, unit]);
  if (profile.vocabulary.banks.includes(key)) return;
  const words = unit ? bank.words.filter(word=>bank.units?.[unit]?.includes(word.en)) : bank.words;
  profile.pending = [...new Set([...profile.pending, ...words.map(word=>word.en)])];
  profile.vocabulary.banks.push(key);
}

export function prepareScreen(profile, lesson, reference, unit = '') {
  recordVocabulary(profile, lesson);
  beginScreen(lesson, reference, profile.pending, [...profile.learned, ...profile.review], unit);
  rememberBank(profile, reference, unit);
  reconcileVocabulary(profile);
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
