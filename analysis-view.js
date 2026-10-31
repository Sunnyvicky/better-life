import {metrics,rangeDays,dailyMetrics,metricSummary,metricValue,periodInsights} from './analysis.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shortDate=day=>day.slice(5).replace('-','/');
export function renderAnalysis(data,state,now){
 const {from,to,metric}=state,rows=dailyMetrics(data,from,to),meta=metrics[metric];
 const goal=data.settings[meta.setting],hasGoal=goal>0;
 const selected=rows.find(r=>r.date===state.day)||rows.at(-1),cell=selected[metric];
 const findings=periodInsights(data,from,to,now);
 const hasEnoughRecords=Object.keys(metrics).some(k=>metricSummary(rows,k).recorded>=4);
 const noFinding=hasEnoughRecords?'本期尚未出現明顯變化或規律，可切換期間查看。':'紀錄不足，暫無可確認的變化或規律。持續記錄後，這裡會顯示本期發現。';
 const cards=Object.entries(metrics).map(([key,m])=>{
  const s=metricSummary(rows,key),configured=data.settings[m.setting]>0;
  return '<button class="analysis-stat '+(key===metric?'selected':'')+'" data-analysis-metric="'+key+'" aria-pressed="'+(key===metric)+'"><span>'+m.label+'</span>'+(configured?'<strong><small>達標 </small>'+s.reached+'<small> / '+s.days+' 天</small></strong>':'<strong class="analysis-unset">尚未設定目標</strong>')+'</button>';
 }).join('');
 const value=cell.value==null?(cell.incomplete?'營養值未填完整':'尚未記錄'):(cell.incomplete?'至少 ':'')+metricValue(metric,cell.value);
 const status=cell.reached==null?(cell.incomplete?'資料未完整，尚無法判定':''):cell.reached?'達標':'未達標';
 const todayNote=selected.date===now?' · 今日暫計':'';
 return '<section class="analysis-page"><section class="intro"><div><span class="eyebrow">YOUR EVERYDAY, BETTER</span><h1>趨勢分析</h1><p>看見進步，也找到可以調整的地方。</p></div></section>'+
 '<div class="segmented analysis-period" aria-label="分析期間">'+[['7','近 7 天'],['30','近 30 天'],['custom','自訂日期']].map(([key,label])=>'<button data-analysis-period="'+key+'" class="'+(state.period===key?'active':'')+'" aria-pressed="'+(state.period===key)+'">'+label+'</button>').join('')+'</div>'+
 (state.period==='custom'?'<form id="analysisRangeForm" class="analysis-range"><label class="field">開始日期<input type="date" name="from" required max="'+now+'" value="'+from+'"></label><label class="field">結束日期<input type="date" name="to" required max="'+now+'" value="'+to+'"></label><button class="btn secondary" type="submit">查看</button></form>':'')+
 '<p class="analysis-dates">'+esc(from)+' — '+esc(to)+'</p><div class="analysis-grid">'+cards+'</div>'+
 '<section class="card analysis-chart-card"><div class="row wrap"><h2>'+meta.label+'趨勢</h2><button class="text-btn" data-action="'+(metric==='sleep'?'sleepGoal':'settings')+'">'+(hasGoal?'目標 '+metricValue(metric,goal):'設定目標 →')+'</button></div><div class="analysis-legend"><span><i></i>每日紀錄</span>'+(hasGoal?'<span><i class="target"></i>目標</span>':'')+'</div>'+trendChart(rows,metric,hasGoal?goal:null,selected.date)+'<div class="analysis-day"><label>查看日期<select id="analysisDay" aria-label="查看每日數值">'+rows.map(r=>'<option value="'+r.date+'" '+(r.date===selected.date?'selected':'')+'>'+shortDate(r.date)+(r.date===now?'（今天）':'')+'</option>').join('')+'</select></label><div aria-live="polite"><strong>'+value+'</strong><small>'+status+todayNote+'</small></div></div>'+
 (cell.incomplete?'<p class="cover-note">部分餐點未填'+meta.label+'。已知合計 '+metricValue(metric,cell.known)+'；'+(cell.reached===true?'已達目標，計入達標天數。':'補齊資料後可確認完整數值。')+'</p>':'')+'</section>'+
 '<section class="card analysis-findings"><h2>本期發現</h2>'+(findings.length?'<ul>'+findings.map(f=>'<li><span class="analysis-finding-mark" aria-hidden="true"></span>'+esc(f.text)+'</li>').join('')+'</ul>':'<p class="cover-note">'+noFinding+'</p>')+'</section>'+
 '<details class="analysis-rules"><summary>統計方式</summary><p>熱量不超過目標算達標；蛋白質、飲水與睡眠達到目標算達標。全部依目前設定的目標重新計算。</p><p>未記錄不當作 0。蛋白質已知合計達標就計入達標天數；若仍有空白欄位，圖表以空心點顯示至少攝取量，低於目標時暫不判定。熱量不完整時不判定。飲食僅依已記錄內容計算，請記下當日各餐。</p><p>今日數值與達標為暫計；本期發現只分析已結束的日期。前期與週末比較僅使用完整紀錄日；前期比較兩期各需至少 4 天且涵蓋 70% 日期。自訂期間最多 366 天。</p></details></section>';
}

export function trendChart(rows,key,goal,selectedDay){
 const width=360,left=50,right=343,top=24,bottom=176;
 const values=rows.map(r=>r[key].value).filter(v=>v!=null);
 const rawMax=Math.max(1,...values,goal||0)*1.15;
 const step=key==='sleep'?60:Math.max(1,10**Math.floor(Math.log10(rawMax))/2);
 const max=Math.ceil(rawMax/step)*step;
 const x=i=>rows.length===1?(left+right)/2:left+i/(rows.length-1)*(right-left),y=v=>bottom-v/max*(bottom-top);
 const tick=v=>key==='sleep'?Math.floor(Math.round(v)/60)+':'+String(Math.round(v)%60).padStart(2,'0'):Math.round(v).toLocaleString('zh-TW');
 const paths=[];let segment=[];
 rows.forEach((r,i)=>{if(r[key].value==null||r[key].incomplete){if(segment.length)paths.push(segment);segment=[];}else segment.push(x(i)+','+y(r[key].value));});if(segment.length)paths.push(segment);
 const ticks=[...new Set([0,Math.floor((rows.length-1)/2),rows.length-1])];
 return '<svg class="analysis-chart" viewBox="0 0 '+width+' 218" role="img" aria-label="'+metrics[key].label+'每日紀錄與目標，圖表空缺代表沒有完整紀錄"><title>'+metrics[key].label+'趨勢</title><text x="43" y="12" text-anchor="end">'+(key==='sleep'?'時:分':metrics[key].unit)+'</text>'+
 (values.length||goal!=null?[0,max/2,max]:[]).map(v=>'<line x1="'+left+'" x2="'+right+'" y1="'+y(v)+'" y2="'+y(v)+'" class="analysis-gridline"/><text x="43" y="'+(y(v)+4)+'" text-anchor="end">'+tick(v)+'</text>').join('')+
 (goal!=null?'<line x1="'+left+'" x2="'+right+'" y1="'+y(goal)+'" y2="'+y(goal)+'" class="analysis-target"/>':'')+
 paths.map(p=>'<polyline points="'+p.join(' ')+'" class="analysis-line"/>').join('')+
 rows.map((r,i)=>r[key].value==null?'':'<circle cx="'+x(i)+'" cy="'+y(r[key].value)+'" r="'+(r.date===selectedDay?5:rows.length>60?2:3.5)+'" class="analysis-dot" '+(r[key].incomplete?'style="fill:white;stroke:var(--accent);stroke-width:2" ':'')+'role="button" tabindex="0" data-analysis-day="'+r.date+'" aria-label="'+r.date+' '+(r[key].incomplete?'至少 ':'')+metricValue(key,r[key].value)+'"><title>'+r.date+' · '+(r[key].incomplete?'至少 ':'')+metricValue(key,r[key].value)+'</title></circle>').join('')+
 ticks.map(i=>'<text x="'+x(i)+'" y="203" text-anchor="'+(rows.length===1?'middle':i===0?'start':i===rows.length-1?'end':'middle')+'">'+shortDate(rows[i].date)+'</text>').join('')+
 (!values.length?'<text x="195" y="105" text-anchor="middle">此期間尚無完整紀錄</text>':'')+'</svg>';
}

export function validateAnalysisRange(from,to,now){
 if(to>now)throw Error('請選擇今天或之前的日期');
 return rangeDays(from,to);
}
