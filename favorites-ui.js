import {labelPhotoFields,attachLabelPhoto} from './label-ui.js';
import {nutritionKeys,validateFavorites,searchFavorites,scaleFavorite,favoriteUnit,favoriteUnits,convertFavoriteAmount} from './favorites.js';

export function createFavoritesUI(api){
 const {getData,commit,modal,close,toast,edit,field,number,area,footer,esc,btn,uid}=api;
 const $=s=>document.querySelector(s);
 const nutritionFields=record=>nutritionKeys.map((k,i)=>number(['熱量 大卡','蛋白質 g','碳水 g','纖維 g','脂肪 g'][i],k,record[k])).join('');
 function manage(){
  modal('常用飲食', '<p class="cover-note">儲存一次，之後選取名稱即可帶入，不需要 AI。更新配方不會更動舊紀錄。</p><div class="actions">'+btn('＋ 新增常用飲食','favoriteNew')+'</div><label class="field">搜尋常用飲食<input id="favoriteSearch" type="search" placeholder="例如：地瓜、綠拿鐵"></label><div id="favoriteList"></div>');
  const draw=()=>{
   const matches=searchFavorites(getData().favorites,$('#favoriteSearch').value);
   $('#favoriteList').innerHTML=matches.length?matches.map(item=>'<article class="favorite-item"><div><strong>'+esc(item.name)+'</strong><p class="cover-note">'+(item.mode==='serving'?'固定配方 · '+esc(item.portionLabel||'一份'):'按'+(item.mode==='volume'?'容量':'重量')+'換算 · 基準 '+item.baseAmount+' '+favoriteUnit(item))+'</p></div><div class="actions"><button class="btn secondary" data-use-favorite="'+esc(item.id)+'">帶入紀錄</button><button class="text-btn" data-edit-favorite="'+esc(item.id)+'">更新配方</button></div></article>').join(''):'<p class="cover-note">沒有符合的常用飲食，可新增或從飲食紀錄存入。</p>';
  };
  $('#favoriteSearch').oninput=draw;
  $('#favoriteList').onclick=e=>{
   const use=e.target.closest('[data-use-favorite]'),update=e.target.closest('[data-edit-favorite]');
   if(use){const item=getData().favorites.find(x=>x.id===use.dataset.useFavorite);if(item)edit('meals',null,scaleFavorite(item,item.mode==='serving'?1:item.baseAmount));}
   if(update)editor(update.dataset.editFavorite);
  };draw();
 }
 function editor(id=null,seed={}){
  const existing=id?getData().favorites.find(x=>x.id===id):null;
  if(id&&!existing)return toast('找不到這筆常用飲食');
  const record=existing||{name:seed.name||'',mode:'serving',baseAmount:1,portionLabel:seed.portion||'',ingredients:seed.ingredients||seed.note||'',...Object.fromEntries(nutritionKeys.map(k=>[k,seed[k]??null]))};
  modal(id?'更新常用配方':'新增常用飲食','<form id="favoriteForm">'+labelPhotoFields(record,esc)+'<p class="cover-note">填入基準份量與相對應的營養值；也可用上方照片辨識後核對。</p><div class="form-grid">'+field('常用飲食名稱 *','name','text',record.name,'required maxlength="200"')+'<label class="field">計算方式<select name="mode" required><option value="">請核對單位</option><option value="serving" '+(record.mode==='serving'?'selected':'')+'>固定配方（每一份）</option><option value="weight" '+(record.mode==='weight'?'selected':'')+'>按重量計算（g）</option><option value="volume" '+(record.mode==='volume'?'selected':'')+'>按容量計算（ml）</option></select></label><div id="favoriteWeight">'+'<label class="field"><span id="favoriteBaseLabel">營養資料對應的基準數量 *</span><input name="baseAmount" type="number" min="0.001" max="100000" step="any" required value="'+(record.mode==='serving'?100:record.baseAmount)+'"></label>'+'</div>'+field('一份的說明（選填）','portionLabel','text',record.portionLabel,'maxlength="200"')+'<div class="full serving-equivalent"><p class="cover-note">每份重量／容量（選填，填入後可改用份數換算）</p><div class="form-grid">'+number('每份相當於多少','servingSize',record.servingSize,false,.001)+'<label class="field">每份單位<select name="servingUnit"><option value="g" '+(record.servingUnit!=='ml'?'selected':'')+'>g</option><option value="ml" '+(record.servingUnit==='ml'?'selected':'')+'>ml</option></select></label></div></div><div class="full">'+area('食材／成分（記下一份或基準重量的內容）','ingredients',record.ingredients)+'</div></div><p id="favoriteBasis" class="notice"></p><div class="form-grid">'+nutritionFields(record)+'</div>'+footer+'</form>');
  const form=$('#favoriteForm');
  const basis=()=>{
   const mode=form.elements.mode.value,isServing=mode==='serving',unit=mode==='volume'?'ml':'g';
   $('#favoriteWeight').hidden=isServing;form.elements.baseAmount.disabled=isServing;
   $('#favoriteBaseLabel').textContent='營養資料對應的基準'+(mode==='volume'?'容量 ml':'重量 g')+' *';
   form.elements.servingUnit.disabled=mode==='weight'||mode==='volume';
   if(form.elements.servingUnit.disabled)form.elements.servingUnit.value=unit;
   $('#favoriteBasis').textContent=!mode?'請核對照片，選擇計算單位並填入基準份量。':isServing?'下列營養值對應一份，可使用 0.5 份、1 份或 2 份。':'下列營養值對應 '+(form.elements.baseAmount.value||'—')+' '+unit+'；不是整包總重量。';
  };
  form.elements.mode.onchange=basis;form.elements.baseAmount.oninput=basis;basis();
  const labelBinding=attachLabelPhoto(form,record,api,basis);
  form.onsubmit=async e=>{
   e.preventDefault();const save=form.querySelector('[type="submit"]');save.disabled=true;
   try{
    const f=new FormData(form),item={id:existing?.id||uid(),name:String(f.get('name')).trim(),mode:f.get('mode'),baseAmount:f.get('mode')==='serving'?1:Number(f.get('baseAmount')),portionLabel:String(f.get('portionLabel')).trim(),ingredients:String(f.get('ingredients')).trim(),revision:(existing?.revision||0)+1};
    if(f.get('servingSize')!==''){item.servingSize=Number(f.get('servingSize'));item.servingUnit=f.get('mode')==='weight'?'g':f.get('mode')==='volume'?'ml':f.get('servingUnit');}
    Object.assign(item,labelBinding.snapshot());
    for(const k of nutritionKeys)item[k]=f.get(k)===''?null:Number(f.get(k));
    await commit(d=>{const next=d.favorites.filter(x=>x.id!==item.id);next.push(item);d.favorites=validateFavorites(next);});
    close();toast(existing?'配方已更新，舊飲食紀錄保持原樣':'已存為常用飲食');manage();
   }catch(error){$('#formError').textContent=error.message;save.disabled=false;}
  };
 }
 function attachMealForm(form,record){
  let selected=null,amount=null,unit=null;
  const name=form.elements.name,results=$('#favoriteMatches'),quantity=$('#favoriteQuantity'),quantityBox=$('#favoriteQuantityBox'),unitField=$('#favoriteQuantityUnit');
  const draw=()=>{
   const query=name.value.trim(),matches=query?searchFavorites(getData().favorites,query).slice(0,8):[];
   results.innerHTML=matches.map(item=>'<button type="button" class="favorite-match" data-pick-favorite="'+esc(item.id)+'"><strong>'+esc(item.name)+'</strong><small>'+(item.mode==='serving'?'固定配方':item.mode==='volume'?'按容量換算':'按重量換算')+'</small></button>').join('');
  };
  const showQuantity=()=>{
   quantityBox.hidden=!selected;
   if(selected){
    const units=favoriteUnits(selected);unit=unit||favoriteUnit(selected);
    unitField.innerHTML=units.map(u=>'<option value="'+u+'" '+(u===unit?'selected':'')+'>'+({g:'g（克）',ml:'ml（毫升）',serving:'份'})[u]+'</option>').join('');
    $('#favoriteQuantityLabel').textContent=units.length>1?'實際用量':unit==='g'?'實際重量 g':unit==='ml'?'實際容量 ml':'份數';
    quantity.value=amount;$('#favoriteSelected').textContent='已帶入「'+selected.name+'」；調整用量會自動換算。';
   }
  };
  const apply=()=>{
   const draft=scaleFavorite(selected,Number(quantity.value),unit);amount=Number(quantity.value);
   for(const k of ['name','portion','ingredients',...nutritionKeys])form.elements[k].value=draft[k]??'';
   $('#favoriteCalculationError').textContent='';
  };
  name.addEventListener('input',()=>{selected=null;quantityBox.hidden=true;draw();});
  results.onclick=e=>{
   const button=e.target.closest('[data-pick-favorite]');if(!button)return;
   selected=getData().favorites.find(x=>x.id===button.dataset.pickFavorite);amount=selected.mode==='serving'?1:selected.baseAmount;unit=favoriteUnit(selected);
   showQuantity();apply();results.innerHTML='';
  };
  unitField.onchange=()=>{const previous=unit;try{quantity.value=convertFavoriteAmount(selected,Number(quantity.value),previous,unitField.value);unit=unitField.value;apply();}catch(error){unitField.value=previous;$('#favoriteCalculationError').textContent=error.message;}};
  quantity.addEventListener('input',()=>{try{apply();}catch(error){$('#favoriteCalculationError').textContent=error.message;}});
  // Never reapply a newer recipe while opening an existing meal for editing.
  const original=getData().favorites.find(x=>x.id===record.favoriteId&&x.revision===record.favoriteRevision);
  if(original){selected=original;amount=record.favoriteAmount;unit=record.favoriteUnit||favoriteUnit(original);showQuantity();}
  return {snapshot(){
   if(selected){if($('#favoriteCalculationError').textContent)throw Error('請確認重量或份數');scaleFavorite(selected,Number(quantity.value),unit);return {favoriteId:selected.id,favoriteRevision:selected.revision,favoriteAmount:Number(quantity.value),favoriteUnit:unit};}
   return record.favoriteId&&name.value===record.name?{favoriteId:record.favoriteId,favoriteRevision:record.favoriteRevision,favoriteAmount:record.favoriteAmount,...(record.favoriteUnit?{favoriteUnit:record.favoriteUnit}:{})}:{};
  }};
 }
 return {manage,editor,attachMealForm};
}
