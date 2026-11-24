import { GRADES, TRIAL_BANKS, bankFor } from './words.js?v=20261123';

export const STAGES = ['check', 'screen', 'learn', 'box', 'post', 'review'];
export const STAGE_LABELS = ['词汇摸底', '学前筛词', '分组训练', '纸盒与混组', '学后检测', '课后三天复习'];

export const DRILLS = [
  { repeats: 1, meaning: false, cue: '先听一遍英文，你也读一遍。' },
  { repeats: 3, meaning: false, cue: '听三遍英文，跟着读三遍。' },
  { repeats: 1, meaning: true, cue: '听一遍英文和中文，再跟读一遍。' },
  { repeats: 2, meaning: true, cue: '英文和中文连读两遍，现在轮到你。' },
  { repeats: 1, meaning: false, cue: '把中文盖住，听一遍英文，再说英文和中文。' },
];

export const ACTIVITY = {
  check: ['词汇摸底', '听英文，口头读出这个词，再说它的中文意思。'],
  screen: ['学前筛词', '认识的词存入词汇小金库；不会、没想起和未筛选的词留在待学习的词库。'],
  learn: ['单词识记', '先听示范，然后照着重复。'],
  groupReview: ['本组复习', '看英文，说出英文和中文。这组会顺读一遍，再倒序读一遍。'],
  listen: ['听音识词', '先别看词形。听音后说出英文和中文。'],
  box: ['剪纸盒', '读出英文和中文，记住的移到绿盒，忘记的词随后练。'],
  mixed: ['混组检查', '把本轮各组的词打乱，再做两遍回忆。'],
  all: ['全部混组', '把整节课的词打乱，看看离开原顺序还能不能认出来。'],
  post: ['学后检测', '听或看英文，自己说出中文。每个词记录第一次作答。'],
  daily: ['课后复习', '这次自己把英文和中文连读两遍。想不起来就再做一轮带读。'],
};

export const BOX_STAGES = ['box', 'mixed', 'all'];
export const groupFor = stage => ({
  check: 'check', checkReport: 'check', screen: 'screen', screenReady: 'screen', chooseBank: 'screen', learn: 'learn',
  groupReview: 'learn', listen: 'learn', box: 'box', mixed: 'box', all: 'box',
  post: 'post', plan: 'post', report: 'review', daily: 'review',
})[stage];

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function startLesson(grade) {
  const { bank } = GRADES[grade];
  const tiers = [...new Set([Math.max(0, bank - 1), bank, Math.min(TRIAL_BANKS.length - 1, bank + 1)])];
  const count = 12 / tiers.length;
  const queue = tiers.flatMap(tier => shuffle(TRIAL_BANKS[tier].words).slice(0, count).map(word => word.en));
  return {
    id: crypto.randomUUID(), grade, bank, stage: 'check', queue, pos: 0, round: 1, drill: 0, aid: null,
    diagnostic: {}, seen: {}, picked: [], trained: [], groups: [], group: 0,
    box: { green: [], red: [] }, post: {}, daily: [],
    starred: [], deferred: [], startedAt: Date.now(), completedAt: null, time: '19:00',
  };
}

export function move(s, stage, queue = []) {
  Object.assign(s, { stage, queue, pos: 0, drill: 0, round: 1, aid: null });
  if (BOX_STAGES.includes(stage)) s.box = { green: [], red: [] };
}

export function recommendation(s) {
  const results = Object.values(s.diagnostic);
  const rate = results.filter(Boolean).length / results.length;
  const bankDelta = rate >= 0.83 ? 1 : rate < 0.34 ? -1 : 0;
  return Math.min(TRIAL_BANKS.length - 1, Math.max(0, GRADES[s.grade].bank + bankDelta));
}

export function beginScreen(s, reference = s.bank, unfamiliar = [], learned = [], unit = '', scopedWords) {
  const bank = bankFor(reference);
  if (!bank) return;
  const words = scopedWords || (unit ? bank.words.filter(word => bank.units?.[unit]?.includes(word.en)) : bank.words);
  s.definitions = { ...s.definitions, ...Object.fromEntries(bank.words.map(word => [word.en, word.zh])) };
  s.bank = bank.id;
  s.bankUnit = unit;
  const wanted = new Set(words.map(word => word.en));
  const excluded = new Set([...learned, ...s.trained]);
  s.picked = [...new Set(unfamiliar)].filter(word =>
    !excluded.has(word) && wanted.has(word));
  const skipped = new Set([...excluded, ...s.picked, ...Object.keys(s.seen)]);
  const wrong = new Set(Object.keys(s.diagnostic).filter(word => !s.diagnostic[word]));
  const pool = [...wanted].filter(word => !skipped.has(word));
  const queue = [...pool.filter(word => wrong.has(word)), ...pool.filter(word => !wrong.has(word))];
  move(s, queue.length ? 'screen' : 'screenReady', queue);
}

export function chooseTraining(s, count) {
  if (!['screen', 'screenReady'].includes(s.stage) ||
      !Number.isInteger(count) || count < 1 || count > s.picked.length) return false;
  const selected = s.picked.splice(0, count);
  s.groups = [];
  for (let i = 0; i < selected.length; i += 5) s.groups.push(selected.slice(i, i + 5));
  s.trained.push(...selected);
  s.group = 0;
  move(s, 'learn', s.groups[0]);
  return true;
}

function endTraining(s) {
  move(s, 'all', shuffle(s.trained));
}

function screenAnswer(s, correct) {
  const word = s.queue[s.pos];
  s.seen[word] = correct;
  if (!correct && !s.picked.includes(word)) s.picked.push(word);
  s.pos++;
  if (s.pos === s.queue.length) move(s, 'screenReady');
  return { message: correct ? '已存入词汇小金库。' : '已加入待学习的词库。' };
}

function finishBox(s) {
  if (s.stage === 'box') {
    if (s.group + 1 < s.groups.length) {
      s.group++;
      move(s, 'learn', s.groups[s.group]);
      return;
    }
    move(s, 'mixed', shuffle(s.groups.flat()));
    return;
  }
  if (s.stage === 'mixed') {
    endTraining(s);
    return;
  }
  move(s, 'post', shuffle(s.trained));
}

function advance(s) {
  s.pos++;
  if (s.pos < s.queue.length) {
    if (BOX_STAGES.includes(s.stage) && s.round === 3) s.aid = { step: 0 };
    return;
  }
  if (s.stage === 'check') move(s, 'checkReport');
  if (s.stage === 'learn') {
    const group = s.groups[s.group];
    const pattern = group.length === 5 ? [3, 2, 4, 1, 0, 1] : [...group.keys()].reverse();
    move(s, 'groupReview', [...group, ...pattern.map(index => group[index]), ...[...group].reverse()]);
  } else if (s.stage === 'groupReview') {
    const group = s.groups[s.group];
    move(s, 'listen', [...group, ...[...group].reverse()]);
  } else if (s.stage === 'listen') {
    move(s, 'box', s.groups[s.group]);
  } else if (BOX_STAGES.includes(s.stage)) {
    if (s.round === 1) {
      s.box.green = [];
      s.round = 2;
      s.pos = 0;
    } else if (s.round === 2 && s.box.red.length) {
      s.round = 3;
      s.queue = [...s.box.red];
      s.pos = 0;
      s.aid = { step: 0 };
    } else {
      finishBox(s);
    }
  } else if (s.stage === 'post') {
    s.completedAt = Date.now();
    move(s, 'plan');
  } else if (s.stage === 'daily') {
    s.daily[s.day - 1].completedAt = Date.now();
    if (s.kind === 'vaultReview') {
      s.completedAt = s.daily[0].completedAt;
      move(s, 'reviewDone');
    } else move(s, 'report');
  }
}

export function follow(s) {
  if (s.aid) {
    s.aid.step++;
    return;
  }
  if (++s.drill === DRILLS.length) {
    s.drill = 0;
    advance(s);
  }
}

export function judge(s, correct) {
  const word = s.queue[s.pos];
  if (s.stage === 'check') s.diagnostic[word] = correct;
  if (s.stage === 'post') s.post[word] = correct;
  if (s.stage === 'screen') return screenAnswer(s, correct);

  if (s.aid) {
    if (s.aid.step !== 2) return {};
    if (!correct) {
      s.aid.step = 0;
      return { message: '再听一轮，跟着读就好。' };
    }
    s.aid = null;
  } else if (!correct) {
    if (s.stage === 'daily') {
      s.daily[s.day - 1].missed.push(word);
      if (!s.starred.includes(word)) s.starred.push(word);
    }
    if (['groupReview', 'listen', 'daily'].includes(s.stage) || (BOX_STAGES.includes(s.stage) && s.round === 1)) {
      s.aid = { step: 0 };
      return { message: '我们先来两轮带读，再试一次。' };
    }
  }

  if (BOX_STAGES.includes(s.stage)) {
    if (correct) {
      s.box.green.push(word);
      s.box.red = s.box.red.filter(id => id !== word);
    } else {
      s.box.red.push(word);
    }
  }
  const box = BOX_STAGES.includes(s.stage);
  const round = s.round;
  advance(s);
  if (box) return { message: correct ? (round === 1 ? '记住了 · 已推两格' : '记住了 · 已放入绿盒') : '已放入红盒，第二遍结束再练。' };
  if (s.stage === 'check' || s.stage === 'post') return { message: correct ? '答对了，继续。' : '已记录，接着看下一个。' };
  return {};
}

export function deferWord(s) {
  if (s.aid?.step !== 2) return {};
  const word = s.queue[s.pos];
  if (!s.deferred.includes(word)) s.deferred.push(word);
  if (s.stage === 'daily') {
    const day = s.daily[s.day - 1];
    day.skipped = [...new Set([...(day.skipped || []), word])];
  }
  s.aid = null;
  advance(s);
  return { message: '已记入待巩固，接着练下一个。' };
}

export function createPlan(s, time) {
  const [hour, minute] = time.split(':').map(Number);
  s.time = time;
  s.daily = [1, 2, 3].map(day => {
    const date = new Date(s.completedAt);
    date.setDate(date.getDate() + day);
    date.setHours(hour, minute, 0, 0);
    return { due: date.getTime(), missed: [], completedAt: null };
  });
  move(s, 'report');
}

export function beginDaily(s, day) {
  if (!s.daily[day - 1] || s.daily[day - 1].completedAt) return false;
  s.day = day;
  move(s, 'daily', shuffle(s.trained));
  return true;
}

export function startVaultReview(grade, words) {
  const s = startLesson(grade);
  Object.assign(s, { kind: 'vaultReview', trained: [...words], day: 1,
    daily: [{due:Date.now(),missed:[],skipped:[],completedAt:null}] });
  move(s, 'daily', shuffle(words));
  return s;
}
