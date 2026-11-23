// Round IDs are immutable: saving, importing or merging a device cannot count a round twice.
export const vocabularyState = () => ({ version: 1, known: [], rounds: {}, banks: [] });
const idOf = lesson => lesson.id || `legacy_${lesson.startedAt}_${lesson.grade}`;
export const repetitionCount = (profile, word) => Math.min(10, profile.vocabulary?.rounds[word]?.length || 0);

export function reconcileVocabulary(profile) {
  const previous = profile.vocabulary || vocabularyState();
  const known = new Set(previous.known);
  const pending = new Set(profile.pending || []);
  const rounds = new Map(Object.entries(previous.rounds).map(([word, ids]) => [word, new Set(ids)]));
  const addRound = (words, id, skipped = []) => {
    const excluded = new Set(skipped);
    for (const word of words) {
      if (excluded.has(word)) continue;
      if (!rounds.has(word)) rounds.set(word, new Set());
      if (rounds.get(word).size < 10) rounds.get(word).add(id);
    }
  };
  for (const lesson of [profile.lesson, ...(profile.history || [])].filter(Boolean)) {
    for (const [word, correct] of Object.entries(lesson.seen || {})) {
      if (correct) known.add(word); else pending.add(word);
    }
    for (const word of [...lesson.picked, ...lesson.trained]) pending.add(word);
    if (!lesson.completedAt) continue;
    addRound(lesson.trained, `study:${idOf(lesson)}`);
    lesson.daily.forEach((day, index) => {
      if (day.completedAt) addRound(lesson.trained, `daily:${idOf(lesson)}:${index}`, day.skipped);
    });
  }
  const session = profile.reviewSession;
  if (session?.completedAt) addRound(session.trained, `review:${idOf(session)}`, session.daily[0]?.skipped);
  // Old learned lists also contain completed lessons. Those become review words;
  // entries without a lesson retain their original learned status.
  for (const word of profile.learned || []) if (!rounds.has(word)) known.add(word);
  const learned = new Set(known);
  const review = [];
  for (const [word, ids] of rounds) {
    if (ids.size >= 10) learned.add(word);
    else if (!known.has(word) && ids.size) review.push(word);
  }
  profile.vocabulary = { version: 1, known: [...known],
    rounds: Object.fromEntries([...rounds].map(([word, ids]) => [word, [...ids].sort().slice(0, 10)])),
    banks: [...new Set(previous.banks)] };
  profile.learned = [...learned];
  profile.review = review;
  const studied = new Set([...learned, ...review]);
  profile.pending = [...pending].filter(word => !studied.has(word));
  return profile;
}
