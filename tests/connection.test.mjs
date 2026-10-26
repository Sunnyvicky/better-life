import test from 'node:test';
import assert from 'node:assert/strict';
import {testConnection,analyzeMeal,DEFAULT_MODEL} from '../ai.js';
const apiKey='test-only-not-a-real-secret';

test('connection check gets metadata only and never generates food or puts key in URL',async()=>{
 let calls=0;
 const result=await testConnection({apiKey},async(url,options)=>{
  calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/'+DEFAULT_MODEL);
  assert.equal(url.includes(apiKey),false);assert.equal(options.method,'GET');assert.equal(options.body,undefined);
  assert.equal(options.headers['x-goog-api-key'],apiKey);assert.equal(options.credentials,'omit');
  return Response.json({name:'models/'+DEFAULT_MODEL});
 });
 assert.equal(calls,1);assert.equal(result.code,'AI_TEST_OK');
});
test('connection timeout covers stalled request and stalled response body without waiting 90s',async()=>{
 for(const fetcher of [async()=>new Promise(()=>{}),async()=>({ok:true,json:async()=>new Promise(()=>{})})]){
  await assert.rejects(()=>testConnection({apiKey,timeoutMs:10},fetcher),{code:'AI_TEST_TIMEOUT'});
 }
});
test('connection failures retain distinction between key, HTTP rejection, network and bad format',async()=>{
 const cases=[
  [async()=>Response.json({error:{details:[{reason:'API_KEY_INVALID'}]}},{status:400}),'AI_TEST_KEY'],
  [async()=>new Response('',{status:403}),'AI_TEST_HTTP_403'],
  [async()=>Response.json({error:{}},{status:404}),'AI_TEST_HTTP_404'],
  [async()=>{throw Error('secret '+apiKey);},'AI_TEST_NETWORK'],
  [async()=>Response.json({}), 'AI_TEST_FORMAT']
 ];
 for(const [fetcher,code]of cases)await assert.rejects(()=>testConnection({apiKey},fetcher),e=>e.code===code&&!e.message.includes(apiKey));
});
test('connection check cancellation cleans up, and invalid key never sends a request',async()=>{
 let calls=0;await assert.rejects(()=>testConnection({apiKey:''},async()=>{calls++;}),{code:'AI_TEST_KEY'});assert.equal(calls,0);
 const c=new AbortController();
 const request=testConnection({apiKey,signal:c.signal},async()=>new Promise(()=>{}));c.abort();
 await assert.rejects(()=>request,{name:'AbortError'});
});
test('generation stages identify headers versus response body without exposing key or payload',async()=>{
 const stages=[];
 await analyzeMeal({apiKey,description:'白飯',onStage:stage=>stages.push(stage)},async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({name:'白飯',portion:'一碗',note:'',calories:250,protein:5,carbs:55,fiber:null,fat:0.5})}]}}]}));
 assert.deepEqual(stages,['request','headers','body','parse']);
});

test('tiny generation probe uses selected model, sends OK prompt only and makes one request',async()=>{
 let calls=0;
 const result=await testConnection({apiKey,generation:true},async(url,options)=>{
  calls++;assert.equal(url.endsWith(DEFAULT_MODEL+':generateContent'),true);assert.equal(options.method,'POST');
  const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[0].text,'Reply with OK only.');
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
  assert.equal(options.body.includes(apiKey),false);assert.equal(options.body.includes('白飯'),false);
  return Response.json({candidates:[{content:{parts:[{text:'OK'}]}}]});
 });
 assert.equal(calls,1);assert.equal(result.code,'AI_GENERATE_OK');assert.equal(result.model,DEFAULT_MODEL);
});
test('original model remains selectable with its supported thinking level',async()=>{
 let urlSeen;
 await analyzeMeal({apiKey,model:'gemini-3.8-flash',description:'白飯'},async(url,options)=>{
  urlSeen=url;assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig.thinkingLevel,'low');
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({name:'白飯',portion:'一碗',note:'',calories:250,protein:5,carbs:55,fiber:null,fat:0.5})}]}}]});
 });
 assert.equal(urlSeen.includes('gemini-3.8-flash:generateContent'),true);
});
test('tiny generation has a distinct timeout and incomplete-output diagnosis',async()=>{
 await assert.rejects(()=>testConnection({apiKey,generation:true,timeoutMs:10},async()=>new Promise(()=>{})),{code:'AI_GENERATE_TIMEOUT'});
 await assert.rejects(()=>testConnection({apiKey,generation:true},async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})),{code:'AI_GENERATE_RESPONSE'});
});
test('unsupported model is rejected before sending credentials',async()=>{
 let calls=0;const fetcher=async()=>{calls++;};
 await assert.rejects(()=>testConnection({apiKey,model:'https://untrusted.example'},fetcher),{code:'AI_MODEL'});
 await assert.rejects(()=>analyzeMeal({apiKey,model:'unknown',description:'白飯'},fetcher),{code:'AI_MODEL'});
 assert.equal(calls,0);
});
