#!/usr/bin/env node
// Only encrypted envelopes and opaque hashes may be committed. Input files stay outside the repo.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate}=require('../sync-engine.js');
const [,,input,root=path.resolve(__dirname,'..')]=process.argv;
if(!input)throw Error('Usage: node scripts/seal-event.cjs /private/events.json [repo-root]');
const config=JSON.parse(fs.readFileSync(path.join(root,'sync/config.json')));
const publicKey=crypto.createPublicKey({key:config.publicKey,format:'jwk'});
const manifestPath=path.join(root,'sync/manifest.json');const manifest=JSON.parse(fs.readFileSync(manifestPath));
const values=JSON.parse(fs.readFileSync(input));
fs.mkdirSync(path.join(root,'sync/events'),{recursive:true});
for(const value of Array.isArray(values)?values:[values]){
 if(!value.sourceMessageId||!value.eventKey)throw Error('sourceMessageId and stable eventKey required');
 const id=crypto.createHash('sha256').update(value.sourceMessageId+'\0'+value.eventKey).digest('hex');
 const e=validate({...value,id});if(manifest.events.includes(id))continue;
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(e)),cipher.final(),cipher.getAuthTag()]);
 const wrapped=crypto.publicEncrypt({key:publicKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},key);
 fs.writeFileSync(path.join(root,'sync/events',id+'.json'),JSON.stringify({version:1,key:wrapped.toString('base64'),iv:iv.toString('base64'),ct:ciphertext.toString('base64')})+'\n');manifest.events.push(id);
}
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({eventCount:manifest.events.length}));
