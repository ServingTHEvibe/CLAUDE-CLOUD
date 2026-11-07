import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to upload photos.'},{status:401});
 if(request.headers.get('X-STV-Expected-Owner')&&request.headers.get('X-STV-Expected-Owner')!==user.userId)return Response.json({error:'Your account changed. Confirm the destination account before syncing.'},{status:403});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'This upload origin is not allowed.'},{status:403});
 if(Number(request.headers.get('content-length')||0)>9000000)return Response.json({error:'Choose a photo under 8 MB.'},{status:413});
 try{
  const form=await request.formData();const file=form.get('file');
  if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8000000)return Response.json({error:'Choose a JPG, PNG or WebP under 8 MB.'},{status:400});
  if(!env.BUCKET)return Response.json({error:'Photo storage unavailable. Keep your editor open and retry.'},{status:503});
  const key=`${user.userId}/${crypto.randomUUID()}`;await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});return Response.json({key});
 }catch{return Response.json({error:'The photo could not be uploaded. Keep your editor open and retry.'},{status:503});}
}
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to view photos.'},{status:401});
 const key=new URL(request.url).searchParams.get('key')||'';if(!key.startsWith(`${user.userId}/`))return Response.json({error:'Photo access denied.'},{status:403});
 try{const obj=await env.BUCKET?.get(key);if(!obj)return new Response('Not found',{status:404});return new Response(obj.body,{headers:{'Content-Type':obj.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});}catch{return Response.json({error:'Photo storage unavailable. Please retry.'},{status:503});}
}
