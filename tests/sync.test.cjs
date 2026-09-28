const {test}=require('node:test');const assert=require('node:assert/strict');const {project,track}=require('../sync-engine.js');
const base={board:{shipments:{a:{id:'a',merchant:'Shop',orderId:'123',status:'shipped',items:['A'],tracks:[{raw:'TBA111'}]},b:{id:'b',merchant:'Shop',orderId:'123',status:'shipped',items:['B'],tracks:[{raw:'TBA222'}]}}},inventory:[{shipmentId:'a',name:'A',status:'shipped'},{shipmentId:'b',name:'B',status:'shipped'}],analytics:{kpis:{totalSpend:20}}};
const event={id:'one',type:'shipment',occurredAt:'2026-09-21T10:00:00Z',tracking:'TBA111',status:'picked_up',pickedUpAt:'2026-09-21T10:00:00Z'};
test('split shipments update only matching tracking and inventory',()=>{const p=project(base,[event]);assert.equal(p.board.shipments.a.status,'picked_up');assert.equal(p.board.shipments.b.status,'shipped');assert.equal(p.inventory[0].status,'picked_up');assert.equal(p.inventory[1].status,'shipped');assert.equal(base.board.shipments.a.status,'shipped');});
test('dedup and status never regresses even with a later shipping email',()=>{const p=project(base,[event,event,{...event,id:'two',occurredAt:'2026-09-22',status:'shipped'}]);assert.equal(p.sync.eventCount,2);assert.equal(p.board.shipments.a.status,'picked_up');});
test('ambiguous order-only and unknown tracking stay in review',()=>{const p=project(base,[{...event,tracking:null,merchant:'Shop',orderId:'123'},{...event,id:'two',tracking:'unknown'}]);assert.equal(p.sync.reviews.length,2);assert.equal(p.board.shipments.a.status,'shipped');});
test('receipt replay does not duplicate order inventory or spend',()=>{const e={id:'order',type:'order',occurredAt:'2026-09-20',merchant:'Other',orderId:'456',items:[{name:'Shirt',size:'XXL',quantity:2}]};const p=project(base,[e,{...e,id:'duplicate'}]);assert.equal(Object.keys(p.board.shipments).length,3);assert.equal(p.inventory.length,4);assert.equal(p.analytics.kpis.totalSpend,20);});
test('USPS routing prefix is normalized',()=>assert.equal(track('420070309261290198173370495026'),track('9261290198173370495026')));
test('carrier delivered remains distinct from desk and pickup',()=>{const p=project(base,[{...event,status:'delivered',pickedUpAt:undefined}]);assert.equal(p.board.shipments.a.status,'delivered');assert.equal(p.board.shipments.a.deskMatch?.pickedUpAt,undefined);});
test('invalid input rejected atomically',()=>assert.throws(()=>project(base,[event,{id:'bad',type:'shipment',occurredAt:'bad'}])));

test('review and financial events do not make shipment or inventory data look newer',()=>{
 const dated={...base,board:{...base.board,updatedAt:'2026-09-17T16:00:00Z'}};
 const p=project(dated,[{id:'review',type:'review',occurredAt:'2026-09-28T12:00:00Z'},{id:'money',type:'financial',occurredAt:'2026-09-28T13:00:00Z',total:10}]);
 assert.equal(p.board.updatedAt,dated.board.updatedAt);assert.equal(p.sync.updated.inventory,dated.board.updatedAt);
 assert.equal(p.sync.lastEventAt,'2026-09-28T13:00:00Z');
});
test('only effective section changes advance its data date',()=>{
 const p=project(base,[event,{...event,id:'old-status',occurredAt:'2026-09-28T12:00:00Z',status:'shipped'}]);
 assert.equal(p.sync.updated.shipments,event.occurredAt);assert.equal(p.sync.updated.inventory,event.occurredAt);
});
