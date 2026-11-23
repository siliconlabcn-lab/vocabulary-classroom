import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomDay,dailyVocabulary} from '../dist/daily-sheet.js';
const course=(id,at,trained,definitions={})=>({id,grade:2,startedAt:Date.parse(at)-60000,completedAt:Date.parse(at),trained,definitions});
test('combines all completed lessons for the Beijing date, including midnight and excluding unfinished work',()=>{
  const one=course('one','2026-11-23T15:59:00Z',['apple','friend'],{apple:'苹果'});
  const two=course('two','2026-11-23T01:00:00Z',['apple','school'],{apple:'苹果；苹果树',school:'学校'});
  const tomorrow=course('tomorrow','2026-11-23T16:01:00Z',['tomorrow']);
  const unfinished={...one,id:'unfinished',completedAt:null,trained:['unlearned']};
  const sheet=dailyVocabulary({lesson:unfinished,history:[one,two,tomorrow]},'2026-11-23',{friend:{zh:'朋友'}});
  assert.equal(sheet.lessonCount,2);assert.deepEqual(sheet.rows.map(w=>w.en),['apple','school','friend']);
  assert.equal(sheet.rows[0].zh,'苹果；苹果树 / 苹果');assert.equal(sheet.rows[2].zh,'朋友');
  assert.equal(classroomDay(Date.parse('2026-11-23T16:00:00Z')),'2026-11-24');
});
test('duplicate cloud snapshots and repeated words do not duplicate the sheet',()=>{
  const lesson=course('one','2026-11-23T02:00:00Z',['apple','apple']);
  const sheet=dailyVocabulary({lesson,history:[structuredClone(lesson)]},'2026-11-23');
  assert.equal(sheet.lessonCount,1);assert.equal(sheet.rows.length,1);
});
test('does not limit the number of lessons or mix learners',()=>{
  const history=Array.from({length:150},(_,i)=>course(`lesson-${i}`,'2026-11-23T02:00:00Z',[`word-${i}`]));
  assert.equal(dailyVocabulary({lesson:null,history},'2026-11-23').rows.length,150);
  assert.deepEqual(dailyVocabulary({lesson:null,history:[]},'2026-11-23').rows,[]);
});
