import {it,expect,vi} from 'vitest';
import {newId} from '../lib/id.mjs';
it('creates distinct UUIDs with secure random bytes when HTTP preview lacks randomUUID',()=>{const native=crypto;vi.stubGlobal('crypto',{getRandomValues:native.getRandomValues.bind(native)});try{const first=newId(),second=newId();expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);expect(first).not.toBe(second);}finally{vi.unstubAllGlobals();}});
