import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validate} from '../core.js';
import {parseLabel} from '../label.js';
import {analyzeNutritionLabel,AI_TIMEOUT_MS} from '../ai.js';
import {validateFavorites,scaleFavorite,favoriteUnits,convertFavoriteAmount} from '../favorites.js';

const photo='data:image/png;base64,iVBORw0KGgo=';
const key='test-only-not-a-real-api-key';
const label=(changes={})=>({name:'蛋白粉',sourceColumn:'每份',basisAmount:30,basisUnit:'g',servingSize:30,servingUnit:'g',ingredients:'測試原料',note:'',calories:120,protein:24,carbs:3,fiber:null,fat:1,...changes});
const favorite=(changes={})=>({id:'label-item',name:'蛋白粉',mode:'weight',baseAmount:30,servingSize:30,servingUnit:'g',revision:1,portionLabel:'一匙',ingredients:'測試原料',calories:120,protein:24,carbs:3,fiber:null,fat:1,labelPhoto:photo,labelConfirmed:true,sourceColumn:'每份',labelNote:'核對過',...changes});
const response=value=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]});

test('per-serving label is kept on one basis and 15g is exactly half a 30g serving',()=>{
 const parsed=parseLabel(JSON.stringify(label()));assert.equal(parsed.basisAmount,30);assert.equal(parsed.protein,24);
 const f=validateFavorites([favorite()])[0];assert.equal(scaleFavorite(f,15).protein,12);assert.equal(scaleFavorite(f,.5,'serving').protein,12);
 assert.deepEqual(favoriteUnits(f),['g','serving']);assert.equal(convertFavoriteAmount(f,15,'g','serving'),.5);assert.equal(convertFavoriteAmount(f,.5,'serving','g'),15);
});
test('per-100ml label and serving size convert independently without grams conversion',()=>{
 const parsed=parseLabel(JSON.stringify(label({sourceColumn:'每100ml',basisUnit:'ml',basisAmount:100,servingSize:250,servingUnit:'ml',calories:40,protein:3})));
 const f=favorite({mode:'volume',baseAmount:parsed.basisAmount,servingSize:250,servingUnit:'ml',calories:40,protein:3});
 assert.equal(scaleFavorite(f,250,'ml').calories,100);assert.equal(scaleFavorite(f,1,'serving').protein,7.5);
 assert.equal(convertFavoriteAmount(f,250,'ml','serving'),1);assert.throws(()=>scaleFavorite(f,250,'g'));
});
test('fixed recipe with an explicit physical serving size supports g without assuming g equals ml',()=>{
 const f=favorite({mode:'serving',baseAmount:1,servingSize:30});
 assert.equal(scaleFavorite(f,15,'g').protein,12);assert.equal(scaleFavorite(f,1,'serving').protein,24);
 assert.throws(()=>scaleFavorite(f,15,'ml'));assert.throws(()=>validateFavorites([favorite({servingUnit:'ml'})]));
});
test('unknown basis and missing nutrient remain unknown, known zero stays zero',()=>{
 const parsed=parseLabel(JSON.stringify(label({basisAmount:null,basisUnit:'unknown',servingSize:null,servingUnit:'unknown',fat:0})));
 assert.equal(parsed.basisAmount,null);assert.equal(parsed.fiber,null);assert.equal(parsed.fat,0);
 const parsedServing=parseLabel(JSON.stringify(label({basisUnit:'serving',basisAmount:1,servingSize:null,servingUnit:'unknown'})));
 assert.equal(parsedServing.basisUnit,'serving');
});
test('invalid/missing/string nutrition, zero basis and cross-unit labels are rejected',()=>{
 for(const changes of [{basisAmount:0},{basisUnit:'mg'},{servingSize:-1},{protein:'24'},{protein:-1},{protein:undefined},{servingUnit:'ml'}])assert.throws(()=>parseLabel(JSON.stringify(label(changes))));
});
test('JSON overflow cannot become a numeric nutrition value',()=>{
 assert.throws(()=>parseLabel(JSON.stringify(label()).replace('"calories":120','"calories":1e400')));
});

test('photos, confirmation and unit basis round trip in backup; meals keep old snapshots',()=>{
 const d=defaults();d.favorites=[favorite()];d.meals=[{id:'m',date:'2026-11-01',meal:'早餐',...scaleFavorite(d.favorites[0],15)}];
 const old=structuredClone(d.meals[0]);d.favorites[0]={...d.favorites[0],revision:2,labelPhoto:'data:image/jpeg;base64,AAAA',protein:20};
 const restored=validate(JSON.parse(JSON.stringify(d)));assert.equal(restored.favorites[0].labelPhoto,'data:image/jpeg;base64,AAAA');assert.equal(restored.favorites[0].servingSize,30);
 assert.deepEqual(restored.meals[0],old);assert.equal(restored.meals[0].protein,12);assert.equal('labelPhoto' in restored.meals[0],false);
});
test('unconfirmed, oversized and remote photos cannot be saved in favorite backups',()=>{
 for(const changes of [{labelConfirmed:false},{labelPhoto:'https://example.com/image.jpg'},{labelPhoto:'data:image/jpeg;base64,'+'A'.repeat(8000000)},{servingSize:0}])assert.throws(()=>validateFavorites([favorite(changes)]));
});
test('legacy favorites still validate without photos, units or serving metadata',()=>{
 const old=favorite();for(const k of ['labelPhoto','labelConfirmed','sourceColumn','labelNote','servingSize','servingUnit'])delete old[k];
 const restored=validateFavorites([old])[0];assert.deepEqual(restored,old);assert.deepEqual(favoriteUnits(restored),['g']);assert.equal(scaleFavorite(restored,15).protein,12);
});
test('label request sends only label photo and OCR prompt, preserves selected schema and keeps key out of body',async()=>{
 let calls=0;
 const result=await analyzeNutritionLabel({photo,apiKey:key,weights:[{weight:70}],meals:[{name:'private'}]},async(url,options)=>{
  calls++;assert.match(url,/:generateContent$/);assert.equal(options.headers['x-goog-api-key'],key);
  assert.equal(options.body.includes(key),false);assert.equal(options.body.includes('private'),false);assert.equal(options.body.includes('weights'),false);
  const body=JSON.parse(options.body);assert.match(body.contents[0].parts[0].text,/不估算食物/);assert.match(body.contents[0].parts[0].text,/禁止把兩欄混用/);
  assert.equal(body.contents[0].parts[1].inlineData.data,'iVBORw0KGgo=');assert.ok(body.generationConfig.responseSchema.properties.basisUnit);
  assert.equal(options.cache,'no-store');return response(label());
 });
 assert.equal(calls,1);assert.equal(result.protein,24);assert.equal(result.sourceColumn,'每份');assert.equal(AI_TIMEOUT_MS,90000);
});
test('missing key, invalid photo, malformed label and HTTP rejection never produce a saved template or retry',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return response(label());};
 for(const input of [{photo},{apiKey:key},{apiKey:key,photo:'http://example.com/photo'}])await assert.rejects(()=>analyzeNutritionLabel(input,fetcher));
 assert.equal(calls,0);
 await assert.rejects(()=>analyzeNutritionLabel({photo,apiKey:key},async()=>response(label({protein:'24'}))),{code:'AI_LABEL_FORMAT'});
 await assert.rejects(()=>analyzeNutritionLabel({photo,apiKey:key},async()=>{calls++;return new Response('',{status:429});}),{code:'AI_HTTP_429'});assert.equal(calls,1);
});
test('label timeout bounds stalled fetch AND response body; cancellation is distinct and never retries',async()=>{
 const never=()=>new Promise(()=>{});let calls=0;
 await assert.rejects(()=>analyzeNutritionLabel({photo,apiKey:key,timeoutMs:10},async()=>{calls++;return never();}),{code:'AI_LABEL_TIMEOUT'});
 await assert.rejects(()=>analyzeNutritionLabel({photo,apiKey:key,timeoutMs:10},async()=>({ok:true,json:never})),{code:'AI_LABEL_TIMEOUT'});
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>analyzeNutritionLabel({photo,apiKey:key,signal:controller.signal},async()=>{calls++;return response(label());}),{name:'AbortError'});assert.equal(calls,1);
});
