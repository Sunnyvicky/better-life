export const lists=['weights','injections','meals','water','purchases','diaries','symptoms','bowel','exercise','sleep'];
export const today=()=>new Date().toLocaleDateString('sv-SE');
export const uid=()=>crypto.randomUUID?.()??'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^(crypto.getRandomValues(new Uint8Array(1))[0]&15)>>Number(c)/4).toString(16));
export const defaults=()=>({version:1,settings:{height:null,startWeight:70.5,target:null,startDate:'2026-10-18',baselineApplied:true,calories:null,protein:null,carbs:null,fiber:null,fat:null,waterGoal:2100,sleepGoal:null,cup:250,next:'',notes:'',lastBackup:''},...Object.fromEntries(lists.map(k=>[k,[]]))});
export const sum=(a,k)=>a.reduce((s,r)=>s+(Number(r[k])||0),0);
export function stats(d,date=today()) {const w=[...d.weights].filter(r=>r.date<=date).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));const current=w.at(-1)?.weight??d.settings.startWeight;const start=d.settings.startWeight??w[0]?.weight;const loss=start!=null&&current!=null?start-current:null;const purchases=d.purchases.filter(r=>r.date>=d.settings.startDate&&r.date<=date);const cost=sum(purchases,'price'),count=purchases.reduce((s,p)=>s+p.items.reduce((v,i)=>v+i.qty,0),0);return {current,start,loss,percent:start&&loss!=null?loss/start*100:null,remaining:current!=null&&d.settings.target!=null?current-d.settings.target:null,bmi:current&&d.settings.height?current/(d.settings.height/100)**2:null,cost,count,average:count?cost/count:null,costPerKg:loss>0?cost/loss:null,monthCost:sum(purchases.filter(r=>r.date.slice(0,7)===date.slice(0,7)),'price')};}
export function validate(d){if(!d||d.version!==1||!d.settings||typeof d.settings!=='object')throw Error('不是相容的 Better life 備份');let clean=defaults();clean.settings.baselineApplied=d.settings.baselineApplied===true;const numeric=['height','startWeight','target','calories','protein','carbs','fiber','fat','waterGoal','sleepGoal','cup'];for(const k of numeric){let v=d.settings[k];if(v!=null&&(typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('設定中的數字有誤');clean.settings[k]=v??null;}for(const k of ['startDate','next','notes','lastBackup']){if(typeof d.settings[k]!=='string')throw Error('設定不完整');clean.settings[k]=d.settings[k];}if(clean.settings.sleepGoal!=null&&(!Number.isInteger(clean.settings.sleepGoal)||clean.settings.sleepGoal>1440))throw Error('睡眠目標請填入 24 小時以內的整數分鐘');if(!validDate(clean.settings.startDate))throw Error('開始日期有誤');const fields={weights:['weight','fatKg','muscle','bodyFat'],injections:['dose'],meals:['calories','protein','carbs','fiber','fat'],water:['ml'],purchases:['price'],diaries:[],symptoms:[],bowel:['count'],exercise:['minutes'],sleep:[]};for(const k of lists){if(k==='sleep'&&d[k]===undefined){clean.sleep=[];continue;}if(!Array.isArray(d[k]))throw Error('備份缺少紀錄：'+k);const ids=new Set();for(const r of d[k]){if(!r||typeof r.id!=='string'||ids.has(r.id)||!validDate(r.date))throw Error('紀錄日期或識別有誤');ids.add(r.id);if(r.time!=null&&r.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))throw Error('時間格式有誤');for(const f of fields[k]){if(r[f]!=null&&(typeof r[f]!=='number'||!Number.isFinite(r[f])||r[f]<0))throw Error('紀錄數字有誤');}if(k==='weights'&&!(r.weight>0))throw Error('體重必須大於零');if(k==='injections'&&!(r.dose>0))throw Error('劑量必須大於零');if(k==='exercise'&&!(r.minutes>0))throw Error('運動時間有誤');if(k==='water'&&!(r.ml>0))throw Error('飲水量有誤');if(k==='purchases'&&(!Array.isArray(r.items)||!r.items.length||r.items.some(i=>typeof i.dose!=='string'||!Number.isInteger(i.qty)||i.qty<=0)||!Number.isFinite(r.price)))throw Error('購買數量或價格有誤');if(k==='bowel'&&(!Number.isInteger(r.count)||r.count<0))throw Error('排便次數有誤');if(k==='meals'){if(!['早餐','午餐','晚餐','點心'].includes(r.meal)||typeof r.name!=='string'||!r.name)throw Error('飲食紀錄不完整');if(r.photo&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.photo))throw Error('照片格式有誤');}for(const [f,v]of Object.entries(r))if(typeof v==='string'&&v.length>(f==='photo'?8000000:10000))throw Error('文字或照片過大');}clean[k]=structuredClone(d[k]);}clean.sleep=clean.sleep.map(r=>{const minutes=sleepMinutes(r.start,r.end);if(r.date!==r.end.slice(0,10))throw Error('睡眠紀錄日期必須是醒來日期');return {...r,minutes};});assertSleepNoOverlap(clean.sleep);return clean;}
export function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
export function calendarUrl(next){if(!next)throw Error('請先設定下次提醒時間');const d=new Date(next+':00+08:00');if(isNaN(d))throw Error('提醒時間有誤');const fmt=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');return 'https://calendar.google.com/calendar/render?'+new URLSearchParams({action:'TEMPLATE',text:'個人提醒',dates:fmt(d)+'/'+fmt(new Date(+d+15*60000)),ctz:'Asia/Taipei',details:'請確認此事件的通知設定。若日期變更，請一併更新舊事件。'});}
export function parseNutrition(text){const s=String(text).replace(/^\s*\x60\x60\x60(?:json)?\s*/,'').replace(/\x60\x60\x60\s*$/,'');let r;try{r=JSON.parse(s)}catch{throw Error('請貼上包含食物名稱與營養欄位的 JSON 回覆；也可以改手動輸入。')}if(typeof r.name!=='string'||!r.name.trim())throw Error('缺少食物名稱');let out={name:r.name.slice(0,200),portion:String(r.portion||''),note:String(r.note||'')};for(const k of ['calories','protein','carbs','fiber','fat']){const v=r[k];if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000))throw Error('營養欄位必須是非負數或 null：'+k);out[k]=v;}return out;}

export function weightChartRows(rows,settings){
 const result=[...rows];
 if(settings.startWeight>0&&validDate(settings.startDate)&&!result.some(r=>r.date===settings.startDate&&r.weight===settings.startWeight))result.push({id:'start-baseline',date:settings.startDate,time:'',weight:settings.startWeight});
 return result;
}

// Sleep intervals use the wall-clock times entered in Taiwan (UTC+08:00).
export function sleepMinutes(start,end){
 const stamp=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)||!validDate(value.slice(0,10)))throw Error('請填入有效的入睡與醒來日期時間');
  return Date.parse(value+':00+08:00');
 };
 const minutes=(stamp(end)-stamp(start))/60000;
 if(!Number.isInteger(minutes)||minutes<=0)throw Error('醒來時間必須晚於入睡時間，跨夜請選擇正確日期');
 if(minutes>1440)throw Error('單筆睡眠請在 24 小時以內，請確認日期是否正確');
 return minutes;
}
export function assertSleepNoOverlap(rows){
 const ordered=[...rows].sort((a,b)=>a.start.localeCompare(b.start));
 for(let i=1;i<ordered.length;i++)if(ordered[i].start<ordered[i-1].end)throw Error('這段睡眠與其他紀錄重疊，請先修改原有紀錄');
}
export function formatMinutes(minutes){
 if(minutes==null)return '尚未記錄';
 return Math.floor(minutes/60)+' 時 '+String(minutes%60).padStart(2,'0')+' 分';
}
export function habitProgress(d,day=today()){
 const water=sum(d.water.filter(r=>r.date===day),'ml');
 const rows=(d.sleep||[]).filter(r=>r.date===day);
 const sleep=rows.length?rows.reduce((n,r)=>n+sleepMinutes(r.start,r.end),0):null;
 return {water,sleep,waterReached:d.settings.waterGoal>0&&water>=d.settings.waterGoal,sleepReached:d.settings.sleepGoal>0&&sleep!=null&&sleep>=d.settings.sleepGoal};
}
