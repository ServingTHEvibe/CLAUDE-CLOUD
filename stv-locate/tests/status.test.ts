// @vitest-environment node
import {it,expect,vi,beforeEach} from 'vitest';
import {env} from './cloudflare-mock';
import {GET} from '../app/api/status/route';
beforeEach(()=>{env.DB={prepare:vi.fn(()=>({all:async()=>({results:['assets','locations','rate_limits'].map(name=>({name}))})}))};env.BUCKET={head:vi.fn(async()=>null)};});
it('reports backend connectivity without reading equipment or file contents',async()=>{const r=await GET();expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('no-store');expect((await r.json() as any).checks).toEqual({database:true,photoStorage:true});expect(env.DB.prepare.mock.calls[0][0]).toContain('sqlite_master');expect(env.BUCKET.head).toHaveBeenCalledWith('readiness/nonexistent-probe');});
it('does not mark missing database tables ready',async()=>{env.DB.prepare=()=>({all:async()=>({results:[{name:'assets'}]})});const r=await GET();expect(r.status).toBe(503);expect((await r.json() as any).checks.database).toBe(false);});
it('reports binding failures without exposing exception details',async()=>{env.DB.prepare=()=>{throw Error('SECRET-DB-DETAIL');};env.BUCKET.head=async()=>{throw Error('SECRET-R2-DETAIL');};const r=await GET();const body=await r.text();expect(r.status).toBe(503);expect(body).not.toContain('SECRET');expect(JSON.parse(body).checks).toEqual({database:false,photoStorage:false});});
