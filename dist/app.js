import { BANKS, GRADES, WORDS, bankFor } from './words.js?v=20261123';
import { RECORDINGS } from './recordings.js?v=20261123';
import { englishRecording, chineseRecording } from './audio-library.js?v=20261123';
import { playPronunciation, stopPronunciation } from './audio-player.js';
import { accountName, registeredKey, validAccountName, verifyPassword } from './accounts.js';
import { ACCOUNT_IDS, LEGACY_STORAGE, PROFILE_STORAGE, newProfile, openProfiles, recordVocabulary, prepareScreen } from './profiles.js?v=vault-20261123';
import { cloudRequest, openCloudProfile } from './cloud-client.js?v=vault-20261123';
import { mergeProfiles, validateProfile, lessonId } from './profile-data.js?v=vault-20261123';
import { repetitionCount } from './vocabulary.js?v=vault-20261123';
import { classroomDay, dailyVocabulary } from './daily-sheet.js';
import {
  ACTIVITY, BOX_STAGES, DRILLS, STAGES, STAGE_LABELS, beginDaily, chooseTraining,
  createPlan, deferWord, follow, groupFor, judge, move, recommendation, startLesson, startVaultReview,
} from './lesson.js?v=vault-20261123';

const root = document.querySelector('#classroom');
const sidebar = document.querySelector('#sidebar');
const notice = document.querySelector('#notice');
const paper = document.querySelector('#print');
const soundToggle = document.querySelector('.sound-toggle');
const accountToggle = document.querySelector('#switch-account');
const escape = text => String(text).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);
const button = (label, action, style = 'primary', extra = '') =>
  `<button type="button" class="${style}" data-action="${action}" ${extra}>${label}</button>`;
const numberCorrect = values => Object.values(values).filter(Boolean).length;
const percent = (correct, count) => count ? Math.round(correct * 100 / count) + '%' : '—';
const wordPills = words => words.map(id => `<span>${escape(id)} <small>${escape(wordFor(id).zh)}</small></span>`).join('');

function readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function startingProfile(name) {
  const legacyId = name.toUpperCase();
  if (!ACCOUNT_IDS.includes(legacyId)) return newProfile();
  const savedProfiles = openProfiles(readStorage(PROFILE_STORAGE), readStorage(LEGACY_STORAGE));
  return readStorage(`${PROFILE_STORAGE}:${legacyId}`) ?? savedProfiles.accounts[legacyId];
}

let account = null;
let registering = false;
let formName = '';
let prefs = null;
let s = null;
let showHome = true;
let showReview = false;
let libraryQuery = '';
let sheetDay = classroomDay();
let reveal = false;
let clock;
let deadline;
let toast;
let busy = false;
let audioUnavailable = false;
let wordAudio = null;
let cloud = null;
let syncText = '云端账户';
let syncOkay = false;
let lessonPrints = new Map();

function syncStatus(text, okay) {
  syncText = text; syncOkay = okay;
  const output=document.querySelector('#sync-status');
  if(output){output.textContent=text;output.dataset.saved=String(okay);}
}

function rememberLessons() {
  lessonPrints = new Map([prefs.lesson,...prefs.history,prefs.reviewSession].filter(Boolean).map(lesson=>{
    const {updatedAt,...content}=lesson;return [lessonId(lesson),JSON.stringify(content)];
  }));
}

function openAccount(result) {
  cloud?.close();
  cloud=openCloudProfile(result.user,result.profile,syncStatus);
  account={key:cloud.key,entry:{name:result.user.name,profile:cloud.profile},id:result.user.id};
  prefs=account.entry.profile;recordVocabulary(prefs,prefs.lesson);s=prefs.lesson;rememberLessons();
  if(result.needsUpload)cloud.save(prefs,true);
  showHome=true;formName='';registering=false;
  update({autoplay:false,jump:true});
}

function save() {
  if (!account) return;
  if(s){
    const {updatedAt,...content}=s;
    const print=JSON.stringify(content), id=lessonId(s);
    if(lessonPrints.get(id)!==print){s.updatedAt=Date.now();lessonPrints.set(id,print);}
  }
  recordVocabulary(prefs, s);
  cloud?.save(prefs);
}

function notify(message) {
  if (!message) return;
  notice.textContent = message;
  notice.classList.add('visible');
  clearTimeout(toast);
  toast = setTimeout(() => notice.classList.remove('visible'), 2600);
}

function playRecordings(parts) {
  stopSound();
  if (!parts.length) return;
  setBusy(true);
  playPronunciation(parts, {
    onFinish: () => setBusy(false),
    onError: error => {
      setBusy(false);
      if (error?.name === 'NotAllowedError') {
        notify('点击播放按钮，开始语音示范。');
        return;
      }
      audioUnavailable = true;
      if (s?.stage === 'listen') {
        render();
        document.querySelector('[data-action="play"]')?.focus();
      }
      notify('音频加载失败，点击播放可重试。');
    },
  });
}

function setBusy(value) {
  busy = value;
  const play = document.querySelector('[data-action="play"]');
  const sample = document.querySelector('[data-action="sample"]');
  if (play) play.textContent = value ? '停止播放' : '♪ 播放发音示范';
  if (sample) sample.textContent = value ? '停止试听' : '♪ 试听发音';
}

function stopSound() {
  stopPronunciation();
  setBusy(false);
}

function wordFor(id) {
  const word = WORDS[id];
  return word && s?.definitions?.[id] ? { en: id, zh: s.definitions[id] } : word;
}

function currentWord() { return wordFor(s?.queue[s.pos]); }

function playWord() {
  const word = currentWord();
  const english = wordAudio;
  if (!english) return;
  const chinese = chineseRecording(word.zh);
  const parts = [];
  const drill = s.stage === 'learn' ? DRILLS[s.drill] : null;
  const aid = s.aid && s.aid.step < 2;
  for (let i = 0; i < (aid ? 2 : drill?.repeats ?? 1); i++) {
    parts.push(english);
    if (drill?.meaning && chinese) parts.push(chinese);
  }
  if (aid && chinese) parts.push(chinese);
  playRecordings(parts);
}

function side() {
  sidebar.hidden = !account;
  if (!account) return;
  const active = showHome ? -1 : s.kind === 'vaultReview' ? 5 : STAGES.indexOf(groupFor(s.stage));
  const hasStats = s && !showHome;
  const completed = hasStats && (s.stage === 'reviewDone' || s.stage === 'report' && s.daily.every(day => day.completedAt));
  const wordCount = hasStats ? s.trained.length : 0;
  sidebar.innerHTML = `
    <div class="side-label">课堂流程</div>
    <ol class="steps">${STAGE_LABELS.map((label, i) => `
      <li class="${i === active && !completed ? 'active' : ''} ${i < active || completed ? 'done' : ''}" ${i === active && !completed ? 'aria-current="step"' : ''}>
        <span class="step-num">${i < active || completed ? '✓' : '0' + (i + 1)}</span><span>${label}</span>
      </li>`).join('')}</ol>
    ${hasStats ? `<div class="side-summary"><span>${wordCount ? '本课训练' : '候选生词'}</span><strong>${wordCount || s.picked.length}<small> 词</small></strong></div>${button('← 返回学员首页','home','quiet back')}` : '<p class="side-hint">先找出生词，再开口练习。<br>课后用三次回忆巩固。</p>'}
  `;
}

function login() {
  if(location.hostname.endsWith('.github.io'))return `<section class="login-panel">
    ${intro('单词练习室','课堂已迁到正式网址','现在的云端账号和学习记录统一保存在正式课堂。')}
    <p><a href="https://wordclassroom.cn/">进入正式课堂 wordclassroom.cn</a></p>
    <p>如果以前在这个网址学习，请先<a href="migration.html">导出本机旧档案</a>，再到正式课堂导入。</p>
  </section>`;
  return `<section class="login-panel">
    ${intro('单词练习室', registering ? '注册学员账户' : '学员登录',
      registering ? '设置登录姓名和密码，建立自己的学习档案。' : '输入注册时使用的姓名和密码。')}
    <form id="account-form" class="account-form">
      <label for="account-name">账户姓名</label>
      <input id="account-name" name="name" type="text" autocomplete="username" maxlength="60" required value="${escape(formName)}">
      <label for="account-password">密码</label>
      <input id="account-password" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" maxlength="256" ${registering ? 'minlength="8" aria-describedby="password-help"' : ''} required>
      ${registering ? '<p id="password-help">至少 8 个字符。</p><label for="confirm-password">确认密码</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" maxlength="256" required>' : ''}
      <p id="account-error" role="alert" hidden></p>
      <div class="buttons">
        <button type="submit" class="primary">${registering ? '注册并登录' : '登录'}</button>
        ${button(registering ? '返回登录' : '注册新账户', 'account-mode', 'secondary')}
      </div>
    </form>
    <p class="login-guidance">学员登陆使用请点复习巩固，开新课请找老师</p>
  </section>`;
}

async function submitAccount(form) {
  const fields = new FormData(form);
  const name = accountName(fields.get('name'));
  const password = fields.get('password');
  const error = form.querySelector('#account-error');
  const showError = message => {
    error.textContent = message;
    error.hidden = false;
  };
  if (!validAccountName(name)) {
    showError('请输入有效的账户姓名，最多 60 个字符。');
    return;
  }
  if (registering && password !== fields.get('confirmation')) {
    showError('两次输入的密码不一致。');
    return;
  }

  const key = registeredKey(name);
  const submit = form.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  error.hidden = true;
  try {
    let entry = readStorage(key);
    if (registering) {
      if (entry) {
        showError('这个账户姓名已注册，请直接登录或使用其他姓名。');
        return;
      }
    }
    let result;
    if(registering)result=await cloudRequest('register',{name,password,profile:startingProfile(name)});
    else {
      let legacyValid=entry?.credentials && await verifyPassword(password,entry.credentials);
      try {result=await cloudRequest('login',{name,password});}
      catch(error){
        if(error.status!==401 || !legacyValid)throw error;
        result=await cloudRequest('register',{name,password,profile:validateProfile(entry.profile)});
      }
      if(legacyValid && !readStorage(`vocabulary-classroom-upgraded:${result.user.id}`)){
        result.profile=mergeProfiles([result.profile,validateProfile(entry.profile)]);
        result.needsUpload=true;
      }
    }
    if (!form.isConnected) return;
    openAccount(result);
    if(entry?.profile){
      await cloud.flush();
      localStorage.setItem(`vocabulary-classroom-upgraded:${result.user.id}`,'1');
    }
  } catch(error) {
    if(form.isConnected)showError(error.message || '云端登录失败，请稍后重试。');
    else notify('本机旧记录尚未同步成功，请点击“同步记录”重试。');
  } finally {
    submit.disabled = false;
  }
}

function studentRecords() {
  const records = [prefs.lesson, ...prefs.history];
  const summary = records.map((lesson, index) => {
    if (!lesson) return '';
    const date = lesson.completedAt ?? lesson.startedAt;
    const label = date ? recordDate.format(date) : '进行中的课堂';
    const subtitle = lesson.completedAt
      ? `学后答对 ${numberCorrect(lesson.post)} / ${lesson.trained.length} 词 · 已复习 ${lesson.daily.filter(day => day.completedAt).length} 天`
      : `${STAGE_LABELS[STAGES.indexOf(groupFor(lesson.stage))] ?? '学前筛词'} · 已选或练习 ${lesson.picked.length + lesson.trained.length} 词`;
    return `<div class="record"><div><strong>${label} · ${GRADES[lesson.grade].name}</strong><p>${subtitle}</p></div>
      ${button(lesson.completedAt ? '查看成绩' : '继续学习', 'record', 'secondary', `data-index="${index}"`)}</div>`;
  }).join('');
  return `<section class="panel account-storage">
    <h2>我的云端档案</h2><p id="sync-status" role="status" data-saved="${syncOkay}">${escape(syncText)}</p>
    <p>换设备后，用同一个姓名和密码登录。开始另一台设备的学习前，请先同步。</p>
    <div class="buttons">${button('同步记录','sync','secondary')}${button('导出备份','export-profile','secondary')}${button('导入旧记录','import-profile','secondary')}</div>
    <input type="file" id="profile-file" accept="application/json,.json" hidden>
    <p class="local-note"><a href="migration.html">临时网址旧记录迁移说明</a></p>
  </section>${vocabularyPanel()}
  <section class="panel"><h2>学习记录</h2>${summary || '<p>开始上课后，这里会保留课堂和成绩。</p>'}</section>`;
}

function vocabularyPanel() {
  const buckets = [
    ['词汇小金库', prefs.learned, '筛词时已认识，或累计完成 10 轮学习与复习的词。', 'gold'],
    ['待学习的词库', prefs.pending, '不会、没想起、未筛选和未选入本轮的词都会保留，下次选同一词库可直接开练。', 'pending'],
    ['待复习巩固', prefs.review, '完整学完新课记 1 次；每完成一轮复习再记 1 次，累计 10 次自动存入小金库。', 'review'],
  ];
  const query = libraryQuery.trim().toLowerCase();
  return `<section class="panel vocabulary-panel" id="my-vocabulary"><div class="section-heading"><div><h2>我的词汇小金库</h2><p>每个学员独立保存，换设备登录后可继续积累。</p></div></div>
    <form id="library-search" class="library-search"><label class="field">查找词汇<input name="query" value="${escape(libraryQuery)}" placeholder="输入英文或中文释义" maxlength="100"></label><button type="submit" class="secondary">查找</button></form>
    <div class="libraries vault-libraries">${buckets.map(([label, words, text, key])=>{
      const filtered=words.filter(word=>!query || word.toLowerCase().includes(query) || wordFor(word).zh.toLowerCase().includes(query));
      return `<details class="library-${key}" ${query?'open':''}><summary><span>${label}</span><strong>${words.length} 词</strong></summary><p>${text}</p>
        ${filtered.length?`<div class="pills">${filtered.slice(0,60).map(word=>`<span>${escape(word)} <small>${escape(wordFor(word).zh)}${key==='review'?` · ${repetitionCount(prefs,word)} / 10 次`:''}</small>${key==='review'?button('复习此词','review-word','card-link',`data-word="${escape(word)}" aria-label="复习 ${escape(word)}"`):''}</span>`).join('')}</div>`:'<p>暂无词汇。</p>'}
        ${filtered.length>60?`<p>显示前 60 / ${filtered.length} 词，可输入英文或中文查找其余词汇。</p>`:''}</details>`;
    }).join('')}</div>
    ${prefs.review.length?`<form id="vault-review" class="choice-actions"><label class="field">本轮复习词数<input type="number" name="count" min="1" max="${prefs.review.length}" value="${Math.min(10,prefs.review.length)}" required inputmode="numeric"></label><button class="primary" type="submit">开始一轮巩固</button><p>优先复习累计次数较少的词。</p></form>`:''}
    ${prefs.reviewSession && !prefs.reviewSession.completedAt ? button('继续未完成的巩固','resume-vault','secondary') : ''}
  </section>`;
}

function openVault(words) {
  if (prefs.reviewSession && !prefs.reviewSession.completedAt) {
    s=prefs.reviewSession;
    showHome=false;update({jump:true,message:'先继续未完成的这一轮，完成后再开新一轮。'});return;
  }
  if (!words.length) return;
  prefs.reviewSession=startVaultReview(prefs.grade,words);
  s=prefs.reviewSession;showHome=false;update({jump:true});
}

function reviewDone() {
  const promoted=s.trained.filter(word=>prefs.learned.includes(word));
  const skipped=s.daily[0].skipped || [];
  return `${intro('复习巩固','这一轮巩固完成了','本轮进度已保存。未完成补练的词保留在待复习巩固，不增加次数。')}
    <section class="panel"><h2>${promoted.length} 个词已在词汇小金库</h2><div class="pills">${s.trained.map(word=>`<span>${escape(word)} <small>${skipped.includes(word)?'本轮待继续巩固':`${repetitionCount(prefs,word)} / 10 次${prefs.learned.includes(word)?' · 已学会':''}`}</small></span>`).join('')}</div>
    <div class="buttons">${button('返回复习巩固','review-hub')}${button('返回学员首页','home','secondary')}</div></section>`;
}

function home() {
  return `
    <section class="welcome">
      <div class="welcome-copy">
        <span class="eyebrow"><span class="dot"></span> 学员 ${escape(account.entry.name)}</span>
        <h1>跟读、回忆，<br>把生词变成熟词。</h1>
        <p>先摸清自己认识哪些词，再跟着陪练开口。从第一轮跟读到课后三天复习，都在这里完成。</p>
        <div class="buttons">${button('复习巩固','review-hub')}${button('词汇小金库','open-vocabulary','secondary')}</div>
        <p>已学会 ${prefs.learned.length} 词 · 待学习 ${prefs.pending.length} 词 · 待复习巩固 ${prefs.review.length} 词</p>
      </div>
      <div class="tiles" aria-hidden="true">
        <div class="tile tile-back"><b>Recall.</b></div>
        <div class="tile tile-front"><small>♪</small><b>Listen.</b><em>听音 · 跟读</em></div>
        <span class="tile-check">✓</span>
      </div>
    </section>
    <section class="setup">
      <div class="section-heading"><div><h2>准备上课</h2><p>选一个学段。先播放示例，确认能听清。</p></div>${button('♪ 试听发音','sample','secondary')}</div>
      <fieldset class="grades"><legend class="sr-only">选择学段</legend>
      ${GRADES.map((grade, index) => `
        <label class="grade"><input type="radio" name="grade" value="${index}" ${index === prefs.grade ? 'checked' : ''}>
        <span><strong>${grade.name}</strong><small>建议 ${grade.total} 个生词</small></span></label>`).join('')}
      </fieldset>
      ${bankPicker(prefs.preferredBank, '', true)}
      <div class="setup-foot"><p>口头作答，学生自评或由老师代判。课堂进度自动保存到云端。</p>
        <div class="buttons">
        ${button('老师开新课','start','secondary')}${prefs.lesson ? button(prefs.lesson.completedAt ? '查看上节课报告' : '继续上节课','resume','secondary') : ''}
        </div>
      </div>
    </section>
    ${dailyPrintPanel()}${studentRecords()}`;
}

function dailyPrintPanel() {
  const sheet=dailyVocabulary(prefs,sheetDay,WORDS);
  return `<section class="panel daily-print"><h2>当天课程合并打印</h2><p>将当天已完成的新课合并成一张词汇表，重复单词只列一次。</p>
    <div class="print-options"><label class="field">上课日期（北京时间）<input id="sheet-day" type="date" value="${escape(sheetDay)}" required></label>
    <label class="field">打印内容<select id="daily-sheet-mode"><option value="both">中英文对照</option><option value="en">仅英文</option><option value="zh">仅中文</option></select></label></div>
    <p id="daily-sheet-summary">${sheet.lessonCount} 节已完成课程 · ${sheet.rows.length} 个词汇</p>
    ${button('预览并打印当天词汇表','print-day','secondary',sheet.rows.length?'':'disabled')}
    ${!sheet.rows.length?'<p class="local-note">所选日期还没有已完成新课的训练词汇。</p>':''}</section>`;
}

function reviewHub() {
  const records=[prefs.lesson,...prefs.history];
  const completed=records.map((lesson,index)=>({lesson,index})).filter(({lesson})=>lesson?.completedAt);
  return `${intro('词汇积累小达人','复习巩固','从待复习巩固里继续练习，累计 10 轮即可存入词汇小金库。')}${vocabularyPanel()}
    <section class="panel">${completed.length?completed.map(({lesson,index})=>`<div class="record"><div><strong>${recordDate.format(lesson.completedAt)} · ${lesson.trained.length} 个词汇</strong><p>已复习 ${lesson.daily.filter(day=>day.completedAt).length} 天</p></div>${button('复习这节课','review-record','secondary',`data-index="${index}"`)}</div>`).join(''):'<p>还没有已完成的课程。开新课请找老师。</p>'}</section>
    ${dailyPrintPanel()}${button('返回学员首页','home','secondary')}`;
}

function intro(label, title, detail) {
  return `<div class="page-head"><span class="eyebrow"><span class="dot"></span>${label}</span><h1 tabindex="-1">${title}</h1><p>${detail}</p></div>`;
}

function coach(text) {
  return `<div class="coach"><div class="coach-icon" aria-hidden="true">声</div><div><strong>模拟陪练</strong><p>${text}</p></div></div>`;
}

function bankDetails(bank) {
  if (!bank) return '';
  return `<p><strong>${bank.words.length} 个词和短语</strong>${bank.note ? ` · ${escape(bank.note)}` : ''}
    ${bank.source ? ` <a href="${escape(bank.source)}" target="_blank" rel="noopener">词库来源</a>` : ''}
    ${bank.official ? ` <a href="${escape(bank.official)}" target="_blank" rel="noopener">官方资料</a>` : ''}</p>`;
}

function bankUnits(bank, selectedUnit = '') {
  const units = Object.keys(bank?.units ?? {});
  return units.length ? `<label class="field">筛词范围 <select id="unit-choice" aria-label="筛词范围">
    <option value="">整册</option>${units.map(unit => `<option value="${escape(unit)}" ${unit === selectedUnit ? 'selected' : ''}>${escape(unit)}</option>`).join('')}
  </select></label>` : '';
}

function bankPicker(defaultRef, buttonLabel, allowAuto = false) {
  const defaultBank = bankFor(defaultRef);
  const groups = new Map();
  for (const bank of BANKS) {
    if (!groups.has(bank.group)) groups.set(bank.group, []);
    groups.get(bank.group).push(bank);
  }
  return `<div class="bank-picker">
    <label class="field">选择词库 <select id="bank-choice" aria-label="选择词库" ${allowAuto ? 'data-preference' : ''}>
      ${allowAuto ? '<option value="">摸底后推荐</option>' : ''}
      ${[...groups].map(([group, banks]) => `<optgroup label="${escape(group)}">
        ${banks.map(bank => `<option value="${bank.id}" ${bank.id === defaultBank?.id ? 'selected' : ''}>${escape(bank.label)} · ${bank.words.length} 词</option>`).join('')}
      </optgroup>`).join('')}
    </select></label>
    <div id="bank-details" aria-live="polite">${bankDetails(defaultBank)}</div>
    ${allowAuto ? '' : `<div id="bank-units">${bankUnits(defaultBank, s.bankUnit)}</div>${button(buttonLabel,'screen')}`}
  </div>`;
}

function chooseBank() {
  return `${intro('学前筛词', '选择学习词库', '筛词结果会保存。选过的词库，下次直接从待学习的词库中选择本轮词数。')}
    <section class="panel">${bankPicker(s.bank, '继续筛词 →')}</section>`;
}

function checkReport() {
  const bank = recommendation(s);
  const correct = numberCorrect(s.diagnostic);
  return `${intro('词汇摸底','摸底结果','这是一份十二词小测，用来挑选本节课的起始词库。')}
    <div class="metrics">
      <div><span>认识词数</span><strong>${correct}<small> / 12</small></strong></div>
      <div><span>本次命中率</span><strong>${percent(correct, 12)}</strong></div>
      <div><span>建议词库</span><strong class="metric-text">${escape(bankFor(bank).label)}</strong></div>
    </div>
    <section class="panel">
      ${coach('接下来我们挑出还不熟悉的词。认不出来很正常，正好拿来练。')}
      ${bankPicker(prefs.preferredBank || bank, '开始学前筛词 →')}
    </section>`;
}

function trainingChoice() {
  const available = s.picked.length;
  const count = Math.min(available, s.countPreference ?? GRADES[s.grade].total);
  const remainder = available - count;
  return `<section class="panel training-choice">
    <div class="section-heading"><div><h2>决定本轮练几个</h2><p>本次可选 ${available} 个待学习词汇。按下方顺序选入本轮，剩下的留到下次。</p></div></div>
    ${available ? `<form id="training-choice">
      <div class="pills candidate-words">${s.picked.map((id, i) => `<span class="${i < count ? 'selected-word' : ''}">${escape(id)} <small>${escape(wordFor(id).zh)}</small></span>`).join('')}</div>
      <div class="choice-actions">
        <label class="field">本轮词数 <input type="number" name="count" inputmode="numeric" min="1" max="${available}" step="1" value="${count}" required></label>
        <button type="submit" class="primary" id="begin-training">开始训练 ${count} 个词 →</button>
        <p id="remaining-words" aria-live="polite">${remainder} 个生词留到下次</p>
      </div>
    </form>` : '<p>把一个词标为“不会”后，就可以选择本轮词数。</p>'}
  </section>`;
}

function screenReady() {
  return `${intro('待学习的词库', '选择本轮学习词数', '认识的词已存入小金库；其余词汇已保留，不用重复筛词。')}
    ${s.picked.length ? trainingChoice() : '<section class="panel"><p>当前范围没有待学习词汇，可到“复习巩固”继续积累。</p></section>'}
    ${button('前往复习巩固','review-hub','secondary')}
    ${button('更换词库继续筛词', 'choose-bank', 'secondary')}`;
}

function exercise() {
  const [label, description] = ACTIVITY[s.stage];
  const word = currentWord();
  const box = BOX_STAGES.includes(s.stage);
  const drill = s.stage === 'learn' ? DRILLS[s.drill] : null;
  const aid = s.aid && s.aid.step < 2;
  const englishRecorded = Boolean(wordAudio);
  const chineseRecorded = Boolean(chineseRecording(word.zh));
  const listening = s.stage === 'listen' && englishRecorded && !audioUnavailable && !aid && !reveal;
  const canFollow = drill || aid;
  const study = drill || ['groupReview', 'listen', 'box'].includes(s.stage);
  const total = s.queue.length;
  const count = s.pos + 1;
  const subtitle = box ? (s.round === 3 ? '红盒返练' : `第 ${s.round} / 2 遍`) : drill ? `跟读 ${s.drill + 1} / 5` : s.stage === 'daily' ? s.kind==='vaultReview' ? `累计 ${repetitionCount(prefs,word.en)} / 10 次` : `第 ${s.day} 天` : s.stage === 'screen' ? bankFor(s.bank)?.label ?? '词库' : '';
  const instruction = aid ? `补练 ${s.aid.step + 1} / 2。听两遍英文${chineseRecorded ? '、一遍中文' : '，再看中文释义'}，然后自己读一遍。` :
    s.aid ? '盖住中文再试一次。听英文，自己说出英文和中文。' :
    drill ? (drill.meaning && !chineseRecorded
      ? `听 ${drill.repeats} 遍英文，结合卡片上的中文释义跟读。`
      : drill.cue) : s.stage === 'check' && s.pos === 0 ? '先确认声音听得清。认识就说出意思，想不起来可以选“不会”。' :
    box && s.round === 2 ? '忘记的词先放入红盒，等这一遍结束后再集中带读。' :
    description;
  const prompt = listening ? '<span class="listen-word">♪</span><span class="listen-text">闭眼听音</span>' : escape(word.en);
  const wordMeaning = aid || drill?.meaning || reveal;
  const field = (study && s.groups.length > 1) ? ` · 第 ${s.group + 1} / ${s.groups.length} 组` : '';
  const header = s.stage === 'daily' ? `抗遗忘 · ${subtitle}` : GRADES[s.grade].name + field;
  return `${intro(header,label,description)}
    <section class="exercise">
      <div class="exercise-top"><span>${subtitle || '口头作答'}</span><span class="counter">${count} <small>/ ${total}</small></span></div>
      <div class="track" role="progressbar" aria-label="当前环节题目" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${count}"><i style="width:${count / total * 100}%"></i></div>
      <div class="word-stage">
        ${s.stage === 'check' ? '<span id="timer" class="timer">10 秒思考</span>' : ''}
        <div class="word ${listening ? 'audio-only' : ''}" ${listening ? '' : 'lang="en"'}>${prompt}</div>
        ${wordMeaning ? `<div class="meaning">${escape(word.zh)}</div>` : '<div class="meaning muted"> </div>'}
        <div class="buttons centered">
        ${englishRecorded ? button('♪ 播放发音示范','play','audio') :
          '<span class="recording-note">当前词录音未加载，请刷新后重试</span>'}
        ${!canFollow ? button(reveal ? '隐藏释义' : '核对释义','reveal','card-link') : ''}
        </div>
      </div>
      ${coach(englishRecorded ? instruction :
        (canFollow ? '读出卡片上的单词，再按提示完成本轮。' : '看英文，说出这个词和它的中文意思。'))}
      <div class="answer-row">
        ${s.stage === 'screen' ? button('更换词库', 'choose-bank', 'secondary') : ''}
        ${s.stage === 'screen' ? button('结束筛词，选择本轮词数', 'finish-screen', 'secondary') : ''}
        ${s.stage === 'screen' && s.picked.length ? button('设置本轮词数 ↓', 'choose-count', 'secondary choose-count') : ''}
        ${canFollow ? button('跟读完成 →','follow') :
          button(s.stage === 'screen' || s.stage === 'check' ? '我认识 ✓' : '答对了 ✓','yes','answer-good') +
          button(box && s.round === 2 ? '放入红盒' : '不会 / 没想起','no','answer-miss')}
        ${s.aid?.step === 2 ? button('留待课后巩固','defer','secondary') : ''}
      </div>
      ${box ? `<div class="boxes"><div class="green-box"><span>绿盒</span><strong>${s.box.green.length}<small> 词</small></strong></div><div class="red-box"><span>红盒</span><strong>${s.box.red.length}<small> 词</small></strong></div></div>` : ''}
    </section>
    ${s.stage === 'screen' ? trainingChoice() : ''}
    <p class="shortcuts">${canFollow ? '快捷键 1 跟读完成' : '快捷键 1 答对 · 2 不会'} · 3 重播</p>`;
}

function plan() {
  const correct = numberCorrect(s.post);
  return `${intro('学后检测','这节课，你记住了多少？','这些词在学前都被标为不熟悉。下方统计来自当堂检测的首次作答。')}
    <div class="metrics">
      <div><span>练习词数</span><strong>${s.trained.length}</strong></div>
      <div><span>首次答对</span><strong>${correct}</strong></div>
      <div><span>当堂正确率</span><strong>${percent(correct,s.trained.length)}</strong></div>
    </div>
    <form id="plan" class="panel">
      <h2>安排三天复习</h2><p>从明天起，每天回到这里口头练一遍今天的词。</p>
      <label class="field">每日复习时间 <input type="time" name="time" value="${s.time}" required></label>
      <button type="submit" class="primary">生成复习计划 →</button>
    </form>`;
}

const recordDate = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
function report() {
  const correct = numberCorrect(s.post);
  const missed = s.trained.filter(word => !s.post[word]);
  const finished = s.daily.filter(day => day.completedAt).length;
  const focus = [...new Set([...missed, ...s.starred, ...s.deferred])];
  return `${intro('课堂报告',finished === 3 ? '三天复习已完成' : '词汇积累小达人 · 本课已完成','复习安排、当堂检测和需要巩固的词都在这里。')}
    <div class="metrics">
      <div><span>摸底认识</span><strong>${numberCorrect(s.diagnostic)}<small> / 12</small></strong></div>
      <div><span>学后答对</span><strong>${correct}<small> / ${s.trained.length}</small></strong></div>
      <div><span>课后复习</span><strong>${finished}<small> / 3 天</small></strong></div>
    </div>
    <section class="panel schedule">
      <div class="section-heading"><div><h2>三天抗遗忘</h2><p>每次读两遍英文和中文，忘记的词会自动收藏。</p></div></div>
      ${s.daily.map((day, i) => `<div class="day"><div class="day-num">0${i + 1}</div><div><strong>第 ${i + 1} 天</strong><p>${dateFormat.format(day.due)} · ${timeFormat.format(day.due)}${day.completedAt ? ` · 首轮忘记 ${day.missed.length} 词` : ''}</p></div>
      ${day.completedAt ? `<span class="completed">✓ ${day.completedAt < day.due ? '提前完成' : '已完成'}</span>` :
      button(Date.now() < day.due ? '提前练习' : '开始复习','daily','secondary',`data-day="${i + 1}" aria-label="第 ${i + 1} 天${Date.now() < day.due ? '提前练习' : '开始复习'}"`)}</div>`).join('')}
    </section>
    <section class="panel">
      <h2>待巩固单词</h2>
      ${focus.length ? `<div class="pills">${wordPills(focus)}</div>` : '<p>目前没有错词或课后遗忘词。</p>'}
      <div class="report-actions"><label class="field">复习讲义 <select id="sheet"><option value="both">中英文对照</option><option value="en">仅英文</option><option value="zh">仅中文</option></select></label>
      <div class="buttons">${button('打印 / 存为 PDF','print','secondary')}${button('复制课后反馈','copy','secondary')}</div></div>
    </section>`;
}

function empty() {
  return `${intro('学前筛词','示例词库中没有筛到生词','你可以返回首页，重新开启一节课并选择更高学段。')}${button('返回首页','home')}`;
}

function showCredits() {
  const list = document.querySelector('#recording-credits');
  list.innerHTML = ['en', 'zh'].map(lang => {
    const entries = Object.entries(RECORDINGS[lang]);
    const generated = entries.filter(([, recording]) => recording[5]?.voice);
    const recorded = entries.filter(([, recording]) => !recording[5]?.voice);
    return `<h3>${lang === 'en' ? '英文' : '中文'}</h3>
      ${generated.length ? `<p>${generated.length} 条自然合成语音 · ${escape(generated[0][1][5].voice)}
        <a href="https://www.microsoft.com/edge/features/read-aloud" target="_blank" rel="noopener">语音来源</a></p>` : ''}
      <ul>${recorded.map(([word, [, artist, license, licenseUrl, source]]) => `
        <li><a href="${escape(source)}" target="_blank" rel="noopener">${escape(word)}</a> ·
        ${escape(artist)} · ${licenseUrl ? `<a href="${escape(licenseUrl)}" target="_blank" rel="noopener">${escape(license)}</a>` : escape(license)}</li>`).join('')}</ul>`;
  }).join('');
}

document.querySelector('#recording-source').addEventListener('toggle', event => {
  if (event.currentTarget.open) showCredits();
});

function render() {
  side();
  document.body.classList.toggle('logged-out', !account);
  if (!account) {
    root.innerHTML = login();
    return;
  }
  accountToggle.textContent = '退出登录';
  soundToggle.textContent = `自动播报 · ${prefs.auto ? '开' : '关'}`;
  soundToggle.setAttribute('aria-pressed', prefs.auto);
  if (showHome) root.innerHTML = showReview ? reviewHub() : home();
  else {
    root.innerHTML = ({ checkReport, plan, report, empty, screenReady, chooseBank, reviewDone }[s.stage] || exercise)();
    if (busy) setBusy(true);
  }
}

function countdown(reset = true) {
  clearInterval(clock);
  const timer = document.querySelector('#timer');
  if (!timer) return;
  if (reset) deadline = Date.now() + 10000;
  const tick = () => {
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timer.textContent = seconds ? seconds + ' 秒思考' : '时间到，可继续作答';
    if (!seconds) clearInterval(clock);
  };
  clock = setInterval(tick, 250);
  tick();
}

function update({ message, autoplay = true, focus = true, jump = false } = {}) {
  stopSound();
  reveal = false;
  audioUnavailable = false;
  wordAudio = null;
  const word = account && !showHome ? currentWord() : null;
  if (word) {
    wordAudio = englishRecording(word.en);
  }
  save();
  render();
  countdown();
  if (focus) {
    (root.querySelector('h1[tabindex]') || root.querySelector('[data-action="start"]'))?.focus({ preventScroll: true });
  }
  if (jump) root.scrollIntoView({ block: 'start' });
  notify(message);
  if (wordAudio && autoplay && prefs.auto) playWord();
}

function printSheet() {
  const mode = document.querySelector('#sheet').value;
  const en = mode !== 'zh';
  const zh = mode !== 'en';
  paper.innerHTML = `<h1>词汇复习讲义</h1><p>${en && zh ? '中英文对照' : en ? '看英文，写中文' : '看中文，拼英文'}</p><ol>${s.trained.map(id => `<li><span>${en ? escape(id) : '________________'}</span><span>${zh ? escape(wordFor(id).zh) : '________________'}</span></li>`).join('')}</ol>`;
  window.print();
}

function previewDailySheet() {
  const sheet=dailyVocabulary(prefs,sheetDay,WORDS);
  if(!sheet.rows.length){notify('所选日期没有可打印的已完成课程。');return;}
  const mode=document.querySelector('#daily-sheet-mode').value,en=mode!=='zh',zh=mode!=='en';
  const html=`<h1>词汇积累小达人 · 当天词汇表</h1><p>学员：${escape(account.entry.name)}　日期：${escape(sheet.day)}（北京时间）</p><p>${sheet.lessonCount} 节新课合并 · ${sheet.rows.length} 个词汇 · ${en&&zh?'中英文对照':en?'看英文，写中文':'看中文，写英文'}</p>
    <table class="vocabulary-table"><thead><tr><th>序号</th><th>${en?'单词':'英文默写'}</th><th>${zh?'中文释义':'中文默写'}</th></tr></thead><tbody>${sheet.rows.map((word,index)=>`<tr><td>${index+1}</td><td>${en?escape(word.en):'________________'}</td><td>${zh?escape(word.zh):'________________'}</td></tr>`).join('')}</tbody></table>`;
  paper.innerHTML=html;
  const dialog=document.querySelector('#sheet-preview');
  dialog.innerHTML=`<div class="preview-actions">${button('打印 / 存为 PDF','confirm-day-print')}${button('关闭预览','close-sheet','secondary')}</div><div class="sheet-content">${html}</div>`;
  dialog.showModal();
}

async function copyFeedback() {
  const lesson = s;
  const correct = numberCorrect(s.post);
  const summary = [
    '词汇积累小达人学习反馈',
    `摸底认识 ${numberCorrect(s.diagnostic)} / 12 个示例词。`,
    `课堂练习了 ${s.trained.length} 个学前不熟悉的词，学后首次答对 ${correct} 个，正确率 ${percent(correct, s.trained.length)}。`,
    `待巩固：${[...new Set([...s.trained.filter(word => !s.post[word]), ...s.starred, ...s.deferred])].map(word => `${word}（${WORDS[word].zh}）`).join('、') || '暂无'}。`,
    ...s.daily.map((day, index) => `复习第 ${index + 1} 天：${dateFormat.format(day.due)} ${timeFormat.format(day.due)}，${day.completedAt ? `已完成，首轮忘记 ${day.missed.length} 词` : '待完成'}。`),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(summary);
    notify('课后反馈已复制。');
  } catch {
    if (s !== lesson) return;
    const area = document.createElement('textarea');
    area.value = summary;
    area.readOnly = true;
    area.setAttribute('aria-label', '课后反馈');
    root.append(area);
    area.focus();
    area.select();
    notify('请手动复制已选中的反馈。');
  }
}

document.addEventListener('change', async event => {
  if(event.target.id==='sheet-day'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))return;
    sheetDay=event.target.value;
    const panel=event.target.closest('.daily-print');panel.outerHTML=dailyPrintPanel();return;
  }
  if(event.target.id==='profile-file'){
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error('档案文件超过 8MB。');
      const data=JSON.parse(await file.text());
      if(data.format!=='wordclassroom-profile-v1')throw new Error('请选择单词课堂导出的档案文件。');
      if(accountName(data.name).toLowerCase()!==accountName(account.entry.name).toLowerCase())throw new Error('档案姓名与当前账户不同，请先登录对应账户。');
      const imported=validateProfile(data.profile);
      if(!confirm(`将“${data.name}”的旧记录合并到当前云端账户？现有记录会保留。`))return;
      prefs=mergeProfiles([imported,prefs]);account.entry.profile=prefs;s=prefs.lesson;rememberLessons();
      save();await cloud.flush();update({autoplay:false,message:'旧记录已合并并保存到云端。'});
    }catch(error){notify(error.message || '档案导入失败。');}
    finally{event.target.value='';}
    return;
  }
  if (event.target.name === 'grade') {
    prefs.grade = Number(event.target.value);
    save();
  } else if (event.target.id === 'bank-choice') {
    const bank = bankFor(event.target.value);
    document.querySelector('#bank-details').innerHTML = bankDetails(bank);
    const unitPicker = document.querySelector('#bank-units');
    if (unitPicker) unitPicker.innerHTML = bankUnits(bank);
    if (event.target.hasAttribute('data-preference')) {
      prefs.preferredBank = event.target.value;
      save();
    }
  }
});

document.addEventListener('input', event => {
  const input = event.target;
  if (input.form?.id !== 'training-choice') return;
  const count = input.valueAsNumber;
  const valid = input.validity.valid;
  const submit = document.querySelector('#begin-training');
  submit.disabled = !valid;
  submit.textContent = valid ? `开始训练 ${count} 个词 →` : '开始训练';
  document.querySelector('#remaining-words').textContent =
    valid ? `${s.picked.length - count} 个生词留到下次` : `请输入 1 到 ${s.picked.length} 之间的整数`;
  document.querySelectorAll('.candidate-words > span').forEach((chip, index) => {
    chip.classList.toggle('selected-word', valid && index < count);
  });
  if (valid) {
    s.countPreference = count;
    save();
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'library-search') {
    event.preventDefault();libraryQuery=String(new FormData(event.target).get('query'));render();document.querySelector('#my-vocabulary')?.scrollIntoView({block:'start'});
  } else if (event.target.id === 'vault-review') {
    event.preventDefault();const count=Number(new FormData(event.target).get('count'));
    if(!Number.isInteger(count) || count<1 || count>prefs.review.length)return;
    openVault([...prefs.review].sort((a,b)=>repetitionCount(prefs,a)-repetitionCount(prefs,b)).slice(0,count));
  } else if (event.target.id === 'account-form') {
    event.preventDefault();
    submitAccount(event.target);
  } else if (event.target.id === 'training-choice') {
    event.preventDefault();
    const count = Number(new FormData(event.target).get('count'));
    if (!chooseTraining(s, count)) return;
    update({ jump: true, message: `本轮训练 ${count} 个词，其余生词已保留。` });
  } else if (event.target.id === 'plan') {
    event.preventDefault();
    createPlan(s, new FormData(event.target).get('time'));
    update();
  }
});

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  switch (target.dataset.action) {
    case 'account-mode':
      formName = document.querySelector('#account-name').value;
      registering = !registering;
      render();
      document.querySelector('#account-name').focus();
      break;
    case 'switch':
      save();
      target.disabled=true;
      try{await cloud?.flush();await cloudRequest('logout',{});}catch{notify('未同步的记录仍在本机，下次登录可重试。');}
      cloud?.close();cloud=null;
      target.disabled=false;
      account = null;
      prefs = null;
      s = null;
      registering = false;
      showHome = true;
      showReview = false;
      libraryQuery = '';
      paper.replaceChildren();
      clearTimeout(toast);
      notice.classList.remove('visible');
      notice.textContent = '';
      update({ autoplay: false, jump: true });
      break;
    case 'sync':
      target.disabled=true;
      try{
        save();const refreshed=await cloud.refresh();
        prefs=refreshed;account.entry.profile=prefs;s=prefs.lesson;rememberLessons();
        update({autoplay:false,message:'云端记录已同步。'});
      }catch(error){notify(error.message);}finally{target.disabled=false;}
      break;
    case 'export-profile': {
      const data={format:'wordclassroom-profile-v1',name:account.entry.name,exportedAt:Date.now(),profile:prefs};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`单词课堂-${account.entry.name.replace(/[^\p{L}\p{N}]/gu,'_')}-学习档案.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      break;
    }
    case 'import-profile':
      document.querySelector('#profile-file').click();break;
    case 'sound':
      prefs.auto = !prefs.auto;
      if (!prefs.auto) stopSound();
      save();
      soundToggle.textContent = `自动播报 · ${prefs.auto ? '开' : '关'}`;
      soundToggle.setAttribute('aria-pressed', prefs.auto);
      break;
    case 'sample':
      if (busy) stopSound();
      else playRecordings(['apple', 'friend'].map(englishRecording).filter(Boolean));
      break;
    case 'start':
      showReview = false;
      if (prefs.lesson) prefs.history.unshift(prefs.lesson);
      s = startLesson(prefs.grade);
      prefs.lesson = s;
      if (bankFor(prefs.preferredBank)) prepareScreen(prefs,s,prefs.preferredBank);
      showHome = false;
      update({ jump: true });
      break;
    case 'resume':
    case 'record':
      s = target.dataset.action === 'resume' || Number(target.dataset.index) === 0
        ? prefs.lesson : prefs.history[Number(target.dataset.index) - 1];
      if (!s) break;
      showHome = false;
      update({ jump: true });
      break;
    case 'home':
      s = prefs.lesson;
      showHome = true;
      showReview = false;
      update({ autoplay: false, jump: true });
      break;
    case 'review-hub':
      showHome=true;showReview=true;update({autoplay:false,jump:true});break;
    case 'open-vocabulary':
      document.querySelector('#my-vocabulary')?.scrollIntoView({block:'start',behavior:'smooth'});break;
    case 'review-word':
      if(prefs.review.includes(target.dataset.word))openVault([target.dataset.word]);break;
    case 'resume-vault':
      if(prefs.reviewSession && !prefs.reviewSession.completedAt){s=prefs.reviewSession;showHome=false;update({jump:true});}break;
    case 'review-record':
      s=[prefs.lesson,...prefs.history][Number(target.dataset.index)];
      if(!s?.completedAt)break;
      if(!s.daily.length)createPlan(s,s.time || '19:00');
      showHome=false;update({autoplay:false,jump:true});break;
    case 'print-day':
      previewDailySheet();break;
    case 'confirm-day-print':
      window.print();break;
    case 'close-sheet':
      document.querySelector('#sheet-preview').close();break;
    case 'choose-bank':
      move(s, 'chooseBank');
      update({ autoplay: false, jump: true });
      break;
    case 'screen':
      prepareScreen(prefs, s, document.querySelector('#bank-choice').value,
        document.querySelector('#unit-choice')?.value);
      prefs.preferredBank = s.bank;
      update();
      break;
    case 'finish-screen':
      s.picked=[...new Set([...s.picked,...s.queue.slice(s.pos)])].filter(word=>prefs.pending.includes(word));
      move(s,'screenReady');update({autoplay:false,jump:true});break;
    case 'choose-count': {
      const field = document.querySelector('#training-choice input');
      field?.scrollIntoView({ block: 'center' });
      field?.focus({ preventScroll: true });
      break;
    }
    case 'play':
      if (busy) stopSound();
      else playWord();
      break;
    case 'reveal':
      reveal = !reveal;
      render();
      if (s.stage === "check") countdown(false);
      document.querySelector('[data-action="reveal"]')?.focus();
      break;
    case 'follow':
      follow(s);
      update();
      break;
    case 'defer':
      update(deferWord(s));
      break;
    case 'yes':
    case 'no': {
      const correct = target.dataset.action === 'yes';
      const previous = s.stage;
      const result = judge(s, correct);
      if (s.stage === previous && !result.message && !s.aid) result.message = correct ? '记住了，继续。' : '已记录。';
      update(result);
      break;
    }
    case 'daily':
      beginDaily(s, Number(target.dataset.day));
      update();
      break;
    case 'print':
      printSheet();
      break;
    case 'copy':
      copyFeedback();
      break;
  }
});

document.addEventListener('keydown', event => {
  if (!account || showHome || event.repeat || event.altKey || event.metaKey || event.ctrlKey ||
      event.target.closest('input, select, textarea, [contenteditable]')) return;
  const action = { '1': root.querySelector('[data-action="follow"]') ? 'follow' : 'yes', '2': 'no', '3': 'play' }[event.key];
  const control = action && root.querySelector(`[data-action="${action}"]`);
  if (!control) return;
  event.preventDefault();
  control.click();
});

render();
cloudRequest('session').then(result=>{if(!account && !document.querySelector('#account-name')?.value)openAccount(result);}).catch(()=>{});
