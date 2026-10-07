/* STICHA v2 — offline-first, Supabase-ready digital measurement book. */
(() => {
  'use strict';

  const STORAGE_KEY = 'sticha_v2_data';
  const SETTINGS_KEY = 'sticha_v2_settings';
  const DB_NAME = 'sticha_offline_db';
  const DB_VERSION = 1;
  const STORE = 'app';
  const PENDING_SYNC_PREFIX = 'sticha_pending_sync_';
  const PENDING_DELETE_PREFIX = 'sticha_pending_delete_';

  const demoCustomers = [
    { id:'demo-1', name:'Aisha Bello', phone:'0803 123 4567', gender:'Female', category:'Dress', date:'Today', startDate:'', deliveryDate:'', unit:'in', notes:'Prefers a comfortable fit. Gold zipper.', measurements:{Bust:'34',Waist:'28',Hip:'38',Shoulder:'15',Sleeve:'24',Length:'58'}, history:[], price:'', paid:'', status:'In progress' },
    { id:'demo-2', name:'Tunde Adeyemi', phone:'0812 445 7788', gender:'Male', category:'Native wear', date:'Yesterday', startDate:'', deliveryDate:'', unit:'in', notes:'Keep native top slightly loose.', measurements:{Chest:'42',Shoulder:'18',Sleeve:'25', 'Buba Length':'31','Trouser Waist':'36','Trouser Length':'42'}, history:[], price:'', paid:'', status:'In progress' },
    { id:'demo-3', name:'Mariam Yusuf', phone:'0901 778 2345', gender:'Female', category:'Gown', date:'Sep 29', startDate:'', deliveryDate:'', unit:'in', notes:'', measurements:{Bust:'36',Waist:'30',Hip:'40',Shoulder:'14.5',Sleeve:'23',Length:'60'}, history:[], price:'', paid:'', status:'Ready' },
    { id:'demo-4', name:'David Okafor', phone:'0705 222 1100', gender:'Male', category:'Shirt', date:'Sep 27', initial:'D', startDate:'', deliveryDate:'', unit:'in', notes:'French cuff.', measurements:{Chest:'40',Shoulder:'17',Sleeve:'24',Length:'29',Waist:'34',Neck:'16'}, history:[], price:'', paid:'', status:'In progress' }
  ];

  const templates = {
    dress:['Bust','Waist','Hip','Shoulder','Sleeve','Length'],
    native:['Chest','Shoulder','Sleeve','Buba Length','Trouser Waist','Trouser Length'],
    shirt:['Neck','Chest','Shoulder','Sleeve','Shirt Length','Waist'],
    trouser:['Waist','Hip','Thigh','Knee','Inseam','Trouser Length'],
    agbada:['Chest','Shoulder','Sleeve','Agbada Length','Trouser Waist','Trouser Length']
  };
  const commonCustom = ['Neck','Armhole','Bicep','Wrist','Back Length','Front Length'];

  const tonePresets = [
    {id:'classic',name:'Classic Bell',notes:[660,880,1046],type:'sine'},
    {id:'urgent',name:'Urgent Pulse',notes:[740,740,980,980],type:'square'},
    {id:'double',name:'Double Alert',notes:[520,780,520,780],type:'triangle'},
    {id:'rising',name:'Rising Signal',notes:[440,554,659,880],type:'sine'},
    {id:'bright',name:'Bright Chime',notes:[784,988,1174],type:'sine'},
    {id:'deep',name:'Deep Guard',notes:[220,330,220],type:'triangle'},
    {id:'rapid',name:'Rapid Warning',notes:[880,660,880,660,880],type:'square'},
    {id:'soft',name:'Soft Reminder',notes:[523,659,784],type:'sine'}
  ];

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let customers = [];
  let selectedCustomer = null;
  let currentTemplate = 'dress';
  let currentUnit = localStorage.getItem('sticha_unit') || 'in';
  let audioContext = null;
  let reminderTimer = null;
  let searchTimer = null;
  let dbPromise = null;
  let isDemo = false;
  let currentUser = null;
  let currentProfile = null;

  const defaultSettings = {
    theme:'sticha', textTheme:'classic', alarmEnabled:false, alarmTime:'08:00', tone:'classic',
    cloudStatus:'Local only', lastSync:null
  };
  let settings = {...defaultSettings, ...safeJSON(localStorage.getItem(SETTINGS_KEY), {})};

  function safeJSON(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
  function escapeHTML(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function uid(prefix='id') { try { return crypto.randomUUID(); } catch { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`; } }
  function localDateInputValue(date=new Date()) { const d=new Date(date); const offset=d.getTimezoneOffset(); return new Date(d.getTime()-offset*60000).toISOString().slice(0,10); }
  function parseDateOnly(value) { if(!value) return null; const [y,m,d]=value.split('-').map(Number); return y&&m&&d ? new Date(y,m-1,d) : null; }
  function formatDate(value) { const d=parseDateOnly(value); return d ? d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}) : 'Not set'; }
  function formatMoney(value) { const n=Number(value||0); return Number.isFinite(n) && n ? `₦${n.toLocaleString()}` : '₦0'; }
  function normalizeCustomer(c) {
    return {...c, id:c.id || uid('customer'), history:Array.isArray(c.history)?c.history:[], measurements:c.measurements||{}, customMeasurements:c.customMeasurements||[], unit:c.unit||'in', price:c.price||'', paid:c.paid||'', status:c.status||'In progress'};
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    if (!('indexedDB' in window)) return Promise.resolve(null);
    dbPromise = new Promise(resolve => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { const db=req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return dbPromise;
  }
  async function idbGet(key) {
    const db=await openDB(); if(!db) return null;
    return new Promise(resolve=>{const tx=db.transaction(STORE,'readonly'); const r=tx.objectStore(STORE).get(key); r.onsuccess=()=>resolve(r.result??null); r.onerror=()=>resolve(null);});
  }
  async function idbSet(key,value) {
    const db=await openDB(); if(!db) return false;
    return new Promise(resolve=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(value,key); tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false);});
  }

  function userStorageKey(){
    return currentUser?.id ? `sticha_customers_${currentUser.id}` : null;
  }
  function pendingSyncKey(){
    return currentUser?.id ? `${PENDING_SYNC_PREFIX}${currentUser.id}` : null;
  }
  function pendingDeleteKey(){
    return currentUser?.id ? `${PENDING_DELETE_PREFIX}${currentUser.id}` : null;
  }
  function markPendingSync(){
    const key=pendingSyncKey();
    if(key) localStorage.setItem(key,'1');
  }
  function hasPendingSync(){
    const key=pendingSyncKey();
    return !!(key && localStorage.getItem(key)==='1');
  }
  function queueDelete(id){
    const key=pendingDeleteKey(); if(!key)return;
    const list=safeJSON(localStorage.getItem(key),[]);
    if(!list.includes(id)) list.push(id);
    localStorage.setItem(key,JSON.stringify(list));
    markPendingSync();
  }
  function getQueuedDeletes(){
    const key=pendingDeleteKey();
    return key ? safeJSON(localStorage.getItem(key),[]) : [];
  }
  function clearQueuedDelete(id){
    const key=pendingDeleteKey(); if(!key)return;
    const list=getQueuedDeletes().filter(x=>String(x)!==String(id));
    if(list.length) localStorage.setItem(key,JSON.stringify(list)); else localStorage.removeItem(key);
  }
  async function loadData(){
    const key=userStorageKey();
    if(!key) return [];
    const stored=await idbGet(key);
    let local=Array.isArray(stored)?stored.map(normalizeCustomer):[];
    if(!local.length){
      const legacy=safeJSON(localStorage.getItem(key),null);
      if(Array.isArray(legacy)){ local=legacy.map(normalizeCustomer); await idbSet(key,local); }
    }
    const client=supabaseClient();
    if(client && currentUser && navigator.onLine && !hasPendingSync()){
      try{
        const {data:rows,error}=await client.from('customers').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
        if(!error && Array.isArray(rows)){
          const ids=rows.map(r=>r.id);
          let measurements=[];
          if(ids.length){ const mr=await client.from('measurements').select('*').eq('user_id',currentUser.id).in('customer_id',ids).order('measured_at',{ascending:false}); if(!mr.error) measurements=mr.data||[]; }
          const grouped={}; measurements.forEach(m=>{(grouped[m.customer_id] ||= []).push(m);});
          local=rows.map(r=>{
            const sets=grouped[r.id]||[]; const latest=sets[0];
            return normalizeCustomer({id:r.id,name:r.name,phone:r.phone,gender:r.gender,category:r.category,date:r.created_at?new Date(r.created_at).toLocaleDateString():'Today',initial:(r.name||'T')[0].toUpperCase(),startDate:r.start_date||'',deliveryDate:r.delivery_date||'',unit:r.unit||'in',notes:r.notes||'',photo:r.photo_url||'',photo_url:r.photo_url||'',price:r.order_price??'',paid:r.amount_paid??'',status:r.order_status||'In progress',measurements:latest?.values||{},customMeasurements:latest?.custom_values||[],history:sets.slice(1,20).map(x=>({date:x.measured_at?.slice(0,10),unit:x.unit,measurements:x.values||{},customMeasurements:x.custom_values||[]})),cloudId:r.id,createdAt:r.created_at,updatedAt:r.updated_at});
          });
          settings.cloudStatus='Synced'; settings.lastSync=new Date().toISOString(); saveSettings();
        }
      }catch(e){ console.warn('STICHA cloud load skipped:',e); }
    }
    return local;
  }
  async function syncCloudData(){
    const client=supabaseClient();
    if(!client||!currentUser||!navigator.onLine)return false;
    try{
      // Push deletions first so a removed customer can never be recreated by an old local copy.
      for(const id of getQueuedDeletes()) {
        const {error:measurementError}=await client.from('measurements').delete().eq('customer_id',id).eq('user_id',currentUser.id);
        if(measurementError) throw measurementError;
        const {error:customerError}=await client.from('customers').delete().eq('id',id).eq('user_id',currentUser.id);
        if(customerError) throw customerError;
        try{ await client.storage.from('customer-photos').remove([`${currentUser.id}/${id}/photo.jpg`]); }catch(e){ console.warn('STICHA photo delete skipped:',e); }
        clearQueuedDelete(id);
      }

      for(const c of customers){
        const cloudId=c.cloudId || c.id || crypto.randomUUID();
        let photoUrl=c.photo_url||c.photo||null;
        // If a photo was captured while offline, upload it now and replace the local data URL with its cloud URL.
        if(typeof photoUrl==='string' && photoUrl.startsWith('data:')){
          try{
            const uploaded=await uploadToBucket('customer-photos',`${currentUser.id}/${cloudId}/photo.jpg`,photoUrl);
            if(uploaded){ photoUrl=uploaded; c.photo=c.photo_url=uploaded; }
          }catch(photoError){ console.warn('STICHA offline photo sync skipped:',photoError); }
        }
        const row={id:cloudId,user_id:currentUser.id,name:c.name,phone:c.phone||null,gender:c.gender||null,category:c.category||null,photo_url:photoUrl,unit:c.unit||'in',notes:c.notes||null,start_date:c.startDate||null,delivery_date:c.deliveryDate||null,order_price:Number(c.price||0),amount_paid:Number(c.paid||0),order_status:c.status||'In progress',updated_at:new Date().toISOString()};
        const {error}=await client.from('customers').upsert(row,{onConflict:'id'});
        if(error)throw error;
        c.cloudId=cloudId;
        const {data:existing}=await client.from('measurements').select('id').eq('customer_id',cloudId).eq('user_id',currentUser.id).order('measured_at',{ascending:false}).limit(1);
        if(!existing?.length || JSON.stringify(c.measurements||{})!==JSON.stringify(c._lastSyncedMeasurements||{})){
          const {error:measurementError}=await client.from('measurements').insert({user_id:currentUser.id,customer_id:cloudId,garment_type:c.category||'Dress',unit:c.unit||'in',values:c.measurements||{},custom_values:c.customMeasurements||[],measured_at:new Date().toISOString()});
          if(measurementError)throw measurementError;
          c._lastSyncedMeasurements=c.measurements||{};
        }
      }
      localStorage.removeItem(pendingSyncKey()||'');
      settings.cloudStatus='Synced'; settings.lastSync=new Date().toISOString(); saveSettings();
      await idbSet(userStorageKey(),customers);
      try{localStorage.setItem(userStorageKey(),JSON.stringify(customers));}catch{}
      return true;
    }catch(e){
      console.warn('STICHA cloud sync failed:',e);
      markPendingSync();
      settings.cloudStatus='Local only'; saveSettings();
      return false;
    }
  }
  async function saveData(){
    const key=userStorageKey();
    customers=customers.map(normalizeCustomer);
    if(key){ await idbSet(key,customers); try{localStorage.setItem(key,JSON.stringify(customers));}catch{} }
    markPendingSync();
    updateOfflineBadge();
    await syncCloudData();
  }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); }

  function getDeliveryStatus(c) {
    if(!c?.deliveryDate) return {key:'none',label:'No delivery date',detail:'Set a delivery date to track this order.',days:null};
    const delivery=parseDateOnly(c.deliveryDate), today=parseDateOnly(localDateInputValue());
    const days=Math.round((delivery-today)/86400000);
    if(days<=0) return {key:'red',label:days===0?'Due today':'Overdue',detail:days===0?'It is time for delivery.':`Delivery was due ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ago.`,days};
    if(days<=2) return {key:'yellow',label:`${days} day${days===1?'':'s'} left`,detail:'Delivery is approaching.',days};
    return {key:'green',label:`${days} days left`,detail:'Order is on schedule.',days};
  }
  function balance(c) { return Math.max(0,Number(c.price||0)-Number(c.paid||0)); }
  function showToast(title='Saved',msg='Done.') { const t=$('#toast'); if(!t)return; t.querySelector('b').textContent=title; t.querySelector('small').textContent=msg; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),3200); }
  function avatarHTML(c) { return c.photo ? `<img src="${escapeHTML(c.photo)}" alt="">` : escapeHTML(c.initial || c.name?.[0] || 'T'); }

  function updateOfflineBadge() {
    const online=navigator.onLine;
    const label=online ? (settings.cloudStatus==='Synced'?'Cloud synced':'Ready to sync') : 'Offline — saved on this device';
    $$('[data-offline-status]').forEach(el=>{el.textContent=label; el.classList.toggle('offline',!online); el.classList.toggle('synced',online&&settings.cloudStatus==='Synced');});
    const stat=$('#backupStatus'); if(stat) stat.textContent=online ? (settings.cloudStatus==='Synced'?'Synced':'Ready') : 'Offline';
    const sub=$('#backupSub'); if(sub) sub.textContent=online ? (settings.cloudStatus==='Synced'?'Cloud backup connected':'Local data ready for Supabase sync') : 'Changes are safe on this device';
  }

  function renderRecent() {
    const el=$('#recentCustomers'); if(!el)return;
    el.innerHTML=customers.slice(0,5).map(c=>{const s=getDeliveryStatus(c); return `<div class="customer-row" data-customer="${escapeHTML(c.id)}"><div class="customer-avatar">${avatarHTML(c)}</div><div class="customer-info"><b>${escapeHTML(c.name)}</b><small>${escapeHTML(c.category)} · ${escapeHTML(c.phone||'No phone')}</small></div>${s.key!=='none'?`<span class="mini-status ${s.key}" title="${escapeHTML(s.detail)}"></span>`:''}<time>${escapeHTML(c.date||'Today')}</time></div>`;}).join('') || '<div class="empty-state">No customers yet.</div>';
    $$('#recentCustomers .customer-row').forEach(x=>x.onclick=()=>openProfile(x.dataset.customer));
  }
  function renderCustomers(filter='') {
    const q=filter.trim().toLowerCase();
    const list=customers.filter(c=>(`${c.name} ${c.phone||''} ${c.category||''}`).toLowerCase().includes(q));
    const el=$('#customerGrid'); if(!el)return;
    el.innerHTML=list.length ? list.map(c=>{const s=getDeliveryStatus(c); return `<article class="customer-card" data-customer="${escapeHTML(c.id)}"><div class="card-top"><div class="customer-avatar">${avatarHTML(c)}</div><div><h3>${escapeHTML(c.name)}</h3><p>${escapeHTML(c.phone||'No phone number')}</p></div></div><div class="card-meta"><span class="pill">${escapeHTML(c.category)}</span><span class="pill">${Object.keys(c.measurements||{}).length + (c.customMeasurements||[]).filter(x=>x.value).length} measurements</span><span class="pill delivery-pill ${s.key}">${s.key==='none'?'No delivery date':`${escapeHTML(s.label)} · ${formatDate(c.deliveryDate)}`}</span></div></article>`;}).join('') : `<div class="panel empty-state" style="grid-column:1/-1"><h3>No customer found</h3><p class="muted">Try another name or add a new customer.</p></div>`;
    $$('#customerGrid .customer-card').forEach(x=>x.onclick=()=>openProfile(x.dataset.customer));
  }
  function updateStats() {
    $('#totalCustomers').textContent=customers.length;
    $('#totalMeasurements').textContent=customers.reduce((n,c)=>n+Object.keys(c.measurements||{}).length+(c.customMeasurements||[]).filter(x=>x.value).length,0);
    const recent=customers.filter(c=>c.createdAt && Date.now()-new Date(c.createdAt).getTime()<7*86400000).length;
    const recentEl=$('#recentCount'); if(recentEl)recentEl.textContent=recent;
    const outstanding=customers.reduce((n,c)=>n+balance(c),0); const outEl=$('#outstandingAmount'); if(outEl)outEl.textContent=formatMoney(outstanding);
  }
  function renderDeliveryDashboard() {
    const scheduled=customers.filter(c=>c.deliveryDate).map(c=>({customer:c,status:getDeliveryStatus(c)})).sort((a,b)=>parseDateOnly(a.customer.deliveryDate)-parseDateOnly(b.customer.deliveryDate));
    const counts={green:scheduled.filter(x=>x.status.key==='green').length,yellow:scheduled.filter(x=>x.status.key==='yellow').length,red:scheduled.filter(x=>x.status.key==='red').length};
    $('#deliverySummary').innerHTML=`<div class="delivery-stat green"><span></span><b>${counts.green}</b><small>On schedule</small></div><div class="delivery-stat yellow"><span></span><b>${counts.yellow}</b><small>Approaching</small></div><div class="delivery-stat red"><span></span><b>${counts.red}</b><small>Due / overdue</small></div>`;
    $('#deliveryList').innerHTML=scheduled.length ? scheduled.slice(0,6).map(({customer:c,status})=>`<button class="delivery-item ${status.key}" data-delivery-customer="${escapeHTML(c.id)}" type="button"><span class="delivery-dot"></span><span class="delivery-item-main"><b>${escapeHTML(c.name)}</b><small>${formatDate(c.deliveryDate)} · ${escapeHTML(status.detail)}</small></span><strong>${escapeHTML(status.label)}</strong></button>`).join('') : '<div class="empty-delivery">No delivery schedules yet.</div>';
    $$('#deliveryList .delivery-item').forEach(x=>x.onclick=()=>openProfile(x.dataset.deliveryCustomer));
    updateAlarmButton();
  }

  function renderFields(values={}) {
    const names=[...(templates[currentTemplate]||templates.dress)];
    const custom=(values.customMeasurements||[]).filter(x=>x.name);
    const fields=names.map(name=>measurementFieldHTML(name,values.measurements?.[name]||'',values.unit||currentUnit)).join('');
    $('#measurementFields').innerHTML=fields;
    $('#customMeasurementFields').innerHTML=custom.map((m,i)=>customFieldHTML(m.name,m.value,m.unit||values.unit||currentUnit,i)).join('');
    updateUnitButtons(values.unit||currentUnit);
  }
  function measurementFieldHTML(name,value,unit) { return `<label class="measurement-field"><span>${escapeHTML(name)} <small>${unit}</small></span><div class="measurement-input"><input inputmode="decimal" data-measure="${escapeHTML(name)}" value="${escapeHTML(value)}" placeholder="e.g. 34.5"><span>${escapeHTML(unit)}</span></div></label>`; }
  function customFieldHTML(name,value,unit,index) { return `<div class="custom-measure-row"><label><span>Measurement name</span><input data-custom-name="${index}" value="${escapeHTML(name)}" placeholder="e.g. Armhole"></label><label><span>Value</span><div class="measurement-input"><input inputmode="decimal" data-custom-value="${index}" value="${escapeHTML(value)}" placeholder="e.g. 16"><span>${escapeHTML(unit)}</span></div></label><button class="icon-danger remove-custom" type="button" data-remove-custom="${index}" aria-label="Remove measurement">×</button></div>`; }
  function updateUnitButtons(unit=currentUnit) { $$('.unit-btn').forEach(b=>b.classList.toggle('active',b.dataset.unit===unit)); $$('#unitLabel').forEach(x=>x.textContent=unit==='in'?'inches':'centimetres'); }
  function setUnit(unit) { currentUnit=unit; localStorage.setItem('sticha_unit',unit); updateUnitButtons(unit); $$('#measurementFields input[data-measure]').forEach(i=>{const unitSpan=i.closest('.measurement-input')?.querySelector('span'); if(unitSpan)unitSpan.textContent=unit;}); $$('#customMeasurementFields .measurement-input span').forEach(s=>s.textContent=unit); }
  function collectMeasurements() {
    const measurements={}; $$('[data-measure]').forEach(i=>{if(i.value.trim())measurements[i.dataset.measure]=i.value.trim();});
    const custom=[]; const rows=$$('#customMeasurementFields .custom-measure-row');
    rows.forEach(row=>{const name=row.querySelector('input[data-custom-name]')?.value.trim();const value=row.querySelector('input[data-custom-value]')?.value.trim();if(name||value)custom.push({name:name||'Custom',value,unit:currentUnit});});
    return {measurements,customMeasurements:custom};
  }

  function resetCustomerForm() {
    const form=$('#customerForm'); form.reset(); delete form.dataset.editingId;
    $('#startDate').value=localDateInputValue(); $('#deliveryDate').value=localDateInputValue(new Date(Date.now()+7*86400000));
    $('#price').value=''; $('#paid').value=''; $('#orderStatus').value='In progress';
    $('#photoPreview').style.backgroundImage=''; $('#photoPreview').classList.remove('has-photo'); delete $('#photoPreview').dataset.photo;
    currentTemplate='dress'; $$('.template').forEach(b=>b.classList.toggle('active',b.dataset.template==='dress')); renderFields();
    $('#formTitle').textContent='Add customer'; $('#formSubtitle').textContent='Create a profile, then save their measurements.';
  }

  async function createCustomer(e) {
    e.preventDefault(); const form=e.target; const name=$('#customerName').value.trim(); const startDate=$('#startDate').value; const deliveryDate=$('#deliveryDate').value;
    if(!name){showToast('Name required','Please add the customer name.');$('#customerName').focus();return;}
    if(deliveryDate && startDate && parseDateOnly(deliveryDate)<parseDateOnly(startDate)){showToast('Check the dates','Delivery date cannot be before the starting date.');return;}
    const {measurements,customMeasurements}=collectMeasurements(); const editingId=form.dataset.editingId;
    let photo=$('#photoPreview').dataset.photo||'';
    if(editingId){
      const index=customers.findIndex(c=>String(c.id)===String(editingId)); if(index<0)return;
      const old=customers[index];
      const newSet={date:localDateInputValue(),unit:currentUnit,measurements,customMeasurements};
      const history=[...(old.history||[])];
      if(Object.keys(old.measurements||{}).length || (old.customMeasurements||[]).length) history.unshift({date:old.updatedAt||old.createdAt||localDateInputValue(),unit:old.unit||'in',measurements:old.measurements||{},customMeasurements:old.customMeasurements||[]});
      customers[index]={...old,name,phone:$('#customerPhone').value.trim(),gender:$('#customerGender').value,category:$('#customerCategory').value,startDate,deliveryDate,initial:name[0]?.toUpperCase()||'T',measurements,customMeasurements,unit:currentUnit,notes:$('#customerNotes').value.trim(),photo:photo||old.photo||'',price:$('#price').value.trim(),paid:$('#paid').value.trim(),status:$('#orderStatus').value,history:history.slice(0,20),updatedAt:new Date().toISOString()};
      if(currentUser && photo && photo.startsWith('data:')){ try{ const url=await uploadToBucket('customer-photos',`${currentUser.id}/${old.cloudId||old.id}/photo.jpg`,photo); if(url) customers[index].photo=customers[index].photo_url=url; }catch(e){ console.warn('Customer photo cloud upload skipped:',e); } }
      selectedCustomer=customers[index]; await saveData(); refreshUI(); showToast('Profile updated',`${name}'s record was updated.`); openProfile(selectedCustomer.id); return;
    }
    const c=normalizeCustomer({id:uid('customer'),name,phone:$('#customerPhone').value.trim(),gender:$('#customerGender').value,category:$('#customerCategory').value,date:'Today',initial:name[0]?.toUpperCase()||'T',startDate,deliveryDate,measurements,customMeasurements,unit:currentUnit,notes:$('#customerNotes').value.trim(),photo:'',price:$('#price').value.trim(),paid:$('#paid').value.trim(),status:$('#orderStatus').value,history:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    if(currentUser && photo && photo.startsWith('data:')){ try{ const url=await uploadToBucket('customer-photos',`${currentUser.id}/${c.id}/photo.jpg`,photo); if(url)c.photo=c.photo_url=url; }catch(e){ console.warn('Customer photo cloud upload skipped:',e); } } else { c.photo=photo; }
    customers.unshift(c); await saveData(); refreshUI(); resetCustomerForm(); showToast('Customer saved','Your measurement record is safely stored offline.'); showCelebration(); openProfile(c.id);
  }

  function refreshUI(){renderRecent();renderCustomers($('#searchInput')?.value||'');updateStats();renderDeliveryDashboard();updateOfflineBadge();}

  function populateProfile(c) {
    $('#profileAvatar').innerHTML=avatarHTML(c); $('#profileName').textContent=c.name; $('#profileMeta').textContent=`${c.phone||'No phone'} · ${c.category} · ${c.unit==='cm'?'cm':'in'}`; $('#profileDate').textContent=`Updated ${c.updatedAt?new Date(c.updatedAt).toLocaleDateString():(c.date||'today')}`; $('#profileNotes').textContent=c.notes||'No notes yet.';
    const entries=[...Object.entries(c.measurements||{}),...(c.customMeasurements||[]).filter(x=>x.value).map(x=>[x.name,x.value])];
    $('#profileMeasurements').innerHTML=entries.length?entries.map(([k,v])=>`<div class="measure-card"><span>${escapeHTML(k)}</span><b>${escapeHTML(v)}</b><small>${c.unit||'in'}</small></div>`).join(''):'<p class="muted">No measurements saved.</p>';
    const status=getDeliveryStatus(c); $('#profileDeliveryStatus').className=`status-badge ${status.key}`; $('#profileDeliveryStatus').textContent=status.key==='none'?'No schedule':status.label; $('#profileStartDate').textContent=c.startDate?formatDate(c.startDate):'Not set'; $('#profileDeliveryDate').textContent=c.deliveryDate?formatDate(c.deliveryDate):'Not set'; $('#profileDeliveryMessage').textContent=status.key==='none'?'No delivery date has been set.':`${status.detail} Starting date: ${c.startDate?formatDate(c.startDate):'Not recorded'}.`;
    $('#profilePrice').textContent=formatMoney(c.price); $('#profilePaid').textContent=formatMoney(c.paid); $('#profileBalance').textContent=formatMoney(balance(c)); $('#profileOrderStatus').textContent=c.status||'In progress';
    $('#historyDate').textContent=c.updatedAt?new Date(c.updatedAt).toLocaleDateString():c.date||'Today';
    const hist=$('#measurementHistory'); const history=c.history||[]; hist.innerHTML=history.length?history.map((h,i)=>`<div class="history-item"><span>Previous set ${i+1}</span><b>${formatDate(h.date)}</b><small>${escapeHTML(h.unit||'in')} · ${Object.keys(h.measurements||{}).length+(h.customMeasurements||[]).length} fields</small></div>`).join(''):'<div class="history-item muted-row"><span>Older sets</span><small>They will appear here when measurements are updated.</small></div>';
  }
  function openProfile(id){selectedCustomer=customers.find(c=>String(c.id)===String(id));if(!selectedCustomer)return;populateProfile(selectedCustomer);showView('profile');}

  function showView(name){if(name!=='login'&&!currentUser){name='login';}$$('.view').forEach(v=>v.classList.remove('active'));const target=$(`#view-${name}`);if(!target)return;target.classList.add('active');$$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===name));window.scrollTo({top:0,behavior:'smooth'});if(name==='customers')renderCustomers($('#searchInput')?.value||'');if(name==='dashboard'){refreshUI();checkDeliveryReminders();}}

  function editProfile(){if(!selectedCustomer)return;showView('add');$('#formTitle').textContent='Edit customer';$('#formSubtitle').textContent='Update details or save a new measurement set.';const c=selectedCustomer;$('#customerName').value=c.name;$('#customerPhone').value=c.phone||'';$('#customerGender').value=c.gender||'Female';$('#customerCategory').value=c.category||'Dress';$('#customerNotes').value=c.notes||'';$('#startDate').value=c.startDate||localDateInputValue();$('#deliveryDate').value=c.deliveryDate||'';$('#price').value=c.price||'';$('#paid').value=c.paid||'';$('#orderStatus').value=c.status||'In progress';$('#customerForm').dataset.editingId=c.id;currentUnit=c.unit||'in';currentTemplate=templateForCategory(c.category);$$('.template').forEach(b=>b.classList.toggle('active',b.dataset.template===currentTemplate));renderFields(c);if(c.photo){$('#photoPreview').dataset.photo=c.photo;$('#photoPreview').style.backgroundImage=`url("${c.photo}")`;$('#photoPreview').classList.add('has-photo');}}
  function templateForCategory(category){const x=String(category||'').toLowerCase();if(x.includes('trouser'))return 'trouser';if(x.includes('shirt'))return 'shirt';if(x.includes('native'))return 'native';if(x.includes('agbada'))return 'agbada';return 'dress';}

  function showCelebration(){const modal=$('#celebration'),confetti=$('#confetti');confetti.innerHTML='';for(let i=0;i<32;i++){const piece=document.createElement('i');piece.style.setProperty('--x',`${Math.random()*260-130}px`);piece.style.setProperty('--y',`${Math.random()*220-120}px`);piece.style.setProperty('--r',`${Math.random()*720-360}deg`);piece.style.setProperty('--d',`${Math.random()*.7}s`);confetti.appendChild(piece);}modal.classList.add('show');modal.setAttribute('aria-hidden','false');}
  function closeCelebration(){$('#celebration').classList.remove('show');$('#celebration').setAttribute('aria-hidden','true');}

  function setTheme(theme){settings.theme=theme;document.body.dataset.theme=theme;saveSettings();}
  function setTextTheme(theme){settings.textTheme=theme;document.body.dataset.textTheme=theme;saveSettings();$$('[data-text-theme]').forEach(b=>b.classList.toggle('active',b.dataset.textTheme===theme));}
  function isAlarmEnabled(){return !!settings.alarmEnabled;}
  function setAlarmEnabled(enabled){settings.alarmEnabled=enabled;saveSettings();if(enabled){unlockAudio();requestNotificationPermission();showToast('Delivery alarms enabled','STICHA will remind you while the app is open.');}else showToast('Delivery alarms paused','You can turn them on again anytime.');updateAlarmButton();}
  function updateAlarmButton(){const b=$('#alarmBtn');if(b){b.textContent=isAlarmEnabled()?'🔔 Alarms on':'🔔 Enable alarms';b.classList.toggle('alarm-active',isAlarmEnabled());}const h=$('#helpAlarmToggle');if(h){h.classList.toggle('on',isAlarmEnabled());h.querySelector('b').textContent=isAlarmEnabled()?'On':'Off';}}
  async function requestNotificationPermission(){if(!('Notification'in window))return;if(Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}}
  function unlockAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!audioContext)audioContext=new C();if(audioContext.state==='suspended')audioContext.resume();}catch{}}
  function playTone(id=settings.tone){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!audioContext)audioContext=new C();const tone=tonePresets.find(t=>t.id===id)||tonePresets[0],now=audioContext.currentTime;tone.notes.forEach((freq,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain(),start=now+i*.19;o.type=tone.type;o.frequency.setValueAtTime(freq,start);g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(.12,start+.025);g.gain.exponentialRampToValueAtTime(.0001,start+.16);o.connect(g);g.connect(audioContext.destination);o.start(start);o.stop(start+.18);});}catch{}}
  function shouldRingNow(c){const s=getDeliveryStatus(c);if(!c.deliveryDate||s.key!=='red')return false;if(s.days<0)return true;const now=new Date(),[h,m]=(settings.alarmTime||'08:00').split(':').map(Number);return now.getHours()>h||(now.getHours()===h&&now.getMinutes()>=m);}
  function showDeliveryReminder(c){$('#reminderTitle').textContent=getDeliveryStatus(c).days===0?`It is time for ${c.name}'s delivery`:`${c.name}'s delivery is overdue`;$('#reminderText').textContent=`Delivery date: ${formatDate(c.deliveryDate)}. Check the order and contact the customer if needed.`;$('#reminderModal').classList.add('show');$('#reminderModal').setAttribute('aria-hidden','false');playTone(settings.tone);if('Notification'in window&&Notification.permission==='granted'){try{new Notification('STICHA delivery reminder',{body:`It is time for ${c.name}'s delivery.`,tag:`sticha-${c.id}-${c.deliveryDate}`});}catch{}}}
  function closeReminder(){$('#reminderModal').classList.remove('show');$('#reminderModal').setAttribute('aria-hidden','true');}
  function checkDeliveryReminders(){if(!isAlarmEnabled())return;customers.filter(shouldRingNow).forEach(c=>{const key=`sticha_alerted_${c.id}_${c.deliveryDate}`;if(localStorage.getItem(key)!=='1'){localStorage.setItem(key,'1');showDeliveryReminder(c);}});}
  function startReminderClock(){clearInterval(reminderTimer);reminderTimer=setInterval(()=>{renderDeliveryDashboard();if($('#view-dashboard').classList.contains('active'))renderRecent();checkDeliveryReminders();},30000);}

  function renderTones(){const list=$('#toneList');if(!list)return;list.innerHTML=tonePresets.map(t=>`<label class="tone-option ${t.id===settings.tone?'selected':''}"><input type="radio" name="stichaTone" value="${t.id}" ${t.id===settings.tone?'checked':''}/><span class="tone-copy"><b>${escapeHTML(t.name)}</b><small>Built-in reminder sound</small></span><button type="button" class="tone-preview" data-tone-preview="${t.id}">▶</button></label>`).join('');$$('input[name="stichaTone"]').forEach(i=>i.onchange=()=>{settings.tone=i.value;saveSettings();renderTones();playTone(settings.tone);});$$('[data-tone-preview]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();unlockAudio();playTone(b.dataset.tonePreview);});}

  function exportData(){const payload={app:'STICHA',version:2,exportedAt:new Date().toISOString(),customers};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`sticha-backup-${localDateInputValue()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast('Backup exported','Your records were exported as a JSON backup.');}
  function importData(file){if(!file)return;const r=new FileReader();r.onload=async()=>{try{const payload=JSON.parse(r.result);const incoming=Array.isArray(payload)?payload:payload.customers;if(!Array.isArray(incoming))throw new Error('Invalid backup');customers=incoming.map(normalizeCustomer);await saveData();refreshUI();showToast('Backup restored',`${customers.length} customer records are now available offline.`);}catch{showToast('Import failed','That backup file is not a valid STICHA export.');}};r.readAsText(file);}
  function downloadCSV(){const rows=[['Name','Phone','Category','Unit','Delivery date','Price','Paid','Balance','Status','Measurements']];customers.forEach(c=>rows.push([c.name,c.phone,c.category,c.unit,c.deliveryDate,c.price,c.paid,balance(c),c.status,Object.entries(c.measurements||{}).map(([k,v])=>`${k}: ${v} ${c.unit}`).join('; ')]));const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`sticha-customers-${localDateInputValue()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  async function deleteProfile(){
    if(!selectedCustomer)return;
    const ok=window.confirm(`Delete ${selectedCustomer.name}'s customer profile?\n\nThis will remove the customer, measurements and customer photo from your STICHA cloud workspace too.`);
    if(!ok)return;
    const target=selectedCustomer;
    const name=target.name;
    const cloudId=target.cloudId||target.id;
    customers=customers.filter(c=>String(c.id)!==String(target.id));
    if(currentUser && cloudId) queueDelete(cloudId);
    selectedCustomer=null;
    await saveData();
    refreshUI();
    showView('customers');
    showToast('Profile deleted',navigator.onLine?`${name}'s profile and cloud data were removed.`:`${name}'s profile was removed locally and will be deleted from the cloud when you reconnect.`);
  }

  // Supabase-ready adapter hooks. The actual connection is intentionally separate so this ZIP stays runnable offline.
  window.STICHA = window.STICHA || {};
  window.STICHA.getData = () => customers.map(normalizeCustomer);
  window.STICHA.replaceData = async data => {customers=(Array.isArray(data)?data:[]).map(normalizeCustomer);await saveData();refreshUI();};
  window.STICHA.markCloudSynced = () => {settings.cloudStatus='Synced';settings.lastSync=new Date().toISOString();saveSettings();updateOfflineBadge();};
  window.STICHA.getSettings = () => ({...settings});


  function supabaseClient(){
    return window.STICHA_SUPABASE?.client || null;
  }

  function setAuthMessage(message='', isError=false){
    const el=$('#authMessage');
    if(!el)return;
    el.textContent=message;
    el.classList.toggle('error',!!isError);
    el.classList.toggle('success',!isError && !!message);
  }

  function setAuthMode(signUp){
    const form=$('#loginForm');
    const fields=$('#signupFields');
    const submit=$('#authSubmitBtn');
    const toggle=$('#authToggleBtn');
    const title=$('#authTitle');
    const eyebrow=$('#authEyebrow');
    const subtitle=$('#authSubtitle');
    const pass=$('#loginPassword');
    const forgot=$('#forgotPasswordBtn');
    if(!fields||!submit||!toggle||!title||!eyebrow||!subtitle)return;

    form?.classList.toggle('signup-mode',!!signUp);
    fields.hidden=!signUp;
    $('#signupName')?.toggleAttribute('required',!!signUp);
    $('#signupBusiness')?.toggleAttribute('required',!!signUp);
    if(pass) pass.autocomplete=signUp?'new-password':'current-password';

    if(signUp){
      eyebrow.textContent='GET STARTED';
      title.textContent='Create your STICHA account';
      subtitle.textContent='Your new workspace starts clean and private.';
      submit.innerHTML='Create account <span>→</span>';
      toggle.textContent='Already have an account? Sign in';
      if(forgot)forgot.hidden=true;
      setAuthMessage('');
    }else{
      eyebrow.textContent='WELCOME BACK';
      title.textContent='Sign in to STICHA';
      subtitle.textContent='Continue to your tailoring workspace.';
      submit.innerHTML='Sign in <span>→</span>';
      toggle.textContent='New to STICHA? Create an account';
      if(forgot)forgot.hidden=false;
      setAuthMessage('');
    }
    setTimeout(()=>$('#loginEmail')?.focus(),120);
  }

  async function ensureProfile(user, businessNameOverride=''){
    const client=supabaseClient();
    if(!client||!user)return null;
    const metadata=user.user_metadata||{};
    const fullName=metadata.full_name||metadata.name||'';
    const businessName=businessNameOverride.trim()||metadata.business_name||'';
    const payload={
      id:user.id,
      full_name:fullName,
      business_name:businessName,
      updated_at:new Date().toISOString()
    };
    const {data,error}=await client.from('profiles').upsert(payload,{onConflict:'id'}).select().single();
    if(error){
      console.warn('STICHA: profile setup failed.',error.message);
      return {full_name:fullName,business_name:businessName};
    }
    return data;
  }

  async function getProfile(user){
    const client=supabaseClient();
    if(!client||!user)return null;
    const {data,error}=await client.from('profiles').select('full_name,business_name,avatar_url,plan').eq('id',user.id).maybeSingle();
    if(error){
      console.warn('STICHA: profile fetch failed.',error.message);
      return null;
    }
    return data;
  }

  async function uploadToBucket(bucket,path,fileOrDataUrl){
    const client=supabaseClient(); if(!client||!currentUser)return null;
    let file=fileOrDataUrl;
    if(typeof fileOrDataUrl==='string' && fileOrDataUrl.startsWith('data:')){ const blob=await (await fetch(fileOrDataUrl)).blob(); file=new File([blob],path.split('/').pop()||'upload.jpg',{type:blob.type||'image/jpeg'}); }
    const {error}=await client.storage.from(bucket).upload(path,file,{upsert:true,contentType:file.type||'image/jpeg'});
    if(error)throw error;
    const {data}=client.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl||null;
  }

  async function saveProfileSettings(){
    if(!currentUser)return;
    const client=supabaseClient(); if(!client)return;
    const fullName=$('#accountFullName')?.value.trim()||'';
    const businessName=$('#accountBusinessName')?.value.trim()||'';
    const file=$('#accountAvatarInput')?.files?.[0];
    let avatar=currentProfile?.avatar_url||'';
    if(file){ if(file.size>5*1024*1024){showToast('Image too large','Choose a profile photo under 5MB.');return;} avatar=await uploadToBucket('profile-avatars',`${currentUser.id}/avatar.jpg`,file); }
    const {data,error}=await client.from('profiles').upsert({id:currentUser.id,full_name:fullName,business_name:businessName,avatar_url:avatar||null,updated_at:new Date().toISOString()},{onConflict:'id'}).select().single();
    if(error)throw error; currentProfile=data; updateSignedInUser(currentUser,currentProfile); renderAccountPanel(); showToast('Profile updated','Your STICHA profile has been saved.');
  }
  function renderAccountPanel(){
    const p=currentProfile||{}, m=currentUser?.user_metadata||{};
    const full=p.full_name||m.full_name||''; const biz=p.business_name||m.business_name||'';
    $('#accountFullName')?.setAttribute('value',full); $('#accountBusinessName')?.setAttribute('value',biz);
    const name=$('#accountDisplayName'); if(name)name.textContent=biz||full||currentUser?.email||'STICHA';
    const email=$('#accountEmail'); if(email)email.textContent=currentUser?.email||''; const side=$('#accountEmailSide'); if(side)side.textContent=currentUser?.email||'';
    const img=$('#accountAvatarPreview'); if(img){ if(p.avatar_url){img.style.backgroundImage=`url("${p.avatar_url}")`;img.classList.add('has-photo');img.textContent='';} else {img.style.backgroundImage='';img.classList.remove('has-photo');img.textContent=(biz||full||'S').charAt(0).toUpperCase();} }
  }

  function updateSignedInUser(user,profile=null){
    if(!user)return;
    const metadata=user.user_metadata||{};
    const business=(profile?.business_name||metadata.business_name||'').trim();
    const fullName=(profile?.full_name||metadata.full_name||metadata.name||'').trim();
    const display=business||fullName||user.email?.split('@')[0]||'STICHA';
    const initial=(business||fullName||'S').trim().charAt(0).toUpperCase();
    const profileName=$('#profileBusinessName');
    const avatar=$('#profileAvatarTop');
    const dashboardTitle=$('#view-dashboard h1');
    if(profileName)profileName.textContent=display;
    if(avatar){ if(profile?.avatar_url){avatar.innerHTML=`<img src="${escapeHTML(profile.avatar_url)}" alt=""/>`;} else avatar.textContent=initial; }
    if(dashboardTitle)dashboardTitle.textContent=`Welcome back, ${display}.`;
  }

  async function activateUserSession(user, profile=null){
    currentUser=user;
    currentProfile=profile||await getProfile(user)||{};
    isDemo=false;
    customers=await loadData();
    updateSignedInUser(user,currentProfile);
    refreshUI();
    resetCustomerForm();
    showView('dashboard');
    // Render local data immediately, then finish any queued cloud sync in the background.
    if(navigator.onLine && hasPendingSync()) syncCloudData().then(()=>refreshUI());
  }

  function friendlyAuthError(error, signUp=false){
    const msg=String(error?.message||'').toLowerCase();
    if(msg.includes('invalid login credentials'))return 'Incorrect email or password. Please try again.';
    if(msg.includes('user already registered')||msg.includes('already been registered'))return 'An account with this email already exists. Please sign in instead.';
    if(msg.includes('password')&&msg.includes('6'))return 'Your password must be at least 6 characters.';
    if(msg.includes('email'))return 'Please enter a valid email address.';
    if(msg.includes('rate limit'))return 'Too many attempts. Please wait a moment and try again.';
    if(msg.includes('email not confirmed'))return 'This account still needs email confirmation. Turn off email confirmation in Supabase Authentication settings, then try again.';
    return error?.message|| (signUp?'We could not create your account. Please try again.':'We could not sign you in. Please try again.');
  }

  function signOut(){
    if(currentUser?.email){ try{localStorage.setItem('sticha_last_email',currentUser.email);}catch{} }
    const client=supabaseClient(); currentUser=null; currentProfile=null; customers=[]; selectedCustomer=null;
    if(client) client.auth.signOut().catch(()=>{});
    $('#loginEmail').value=localStorage.getItem('sticha_last_email')||'';
    $('#loginPassword').value=''; setAuthMode(false); showView('login');
    showToast('Signed out','Your email is remembered. Enter your password to sign back in.');
  }

  async function handleAuthSubmit(e){
    e.preventDefault();
    const client=supabaseClient();
    if(!client){
      setAuthMessage('STICHA could not connect to Supabase. Check your configuration and refresh.',true);
      return;
    }

    const email=$('#loginEmail')?.value.trim().toLowerCase();
    const password=$('#loginPassword')?.value||'';
    const signUp=!$('#signupFields')?.hidden;
    const submit=$('#authSubmitBtn');

    if(!email||!password){
      setAuthMessage('Enter your email and password to continue.',true);
      return;
    }
    if(password.length<6){
      setAuthMessage('Your password must be at least 6 characters.',true);
      return;
    }

    let fullName='',businessName='';
    if(signUp){
      fullName=$('#signupName')?.value.trim()||'';
      businessName=$('#signupBusiness')?.value.trim()||'';
      if(!fullName||!businessName){
        setAuthMessage('Enter your full name and business name.',true);
        return;
      }
    }

    if(submit){submit.disabled=true;submit.innerHTML=signUp?'Creating your workspace…':'Signing you in…';}
    setAuthMessage(signUp?'Creating your secure STICHA workspace…':'Checking your account…');

    try{
      if(signUp){
        const {data,error}=await client.auth.signUp({
          email,
          password,
          options:{data:{full_name:fullName,business_name:businessName}}
        });
        if(error)throw error;

        // With Supabase email confirmation disabled, a session is returned immediately.
        if(!data.session||!data.user){
          throw new Error('Your STICHA account was created, but Supabase is waiting for email confirmation. Disable "Confirm email" in Supabase Authentication settings so users can enter STICHA immediately after signup.');
        }

        const profile=await ensureProfile(data.user,businessName);
        await activateUserSession(data.user,profile);
        showToast('Workspace created',`${businessName} is ready.`);
        $('#loginForm')?.reset();
      }else{
        const {data,error}=await client.auth.signInWithPassword({email,password});
        if(error)throw error;
        if(!data.user)throw new Error('No active account session was returned.');
        const profile=await getProfile(data.user)||await ensureProfile(data.user);
        await activateUserSession(data.user,profile);
        showToast('Welcome back',`Opening ${profile?.business_name||'your workspace'}.`);
        $('#loginForm')?.reset();
      }
    }catch(error){
      console.error('STICHA authentication error:',error);
      setAuthMessage(friendlyAuthError(error,signUp),true);
    }finally{
      if(submit){
        submit.disabled=false;
        submit.innerHTML=signUp?'Create account <span>→</span>':'Sign in <span>→</span>';
      }
    }
  }

  async function handleForgotPassword(){
    const client=supabaseClient();
    const email=$('#loginEmail')?.value.trim().toLowerCase();
    if(!client){setAuthMessage('STICHA could not connect to Supabase.',true);return;}
    if(!email){setAuthMessage('Enter your email first, then choose "Forgot your password?".',true);$('#loginEmail')?.focus();return;}
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.href});
    if(error){setAuthMessage(friendlyAuthError(error),true);return;}
    setAuthMessage('Password reset instructions have been sent to your email.',false);
  }

  async function signOut(){
    const client=supabaseClient();
    if(client){
      const {error}=await client.auth.signOut();
      if(error){console.error('STICHA sign out error:',error);showToast('Sign out failed',error.message);return;}
    }
    currentUser=null;
    currentProfile=null;
    customers=[];
    isDemo=false;
    refreshUI();
    showView('login');
    setAuthMode(false);
    setAuthMessage('You have been signed out.');
  }

  async function restoreAuthSession(){
    const client=supabaseClient();
    if(!client){showView('login');return;}
    const {data,error}=await client.auth.getSession();
    if(error){
      console.error('STICHA session check failed:',error);
      showView('login');
      return;
    }
    if(data.session?.user){
      await activateUserSession(data.session.user);
    }else{
      currentUser=null;
      currentProfile=null;
      customers=[];
      refreshUI();
      showView('login');
    }

    client.auth.onAuthStateChange(async (event,session)=>{
      if(event==='SIGNED_IN'&&session?.user){
        await activateUserSession(session.user);
      }
      if(event==='SIGNED_OUT'){
        currentUser=null;
        currentProfile=null;
        customers=[];
        refreshUI();
        showView('login');
      }
    });
  }

  function bindEvents(){
    $$('[data-view]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();showView(btn.dataset.view);}));
    $('#loginForm')?.addEventListener('submit',handleAuthSubmit);
    $('#authToggleBtn')?.addEventListener('click',()=>setAuthMode($('#signupFields')?.hidden));
    $('#showPass')?.addEventListener('click',()=>{const i=$('#loginPassword');i.type=i.type==='password'?'text':'password';$('#showPass').textContent=i.type==='password'?'Show':'Hide';});
    $('#forgotPasswordBtn')?.addEventListener('click',handleForgotPassword);
    $('#themeQuickBtn')?.addEventListener('click',()=>showView('themes')); $('#profileBtn')?.addEventListener('click',()=>{renderAccountPanel();showView('account');}); $('#signOutBtn')?.addEventListener('click',signOut); $('#saveAccountBtn')?.addEventListener('click',async()=>{try{await saveProfileSettings();}catch(e){console.error(e);showToast('Could not save profile','Check your Supabase Storage bucket and RLS policies.');}}); $('#accountAvatarInput')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){showToast('Image too large','Choose a profile photo under 5MB.');e.target.value='';return;}const r=new FileReader();r.onload=ev=>{const x=$('#accountAvatarPreview');x.style.backgroundImage=`url("${ev.target.result}")`;x.textContent='';x.classList.add('has-photo');};r.readAsDataURL(f);});
    $$('.sidebar [data-view="login"]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();signOut();}));
    $('#customerForm')?.addEventListener('submit',createCustomer);
    $('#searchInput')?.addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderCustomers(e.target.value),80);});
    $('#customerPhoto')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){showToast('Photo too large','Choose a photo under 5MB.');e.target.value='';return;}const r=new FileReader();r.onload=ev=>{$('#photoPreview').dataset.photo=ev.target.result;$('#photoPreview').style.backgroundImage=`url("${ev.target.result}")`;$(`#photoPreview`).classList.add('has-photo');};r.readAsDataURL(f);});
    $$('.template').forEach(btn=>btn.addEventListener('click',()=>{currentTemplate=btn.dataset.template;$$('.template').forEach(b=>b.classList.toggle('active',b===btn));renderFields();}));
    $$('.unit-btn').forEach(btn=>btn.addEventListener('click',()=>setUnit(btn.dataset.unit)));
    $('#addCustomMeasurement')?.addEventListener('click',()=>{const wrap=$('#customMeasurementFields');const index=wrap.children.length;wrap.insertAdjacentHTML('beforeend',customFieldHTML('','',currentUnit,index));});
    $('#customMeasurementFields')?.addEventListener('click',e=>{const b=e.target.closest('[data-remove-custom]');if(b)b.closest('.custom-measure-row').remove();});
    $$('[data-theme-choice]').forEach(btn=>btn.addEventListener('click',()=>{setTheme(btn.dataset.themeChoice);showToast('Theme applied','Your workspace appearance was updated.');}));
    $$('[data-text-theme]').forEach(btn=>btn.addEventListener('click',()=>{setTextTheme(btn.dataset.textTheme);showToast('Text style applied','Your text style was updated.');}));
    $('#newMeasurementBtn')?.addEventListener('click',()=>{if(!selectedCustomer)return;editProfile();});
    $('#editProfileBtn')?.addEventListener('click',editProfile); $('#deleteProfileBtn')?.addEventListener('click',deleteProfile);
    $('#whatsappBtn')?.addEventListener('click',()=>{if(!selectedCustomer?.phone){showToast('No phone number','Add a phone number to use WhatsApp.');return;}const phone=selectedCustomer.phone.replace(/\D/g,'');window.open(`https://wa.me/${phone}`,'_blank','noopener');});
    $('#alarmBtn')?.addEventListener('click',()=>setAlarmEnabled(!isAlarmEnabled()));
    $('#helpAlarmToggle')?.addEventListener('click',()=>setAlarmEnabled(!isAlarmEnabled()));
    $('#alarmTime')?.addEventListener('change',e=>{settings.alarmTime=e.target.value||'08:00';saveSettings();showToast('Reminder time saved',`Due-today alerts will use ${settings.alarmTime}.`);});
    $('#testToneBtn')?.addEventListener('click',()=>{unlockAudio();playTone(settings.tone);showToast('Tone preview','Playing the selected reminder tone.');});
    $('#celebrationClose')?.addEventListener('click',closeCelebration); $('#reminderClose')?.addEventListener('click',closeReminder);
    $('#celebration')?.addEventListener('click',e=>{if(e.target.id==='celebration')closeCelebration();}); $('#reminderModal')?.addEventListener('click',e=>{if(e.target.id==='reminderModal')closeReminder();});
    $('#exportBackup')?.addEventListener('click',exportData); $('#exportCSV')?.addEventListener('click',downloadCSV); $('#importBackup')?.addEventListener('change',e=>importData(e.target.files?.[0]));
    document.addEventListener('click',()=>{if(isAlarmEnabled())unlockAudio()},{capture:true});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCelebration();closeReminder();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showView('customers');setTimeout(()=>$('#searchInput')?.focus(),100);}});
    window.addEventListener('online',async()=>{
      updateOfflineBadge();
      if(currentUser){
        showToast('Back online','Syncing your STICHA records…');
        await syncCloudData();
        updateOfflineBadge();
      }
    });
    window.addEventListener('offline',()=>{settings.cloudStatus='Local only';saveSettings();updateOfflineBadge();showToast('Offline mode','Your records continue saving on this device.');});
  }

  async function init(){
    document.body.dataset.theme=settings.theme; document.body.dataset.textTheme=settings.textTheme; setTextTheme(settings.textTheme); setTheme(settings.theme);
    if($('#alarmTime'))$('#alarmTime').value=settings.alarmTime; renderTones();
    customers=[]; bindEvents(); resetCustomerForm(); refreshUI(); startReminderClock(); updateAlarmButton(); setAuthMode(false); const rememberedEmail=localStorage.getItem('sticha_last_email'); if(rememberedEmail && $('#loginEmail')) $('#loginEmail').value=rememberedEmail; await restoreAuthSession();
  }

  init();
})();
