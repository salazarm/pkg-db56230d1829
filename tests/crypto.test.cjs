const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const c=require('node:crypto');const {execFileSync}=require('node:child_process');
test('writer envelopes decrypt in Web Crypto; replay and tampering handled',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tracker-crypto-'));
 try{
  fs.mkdirSync(path.join(root,'sync/events'),{recursive:true});
  const keys=await c.webcrypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const pub=await c.webcrypto.subtle.exportKey('jwk',keys.publicKey);
  fs.writeFileSync(path.join(root,'sync/config.json'),JSON.stringify({publicKey:pub}));
  fs.writeFileSync(path.join(root,'sync/manifest.json'),JSON.stringify({version:1,events:[]}));
  const e={sourceMessageId:'synthetic-mail',eventKey:'shipment:ABC',type:'shipment',tracking:'ABC',status:'shipped',occurredAt:'2026-09-22T00:00:00Z'};
  const input=path.join(root,'input.json');fs.writeFileSync(input,JSON.stringify(e));
  const run=()=>execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/seal-event.cjs'),input,root]);run();run();
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'sync/manifest.json')));assert.equal(manifest.events.length,1);
  const id=manifest.events[0], envelope=JSON.parse(fs.readFileSync(path.join(root,'sync/events',id+'.json')));
  const raw=await c.webcrypto.subtle.decrypt({name:'RSA-OAEP'},keys.privateKey,Buffer.from(envelope.key,'base64'));
  const key=await c.webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  const opts={name:'AES-GCM',iv:Buffer.from(envelope.iv,'base64'),additionalData:Buffer.from(id)};
  const plain=await c.webcrypto.subtle.decrypt(opts,key,Buffer.from(envelope.ct,'base64'));
  assert.equal(JSON.parse(Buffer.from(plain).toString()).tracking,'ABC');
  await assert.rejects(c.webcrypto.subtle.decrypt({...opts,additionalData:Buffer.from('wrong-id')},key,Buffer.from(envelope.ct,'base64')));
  const damaged=Buffer.from(envelope.ct,'base64');damaged[0]^=1;await assert.rejects(c.webcrypto.subtle.decrypt(opts,key,damaged));
  assert.ok(!JSON.stringify(envelope).includes('synthetic-mail'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
