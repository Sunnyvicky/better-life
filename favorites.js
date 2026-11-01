export const nutritionKeys=['calories','protein','carbs','fiber','fat'];
const normalize=s=>String(s).trim().normalize('NFKC').toLocaleLowerCase();

export function validateFavorites(items=[]){
 if(!Array.isArray(items)||items.length>5000)throw Error('常用飲食資料格式或數量有誤');
 const ids=new Set(),names=new Set();
 return items.map(item=>{
  if(!item||typeof item.id!=='string'||!item.id||item.id.length>200||ids.has(item.id))throw Error('常用飲食識別有誤');
  if(typeof item.name!=='string'||!item.name.trim()||item.name.length>200)throw Error('請填入常用飲食名稱（最多 200 字）');
  const name=normalize(item.name);if(names.has(name))throw Error('常用飲食已有同名項目，請改用更新配方或不同名稱');
  if(!['weight','volume','serving'].includes(item.mode)||!Number.isFinite(item.baseAmount)||item.baseAmount<=0||item.baseAmount>100000)throw Error('請填入有效的基準重量、毫升或份數');
  if(!Number.isInteger(item.revision)||item.revision<1)throw Error('常用飲食版本有誤');
  for(const k of nutritionKeys)if(item[k]!==null&&(!Number.isFinite(item[k])||item[k]<0||item[k]>100000))throw Error('常用飲食營養值必須是非負數或空白');
  if(!nutritionKeys.some(k=>item[k]!=null))throw Error('請至少填入一項營養值');
  for(const k of ['ingredients','portionLabel'])if(typeof item[k]!=='string'||item[k].length>(k==='ingredients'?10000:200))throw Error('常用飲食的成分或份量文字有誤');
  const extra={};
  if(item.servingSize!=null){
   if(!Number.isFinite(item.servingSize)||item.servingSize<=0||item.servingSize>100000||!['g','ml'].includes(item.servingUnit))throw Error('每份的重量或容量有誤');
   if(item.mode==='weight'&&item.servingUnit!=='g'||item.mode==='volume'&&item.servingUnit!=='ml')throw Error('每份單位與計算基準不同，不能直接換算 g 與 ml');
   extra.servingSize=item.servingSize;extra.servingUnit=item.servingUnit;
  }
  if(item.labelPhoto!=null&&item.labelPhoto!==''){
   if(typeof item.labelPhoto!=='string'||item.labelPhoto.length>8000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.labelPhoto))throw Error('營養標示照片格式或大小有誤');
   if(item.labelConfirmed!==true)throw Error('請先核對照片中的計算基準與營養值，並勾選確認');
   extra.labelPhoto=item.labelPhoto;extra.labelConfirmed=true;
  }
  for(const k of ['sourceColumn','labelNote'])if(item[k]!=null){if(typeof item[k]!=='string'||item[k].length>1000)throw Error('營養標示來源說明有誤');extra[k]=item[k];}
  ids.add(item.id);names.add(name);
  return {...Object.fromEntries(['id','name','mode','baseAmount','revision','ingredients','portionLabel',...nutritionKeys].map(k=>[k,k==='name'?item.name.trim():item[k]])),...extra};
 });
}

export function searchFavorites(items,query){
 const q=normalize(query);
 return items.filter(item=>!q||normalize(item.name).includes(q)).sort((a,b)=>{
  const rank=item=>normalize(item.name)===q?0:normalize(item.name).startsWith(q)?1:2;
  return rank(a)-rank(b)||a.name.localeCompare(b.name,'zh-TW');
 });
}

export const favoriteUnit=item=>item.mode==='weight'?'g':item.mode==='volume'?'ml':'serving';
export function favoriteUnits(item){
 const primary=favoriteUnit(item),units=[primary];
 if(item.servingSize>0)units.push(primary==='serving'?item.servingUnit:'serving');
 return units;
}
export function convertFavoriteAmount(item,amount,from,to){
 validateFavorites([item]);
 if(!favoriteUnits(item).includes(from)||!favoriteUnits(item).includes(to)||!Number.isFinite(amount)||amount<=0)throw Error('無法換算此單位');
 if(from===to)return amount;
 const equivalent=from==='serving'?amount*item.servingSize:amount/item.servingSize;
 if(!Number.isFinite(equivalent)||equivalent<=0||equivalent>100000)throw Error('換算後用量過大，請確認單位');
 return Math.round(equivalent*100000000)/100000000;
}
export function scaleFavorite(item,amount,unit=favoriteUnit(item)){
 validateFavorites([item]);
 if(!Number.isFinite(amount)||amount<=0||amount>100000)throw Error('重量或份數必須大於 0，且不超過 100000');
 if(!favoriteUnits(item).includes(unit))throw Error('此項目沒有這個單位的換算基準，不能直接換算 g 與 ml');
 const primary=favoriteUnit(item);
 const basisAmount=unit===primary?amount:primary==='serving'?amount/item.servingSize:amount*item.servingSize;
 const ratio=basisAmount/item.baseAmount;
 const result={name:item.name,portion:unit!=='serving'?amount+' '+unit:amount+' 份'+(item.portionLabel?'（'+item.portionLabel+'）':''),ingredients:item.ingredients,favoriteId:item.id,favoriteRevision:item.revision,favoriteAmount:amount,favoriteUnit:unit};
 for(const k of nutritionKeys){
  const value=item[k]==null?null:Math.round(item[k]*ratio*10000)/10000;
  if(value!=null&&(!Number.isFinite(value)||value>100000))throw Error('換算後數值過大，請確認重量或份數');
  result[k]=value;
 }
 return result;
}
