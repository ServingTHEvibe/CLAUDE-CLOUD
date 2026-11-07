// @vitest-environment node
import {it,expect,vi,beforeEach} from 'vitest';
import {env} from './cloudflare-mock';
import {validateModel} from '../lib/model-file';
const state=vi.hoisted(()=>({user:{userId:'owner-a'} as {userId:string}|null}));
vi.mock('../app/chatgpt-auth',()=>({getChatGPTUser:async()=>state.user}));
import * as models from '../app/api/models/route';

function glb(extra:Record<string,unknown>={}){
 const json=JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[]}],scene:0,...extra});
 const encoded=new TextEncoder().encode(json.padEnd(Math.ceil(json.length/4)*4,' '));
 const buffer=new ArrayBuffer(20+encoded.length),view=new DataView(buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,buffer.byteLength,true);
 view.setUint32(12,encoded.length,true);view.setUint32(16,0x4e4f534a,true);new Uint8Array(buffer,20).set(encoded);
 return buffer;
}
function upload(buffer=glb()){
 const form=new FormData();form.append('file',new File([buffer],'room.glb',{type:'model/gltf-binary'}));
 return new Request('https://site.test/api/models',{method:'POST',body:form});
}
beforeEach(()=>{
 state.user={userId:'owner-a'};const data=new Map();
 env.BUCKET={put:async(key:string,body:unknown,metadata:object)=>data.set(key,{body,...metadata}),get:async(key:string)=>data.get(key)};
});
it('stores and retrieves a private GLB and rejects foreign reads',async()=>{
 const response=await models.POST(upload());expect(response.status).toBe(200);
 const {key}=await response.json() as {key:string};
 expect(key).toMatch(/^owner-a\/model-/);
 const read=await models.GET(new Request('https://site.test/api/models?key='+key));
 expect(read.status).toBe(200);expect(read.headers.get('Content-Type')).toBe('model/gltf-binary');
 expect((await models.GET(new Request('https://site.test/api/models?key=owner-b/model-x'))).status).toBe(403);
});
it('refuses external model dependencies, malformed files and unconfigured compression',()=>{
 expect(()=>validateModel(glb({images:[{uri:'https://example.test/private-image'}]}))).toThrow('embedded');
 expect(()=>validateModel(new ArrayBuffer(24))).toThrow('valid GLB');
 expect(()=>validateModel(glb({extensionsRequired:['KHR_draco_mesh_compression']}))).toThrow('Compressed');
});
it('rejects anonymous and cross-origin model writes',async()=>{
 state.user=null;expect((await models.POST(upload())).status).toBe(401);
 state.user={userId:'owner-a'};const request=upload();request.headers.set('Origin','https://foreign.test');
 expect((await models.POST(request)).status).toBe(403);
});
