import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults} from '../core.js';
import {dailyMetrics,metricSummary,periodInsights,rangeDays,shiftDay} from '../analysis.js';
import {renderAnalysis,validateAnalysisRange,trendChart} from '../analysis-view.js';

const setup=()=>{const d=defaults();Object.assign(d.settings,{startDate:'2026-01-01',calories:1500,protein:90,waterGoal:2100,sleepGoal:450});return d;};
const meal=(date,calories,protein)=>({date,calories,protein});
test('calories use <= while other goals use >=; aggregate meals and naps on waking date',()=>{
 const d=setup();d.meals=[meal('2026-10-25',800,45),meal('2026-10-25',700,45),meal('2026-10-26',1501,89)];
 d.water=[{date:'2026-10-25',ml:1100},{date:'2026-10-25',ml:1000}];
 d.sleep=[{date:'2026-10-25',start:'2026-10-24T23:00',end:'2026-10-25T06:00'},{date:'2026-10-25',start:'2026-10-25T14:00',end:'2026-10-25T14:30'}];
 const before=JSON.stringify(d),rows=dailyMetrics(d,'2026-10-24','2026-10-26');
 for(const key of ['calories','protein','water','sleep'])assert.equal(rows[1][key].reached,true);
 assert.equal(rows[1].sleep.value,450);assert.equal(rows[0].sleep.value,null);
 assert.equal(rows[2].calories.reached,false);assert.equal(rows[2].protein.reached,false);
 assert.deepEqual(metricSummary(rows,'calories'),{days:3,recorded:2,reached:1});assert.equal(JSON.stringify(d),before);
});
test('missing days, incomplete nutrition, zero values and unset goals remain distinct',()=>{
 const d=setup();d.meals=[meal('2026-10-25',300,30),meal('2026-10-25',null,60),meal('2026-10-26',0,0)];
 let rows=dailyMetrics(d,'2026-10-24','2026-10-26');
 assert.equal(rows[0].calories.value,null);assert.equal(rows[0].water.value,null);
 assert.equal(rows[1].calories.value,null);assert.equal(rows[1].calories.known,300);assert.equal(rows[1].calories.reached,null);
 assert.equal(rows[1].protein.reached,true);assert.equal(rows[2].calories.reached,true);
 d.settings.calories=null;rows=dailyMetrics(d,'2026-10-26','2026-10-26');assert.equal(rows[0].calories.reached,null);
});
test('dates cross year and leap day; ranges reject invalid, reversed, future and oversized input',()=>{
 assert.equal(shiftDay('2027-01-01',-1),'2026-12-31');assert.equal(shiftDay('2024-03-01',-1),'2024-02-29');
 assert.equal(rangeDays('2024-02-28','2024-03-01').length,3);
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-10-30','2026-10-29'],['2025-01-01','2026-01-02']])assert.throws(()=>rangeDays(from,to));
 assert.throws(()=>validateAnalysisRange('2026-10-30','2026-11-01','2026-10-31'));
});
test('comparison uses recorded-day rates, excludes today, and requires adequate coverage',()=>{
 const d=setup();
 for(const date of rangeDays('2026-10-17','2026-10-30'))d.water.push({date,ml:date<'2026-10-24'?1000:2200});
 d.water.push({date:'2026-10-31',ml:1});
 const findings=periodInsights(d,'2026-10-24','2026-10-31','2026-10-31');
 assert.match(findings.find(f=>f.key==='water').text,/100 個百分點/);
 d.water=d.water.slice(-3);assert.equal(periodInsights(d,'2026-10-24','2026-10-31','2026-10-31').length,0);
});
test('missing day breaks streaks; current goal changes recalculate derived results',()=>{
 const d=setup();d.water=['2026-10-27','2026-10-28','2026-10-29','2026-10-30'].map(date=>({date,ml:2200}));
 assert.match(periodInsights(d,'2026-10-25','2026-10-31','2026-10-31')[0].text,/連續 4 天/);
 d.water=d.water.filter(r=>r.date!=='2026-10-29');
 assert.equal(periodInsights(d,'2026-10-25','2026-10-31','2026-10-31').some(r=>/連續/.test(r.text)),false);
 d.settings.waterGoal=2300;assert.equal(metricSummary(dailyMetrics(d,'2026-10-25','2026-10-31'),'water').reached,0);
});
test('findings have at most three distinct metrics, with gaps and weekend patterns based on actual observations',()=>{
 const d=setup();
 for(const date of rangeDays('2026-10-01','2026-10-28')){
  const weekend=[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
  d.meals.push(meal(date,weekend?1800:1400,50));d.water.push({date,ml:1800});
 }
 const findings=periodInsights(d,'2026-10-01','2026-10-28','2026-10-31');
 assert.equal(findings.length,3);assert.equal(new Set(findings.map(f=>f.key)).size,3);
 assert.match(findings.find(f=>f.key==='calories').text,/週末/);assert.match(findings.find(f=>f.key==='water').text,/300 ml/);
});
test('view handles empty data, one day, missing goals, incomplete values and chart gaps',()=>{
 const d=setup(),state={period:'7',metric:'calories',from:'2026-10-25',to:'2026-10-31',day:'2026-10-31'};
 let html=renderAnalysis(d,state,'2026-10-31');assert.match(html,/暫無可確認/);assert.match(html,/0<small> \/ 7 天/);assert.doesNotMatch(html,/NaN|undefined/);
 d.meals=[meal('2026-10-25',1000,50),meal('2026-10-27',1100,60),meal('2026-10-31',null,null)];
 html=renderAnalysis(d,state,'2026-10-31');assert.match(html,/營養值未填完整/);
 const chart=trendChart(dailyMetrics(d,state.from,state.to),'calories',1500,'2026-10-31');assert.equal((chart.match(/<polyline /g)||[]).length,2);
 state.from=state.to;d.settings.calories=null;html=renderAnalysis(d,state,'2026-10-31');assert.match(html,/尚未設定目標/);assert.doesNotMatch(html,/NaN|undefined/);
});
