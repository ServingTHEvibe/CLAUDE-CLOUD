// @vitest-environment node
import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({headers:new Headers()}));
vi.mock('next/headers',()=>({headers:async()=>state.headers}));
import {getChatGPTUser,chatGPTSignInPath} from '../app/chatgpt-auth';
import {GET} from '../app/api/session/route';
it('requires a stable Site user ID, rather than treating an email header as authorization',async()=>{state.headers=new Headers({'oai-authenticated-user-email':'test@example.test'});expect(await getChatGPTUser()).toBeNull();expect(await (await GET()).json()).toEqual({signedIn:false,user:null});state.headers.set('oai-authenticated-user-id','site-owner-a');const r=await GET();expect(r.headers.get('Cache-Control')).toBe('no-store');expect((await r.json() as any).user.id).toBe('site-owner-a');});
it('does not allow external login return destinations',()=>{expect(chatGPTSignInPath('https://evil.test')).toBe('/signin-with-chatgpt?return_to=%2F');expect(chatGPTSignInPath('//evil.test')).toBe('/signin-with-chatgpt?return_to=%2F');});
