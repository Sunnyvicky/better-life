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
