import {nutritionKeys} from './favorites.js';

export function labelPhotoFields(record,esc){
 return '<section class="label-photo-section"><h3>營養標示照片</h3><p class="cover-note">拍清楚品名、每份重量與整張營養表；辨識後請核對數字與單位。</p><label class="field">拍照／選取營養標示<input id="labelPhotoFile" type="file" accept="image/*"></label><img id="labelPhotoPreview" class="photo-preview" alt="營養標示原圖" '+(record.labelPhoto?'src="'+esc(record.labelPhoto)+'"':'hidden')+'><button type="button" class="text-btn" id="removeLabelPhoto" '+(!record.labelPhoto?'hidden':'')+'>移除這張標示照片</button><div id="labelTools" '+(!record.labelPhoto?'hidden':'')+'><label class="field">本次 Google AI 金鑰（已啟用可留空）<input id="labelAIKey" type="password" autocomplete="off" placeholder="僅本次使用，不存入備份"></label><p class="cover-note">只送出這張營養標示，不含其他紀錄。免費方案內容可能用於改善 Google 產品。辨識使用一次 API 額度；儲存後換算不需 AI。也可照照片手動填入。</p><div class="actions"><button type="button" class="btn secondary" id="readLabelPhoto">同意送出照片並辨識</button><button type="button" class="btn quiet" id="stopLabelPhoto" hidden>停止辨識</button></div><p id="labelStatus" class="cover-note" role="status" aria-live="polite"></p><p id="labelError" class="error" role="alert"></p><label class="label-confirm"><input id="labelConfirmed" class="check" type="checkbox" '+(record.labelConfirmed?'checked':'')+'>我已核對照片、營養數字及每份／每 100g／每 100ml 的計算基準</label></div><p id="labelSource" class="cover-note"></p></section>';
}

export function attachLabelPhoto(form,record,api,basis){
 const $=s=>form.querySelector(s),save=form.querySelector('[type="submit"]');
 let photo=record.labelPhoto||'',sourceColumn=record.sourceColumn||'',labelNote=record.labelNote||'',active=null,serial=0;
 const confirmed=$('#labelConfirmed'),read=$('#readLabelPhoto'),file=$('#labelPhotoFile'),stop=$('#stopLabelPhoto');
 const show=()=>{
  $('#labelTools').hidden=!photo;$('#labelPhotoPreview').hidden=!photo;$('#removeLabelPhoto').hidden=!photo;
  if(photo)$('#labelPhotoPreview').src=photo;else $('#labelPhotoPreview').removeAttribute('src');
  confirmed.required=!!photo;
  $('#labelSource').textContent=[sourceColumn?'標示欄位：'+sourceColumn:'',labelNote].filter(Boolean).join(' · ');
 };show();
 form.addEventListener('input',e=>{if([...nutritionKeys,'mode','baseAmount','servingSize','servingUnit'].includes(e.target.name))confirmed.checked=false;});
 file.onchange=async()=>{
  const selected=file.files[0];if(!selected)return;
  const request=++serial;save.disabled=true;read.disabled=true;$('#labelError').textContent='';$('#labelStatus').textContent='正在準備營養標示照片…';
  try{
   const converted=await api.imageData(selected,{maxDimension:2000,quality:.9});
   if(!form.isConnected||request!==serial)return;
   if(converted.length>8000000)throw Error('照片過大，請改用較小照片');
   photo=converted;sourceColumn='';labelNote='';confirmed.checked=false;show();
   $('#labelStatus').textContent='照片已準備好。可按辨識，或手動填入營養表；最後請核對並勾選確認。';
  }catch(error){if(form.isConnected&&request===serial){$('#labelError').textContent=error.message;$('#labelStatus').textContent='新照片未載入；原有資料保留。';}}
  finally{if(form.isConnected&&request===serial){save.disabled=false;read.disabled=false;}}
 };
 $('#removeLabelPhoto').onclick=()=>{active?.abort();serial++;photo='';sourceColumn='';labelNote='';file.value='';confirmed.checked=false;save.disabled=false;read.disabled=false;show();};
 read.onclick=async()=>{
  if(active||!photo)return;
  const controller=new AbortController();active=controller;
  const key=$('#labelAIKey').value.trim();$('#labelAIKey').value='';
  $('#labelError').textContent='';$('#labelStatus').textContent='正在辨識營養標示，最長等待 90 秒；尚未儲存。';
  const controls=[...form.querySelectorAll('input,select,textarea,button')].filter(el=>el!==stop),disabled=controls.map(el=>el.disabled);
  controls.forEach(el=>el.disabled=true);stop.hidden=false;stop.onclick=()=>controller.abort();
  const started=Date.now(),timer=setInterval(()=>{if(form.isConnected)$('#labelStatus').textContent='正在辨識營養標示 · '+Math.floor((Date.now()-started)/1000)+' 秒（最長 90 秒，可按停止）。';},1000);
  try{
   const draft=await api.recognizeLabel({photo,apiKey:key,controller});
   if(!form.isConnected||controller.signal.aborted)return;
   if(draft.name.trim())form.elements.name.value=draft.name;
   form.elements.mode.value=({g:'weight',ml:'volume',serving:'serving'})[draft.basisUnit]||'';
   form.elements.baseAmount.value=draft.basisAmount??'';
   form.elements.servingSize.value=draft.servingSize??'';
   form.elements.servingUnit.value=draft.servingUnit==='ml'?'ml':'g';
   if(draft.ingredients)form.elements.ingredients.value=draft.ingredients;
   for(const key of nutritionKeys)form.elements[key].value=draft[key]??'';
   sourceColumn=draft.sourceColumn;labelNote=draft.note;confirmed.checked=false;show();basis();
   $('#labelStatus').textContent='辨識結果已帶入，尚未儲存。請核對同一欄的數字、基準份量與單位；空白欄位可手動補填。';
  }catch(error){if(form.isConnected){$('#labelError').textContent=error.name==='AbortError'?'已停止辨識，照片與表單仍保留。':error.message;$('#labelStatus').textContent='尚未儲存，可手動填入或重新辨識。';}}
  finally{clearInterval(timer);active=null;if(form.isConnected){controls.forEach((el,i)=>el.disabled=disabled[i]);stop.hidden=true;basis();}}
 };
 return {snapshot(){
  if(active)throw Error('請先停止辨識或等待完成');
  return photo?{labelPhoto:photo,labelConfirmed:confirmed.checked,sourceColumn,labelNote}:{};
 }};
}
