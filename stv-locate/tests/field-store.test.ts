import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {newAsset} from '../lib/asset';
import {starterLayout} from '../lib/interior-layout';
import {readDeviceCapture,saveDeviceAsset,saveDeviceLocation,syncDeviceCapture,importDeviceBackup} from '../lib/field-store';
const building=()=>({id:crypto.randomUUID(),name:'Field office',address:'123 Test St',businessType:'Office & commercial',lat:41.59,lng:-93.62,zoom:230,updated:'2026-10-08'});
const machine=()=>({...newAsset(),name:'Office brewer',site:'Field office',address:'123 Test St',lat:41.5901234,lng:-93.6212345});
beforeEach(()=>localStorage.clear());afterEach(()=>vi.unstubAllGlobals());
it('restores sketches and indoor equipment links to the copied device IDs',async()=>{const l=building(),a={...machine(),siteId:l.id},layout=starterLayout();layout.pins=[{assetId:a.id,roomId:layout.rooms[0].id,x:.5,z:.5}];layout.planPins=[{assetId:a.id,x:4,z:2}];layout.sketch=[[{x:1,z:1},{x:5,z:1}]];await importDeviceBackup({text:async()=>JSON.stringify({format:'stv-device-capture',version:1,assets:[a],locations:[{...l,layout}]})} as File);const d=readDeviceCapture();expect(d.locations[0].layout?.pins[0].assetId).toBe(d.assets[0].id);expect(d.locations[0].layout?.planPins?.[0].assetId).toBe(d.assets[0].id);expect(d.locations[0].layout?.sketch).toEqual(layout.sketch);});
it('persists exact pins and buildings across reads; edits do not duplicate',async()=>{const l=building();const a={...machine(),siteId:l.id};await saveDeviceLocation(l);await saveDeviceAsset(a);expect(readDeviceCapture().assets[0]).toMatchObject({lat:41.5901234,lng:-93.6212345,siteId:l.id});await saveDeviceAsset({...a,room:'North breakroom'});expect(readDeviceCapture().assets).toHaveLength(1);expect(readDeviceCapture().assets[0].room).toBe('North breakroom');});
it('does not report a save when browser storage is full',async()=>{const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw Error('quota');});await expect(saveDeviceAsset(machine())).rejects.toThrow('could not save on-device');expect(readDeviceCapture().assets).toHaveLength(0);spy.mockRestore();});
it('keeps every capture when sync partly fails, then retries stable UUIDs',async()=>{const l=building();const a={...machine(),siteId:l.id};await saveDeviceLocation(l);await saveDeviceAsset(a);const requests:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>{requests.push({url,init});if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a'}});if(url==='/api/assets')return Response.json({error:'Network unavailable'},{status:503});return Response.json({location:l});}));await expect(syncDeviceCapture('owner-a')).rejects.toThrow('Network unavailable');expect(readDeviceCapture().assets).toHaveLength(1);expect(readDeviceCapture().locations).toHaveLength(1);expect(requests[1].init.headers['X-STV-Expected-Owner']).toBe('owner-a');vi.stubGlobal('fetch',vi.fn(async(url:any)=>url==='/api/session'?Response.json({signedIn:true,user:{id:'owner-a'}}):Response.json({ok:true})));expect(await syncDeviceCapture('owner-a')).toBe(1);expect(readDeviceCapture()).toMatchObject({assets:[],locations:[]});});
it('refuses syncing when identity is missing or changed',async()=>{await saveDeviceAsset(machine());vi.stubGlobal('fetch',vi.fn(async()=>Response.json({signedIn:true,user:{id:'other-owner'}})));await expect(syncDeviceCapture('owner-a')).rejects.toThrow('account changed');expect(fetch).toHaveBeenCalledTimes(1);expect(readDeviceCapture().assets).toHaveLength(1);});
it('does not clear an edit made in another tab during sync',async()=>{const a=machine();await saveDeviceAsset(a);vi.stubGlobal('fetch',vi.fn(async(url:any)=>{if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a'}});await saveDeviceAsset({...a,notes:'New concurrent edit'});return Response.json({asset:a});}));await syncDeviceCapture('owner-a');expect(readDeviceCapture().assets[0].notes).toBe('New concurrent edit');});
it('restores a backup as new records with consistent building links',async()=>{const l=building();const a={...machine(),siteId:l.id};const raw={format:'stv-device-capture',version:1,assets:[a],locations:[l]};const file={text:async()=>JSON.stringify(raw)} as File;await saveDeviceAsset(a);await importDeviceBackup(file);const data=readDeviceCapture();expect(data.assets).toHaveLength(2);expect(data.assets[0].id).not.toBe(a.id);expect(data.assets[0].siteId).toBe(data.locations[0].id);});
it('rejects invalid backups without changing existing captures',async()=>{await saveDeviceAsset(machine());const file={text:async()=>JSON.stringify({format:'stv-device-capture',version:1,assets:[{}],locations:[]})} as File;await expect(importDeviceBackup(file)).rejects.toThrow();expect(readDeviceCapture().assets).toHaveLength(1);});

it('backs up and restores device photos under independent keys',async()=>{
 const {saveDevicePhoto,photoSource}=await import('../lib/field-store');
 const source='data:image/jpeg;base64,cGhvdG8=';
 const key=saveDevicePhoto(source);
 const asset={...machine(),photos:[{label:'Equipment',key}]};
 await saveDeviceAsset(asset);
 const snapshot=readDeviceCapture();
 expect(photoSource(key)).toBe(source);
 await importDeviceBackup({text:async()=>JSON.stringify({format:'stv-device-capture',...snapshot})} as File);
 const restored=readDeviceCapture().assets[0];
 expect(restored.photos[0].key).not.toBe(key);
 expect(photoSource(restored.photos[0].key)).toBe(source);
 expect(restored.id).not.toBe(asset.id);
});

it('keeps local photos after a partial sync and reuses their uploaded copies on retry',async()=>{
 const {saveDevicePhoto}=await import('../lib/field-store');
 const key=saveDevicePhoto('data:image/jpeg;base64,cGhvdG8=');
 await saveDeviceAsset({...machine(),photos:[{label:'Equipment',key}]});
 let fail=true,uploads=0;const saved:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:any={})=>{
  if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a'}});
  if(url==='/api/files'){uploads++;expect(init.headers['X-STV-Expected-Owner']).toBe('owner-a');return Response.json({key:'owner-a/photo'});}
  if(fail)return Response.json({error:'Network interrupted'},{status:503});
  saved.push(JSON.parse(init.body));return Response.json({ok:true});
 }));
 await expect(syncDeviceCapture('owner-a')).rejects.toThrow('Network interrupted');
 expect(readDeviceCapture().assets[0].photos[0].key).toBe(key);
 expect(readDeviceCapture().media?.[key]).toBeDefined();
 fail=false;expect(await syncDeviceCapture('owner-a')).toBe(1);
 expect(uploads).toBe(1);
 expect(saved[0].photos[0].key).toBe('owner-a/photo');
 expect(readDeviceCapture().assets).toHaveLength(0);
});
