/* Pure event projection. Private event fields are never stored unencrypted in Git. */
(function(root){
'use strict';
const ranks={ordered:0,shipped:1,out_for_delivery:2,delivered:3,at_desk:4,picked_up:5};
const norm=s=>String(s||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const track=s=>{s=norm(s);return s.startsWith('420')&&s.length>=27?s.slice(8):s;};
function validate(e){
 if(!e||typeof e.id!=='string'||!e.id||!e.occurredAt||!Number.isFinite(Date.parse(e.occurredAt)))throw Error('Invalid event identity/date');
 if(!['order','shipment','review','financial'].includes(e.type))throw Error('Invalid event type');
 if(e.status&&!Object.hasOwn(ranks,e.status)&&!['cancelled','refunded','returned'].includes(e.status))throw Error('Invalid status');
 if(e.type==='order'&&(!e.merchant||!e.orderId||!Array.isArray(e.items)))throw Error('Order requires merchant, order and items');
 if(e.items&&e.items.some(i=>typeof i.name!=='string'||!i.name||!Number.isInteger(i.quantity||1)||(i.quantity||1)<1||(i.quantity||1)>50))throw Error('Invalid item');
 return e;
}
function project(base,events){
 const app=structuredClone(base);app.board||={};app.board.shipments||={};app.inventory||=[];
 const ships=app.board.shipments, reviews=[], seen=new Set(), financial=[];
 const updated={shipments:base.board?.updatedAt||null,inventory:base.board?.updatedAt||null};
 const touch=(section,date)=>{if(!updated[section]||Date.parse(date)>Date.parse(updated[section]))updated[section]=date;};
 const sameOrder=(s,e)=>norm(s.merchant)===norm(e.merchant)&&norm(s.orderId)===norm(e.orderId);
 const ordered=[...events].map(validate).sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.id.localeCompare(b.id));
 for(const e of ordered){
  if(seen.has(e.id))continue;seen.add(e.id);
  if(e.type==='review'){reviews.push(e);continue;}
  if(e.type==='financial'){financial.push(e);continue;}
  let matches=Object.values(ships).filter(s=>e.tracking?(s.tracks||[]).some(t=>track(t.raw)===track(e.tracking)):(sameOrder(s,e)));
  if(e.type==='order'){
   if(matches.length)continue;
   const id='mail-'+e.id;
   const items=e.items.flatMap(i=>Array(i.quantity||1).fill([i.name,i.color,i.size].filter(Boolean).join(' / ')));
   ships[id]={id,merchant:e.merchant,orderId:e.orderId,orderDate:e.orderDate||e.occurredAt.slice(0,10),status:'ordered',items,tracks:[],sourceEvent:e.id};
   e.items.forEach((i,j)=>{for(let n=0;n<(i.quantity||1);n++)app.inventory.push({id:id+'-'+j+'-'+n,shipmentId:id,name:[i.name,i.color,i.size].filter(Boolean).join(' / '),merchant:e.merchant,orderId:e.orderId,orderDate:ships[id].orderDate,status:'ordered',owner:i.owner||'marco',category:i.category||'other',url:/^https:\/\//.test(i.url||'')?i.url:null,unitPrice:i.unitPrice});});
   touch('shipments',e.occurredAt);touch('inventory',e.occurredAt);
   if(Number.isFinite(e.total))financial.push({...e,type:'financial',kind:'purchase'});
   else reviews.push({...e,note:'Order added; receipt total needs verification. Spend totals exclude this order.'});
   continue;
  }
  // A newly shipped order may attach to one entirely unshipped order only with a complete item match.
  let attachedTracking=false;
  if(!matches.length&&e.tracking&&e.items?.length){
   const names=e.items.flatMap(i=>Array(i.quantity||1).fill(norm([i.name,i.color,i.size].filter(Boolean).join(' / ')))).sort();
   matches=Object.values(ships).filter(s=>sameOrder(s,e)&&!(s.tracks||[]).length&&s.status==='ordered'&&JSON.stringify((s.items||[]).map(norm).sort())===JSON.stringify(names));
   if(matches.length===1){matches[0].tracks=[{raw:e.tracking}];attachedTracking=true;}
  }
  if(matches.length!==1){reviews.push({...e,note:e.note||'Shipment could not be matched safely. No existing shipment was changed.'});continue;}
  const s=matches[0],before=JSON.stringify(s);
  if(e.status&&ranks[e.status]!==undefined&&ranks[e.status]>=(ranks[s.status]??-1))s.status=e.status;
  if(e.status&&ranks[e.status]===undefined){s.exception=e.status;reviews.push({...e,note:e.note||'Order exception requires review.'});}
  if(e.arrivedAt||e.pickedUpAt)s.deskMatch||={};
  if(e.arrivedAt)s.deskMatch.arrivedAt=e.arrivedAt;
  if(e.pickedUpAt)s.deskMatch.pickedUpAt=e.pickedUpAt;
  if(e.deliveredAt)s.deliveredAt=e.deliveredAt;
  if(e.shipDate)s.shipDate=e.shipDate;
  if(e.carrier)s.carrier=e.carrier;
  if(e.eta!==undefined)s.eta=e.eta;
  if(e.estimateText)s.estimateText=e.estimateText;
  if(attachedTracking||JSON.stringify(s)!==before)touch('shipments',e.occurredAt);
  s.sourceEvent=e.id;
  for(const i of app.inventory)if(i.shipmentId&&((s.id&&i.shipmentId===s.id)||(s.shipmentId&&i.shipmentId===s.shipmentId))&&i.status!==s.status){i.status=s.status;touch('inventory',e.occurredAt);}
 }
 app.sync={eventCount:seen.size,reviews,financial,lastEventAt:ordered.at(-1)?.occurredAt||null,updated};
 if(updated.shipments)app.board.updatedAt=updated.shipments;
 app.analytics||={};app.analytics.kpis||={};
 const ss=Object.values(ships),open=ss.filter(s=>s.status!=='picked_up');
 Object.assign(app.analytics.kpis,{openShipments:open.length,openItemQty:open.reduce((n,s)=>n+(s.items||[]).length,0),shipmentCount:ss.length,itemQty:app.inventory.length});
 // Existing financial aggregates remain a clearly dated baseline. New amounts are shown separately.
 return app;
}
const api={validate,project,track};if(typeof module!=='undefined')module.exports=api;else root.TrackerSync=api;
})(typeof window!=='undefined'?window:this);
