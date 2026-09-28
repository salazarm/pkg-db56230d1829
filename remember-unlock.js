/* Only a non-exportable Web Crypto key is remembered; never the password. */
'use strict';
const RememberUnlock={
 async database(){
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('package-tracker-unlock',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('keys');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(Error('Browser storage is blocked'));
  });
 },
 async run(mode,action){
  const db=await this.database();
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('keys',mode),request=action(tx.objectStore('keys'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onerror=()=>reject(tx.error||request.error);
   tx.onabort=()=>reject(tx.error||Error('Browser storage unavailable'));
  });}finally{db.close();}
 },
 async read(){return this.run('readonly',store=>store.get('unlock'));},
 async save(key){
  if(key.extractable||key.type!=='secret'||key.algorithm.name!=='AES-GCM')throw Error('Invalid remembered key');
  return this.run('readwrite',store=>store.put(key,'unlock'));
 },
 async clear(){return this.run('readwrite',store=>store.delete('unlock'));}
};
