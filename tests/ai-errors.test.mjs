import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeMeal, AI_TIMEOUT_MS} from '../ai.js';
const input={apiKey:'test-only-not-a-real-api-key',description:'便當一份'};
const meal={name:'便當',portion:'一份',note:'估算',calories:600,protein:30,carbs:60,fiber:null,fat:20};

test('simple meal request explicitly uses minimal thinking with enough output room',async()=>{
 await analyzeMeal(input,async(url,options)=>{
  const request=JSON.parse(options.body);
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel,'minimal');
  assert.equal(request.generationConfig.maxOutputTokens,8192);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(meal)}]}}]});
 });
 assert.equal(AI_TIMEOUT_MS,90000);
});
test('truncated/continuation and thinking-only results explain output limits, never save partial values',async()=>{
 for(const finishReason of ['MAX_TOKENS','CONTINUATION']){
  let calls=0;
  await assert.rejects(()=>analyzeMeal(input,async()=>{calls++;return Response.json({candidates:[{finishReason,content:{parts:[{thought:true,text:'thinking only'},{text:'{"name":"便當"'}]}}]});}),{code:'AI_OUTPUT_LIMIT'});
  assert.equal(calls,1);
 }
});
test('empty response is distinguishable from bad nutrition and safety blocks',async()=>{
 const cases=[
  [{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private thought'}]}}]},'AI_EMPTY'],
  [{candidates:[{content:{parts:[{text:'not JSON'}]}}]},'AI_NUTRITION'],
  [{promptFeedback:{blockReason:'SAFETY'}},'AI_BLOCKED'],
  [{candidates:[{finishReason:'SAFETY'}]},'AI_BLOCKED'],
  [null,'AI_EMPTY']
 ];
 for(const [body,code]of cases)await assert.rejects(()=>analyzeMeal(input,async()=>Response.json(body)),{code});
});
test('HTTP error codes and invalid key details are safe to show without raw provider content',async()=>{
 const provider={error:{message:'secret '+input.apiKey,details:[{reason:'API_KEY_INVALID'}]}};
 await assert.rejects(()=>analyzeMeal(input,async()=>Response.json(provider,{status:400})),e=>{
  assert.equal(e.code,'AI_KEY');assert.equal(e.message.includes(input.apiKey),false);return true;
 });
 await assert.rejects(()=>analyzeMeal(input,async()=>new Response('',{status:429})),{code:'AI_HTTP_429'});
 await assert.rejects(()=>analyzeMeal(input,async()=>Response.json({error:{status:'FAILED_PRECONDITION'}},{status:400})),{code:'AI_ACCOUNT'});
});
test('aborting during body download is reported as cancellation rather than malformed JSON',async()=>{
 await assert.rejects(()=>analyzeMeal(input,async()=>({ok:true,json:async()=>{throw new DOMException('cancel','AbortError');}})),{name:'AbortError'});
});
test('network errors hide raw messages and successful split JSON still parses',async()=>{
 await assert.rejects(()=>analyzeMeal(input,async()=>{throw Error(input.apiKey);}),e=>e.code==='AI_NETWORK'&&!e.message.includes(input.apiKey));
 const json=JSON.stringify(meal);
 const result=await analyzeMeal(input,async()=>Response.json({candidates:[{content:{parts:[{text:json.slice(0,20)},{thought:true,text:'ignore'},{text:json.slice(20)}]}}]}));
 assert.deepEqual(result,meal);
});
test('UI displays timed status and error at top, and preserves photo for manual fallback',async()=>{
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/id="stopAI"/);assert.match(app,/AI_TIMEOUT/);assert.match(app,/AI_CANCELLED/);
 assert.match(app,/edit\('meals',null,\{photo,name:/);
 assert.ok(app.indexOf('id="aiError"')<app.indexOf('id="aiPhoto"'));
 assert.match(app,/clearInterval\(timer\)/);
});
