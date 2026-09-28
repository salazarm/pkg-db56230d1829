const {test}=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('../sync-engine.js');
const base={board:{updatedAt:'2026-09-17',shipments:{a:{id:'a',merchant:'Old Shop',orderId:'1',status:'picked_up',items:['A'],tracks:[]}}},inventory:[],analytics:{syncedAt:'2026-09-17',kpis:{totalSpend:20,orderCount:1,avgOrder:20},spendByDay:[{day:'2026-09-17',total:20,marco:20,clarry:0}],categories:[{category:'tees',spend:20,marcoSpend:20,clarrySpend:0}],merchants:[{merchant:'Old Shop',orderCount:1,itemQty:1,spend:20}],recentOrders:[{merchant:'Old Shop',orderId:'1',orderDate:'2026-09-17',total:20}]}};
const order={id:'order',type:'order',occurredAt:'2026-09-22T10:00:00Z',merchant:'New Shop',orderId:'2',items:[{name:'A',category:'tees',unitPrice:10,quantity:1,owner:'marco'},{name:'B',category:'tops',unitPrice:20,quantity:1,owner:'clarry'}]};
const receipt={id:'receipt',type:'financial',kind:'purchase',occurredAt:'2026-09-22T10:01:00Z',merchant:'New Shop',orderId:'2',currency:'USD',total:31.01};
test('verified receipts update every spend view with exact allocation and no duplicate order',()=>{
 const p=project(base,[order,receipt,{...receipt,id:'same-receipt'},order]);
 assert.equal(p.analytics.kpis.totalSpend,51.01);assert.equal(p.analytics.kpis.orderCount,2);
 assert.equal(p.analytics.spendByDay.at(-1).total,31.01);
 assert.equal(Math.round(p.analytics.categories.reduce((n,c)=>n+c.spend,0)*100),5101);
 assert.equal(p.analytics.merchants[0].spend,31.01);assert.equal(p.analytics.recentOrders[0].total,31.01);
 assert.equal(p.sync.reviews.length,0);assert.equal(p.sync.updated.analytics,receipt.occurredAt);
 assert.equal(base.analytics.kpis.totalSpend,20);
});
test('existing baseline receipts never double count totals',()=>{
 const p=project(base,[{...order,merchant:'Old Shop',orderId:'1',total:20}]);
 assert.equal(p.analytics.kpis.totalSpend,20);assert.equal(p.analytics.kpis.orderCount,1);
});
test('unverified, conflicting, and non-USD amounts remain excluded',()=>{
 for(const ev of [[order],[order,receipt,{...receipt,id:'conflict',total:32}],[order,{...receipt,currency:'CAD'}]]){
  const p=project(base,ev);assert.equal(p.analytics.kpis.totalSpend,20);assert.ok(p.sync.reviews.length>0);assert.equal(p.sync.updated.analytics,'2026-09-17');
 }
});
test('refunds are flagged rather than silently deducted or ignored',()=>{
 const p=project(base,[order,receipt,{...receipt,id:'refund',kind:'refund',total:10}]);
 assert.equal(p.analytics.updateSummary.unresolvedAdjustments,1);
 assert.ok(p.sync.reviews.some(e=>e.kind==='refund'));
});
