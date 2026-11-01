import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validate} from '../core.js';
import {validateFavorites,searchFavorites,scaleFavorite} from '../favorites.js';
const food=(changes={})=>({id:'sweet-potato',name:'蒸地瓜',mode:'weight',baseAmount:100,revision:1,portionLabel:'',ingredients:'地瓜',calories:120,protein:2,carbs:28,fiber:null,fat:0,...changes});

test('weight conversion uses saved basis for 50g, 60g and non-100g baselines',()=>{
 const f=food(),before=JSON.stringify(f);
 assert.equal(scaleFavorite(f,50).calories,60);assert.equal(scaleFavorite(f,60).calories,72);
 assert.equal(scaleFavorite(f,60).protein,1.2);assert.equal(scaleFavorite(f,60).fiber,null);assert.equal(scaleFavorite(f,60).fat,0);
 assert.equal(scaleFavorite(food({baseAmount:50,calories:60}),60).calories,72);assert.equal(JSON.stringify(f),before);
});
test('fixed recipes support half and double servings without requests',()=>{
 const f=food({name:'綠拿鐵',mode:'serving',baseAmount:1,ingredients:'蔬菜 100g、豆漿 200ml',portionLabel:'一杯',calories:200});
 assert.equal(scaleFavorite(f,.5).calories,100);assert.equal(scaleFavorite(f,2).calories,400);
 assert.equal(scaleFavorite(f,1).ingredients,f.ingredients);assert.match(scaleFavorite(f,1).portion,/1 份/);
});
test('updating recipes preserves old meal snapshots across backup round trips',()=>{
 const d=defaults(),f=food({name:'綠拿鐵',mode:'serving',baseAmount:1,ingredients:'舊配方'});d.favorites=[f];
 d.meals=[{id:'meal',date:'2026-11-01',meal:'早餐',...scaleFavorite(f,1)}];
 const old=structuredClone(d.meals[0]);d.favorites[0]={...f,revision:2,ingredients:'新配方',calories:300};
 const restored=validate(JSON.parse(JSON.stringify(d)));
 assert.deepEqual(restored.meals[0],old);assert.equal(restored.favorites[0].revision,2);
 assert.equal(scaleFavorite(restored.favorites[0],1).calories,300);assert.equal(restored.meals[0].ingredients,'舊配方');
});
test('old backups acquire an empty favorites collection while preserving all old records',()=>{
 const d=defaults();delete d.favorites;d.water=[{id:'w',date:'2026-11-01',ml:250}];
 const restored=validate(d);assert.deepEqual(restored.favorites,[]);assert.deepEqual(restored.water,d.water);
});
test('lookup matches partial names and English case without silently choosing a template',()=>{
 const f=[food(),food({id:'tea',name:'Green Latte'}),food({id:'roasted',name:'烤地瓜'})];
 assert.equal(searchFavorites(f,'地瓜').length,2);assert.equal(searchFavorites(f,'green LATTE')[0].id,'tea');
 assert.equal(searchFavorites(f,'不存在').length,0);assert.equal(searchFavorites(f,'蒸地瓜')[0].id,'sweet-potato');
});
test('invalid templates, duplicate names and destructive null backups are rejected',()=>{
 for(const changes of [{baseAmount:0},{baseAmount:-1},{calories:-1},{calories:Infinity},{revision:0},{name:''},{mode:'other'},{ingredients:4}])assert.throws(()=>validateFavorites([food(changes)]));
 assert.throws(()=>validateFavorites([food(),food({id:'another',name:' 蒸地瓜 '})]));
 assert.throws(()=>validate({...defaults(),favorites:null}));
 assert.throws(()=>validateFavorites([food(Object.fromEntries(['calories','protein','carbs','fiber','fat'].map(k=>[k,null])))]));
});
test('invalid quantities and overflowing nutrition are rejected before saving',()=>{
 for(const value of [0,-1,NaN,Infinity,100001])assert.throws(()=>scaleFavorite(food(),value));
 assert.throws(()=>scaleFavorite(food({baseAmount:.001}),100000));
});
test('favorite backups reject duplicates without mutating current data',()=>{
 const d=defaults();d.favorites=[food()];const before=JSON.stringify(d);
 const broken=structuredClone(d);broken.favorites.push(food());assert.throws(()=>validate(broken));assert.equal(JSON.stringify(d),before);
});
