import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaults,validate,sleepMinutes,formatMinutes,habitProgress,assertSleepNoOverlap} from '../core.js';

function record(start,end,id='s1'){
 return {id,date:end.slice(0,10),start,end,minutes:sleepMinutes(start,end)};
}
test('overnight sleep is calculated in hours and minutes, including month/year/leap boundaries',()=>{
 assert.equal(sleepMinutes('2026-10-25T23:30','2026-10-26T07:10'),460);
 assert.equal(formatMinutes(460),'7 時 40 分');
 assert.equal(sleepMinutes('2026-12-31T23:55','2027-01-01T00:05'),10);
 assert.equal(sleepMinutes('2024-02-29T23:00','2024-03-01T07:05'),485);
 assert.equal(sleepMinutes('2026-10-26T01:00','2026-10-26T08:00'),420);
});
test('invalid, reversed, equal and over-24-hour intervals are rejected',()=>{
 for(const [start,end] of [
 ['','2026-10-26T07:00'],['2026-02-30T23:00','2026-03-01T07:00'],
 ['2026-10-25T25:00','2026-10-26T07:00'],['2026-10-26T23:30','2026-10-26T07:10'],
 ['2026-10-26T07:00','2026-10-26T07:00'],['2026-10-24T23:00','2026-10-26T07:00']
 ])assert.throws(()=>sleepMinutes(start,end));
});
test('old backups gain empty sleep and unset goal; old data is preserved',()=>{
 const legacy=defaults();delete legacy.sleep;delete legacy.settings.sleepGoal;
 legacy.diaries.push({id:'old-diary',date:'2026-10-24',note:'保留內容'});
 legacy.weights.push({id:'weight',date:'2026-10-24',weight:69});
 const restored=validate(legacy);
 assert.deepEqual(restored.sleep,[]);assert.equal(restored.settings.sleepGoal,null);
 assert.deepEqual(restored.diaries,legacy.diaries);assert.deepEqual(restored.weights,legacy.weights);
});
test('sleep backup round trip recomputes derived total and preserves goal',()=>{
 const d=defaults();d.settings.sleepGoal=480;
 d.sleep=[{...record('2026-10-25T23:30','2026-10-26T07:10'),minutes:999}];
 const restored=validate(JSON.parse(JSON.stringify(d)));
 assert.equal(restored.sleep[0].minutes,460);assert.equal(restored.settings.sleepGoal,480);
 assert.equal(d.sleep[0].minutes,999);
});
test('waking date is enforced and invalid sleep/goal imports fail',()=>{
 const d=defaults();d.sleep=[record('2026-10-25T23:30','2026-10-26T07:10')];
 const wrong=structuredClone(d);wrong.sleep[0].date='2026-10-25';assert.throws(()=>validate(wrong));
 for(const goal of [-1,1441,480.5,'480']){const broken=structuredClone(d);broken.settings.sleepGoal=goal;assert.throws(()=>validate(broken));}
 const bad=structuredClone(d);bad.sleep=null;assert.throws(()=>validate(bad));
});
test('overlapping sleep is rejected, adjacent sleep and separate naps are allowed',()=>{
 const night=record('2026-10-25T23:00','2026-10-26T07:00');
 const overlap=record('2026-10-26T06:00','2026-10-26T08:00','s2');
 assert.throws(()=>assertSleepNoOverlap([night,overlap]));
 assert.throws(()=>validate({...defaults(),sleep:[night,overlap]}));
 assert.doesNotThrow(()=>assertSleepNoOverlap([night,record('2026-10-26T07:00','2026-10-26T07:20','s2')]));
});
test('sleep totals include naps only on their waking day and distinguish unrecorded',()=>{
 const d=defaults();d.settings.sleepGoal=480;
 d.sleep=[record('2026-10-25T23:30','2026-10-26T07:10'),record('2026-10-26T14:00','2026-10-26T14:20','s2')];
 assert.equal(habitProgress(d,'2026-10-26').sleep,480);
 assert.equal(habitProgress(d,'2026-10-26').sleepReached,true);
 assert.equal(habitProgress(d,'2026-10-25').sleep,null);
 assert.equal(habitProgress(d,'2026-10-25').sleepReached,false);
});
test('water and sleep praise require positive targets and independent achievement',()=>{
 const d=defaults();d.settings.waterGoal=500;d.settings.sleepGoal=480;
 d.water=[{id:'w1',date:'2026-10-26',ml:250},{id:'w2',date:'2026-10-25',ml:500}];
 d.sleep=[record('2026-10-25T23:00','2026-10-26T07:00')];
 assert.equal(habitProgress(d,'2026-10-26').waterReached,false);
 assert.equal(habitProgress(d,'2026-10-26').sleepReached,true);
 d.water.push({id:'w3',date:'2026-10-26',ml:250});
 assert.equal(habitProgress(d,'2026-10-26').waterReached,true);
 d.settings.waterGoal=0;d.settings.sleepGoal=null;
 assert.equal(habitProgress(d,'2026-10-26').waterReached,false);
 assert.equal(habitProgress(d,'2026-10-26').sleepReached,false);
});
test('editing/deleting records and changing goals recalculate achievement',()=>{
 const d=defaults();d.settings.sleepGoal=480;d.settings.waterGoal=500;
 d.sleep=[record('2026-10-25T23:00','2026-10-26T07:00')];d.water=[{id:'w',date:'2026-10-26',ml:500}];
 assert.equal(habitProgress(d,'2026-10-26').sleepReached,true);
 d.sleep[0]=record('2026-10-25T23:00','2026-10-26T06:59');
 assert.equal(habitProgress(d,'2026-10-26').sleepReached,false);
 d.settings.sleepGoal=479;assert.equal(habitProgress(d,'2026-10-26').sleepReached,true);
 d.sleep=[];d.water=[];
 assert.equal(habitProgress(d,'2026-10-26').sleepReached,false);
 assert.equal(habitProgress(d,'2026-10-26').waterReached,false);
});
test('diary controls are removed and sleep is editable without changing database identity',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/寫日記|留給自己的話|tab:diary|showDiary/);
 assert.match(source,/function editSleep\(/);assert.match(source,/總計睡眠時間（自動計算）/);
 assert.match(source,/indexedDB.open\('better-life:'/);
});
