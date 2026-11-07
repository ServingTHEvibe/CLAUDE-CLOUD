import {newId} from './id.mjs';
import {remapInteriorPins} from './interior-layout';
import {assetSchema,type Asset} from './asset';
import {locationSchema,type Location} from './location';
import {readApiResponse} from './api-response';

// Explicit, device-only capture. Never used to authorize access to cloud records.
export type DeviceCapture={version:1,assets:Asset[],locations:Location[],media?:Record<string,string>,uploads?:Record<string,{owner:string,key:string}>};
const KEY='stv-locate.device-capture.v1';
export function readDeviceCapture():DeviceCapture{
 const raw=localStorage.getItem(KEY);
 if(!raw)return {version:1,assets:[],locations:[]};
 const value=JSON.parse(raw);
 if(value.version!==1||!Array.isArray(value.assets)||!Array.isArray(value.locations))throw Error('Device backup format is invalid. Export your backup before making changes.');
 return {version:1,assets:value.assets.map((a:unknown)=>assetSchema.parse(a)),locations:value.locations.map((l:unknown)=>locationSchema.parse(l)),...(value.media?{media:value.media}:{}),...(value.uploads?{uploads:value.uploads}:{})};
}
export function writeDeviceCapture(data:DeviceCapture){
 // Validate and write before the UI reports a save. Quota/private-browsing errors propagate.
 const value={...data,version:1,assets:data.assets.map(a=>assetSchema.parse(a)),locations:data.locations.map(l=>locationSchema.parse(l))};
 try{localStorage.setItem(KEY,JSON.stringify(value));}catch{throw Error('This browser could not save on-device. Keep the form open, free storage or enable browser storage, then retry.');}
}
export function saveDevicePhoto(dataUrl:string){
 if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)||dataUrl.length>1500000)throw Error('Choose a smaller JPG, PNG or WebP photo.');
 const key='device-photo:'+newId();
 const data=readDeviceCapture();
 writeDeviceCapture({...data,media:{...data.media,[key]:dataUrl}});
 return key;
}
export function photoSource(key:string){
 if(!key.startsWith('device-photo:'))return '/api/files?key='+encodeURIComponent(key);
 return readDeviceCapture().media?.[key]||'';
}
export async function saveDeviceAsset(asset:Asset){
 const a=assetSchema.parse({...asset,updated:new Date().toISOString()});
 const data=readDeviceCapture();data.assets=[a,...data.assets.filter(x=>x.id!==a.id)];writeDeviceCapture(data);return a;
}
export async function saveDeviceLocation(location:Location){
 const l=locationSchema.parse({...location,updated:new Date().toISOString()});
 const data=readDeviceCapture();data.locations=[l,...data.locations.filter(x=>x.id!==l.id)];writeDeviceCapture(data);return l;
}
export function downloadDeviceBackup(){
 const data=readDeviceCapture();
 const blob=new Blob([JSON.stringify({format:'stv-device-capture',...data},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='STV-field-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function importDeviceBackup(file:File){
 const raw=JSON.parse(await file.text());
 if(raw.format!=='stv-device-capture'||raw.version!==1||!Array.isArray(raw.assets)||!Array.isArray(raw.locations))throw Error('Choose an STV field JSON backup.');
 // Restore as independent copies. Never overwrite existing field captures.
 const parsedAssets:Asset[]=raw.assets.map((v:unknown)=>assetSchema.parse(v));const assetIds=new Map(parsedAssets.map(a=>[a.id,newId()]));
 const ids=new Map<string,string>();const locations:Location[]=raw.locations.map((v:unknown)=>{const l=locationSchema.parse(v);const id=newId();ids.set(l.id,id);return {...l,id,layout:remapInteriorPins(l.layout,assetIds)};});
 const assets:Asset[]=raw.assets.map((v:unknown)=>{const a=assetSchema.parse(v);return {...a,id:assetIds.get(a.id)!,siteId:a.siteId?ids.get(a.siteId):undefined};});
 const existing=readDeviceCapture();
 const remapped=new Map<string,string>();
 const media={...existing.media};
 for(const [key,value] of Object.entries(raw.media||{})){
  if(typeof value!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)||value.length>1500000)throw Error('Backup contains an invalid photo.');
  const next='device-photo:'+newId();remapped.set(key,next);media[next]=value;
 }
 for(const asset of assets)asset.photos=asset.photos.map(p=>({...p,key:remapped.get(p.key)||p.key}));
 for(const location of locations){
  if(location.interior){location.interior.modelPins=location.interior.modelPins?.flatMap(p=>assetIds.has(p.assetId)?[{...p,assetId:assetIds.get(p.assetId)!}]:[]);location.interior.photos=location.interior.photos.map(p=>({...p,key:remapped.get(p.key)||p.key}));if(location.interior.section)location.interior.section.key=remapped.get(location.interior.section.key)||location.interior.section.key;}
  if(location.layout?.reference)location.layout.reference.key=remapped.get(location.layout.reference.key)||location.layout.reference.key;
 }
 writeDeviceCapture({...existing,version:1,locations:[...locations,...existing.locations],assets:[...assets,...existing.assets],...(Object.keys(media).length?{media}:{})});return assets.length;
}
export async function syncDeviceCapture(expectedUserId:string){
 const session=await readApiResponse(await fetch('/api/session',{cache:'no-store'}));
 if(!session.signedIn||session.user?.id!==expectedUserId)throw Error('Your account changed. Sign in and confirm the destination account before syncing.');
 let count=0;
 // Stable UUID upserts make retries idempotent. Keep everything on-device on any failure.
 const data=readDeviceCapture();
 const headers={'Content-Type':'application/json','X-STV-Expected-Owner':expectedUserId};
 const uploaded=new Map<string,string>();
 async function uploadPhoto(key:string){
  if(!key.startsWith('device-photo:'))return key;
  if(uploaded.has(key))return uploaded.get(key)!;
  const previous=data.uploads?.[key];
  if(previous?.owner===expectedUserId){uploaded.set(key,previous.key);return previous.key;}
  const source=data.media?.[key];
  if(!source)throw Error('A device photo is missing. Keep your device backup and retry.');
  const [prefix,encoded]=source.split(',');const type=prefix.slice(5).split(';')[0];
  const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
  const form=new FormData();form.append('file',new Blob([bytes],{type}),'device-photo');
  const response=await readApiResponse(await fetch('/api/files',{method:'POST',headers:{'X-STV-Expected-Owner':expectedUserId},body:form}));
  const current=readDeviceCapture();
  writeDeviceCapture({...current,uploads:{...current.uploads,[key]:{owner:expectedUserId,key:response.key}}});
  uploaded.set(key,response.key);return response.key as string;
 }
 for(const original of data.locations){
  const location=structuredClone(original);
  if(location.interior){for(const p of location.interior.photos)p.key=await uploadPhoto(p.key);if(location.interior.section)location.interior.section.key=await uploadPhoto(location.interior.section.key);}
  if(location.layout?.reference)location.layout.reference.key=await uploadPhoto(location.layout.reference.key);
  await readApiResponse(await fetch('/api/locations',{method:'POST',headers,body:JSON.stringify(location)}));
 }
 for(const original of data.assets){const asset=structuredClone(original);for(const photo of asset.photos)photo.key=await uploadPhoto(photo.key);await readApiResponse(await fetch('/api/assets',{method:'POST',headers,body:JSON.stringify(asset)}));count++;}
 // Only remove items identical to the snapshot; edits made in another tab stay pending.
 const current=readDeviceCapture();
 writeDeviceCapture({...current,version:1,assets:current.assets.filter(a=>!data.assets.some(old=>old.id===a.id&&JSON.stringify(old)===JSON.stringify(a))),locations:current.locations.filter(l=>!data.locations.some(old=>old.id===l.id&&JSON.stringify(old)===JSON.stringify(l)))});
 return count;
}
