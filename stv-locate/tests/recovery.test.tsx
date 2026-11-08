import {outlineResponse} from './outline-fixture';
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPlanner from '../components/inventory-planner';
import {readApiResponse} from '../lib/api-response';
vi.mock('../components/asset-map',()=>({default:(p:any)=><button onClick={()=>p.onPick(41.6,-93.6)}>Select building roof</button>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});





it('handles gateway HTML rather than exposing a JSON parse error',async()=>{
 await expect(readApiResponse(new Response('<html>Gateway unavailable</html>',{status:502}))).rejects.toThrow('cloud connection is unavailable');
});
