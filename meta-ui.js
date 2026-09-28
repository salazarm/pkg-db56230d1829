'use strict';
const APP_RELEASE={version:'2026.09.28.1',date:'2026-09-28',description:'Freshness, schedules and remembered unlock'};
function metaDate(value){
 if(!value)return 'Not recorded';
 const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00':value);
 if(!Number.isFinite(date.getTime()))return 'Not recorded';
 return date.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',...(/^\d{4}-\d{2}-\d{2}$/.test(value)?{}:{hour:'numeric',minute:'2-digit',timeZoneName:'short'})});
}
function metaAge(value){
 if(!value||!Number.isFinite(Date.parse(value)))return 'Age unknown';
 const days=Math.max(0,Math.floor((Date.now()-Date.parse(value))/86400000));
 return days===0?'Less than 1 day old':days+' day'+(days===1?'':'s')+' old';
}
function dataDates(){
 const baseline=baseData||APP||{},sync=APP?.sync||{};
 return {baseline:baseline.board?.updatedAt,shipments:sync.updated?.shipments||baseline.board?.updatedAt,
 inventory:sync.updated?.inventory||baseline.board?.updatedAt,analytics:baseline.analytics?.syncedAt,
 discovery:APP?.discovery?.updatedAt||APP?.discovery?.date,latestEvent:sync.lastEventAt};
}
function freshnessText(){
 const d=dataDates();
 return `Shipment data: ${metaDate(d.shipments)} (${metaAge(d.shipments).toLowerCase()}). `+
 ((APP?.sync?.eventCount||0)===0?'No email updates have been applied to the saved snapshot. ':'Dates reflect applied changes; they do not confirm that every email has been checked. ')+
 'Calendar dates and delivery estimates come from these shipments.';
}
function renderFreshness(){
 if(!APP)return;
 document.getElementById('calFreshness').textContent=freshnessText();
 if(activeTab==='meta')renderMeta();
}
function renderMeta(){
 if(!APP)return;
 const d=dataDates(),rt=syncRuntime,service=rt.service,email=service?.email,obey=service?.obey;
 const h=escapeHtml;
 const emailState=email?.state==='active'?'Email monitoring active':email?.state==='awaiting_approval'?'Email monitoring inactive':'Email monitoring status unknown';
 document.getElementById('metaState').textContent=emailState;
 document.getElementById('metaSummary').textContent=freshnessText();
 const cards=[
  ['Latest shipment change',metaDate(d.shipments),metaAge(d.shipments)],
  ['Published updates fetched',metaDate(rt.lastSuccessAt),rt.error?'Latest attempt failed: '+rt.error:'A browser refresh fetches saved updates. It does not check Gmail.'],
  ['Email check completed',metaDate(email?.lastSuccessfulCheckAt),email?.state==='awaiting_approval'?'Waiting for approval to publish encrypted email updates.':email?.state==='active'?'New matching messages trigger a check.':'No successful automated email check is recorded.'],
  ['Saved unlock',rt.remembered?'Remembered on this device':'This session only',rt.storageError||'Lock clears the remembered key. The password is never saved.']
 ];
 document.getElementById('metaCards').innerHTML=cards.map(([title,value,detail])=>`<article class="meta-card"><h3>${h(title)}</h3><div class="meta-value">${h(value)}</div><p class="meta-help">${h(detail)}</p></article>`).join('');
 const rows=[
  ['Shipments',d.shipments,'Saved ledger plus matched order, shipping, delivery and pickup events.'],
  ['Inventory',d.inventory,'Order additions and matched shipment status changes. Shares the initial ledger snapshot.'],
  ['Calendar',d.shipments,'Uses shipment order dates, shipping dates, ETAs and desk arrivals. No separate calendar feed.'],
  ['Analytics · spending',d.analytics,'Historical financial snapshot. New receipt amounts appear separately under Email updates.'],
  ['Analytics · counts',d.shipments,'Open package and item counts are recalculated from loaded shipments and inventory.'],
  ['Discovery',d.discovery,'Saved recommendations. No automatic refresh is configured.']
 ];
 document.getElementById('metaSections').innerHTML=rows.map(([title,date,detail])=>`<tr><td>${h(title)}</td><td>${h(metaDate(date))}<p class="meta-help">${h(metaAge(date))}</p></td><td>${h(detail)}</td></tr>`).join('');
 const schedules=[
  ['App refresh','On unlock, every 5 minutes while the tab is visible, and when you press Refresh updates.',rt.lastAttemptAt?'Last attempted '+metaDate(rt.lastAttemptAt)+(rt.error?' · failed':''):'Not attempted this session'],
  ['Email monitoring',email?.state==='active'?'When new matching purchase or delivery messages arrive. No fixed daily time.':'Inactive. Intended to run when matching purchase or delivery emails arrive.',email?.lastSuccessfulCheckAt?'Last completed '+metaDate(email.lastSuccessfulCheckAt):'No completed automated check recorded'],
  ['OBEY release watch',obey?.schedule||'Separate from this app; schedule not available.',obey?'Enabled as of '+metaDate(service.verifiedAt)+'. Does not refresh Discovery, shipments or Calendar.':'Status unavailable'],
 ];
 document.getElementById('metaSchedule').innerHTML=schedules.map(row=>'<tr>'+row.map(cell=>'<td>'+h(cell)+'</td>').join('')+'</tr>').join('');
 document.getElementById('metaStatusDate').textContent=(service?'Schedule configuration last verified '+metaDate(service.verifiedAt)+'. ':'Schedule configuration could not be loaded. ')+(rt.serviceError?'Status refresh failed: '+rt.serviceError+'. ':'')+'These are recorded service details, not a live connection to the automation scheduler.';
 document.getElementById('metaRelease').textContent=metaDate(APP_RELEASE.date)+' · '+APP_RELEASE.description+' · version '+APP_RELEASE.version;
}
