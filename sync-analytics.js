(function(root){
'use strict';
const norm=s=>String(s||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const orderKey=e=>norm(e.merchant)+'|'+norm(e.orderId);
const cents=n=>Number.isFinite(n)?Math.round(n*100):null;
function project(base,app,events){
 const a=app.analytics||={},k=a.kpis||={},baselineOrders=new Set([
  ...Object.values(base.board?.shipments||{}),...(base.inventory||[]),...(base.analytics?.recentOrders||[])
 ].filter(e=>e.merchant&&e.orderId).map(orderKey));
 const orders=new Map(),receipts=new Map(),seen=new Set(),issues=[],included=new Set();
 const ordered=[...events].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.id.localeCompare(b.id));
 for(const e of ordered){
  if(seen.has(e.id))continue;seen.add(e.id);
  if(!e.merchant||!e.orderId)continue;
  const key=orderKey(e);
  if(e.type==='order'&&!baselineOrders.has(key)&&!orders.has(key))orders.set(key,e);
  if((e.type==='order'||e.type==='financial'&&(!e.kind||e.kind==='purchase'))&&cents(e.total)!==null){
   if(e.currency&&e.currency!=='USD'){issues.push({...e,note:'Non-USD receipt requires review before inclusion in USD totals.'});continue;}
   const old=receipts.get(key);
   if(old&&cents(old.total)!==cents(e.total)){receipts.set(key,{conflict:true});continue;}
   if(!old?.conflict)receipts.set(key,e);
  }
 }
 const byDay=new Map((a.spendByDay||[]).map(x=>[x.day,{...x}]));
 const byCat=new Map((a.categories||[]).map(x=>[x.category,{...x}]));
 const byMerchant=new Map((a.merchants||[]).map(x=>[norm(x.merchant),{...x}]));
 const recent=[...(a.recentOrders||[])];let added=0,addedCount=0,lastAt=a.syncedAt||null;
 const plus=(o,field,n)=>{o[field]=((cents(o[field])||0)+n)/100;};
 for(const [key,o] of orders){
  const r=receipts.get(key),amount=r&&!r.conflict?cents(r.total):null;
  if(amount===null||amount<0){issues.push({...o,note:r?.conflict?'Conflicting receipt totals; spending excludes this order.':'Receipt total unverified; spending excludes this order.'});continue;}
  if(!o.items?.length){issues.push({...o,note:'No item detail; spending attribution requires review.'});continue;}
  const quantities=o.items.map(i=>i.quantity||1);
  const weights=o.items.map((i,j)=>(cents(i.unitPrice)||0)*quantities[j]);
  const weighted=weights.every(w=>w>0),ws=weighted?weights:quantities;
  const sum=ws.reduce((n,w)=>n+w,0);
  // Largest remainder allocation keeps every chart equal to the exact receipt total.
  const allocated=ws.map(w=>Math.floor(amount*w/sum));
  const order=ws.map((w,i)=>({i,f:amount*w/sum-allocated[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
  for(let remaining=amount-allocated.reduce((n,v)=>n+v,0),i=0;remaining>0;remaining--,i++)allocated[order[i].i]++;
  const day=o.orderDate||o.occurredAt.slice(0,10),row=byDay.get(day)||{day,total:0,marco:0,clarry:0};
  plus(row,'total',amount);
  o.items.forEach((item,i)=>{
   const owner=item.owner==='clarry'?'clarry':'marco',cat=item.category||'other';
   plus(row,owner,allocated[i]);
   const c=byCat.get(cat)||{category:cat,spend:0,marcoSpend:0,clarrySpend:0};
   plus(c,'spend',allocated[i]);plus(c,owner+'Spend',allocated[i]);byCat.set(cat,c);
  });byDay.set(day,row);
  const merchant=byMerchant.get(norm(o.merchant))||{merchant:o.merchant,orderCount:0,itemQty:0,spend:0};
  merchant.orderCount=(merchant.orderCount||0)+1;merchant.itemQty=(merchant.itemQty||0)+quantities.reduce((n,q)=>n+q,0);plus(merchant,'spend',amount);byMerchant.set(norm(o.merchant),merchant);
  recent.push({merchant:o.merchant,orderId:o.orderId,orderDate:day,total:amount/100});
  added+=amount;addedCount++;included.add(key);
  const date=Date.parse(r.occurredAt)>Date.parse(o.occurredAt)?r.occurredAt:o.occurredAt;
  if(!lastAt||Date.parse(date)>Date.parse(lastAt))lastAt=date;
 }
 const seenFinancial=new Set();
 for(const e of ordered.filter(e=>e.type==='financial')){
  if(seenFinancial.has(e.id))continue;seenFinancial.add(e.id);
  if(e.kind&&e.kind!=='purchase')issues.push({...e,note:'Refund or adjustment requires reconciliation before changing spending totals.'});
  else if(baselineOrders.has(orderKey(e))){
   const old=(base.analytics?.recentOrders||[]).find(o=>orderKey(o)===orderKey(e));
   if(!old||cents(old.total)!==cents(e.total))issues.push({...e,note:'Existing order receipt needs comparison with the original total; no duplicate amount was added.'});
  }
  else if(!included.has(orderKey(e))&&!baselineOrders.has(orderKey(e)))issues.push({...e,note:'Receipt could not be matched to a new order; excluded from spending.'});
 }
 k.totalSpend=((cents(k.totalSpend)||0)+added)/100;k.orderCount=(k.orderCount||0)+addedCount;
 k.avgOrder=k.orderCount?k.totalSpend/k.orderCount:0;
 a.spendByDay=[...byDay.values()].sort((a,b)=>a.day.localeCompare(b.day));
 a.categories=[...byCat.values()];a.merchants=[...byMerchant.values()].sort((a,b)=>b.spend-a.spend);
 a.recentOrders=recent.sort((a,b)=>(b.orderDate||'').localeCompare(a.orderDate||''));a.syncedAt=lastAt;
 a.updateSummary={addedOrders:addedCount,addedSpend:added/100,excludedOrders:orders.size-addedCount,unresolvedAdjustments:issues.filter(e=>e.type==='financial').length,baselineAt:base.analytics?.syncedAt||null};
 app.sync.reviews=app.sync.reviews.filter(e=>e.reviewReason!=='receipt_total');
 for(const e of issues)app.sync.reviews.push({...e,reviewReason:'financial'});
 app.sync.updated.analytics=lastAt;
 return app;
}
const api={project};if(typeof module!=='undefined')module.exports=api;else root.TrackerAnalytics=api;
})(typeof window!=='undefined'?window:this);
