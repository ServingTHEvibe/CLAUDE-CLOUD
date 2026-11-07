'use client';
import {lazy,Suspense,useEffect,useState} from 'react';
import type {Location} from '../lib/location';
import type {Asset} from '../lib/asset';
import {readApiResponse} from '../lib/api-response';
import {capturePhoto} from '../lib/capture-photo';
import {photoSource} from '../lib/field-store';
import {MAX_MODEL_BYTES,validateModel} from '../lib/model-file';
const ModelViewer=lazy(()=>import('./model-viewer'));

type Props={location:Location,assets:Asset[],save:(location:Location)=>Promise<void>,deviceOnly?:boolean,onBusy?:(busy:boolean)=>void};

export default function BuildingInterior({location,assets,save,deviceOnly,onBusy}:Props){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notes,setNotes]=useState(location.interior?.notes||'');
 useEffect(()=>{onBusy?.(busy);return()=>onBusy?.(false);},[busy,onBusy]);
 const interior=location.interior||{notes:'',photos:[]};
 async function uploadPhoto(file:File|undefined,section=false){
  if(!file)return;
  setBusy(true);setError('');
  try{
   const key=await capturePhoto(file,Boolean(deviceOnly));
   const photo={key,label:file.name.slice(0,250)};
   await save({...location,interior:{...interior,notes,...(section?{section:photo}:{photos:[...interior.photos,photo]})}});
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 async function uploadModel(file:File|undefined){
  if(!file)return;
  setBusy(true);setError('');
  try{
   if(file.size>MAX_MODEL_BYTES)throw Error('Choose a self-contained GLB under 24 MB.');
   validateModel(await file.arrayBuffer());
   const form=new FormData();form.append('file',file);
   const {key}=await readApiResponse(await fetch('/api/models',{method:'POST',body:form}));
   await save({...location,interior:{...interior,notes,model:{key,label:file.name.slice(0,250)},modelPins:[]}});
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 async function saveNotes(){
  setBusy(true);setError('');
  try{await save({...location,interior:{...interior,notes}});}
  catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 return <details className="building-interior">
  <summary>Interior photos & 3D section</summary>
  <p>Capture each equipment area from several angles. Include the entrance, corners and machines. Add the area name and any measurements you know.</p>
  <label className="field">Interior notes / measured dimensions<textarea maxLength={5000} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Area names, route from the entrance, measured wall lengths and missing views"/></label>
  <button className="secondary" disabled={busy} onClick={()=>void saveNotes()}>Save interior notes</button>
  <div className="capture-actions">
   <label className="field">Take interior photo<input aria-label="Take interior photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy||interior.photos.length>=12} onChange={event=>{void uploadPhoto(event.target.files?.[0]);event.target.value='';}}/></label>
   <label className="field">Or choose an existing photo<input aria-label="Choose interior photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||interior.photos.length>=12} onChange={event=>{void uploadPhoto(event.target.files?.[0]);event.target.value='';}}/></label>
  </div>
  <small>{interior.photos.length}/12 reference photos saved {deviceOnly?'on this device':'to this building'}</small>
  <div className="interior-photos">{interior.photos.map((photo,index)=><figure key={photo.key}>
   <img src={photoSource(photo.key)} alt={photo.label} loading="lazy"/>
   <label>Room / view description<input maxLength={250} defaultValue={photo.label} disabled={busy} onBlur={async event=>{
    const label=event.target.value;if(label===photo.label)return;
    setBusy(true);setError('');
    try{await save({...location,interior:{...interior,notes,photos:interior.photos.map((item,i)=>i===index?{...item,label}:item)}});}
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
   }}/></label>
   <button className="text-button" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');
    try{await save({...location,interior:{...interior,notes,photos:interior.photos.filter(item=>item.key!==photo.key)}});}
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
   }}>Remove reference</button>
  </figure>)}</div>
  <details className="reconstruction-tools"><summary>Build or import a 3D location</summary>
   <p>These photos and equipment records can be exported for the scan-to-threejs and Unreal Home Wizard workflows. Reconstruction runs separately on a suitable computer. Upload the resulting GLB here to explore it and mark your equipment inside.</p>
   <button className="secondary" disabled={busy||!interior.photos.length} onClick={async()=>{
    setBusy(true);setError('');
    try{
     const updated={...location,interior:{...interior,notes}};
     await save(updated);
     const {exportInterior}=await import('../lib/export');await exportInterior(updated,assets);
    }catch(error){setError((error as Error).message);}finally{setBusy(false);}
   }}>Download reconstruction photos & brief</button>
   {deviceOnly?<p>Sync this site to your account to upload a finished 3D model.</p>:<label className="field">Upload reconstructed 3D location<input aria-label="Upload reconstructed 3D location" type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file&&interior.model&&!confirm('Replace the current model and its indoor markers?')){event.target.value='';return;}void uploadModel(file);event.target.value='';}}/></label>}
   <small>Self-contained GLB · up to 24 MB · keep the model scale from your reconstruction.</small>
   <label className="field">Upload a finished 3D section image<input aria-label="Upload finished 3D section" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{void uploadPhoto(event.target.files?.[0],true);event.target.value='';}}/></label>
   {interior.section?<figure><img className="finished-section" src={photoSource(interior.section.key)} alt="Uploaded interior 3D section"/><figcaption>{interior.section.label}</figcaption></figure>:<small>No completed 3D section yet.</small>}
  </details>
  {interior.model&&!deviceOnly&&<Suspense fallback={<p>Loading model viewer…</p>}><ModelViewer location={location} assets={assets} save={save}/></Suspense>}
  {busy&&<p role="status">Saving…</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
