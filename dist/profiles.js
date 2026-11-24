import { bankFor } from './words.js?v=20261123';
import { emptyProfile } from './profile-data.js?v=banks-20261124';
import { reconcileVocabulary } from './vocabulary.js?v=banks-20261124';
import { beginScreen } from './lesson.js?v=banks-20261124';

export const ACCOUNT_IDS = [...'ABCDEFG'];
export const PROFILE_STORAGE = 'vocabulary-classroom-profiles-v1';
export const LEGACY_STORAGE = 'vocabulary-classroom-v1';

export const newProfile = emptyProfile;

export function recordVocabulary(profile, lesson) {
  reconcileVocabulary(profile);
  // Include old course selections once, so their untouched words also remain pending.
  for (const item of [lesson, profile.lesson, ...profile.history].filter(Boolean)) {
    if (item.kind === 'vaultReview' || !(Object.keys(item.seen).length || item.picked.length || item.trained.length)) continue;
    for (const unit of item.bankScopes || [item.bankUnit || '']) rememberBank(profile, item.bank, unit);
  }
  reconcileVocabulary(profile);
  // Repair the previous release's candidate lists, which could include words
  // that had never received an answer. Do not alter completed lesson results.
  const studied = new Set([...profile.learned, ...profile.review]);
  const eligible = new Set(profile.vocabulary.unfamiliar.filter(word=>!studied.has(word)));
  for (const item of [lesson, profile.lesson, ...profile.history].filter(Boolean)) {
    if (['screen','screenReady'].includes(item.stage)) item.picked=item.picked.filter(word=>eligible.has(word));
  }
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
  const scopes = Array.isArray(unit) ? unit : [unit || ''];
  const bank = bankFor(reference);
  if (!bank) return;
  const words = wordsInScopes(bank, scopes);
  beginScreen(lesson, reference, profile.vocabulary.unfamiliar, [...profile.learned, ...profile.review], scopes.length===1?scopes[0]:'', words);
  lesson.bankScopes = scopes;
  for (const scope of scopes) rememberBank(profile, reference, scope);
  reconcileVocabulary(profile);
}

function wordsInScopes(bank, scopes) {
  if (scopes.includes('')) return bank.words;
  const selected = new Set(scopes.flatMap(unit=>bank.units?.[unit] || []));
  return bank.words.filter(word=>selected.has(word.en));
}

export function bankProgress(profile, reference, scopes = ['']) {
  const bank = bankFor(reference);
  if (!bank) return null;
  const studied = new Set([...profile.learned, ...profile.review]);
  const screened = new Set(profile.vocabulary.unfamiliar || []);
  const words = [...new Set(wordsInScopes(bank, scopes).map(word=>word.en))];
  const remaining = words.filter(word=>!studied.has(word));
  return {bank, scopes, total:words.length, removed:words.length-remaining.length, remaining,
    unseen:remaining.filter(word=>!screened.has(word)), unfamiliar:remaining.filter(word=>screened.has(word))};
}

export function openedBanks(profile) {
  const groups = new Map();
  for (const key of profile.vocabulary.banks) {
    try {
      const [id, unit] = JSON.parse(key);
      if (!bankFor(id) || typeof unit !== 'string') continue;
      if (!groups.has(id)) groups.set(id,new Set());
      groups.get(id).add(unit);
    } catch { /* Ignore a legacy key that cannot identify a bank. */ }
  }
  return [...groups].map(([id, units])=>bankProgress(profile,id,[...units]));
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
