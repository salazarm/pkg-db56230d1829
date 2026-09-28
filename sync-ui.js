'use strict';
let unlockKey, syncConfig, baseData, syncBusy=false;
const enc=new TextEncoder(),dec=new TextDecoder();
function bytes64(bytes){let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s);}
async function getJSON(path){const r=await fetch(path,{cache:'no-store'});if(!r.ok)throw Error(path+': '+r.status);return r.json();}
async function readConfig(){const r=await fetch('sync/config.json',{cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw Error('Unable to read sync configuration');return r.json();}
async function loadBaseline(){const r=await fetch('archive.html');if(!r.ok)throw Error('Unable to load encrypted archive');const html=await r.text();const match=html.match(/const PAYLOAD = (\{[^\n]+\});/);if(!match)throw Error('Encrypted archive is invalid');return JSON.parse(match[1]);}
async function unlock(password){
 const p=await loadBaseline();const key=await deriveKey(password,b64ToBytes(p.salt),p.iter);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(p.iv)},key,b64ToBytes(p.ct));
 baseData=JSON.parse(dec.decode(plain));unlockKey=key;
 showApp(baseData);document.getElementById('syncPanel').hidden=false;
 await refreshUpdates();
}
async function setupSync(){
 const button=document.getElementById('setupSync');button.disabled=true;
 try{
  if(await readConfig())throw Error('Sync is already configured. Reload the app.');
  let config=JSON.parse(localStorage.getItem('pkg_sync_pending')||'null');
  if(!config){
   const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
   const pub=await crypto.subtle.exportKey('jwk',keys.publicKey),priv=await crypto.subtle.exportKey('pkcs8',keys.privateKey);
   const iv=crypto.getRandomValues(new Uint8Array(12));
   const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},unlockKey,priv);
   config={version:1,publicKey:pub,privateKey:{iv:bytes64(iv),ct:bytes64(ct)}};
   localStorage.setItem('pkg_sync_pending',JSON.stringify(config));
  }
  document.getElementById('syncConfigOutput').textContent=JSON.stringify(config,null,2);
  document.getElementById('syncSetupResult').hidden=false;
  document.getElementById('syncStatus').textContent='Encryption ready. Publish this encrypted configuration to finish connecting email updates.';
 }catch(e){document.getElementById('syncStatus').textContent=e.message;button.disabled=false;}
}
async function refreshUpdates(){
 if(syncBusy)return;syncBusy=true;
 const status=document.getElementById('syncStatus');status.textContent='Checking encrypted updates…';
 try{
  syncConfig=await readConfig();document.getElementById('setupSync').hidden=!!syncConfig;
  if(!syncConfig){status.textContent='Email updates need encryption setup.';return;}
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(syncConfig.privateKey.iv)},unlockKey,b64ToBytes(syncConfig.privateKey.ct));
  const privateKey=await crypto.subtle.importKey('pkcs8',raw,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  const manifest=await getJSON('sync/manifest.json');const events=[];
  for(const id of manifest.events){
   if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid event identifier');
   const envelope=await getJSON('sync/events/'+id+'.json');
   const rawKey=await crypto.subtle.decrypt({name:'RSA-OAEP'},privateKey,b64ToBytes(envelope.key));
   const eventKey=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['decrypt']);
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(envelope.iv),additionalData:enc.encode(id)},eventKey,b64ToBytes(envelope.ct));
   const event=JSON.parse(dec.decode(plain));if(event.id!==id)throw Error('Event identity mismatch');events.push(event);
  }
  APP=TrackerSync.project(baseData,events);renderAll();renderSyncReview();
  status.textContent=`${events.length} email updates loaded · checked ${new Date().toLocaleTimeString()}${APP.sync.lastEventAt?' · latest event '+new Date(APP.sync.lastEventAt).toLocaleDateString():''}`;
  document.getElementById('syncSetupResult').hidden=true;
 }catch(e){status.textContent='Updates unavailable: '+e.message+'. Showing the last successfully loaded data.';}
 finally{syncBusy=false;}
}
function renderSyncReview(){
 const sync=APP.sync||{reviews:[],financial:[]};
 const root=document.getElementById('syncReview');root.replaceChildren();
 if(sync.reviews.length){const title=document.createElement('h3');title.textContent='Needs review ('+sync.reviews.length+')';root.append(title);}
 for(const e of sync.reviews){const p=document.createElement('p');p.textContent=[e.merchant,e.orderId,e.tracking,e.status,e.note].filter(Boolean).join(' · ');root.append(p);}
 if(sync.financial.length){const p=document.createElement('p');p.textContent='New receipt amounts (separate from historical analytics): '+sync.financial.map(e=>`${e.merchant} ${e.orderId}: ${e.kind||'purchase'} ${Number.isFinite(e.total)?money(e.total):'amount unknown'}`).join('; ');root.append(p);}
}
document.getElementById('setupSync').addEventListener('click',setupSync);
document.getElementById('refreshSync').addEventListener('click',refreshUpdates);
document.getElementById('gateForm').addEventListener('submit',async e=>{e.preventDefault();const err=document.getElementById('err');err.textContent='Unlocking…';try{await unlock(document.getElementById('pw').value);document.getElementById('pw').value='';err.textContent='';}catch(_){err.textContent='Unable to unlock. Check your password and connection.';}});
// Remove the legacy plaintext password cache. Keep the derived key in memory only.
localStorage.removeItem('pkg_board_pw');
setInterval(()=>{if(baseData&&!document.hidden)refreshUpdates();},300000);
