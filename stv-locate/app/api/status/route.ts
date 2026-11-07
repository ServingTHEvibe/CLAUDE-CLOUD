import {env} from 'cloudflare:workers';

/** Read-only deployment health. No record data, identity, file keys or secrets. */
export async function GET(){
 const checks={database:false,photoStorage:false};
 await Promise.all([
  (async()=>{try{
   if(!env.DB)return;
   const r=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('assets','locations','rate_limits')").all<{name:string}>();
   checks.database=['assets','locations','rate_limits'].every(name=>r.results.some(row=>row.name===name));
  }catch{}})(),
  (async()=>{try{
   if(!env.BUCKET)return;
   // A missing object is normal; a successful metadata lookup verifies the binding.
   await env.BUCKET.head('readiness/nonexistent-probe');checks.photoStorage=true;
  }catch{}})()
 ]);
 const ready=checks.database&&checks.photoStorage;
 return Response.json({service:'STV Locate',ready,checks,error:ready?undefined:'Backend storage is unavailable. Please retry later.',checkedAt:new Date().toISOString(),scope:'Read-only backend connectivity; user login, writes and imagery are separate checks.'},{status:ready?200:503,headers:{'Cache-Control':'no-store'}});
}
