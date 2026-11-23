import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProfile, mergeProfiles, validateProfile } from '../dist/profile-data.js';
import { recordVocabulary, prepareScreen } from '../dist/profiles.js';
import { startLesson, startVaultReview, chooseTraining, judge, beginDaily, move, deferWord } from '../dist/lesson.js';
import { repetitionCount, reconcileVocabulary } from '../dist/vocabulary.js';
import { bankFor } from '../dist/words.js';
import { dailyVocabulary, classroomDay } from '../dist/daily-sheet.js';

function completeStudy(profile, word='apple') {
  const s=startLesson(1);s.trained=[word];move(s,'post',[word]);profile.lesson=s;
  judge(s,true);recordVocabulary(profile,s);return s;
}
function review(profile, words=['apple']) {
  const s=startVaultReview(1,words);profile.reviewSession=s;
  while(s.stage==='daily')judge(s,true);
  recordVocabulary(profile,s);return s;
}
test('known screening enters the vault; unknown and untouched bank words remain pending across courses and devices',()=>{
  const p=emptyProfile();p.lesson=startLesson(1);
  prepareScreen(p,p.lesson,'trial-0');
  assert.equal(p.pending.length,bankFor('trial-0').words.length);
  const known=p.lesson.queue[0];judge(p.lesson,true);recordVocabulary(p,p.lesson);
  const unknown=p.lesson.queue[p.lesson.pos];judge(p.lesson,false);recordVocabulary(p,p.lesson);
  assert.ok(p.learned.includes(known));assert.ok(!p.pending.includes(known));assert.ok(p.pending.includes(unknown));
  const copied=validateProfile(JSON.parse(JSON.stringify(p)));
  const next=startLesson(1);copied.history.push(copied.lesson);copied.lesson=next;
  prepareScreen(copied,next,'trial-0');
  assert.equal(next.stage,'screenReady');assert.equal(next.queue.length,0);
  assert.equal(next.picked.length,bankFor('trial-0').words.length-1);
  assert.ok(next.picked.includes(unknown));assert.ok(!next.picked.includes(known));
});
test('selected unit is isolated; another bank does not pull unrelated pending words into the lesson',()=>{
  const p=emptyProfile();p.pending=['intuition'];p.lesson=startLesson(1);
  const bank=bankFor('pep-primary-all-2022'),unit=Object.keys(bank.units)[0];
  prepareScreen(p,p.lesson,bank.id,unit);
  assert.deepEqual(new Set(p.pending),new Set(['intuition',...bank.units[unit]]));
  judge(p.lesson,false);recordVocabulary(p,p.lesson);
  assert.ok(!p.lesson.picked.includes('intuition'));
});
test('training selection keeps every leftover; one finished course goes to review at 1/10',()=>{
  const p=emptyProfile();p.lesson=startLesson(1);prepareScreen(p,p.lesson,'trial-0');
  const s=p.lesson;judge(s,false);recordVocabulary(p,s);
  const word=s.picked[0];assert.ok(chooseTraining(s,1));recordVocabulary(p,s);
  assert.ok(p.pending.includes(word));assert.equal(p.review.length,0);
  move(s,'post',[word]);judge(s,false);recordVocabulary(p,s);
  assert.deepEqual(p.review,[word]);assert.ok(!p.pending.includes(word));assert.ok(!p.learned.includes(word));
  assert.equal(repetitionCount(p,word),1);assert.equal(p.pending.length,bankFor('trial-0').words.length-1);
});
test('ten completed study/review rounds promote automatically; retries, saves, imports and stale devices cannot inflate counts',()=>{
  const p=emptyProfile();completeStudy(p);const stale=structuredClone(p);
  for(let i=0;i<20;i++)recordVocabulary(p,p.lesson);
  assert.equal(repetitionCount(p,'apple'),1);
  for(let n=2;n<=9;n++){
    review(p);assert.equal(repetitionCount(p,'apple'),n);assert.ok(p.review.includes('apple'));assert.ok(!p.learned.includes('apple'));
  }
  review(p);assert.equal(repetitionCount(p,'apple'),10);assert.ok(p.learned.includes('apple'));assert.ok(!p.review.includes('apple'));
  const merged=mergeProfiles([p,stale,p,validateProfile(p)]);
  assert.equal(repetitionCount(merged,'apple'),10);assert.ok(merged.learned.includes('apple'));assert.ok(!merged.pending.includes('apple'));
  assert.equal(dailyVocabulary(p,classroomDay(),{}).lessonCount,1,'standalone reviews do not become new courses on the printed sheet');
});
test('two devices finishing different review rounds preserve both events, and repeated snapshots deduplicate',()=>{
  const first=emptyProfile();completeStudy(first);
  const a=structuredClone(first),b=structuredClone(first);review(a);review(b);
  const merged=mergeProfiles([first,a,b,a,b]);
  assert.equal(repetitionCount(merged,'apple'),3);assert.deepEqual(merged.review,['apple']);
  assert.equal(repetitionCount(validateProfile(merged),'apple'),3);
});
test('unfinished review survives serialization; skipped words do not earn a round',()=>{
  const p=emptyProfile();completeStudy(p);const s=startVaultReview(1,['apple']);p.reviewSession=s;
  judge(s,false);recordVocabulary(p,s);assert.equal(repetitionCount(p,'apple'),1);
  const restored=validateProfile(p);assert.equal(restored.reviewSession.aid.step,0);
  restored.reviewSession.aid.step=2;deferWord(restored.reviewSession);recordVocabulary(restored,restored.reviewSession);
  assert.equal(restored.reviewSession.stage,'reviewDone');assert.equal(repetitionCount(restored,'apple'),1);
  review(restored);assert.equal(repetitionCount(restored,'apple'),2);
});
test('old completed courses become review with prior daily rounds; recognized words and unrelated old learned entries remain mastered',()=>{
  const p=emptyProfile();delete p.vocabulary;delete p.review;delete p.reviewSession;
  const s=startLesson(1);p.lesson=s;s.seen={friend:true,apple:false};s.trained=['apple'];s.completedAt=Date.now();
  s.daily=[{due:Date.now(),missed:[],completedAt:Date.now()}];p.learned=['apple','blue'];
  reconcileVocabulary(p);assert.equal(repetitionCount(p,'apple'),2);assert.deepEqual(p.review,['apple']);
  assert.deepEqual(new Set(p.learned),new Set(['friend','blue']));
  const before=JSON.stringify(p);reconcileVocabulary(p);assert.equal(JSON.stringify(p),before);
  assert.equal(beginDaily(s,1),false,'a completed scheduled review cannot run/count again');
});
test('cloud validation rejects malformed vocabulary metadata and review sessions',()=>{
  const p=emptyProfile();assert.throws(()=>validateProfile({...p,vocabulary:{version:1,known:[],banks:[],rounds:{apple:Array(11).fill('fake')}}}));
  p.reviewSession=startVaultReview(1,['apple']);p.reviewSession.day=2;assert.throws(()=>validateProfile(p));
});
