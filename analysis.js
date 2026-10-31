import {validDate, sleepMinutes, formatMinutes} from './core.js';

export const metrics = {
 calories:{label:'熱量',unit:'大卡',setting:'calories',icon:'food'},
 protein:{label:'蛋白質',unit:'g',setting:'protein',icon:'spark'},
 water:{label:'飲水',unit:'ml',setting:'waterGoal',icon:'water'},
 sleep:{label:'睡眠',unit:'分鐘',setting:'sleepGoal',icon:'moon'}
};
export function shiftDay(day, offset){
 if(!validDate(day))throw Error('請選擇有效日期');
 const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);
 return d.toISOString().slice(0,10);
}
export function rangeDays(from,to){
 if(!validDate(from)||!validDate(to)||from>to)throw Error('開始日期必須早於或等於結束日期');
 const count=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
 if(count>366)throw Error('一次最多查看 366 天');
 return Array.from({length:count},(_,i)=>shiftDay(from,i));
}
export function metricValue(key,value){
 return key==='sleep'?formatMinutes(value):Number(value).toLocaleString('zh-TW',{maximumFractionDigits:1})+' '+metrics[key].unit;
}
// Missing nutrition stays unknown, but known protein can already prove a minimum goal.
// Even complete values represent recorded food, not proof that every meal was logged.
export function dailyMetrics(data,from,to){
 const rows=rangeDays(from,to).map(date=>({date,...Object.fromEntries(Object.keys(metrics).map(k=>[k,{value:null,known:0,entries:0,filled:0,incomplete:false}]))}));
 const byDate=new Map(rows.map(r=>[r.date,r]));
 for(const meal of data.meals){
  const row=byDate.get(meal.date);if(!row)continue;
  for(const key of ['calories','protein']){
   const cell=row[key];cell.entries++;
   if(meal[key]==null)cell.incomplete=true;else {cell.known+=meal[key];cell.filled++;}
  }
 }
 for(const record of data.water){const row=byDate.get(record.date);if(row){row.water.entries++;row.water.known+=record.ml;}}
 for(const record of data.sleep||[]){const row=byDate.get(record.date);if(row){row.sleep.entries++;row.sleep.known+=sleepMinutes(record.start,record.end);}}
 for(const row of rows)for(const key of Object.keys(metrics)){
  const cell=row[key],goal=data.settings[metrics[key].setting];
  cell.value=cell.entries&&(!cell.incomplete||(key==='protein'&&cell.filled>0))?cell.known:null;
  cell.goal=goal>0?goal:null;
  cell.reached=cell.value==null||cell.goal==null?null:key==='calories'?cell.value<=goal:cell.value>=goal;
  // With missing protein, a subtotal below goal cannot prove failure; above it proves success.
  if(key==='protein'&&cell.incomplete&&cell.reached===false)cell.reached=null;
 }
 return rows;
}
export function metricSummary(rows,key){
 return {days:rows.length,recorded:rows.filter(r=>r[key].value!=null).length,reached:rows.filter(r=>r[key].reached===true).length};
}
export function periodInsights(data,from,to,now){
 // Today's totals are still growing. Compare only days that have finished.
 const end=to<now?to:shiftDay(now,-1);
 if(end<from)return [];
 const rows=dailyMetrics(data,from,end),length=rows.length;
 const previousFrom=shiftDay(from,-length),previousTo=shiftDay(from,-1);
 const previous=dailyMetrics(data,previousFrom,previousTo);
 const candidates=[];
 for(const key of Object.keys(metrics)){
  const label=metrics[key].label,goal=data.settings[metrics[key].setting];if(!(goal>0))continue;
  // Rate comparisons use only complete days in both numerator and denominator.
  const current=metricSummary(rows.filter(r=>!r[key].incomplete),key),prior=metricSummary(previous.filter(r=>!r[key].incomplete),key);
  const sufficient=count=>count>=Math.max(4,Math.ceil(length*.7));
  if(previousFrom>=data.settings.startDate&&sufficient(current.recorded)&&sufficient(prior.recorded)){
   const rate=Math.round(current.reached/current.recorded*100),old=Math.round(prior.reached/prior.recorded*100),delta=rate-old;
   if(Math.abs(delta)>=10)candidates.push({key,score:100+Math.abs(delta),text:label+'達標率比前一個等長期間'+(delta>0?'提高':'下降')+' '+Math.abs(delta)+' 個百分點（'+old+'% → '+rate+'%）。'});
  }
  let streak=0;for(let i=rows.length-1;i>=0&&rows[i][key].reached===true;i--)streak++;
  if(streak>=3)candidates.push({key,score:90+streak,text:label+'截至 '+end.slice(5).replace('-','/')+'，已連續 '+streak+' 天達標。'});
  // Compare weekend and weekday failure rates only with enough observations.
  if(length>=28){
   const weekend=rows.filter(r=>[0,6].includes(new Date(r.date+'T12:00:00Z').getUTCDay()));
   const weekday=rows.filter(r=>![0,6].includes(new Date(r.date+'T12:00:00Z').getUTCDay()));
   const a=metricSummary(weekend.filter(r=>!r[key].incomplete),key),b=metricSummary(weekday.filter(r=>!r[key].incomplete),key);
   if(a.recorded>=Math.max(4,Math.ceil(weekend.length*.7))&&b.recorded>=Math.max(8,Math.ceil(weekday.length*.7))){
    const weekendMiss=1-a.reached/a.recorded,weekdayMiss=1-b.reached/b.recorded;
    if(weekendMiss-weekdayMiss>=.25)candidates.push({key,score:110,text:'這段期間，'+label+'在週末較常'+(key==='calories'?'超過目標':'未達標')+'（週末 '+Math.round(weekendMiss*100)+'%、平日 '+Math.round(weekdayMiss*100)+'%）。'});
   }
  }
  const missed=rows.filter(r=>r[key].reached===false);
  if(missed.length>=3){
   const precision=key==='sleep'?1:10;
   const gap=Math.ceil(missed.reduce((n,r)=>n+Math.abs(r[key].value-goal),0)/missed.length*precision)/precision;
   candidates.push({key,score:50+Math.min(20,missed.length),text:label+(key==='calories'?'超過目標':'未達標')+'的 '+missed.length+' 天，平均'+(key==='calories'?'超出 ':'還差 ')+metricValue(key,gap)+'。'});
  }
 }
 // At most three short findings, covering distinct metrics.
 const chosen=[],seen=new Set();
 for(const item of candidates.sort((a,b)=>b.score-a.score))if(!seen.has(item.key)){chosen.push(item);seen.add(item.key);if(chosen.length===3)break;}
 return chosen;
}
