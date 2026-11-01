export const nutritionKeys=['calories','protein','carbs','fiber','fat'];
const normalize=s=>String(s).trim().normalize('NFKC').toLocaleLowerCase();

export function validateFavorites(items=[]){
 if(!Array.isArray(items)||items.length>5000)throw Error('常用飲食資料格式或數量有誤');
 const ids=new Set(),names=new Set();
 return items.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||item.id.length>200||ids.has(item.id))throw Error('常用飲食識別有誤');
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>200)throw Error('請填入常用飲食名稱（最多 200 字）');
  const name=normalize(item.name);if(names.has(name))throw Error('常用飲食已有同名項目，請改用更新配方或不同名稱');
  if(!['weight','serving'].includes(item.mode)||!Number.isFinite(item.baseAmount)||item.baseAmount<=0||item.baseAmount>100000)throw Error('請填入有效的基準重量或份數');
  if(!Number.isInteger(item.revision)||item.revision<1)throw Error('常用飲食版本有誤');
  for(const k of nutritionKeys)if(item[k]!==null&&(!Number.isFinite(item[k])||item[k]<0||item[k]>100000))throw Error('常用飲食營養值必須是非負數或空白');
  if(!nutritionKeys.some(k=>item[k]!=null))throw Error('請至少填入一項營養值');
  for(const k of ['ingredients','portionLabel'])if(typeof item[k]!=='string'||item[k].length>(k==='ingredients'?10000:200))throw Error('常用飲食的成分或份量文字有誤');
  ids.add(item.id);names.add(name);
  return Object.fromEntries(['id','name','mode','baseAmount','revision','ingredients','portionLabel',...nutritionKeys].map(k=>[k,k==='name'?item.name.trim():item[k]]));
 });
}

export function searchFavorites(items,query){
 const q=normalize(query);
 return items.filter(item=>!q||normalize(item.name).includes(q)).sort((a,b)=>{
  const rank=item=>normalize(item.name)===q?0:normalize(item.name).startsWith(q)?1:2;
  return rank(a)-rank(b)||a.name.localeCompare(b.name,'zh-TW');
 });
}

export function scaleFavorite(item,amount){
 validateFavorites([item]);
 if(!Number.isFinite(amount)||amount<=0||amount>100000)throw Error('重量或份數必須大於 0，且不超過 100000');
 const ratio=amount/item.baseAmount;
 const result={name:item.name,portion:item.mode==='weight'?amount+' g':amount+' 份'+(item.portionLabel?'（'+item.portionLabel+'）':''),ingredients:item.ingredients,favoriteId:item.id,favoriteRevision:item.revision,favoriteAmount:amount};
 for(const k of nutritionKeys){
  const value=item[k]==null?null:Math.round(item[k]*ratio*10000)/10000;
  if(value!=null&&(!Number.isFinite(value)||value>100000))throw Error('換算後數值過大，請確認重量或份數');
  result[k]=value;
 }
 return result;
}
