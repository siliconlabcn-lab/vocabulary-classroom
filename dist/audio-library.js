import { RECORDINGS } from './recordings.js?v=20261123';

export function englishRecording(word) {
  return RECORDINGS.en[word] ?? RECORDINGS.en[word?.toLowerCase()] ?? null;
}

export function firstMeaning(text) {
  const cleaned = text
    .replace(/\b(?:n|v|adj|adv|vt|vi|prep|pron|conj|det|num|art|aux|abbr|interj)\.\s*/g, '')
    .replace(/^[\s&./]+/, '')
    .trim();
  let depth = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const character = cleaned[i];
    if ('（('.includes(character)) depth++;
    else if ('）)'.includes(character)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && '；;|，,、'.includes(character)) return cleaned.slice(0, i).trim();
  }
  return cleaned;
}

export function chineseRecording(text) {
  return RECORDINGS.zh[firstMeaning(text)] ?? null;
}
