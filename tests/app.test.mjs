import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {defaults, validate, stats, weightChartRows, calendarUrl} from '../core.js';
import {analyzeMeal, DEFAULT_MODEL} from '../ai.js';

const nutrition = {name:'便當', portion:'一份', note:'估算', calories:600, protein:30, carbs:60, fiber:null, fat:20};
const key = 'test-key-not-a-real-secret';
const photo = 'data:image/png;base64,iVBORw0KGgo=';

test('record IDs work when randomUUID is unavailable in an HTTP preview', async () => {
  const source=await readFile(new URL('../core.js',import.meta.url),'utf8');
  const declaration=source.split('\n').find(line=>line.startsWith('export const uid='));
  const context={crypto:{getRandomValues:array=>globalThis.crypto.getRandomValues(array)},Uint8Array};
  const id=vm.runInNewContext(declaration.replace('export ','')+'\nuid();',context);
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('new installation starts at the confirmed date and weight', () => {
  const d = defaults();
  assert.equal(d.settings.startDate, '2026-10-18');
  assert.equal(d.settings.startWeight, 70.5);
  assert.equal(d.weights.length, 0);
  assert.equal(weightChartRows(d.weights, d.settings)[0].weight, 70.5);
});

test('chart includes start point without inventing body composition or mutating records', () => {
  const d = defaults();
  d.weights = [{id:'w',date:'2026-10-24',time:'08:00',weight:69}];
  const rows = weightChartRows(d.weights, d.settings);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.date === '2026-10-18').fatKg, undefined);
  assert.equal(d.weights.length, 1);
  assert.equal(stats(d, '2026-10-24').loss, 1.5);
});

test('matching recorded baseline is not duplicated; another measurement on that day is retained', () => {
  const d = defaults();
  assert.equal(weightChartRows([{date:'2026-10-18',weight:70.5}],d.settings).length,1);
  assert.equal(weightChartRows([{date:'2026-10-18',weight:70.4}],d.settings).length,2);
});

test('legacy JSON imports preserve dates, decimals, settings, all record classes and photos', () => {
  const d = defaults();
  delete d.settings.baselineApplied;
  d.settings.startDate = '2026-09-01';
  d.settings.startWeight = 72.1;
  d.weights.push({id:'w',date:'2026-10-18',weight:70.5});
  d.injections.push({id:'i',date:'2026-10-18',dose:0.25});
  d.water.push({id:'water',date:'2026-10-18',ml:250});
  d.diaries.push({id:'d',date:'2026-10-18',note:'日記'});
  d.purchases.push({id:'p',date:'2026-10-18',price:6000,items:[{dose:'自訂',qty:2}]});
  d.symptoms.push({id:'s',date:'2026-10-18',name:'手動紀錄'});
  d.bowel.push({id:'b',date:'2026-10-18',count:0});
  d.exercise.push({id:'e',date:'2026-10-18',minutes:30});
  for(let i=0;i<360;i++)d.meals.push({id:'m'+i,date:'2026-10-18',meal:'早餐',...nutrition,photo});
  const restored = validate(JSON.parse(JSON.stringify(d)));
  assert.equal(restored.settings.startDate,'2026-09-01');
  assert.equal(restored.settings.startWeight,72.1);
  assert.deepEqual(restored.meals,d.meals);
  for(const k of ['weights','injections','water','diaries','purchases','symptoms','bowel','exercise'])assert.deepEqual(restored[k],d[k]);
  assert.equal(JSON.stringify(restored).includes(key),false);
});

test('bad imports do not mutate existing state', () => {
  const d=defaults(), original=JSON.stringify(d), broken=structuredClone(d);
  broken.weights=[{id:'w',date:'2026-02-30',weight:70}];
  assert.throws(()=>validate(broken));
  assert.equal(JSON.stringify(d),original);
});

test('calendar remains independent with Taiwan time', () => {
  const url = new URL(calendarUrl('2026-10-25T09:00'));
  assert.equal(url.searchParams.get('dates'),'20261025T010000Z/20261025T011500Z');
  assert.equal(url.searchParams.get('text'),'個人提醒');
});

test('AI sends only meal content to Google, puts key in header and returns editable draft', async () => {
  let calls=0;
  const result=await analyzeMeal({description:'便當一份',photo,apiKey:key,weights:[{weight:69}]},async(url,options)=>{
    calls++;
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/'+DEFAULT_MODEL+':generateContent');
    assert.equal(url.includes(key),false);
    assert.equal(options.headers['x-goog-api-key'],key);
    assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');
    const body=JSON.parse(options.body);
    assert.equal(options.body.includes(key),false);
    assert.equal(options.body.includes('weights'),false);
    assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png');
    return Response.json({candidates:[{content:{parts:[{thought:true,text:'ignore'},{text:JSON.stringify(nutrition)}]}}]});
  });
  assert.equal(calls,1);
  assert.deepEqual(result,nutrition);
});

test('missing key and empty or invalid input never make a request', async () => {
  let calls=0;const fetcher=async()=>{calls++;throw Error('should not run');};
  for(const input of [{description:'便當'},{apiKey:key},{apiKey:key,photo:'https://example.com/image.jpg'},{apiKey:key,description:'a'.repeat(5001)}]) {
    await assert.rejects(()=>analyzeMeal(input,fetcher));
  }
  assert.equal(calls,0);
});

for(const status of [400,401,403,404,429,500])test('AI HTTP '+status+' is surfaced without automatic retry',async()=>{
  let calls=0;
  await assert.rejects(()=>analyzeMeal({apiKey:key,description:'食物'},async()=>{calls++;return new Response('',{status});}));
  assert.equal(calls,1);
});

test('cancelled AI request remains cancelled',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>analyzeMeal({apiKey:key,description:'食物',signal:controller.signal},async()=>{throw new DOMException('cancelled','AbortError');}),{name:'AbortError'});
});

test('AI malformed or empty responses never become a meal',async()=>{
  for(const payload of [{},{candidates:[{content:{parts:[{text:'not JSON'}]}}]},{candidates:[{content:{parts:[{text:JSON.stringify({...nutrition,calories:-1})}]}}]}]) {
    await assert.rejects(()=>analyzeMeal({apiKey:key,description:'便當'},async()=>Response.json(payload)));
  }
});

test('all local entry points use project-relative paths',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/(?:href|src)="\//);
  assert.match(html,/generativelanguage.googleapis.com/);
  const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/\/api\/(?:status|analyze)|signin-with-chatgpt|oai-authenticated|applyBaseline/);
  assert.match(app,/indexedDB.open\('better-life:'/);
});

async function workerHarness(path='/better-life/') {
  const events={}, cacheStore=new Map(), deleted=[], network=[];
  let offline=false;
  const cached={put:async(k,v)=>cacheStore.set(String(k),v),match:async k=>cacheStore.get(String(k))};
  const scope='https://example.github.io'+path;
  const context={URL,Response,Set,Promise,Error,self:{location:{href:scope+'sw.js'},addEventListener:(k,f)=>events[k]=f,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches:{open:async()=>cached,keys:async()=>['better-life-github:'+path+':old','unrelated-site-cache','better-life-github:/other/:old'],delete:async k=>deleted.push(k)},
    fetch:async(input)=>{if(offline)throw Error('offline');const url=typeof input==='string'?input:input.url;network.push(url);return new Response('asset',{headers:{'content-type':url===scope||url.endsWith('index.html')?'text/html':url.endsWith('.js')?'text/javascript':'application/octet-stream'}});}};
  vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
  async function lifecycle(name){let promise;events[name]({waitUntil:p=>promise=p});await promise;}
  return {events,cacheStore,deleted,network,lifecycle,offline:()=>offline=true,scope};
}

for(const path of ['/','/better-life/'])test('offline shell works at '+path+' and cleans only its own cache',async()=>{
  const h=await workerHarness(path);await h.lifecycle('install');await h.lifecycle('activate');
  assert.equal(h.network.length,11);
  assert.equal(h.network.every(url=>url.startsWith(h.scope)),true);
  assert.deepEqual(h.deleted,['better-life-github:'+path+':old']);
  h.offline();
  for(const file of ['','index.html','app.js','ai.js','core.js']){
    let result;const pending=[];
    h.events.fetch({request:new Request(h.scope+file+'?v=1'),respondWith:p=>result=p,waitUntil:p=>pending.push(p)});
    assert.equal((await result).status,200);await Promise.all(pending);
  }
  let intercepted=false;
  h.events.fetch({request:new Request('https://generativelanguage.googleapis.com/test'),respondWith:()=>intercepted=true});
  assert.equal(intercepted,false);
});
