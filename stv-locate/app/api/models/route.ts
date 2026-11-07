import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {MAX_MODEL_BYTES,validateModel} from '../../../lib/model-file';

export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:'Sign in to save a 3D model.'},{status:401});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Upload origin denied.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>MAX_MODEL_BYTES+1000000)return Response.json({error:'Choose a GLB under 24 MB.'},{status:413});
 try{
  const form=await request.formData();const file=form.get('file');
  if(!(file instanceof File)||file.size>MAX_MODEL_BYTES)return Response.json({error:'Choose a GLB under 24 MB.'},{status:400});
  const buffer=await file.arrayBuffer();
  try{validateModel(buffer);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
  if(!env.BUCKET)return Response.json({error:'Model storage is unavailable. Keep this form open and retry.'},{status:503});
  const key=user.userId+'/model-'+crypto.randomUUID();
  await env.BUCKET.put(key,buffer,{httpMetadata:{contentType:'model/gltf-binary'}});
  return Response.json({key},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'The model could not be saved. Retry when connected.'},{status:503});}
}

export async function GET(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:'Sign in to view this model.'},{status:401});
 const key=new URL(request.url).searchParams.get('key')||'';
 if(!key.startsWith(user.userId+'/model-'))return Response.json({error:'Model access denied.'},{status:403});
 try{
  const model=await env.BUCKET?.get(key);
  if(!model)return new Response('Model not found',{status:404});
  return new Response(model.body,{headers:{'Content-Type':'model/gltf-binary','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Model storage is unavailable. Retry when connected.'},{status:503});}
}
