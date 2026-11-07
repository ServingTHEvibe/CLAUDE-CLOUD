import {outlineResponse} from './outline-fixture';
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPlanner from '../components/inventory-planner';
import {readApiResponse} from '../lib/api-response';
vi.mock('../components/asset-map',()=>({default:(p:any)=><button onClick={()=>p.onPick(41.6,-93.6)}>Select building roof</button>}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows the approximate result for visual review before explicit building confirmation',async()=>{const writes:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>{if(String(url).startsWith('/api/building-footprint'))return outlineResponse(String(url));if(init.method==='POST'){writes.push(JSON.parse(init.body));return Response.json({location:writes.at(-1)});}return String(url).startsWith('/api/geocode')?Response.json({results:[{place_id:1,lat:'41.6',lon:'-93.6',display_name:'Main St, Des Moines',location_hint:'approximate_area'}]}):Response.json({locations:[]});}));render(<InventoryPlanner assets={[]} onSaved={()=>{}} onClose={()=>{}}/>);await userEvent.type(screen.getByLabelText('Business or building address'),'123 Main St');await userEvent.click(screen.getByRole('button',{name:'Find address'}));await userEvent.click(await screen.findByRole('button',{name:'Main St, Des Moines'}));await screen.findByText(/Approximate result: check the roof/);expect(writes).toHaveLength(0);await userEvent.click(screen.getByRole('button',{name:'Select building roof'}));await screen.findByText(/Building outlined in green/);expect(writes).toHaveLength(0);await userEvent.click(screen.getByRole('button',{name:'Select building roof'}));await waitFor(()=>expect(screen.getByLabelText('This address and building are correct')).toHaveProperty('disabled',false));await userEvent.click(screen.getByLabelText('This address and building are correct'));await userEvent.click(screen.getByRole('button',{name:'Use this building'}));await waitFor(()=>expect(writes).toHaveLength(1));});
it('finds a physical address from street, city, state and ZIP without GPS or typed coordinates',async()=>{
 const calls:string[]=[];let saved:any;
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>{calls.push(String(url));if(String(url).startsWith('/api/geocode'))return Response.json({results:[{place_id:123,lat:'41.6',lon:'-93.6',name:'Plant',display_name:'1572 NE 58th Ave, Des Moines, IA 50313'}]});if(String(url).startsWith('/api/building-footprint'))return outlineResponse(String(url));if(init.method==='POST'){saved=JSON.parse(init.body);return Response.json({location:saved});}return Response.json({locations:[]});}));
 render(<InventoryPlanner assets={[]} onSaved={()=>{}} onClose={()=>{}}/>);
 expect(screen.getByLabelText('Business or building address')).toBeDefined();await userEvent.click(screen.getByText('Add city, state or ZIP separately'));
 await userEvent.type(screen.getByLabelText('Business or building address'),'1572 NE 58th Ave');
 await userEvent.type(screen.getByLabelText('City (optional if included above)'),'Des Moines');
 await userEvent.type(screen.getByLabelText('State / region'),'IA');
 await userEvent.type(screen.getByLabelText('ZIP / postal code'),'50313');
 await userEvent.click(screen.getByRole('button',{name:'Find address'}));
 await userEvent.click(await screen.findByRole('button',{name:'1572 NE 58th Ave, Des Moines, IA 50313'}));
 await userEvent.click(screen.getByRole('button',{name:'Select building roof'}));await waitFor(()=>expect(screen.getByLabelText('This address and building are correct')).toHaveProperty('disabled',false));await userEvent.click(screen.getByLabelText('This address and building are correct'));await userEvent.click(screen.getByRole('button',{name:'Use this building'}));
 await waitFor(()=>expect(saved).toBeDefined());
 expect(new URL(calls.find(u=>u.startsWith('/api/geocode'))!,'https://test.local').searchParams.get('q')).toContain('1572 NE 58th Ave, Des Moines, IA 50313');
 expect(saved).toMatchObject({address:'1572 NE 58th Ave, Des Moines, IA 50313',lat:41.6,lng:-93.6});
});
it('clears old address results as soon as the address is edited',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).startsWith('/api/geocode')?Response.json({results:[{place_id:1,lat:'41.6',lon:'-93.6',display_name:'Old search result'}]}):Response.json({locations:[]})));
 render(<InventoryPlanner assets={[]} onSaved={()=>{}} onClose={()=>{}}/>);
 await userEvent.type(screen.getByLabelText('Business or building address'),'Old street');
 await userEvent.click(screen.getByRole('button',{name:'Find address'}));
 await screen.findByRole('button',{name:'Old search result'});
 await userEvent.type(screen.getByLabelText('Business or building address'),' revised');
 expect(screen.queryByRole('button',{name:'Old search result'})).toBeNull();
});
it('offers direct map selection when the submitted address has no geocoder match',async()=>{
 const saved:any[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>{
  if(String(url).startsWith('/api/geocode'))return Response.json({results:[]});
  if(String(url).startsWith('/api/building-footprint'))return outlineResponse(String(url));if(init.method==='POST'){const loc=JSON.parse(init.body);saved.push(loc);return Response.json({location:loc});}
  return Response.json({locations:[]});
 }));
 render(<InventoryPlanner assets={[]} onSaved={()=>{}} onClose={()=>{}}/>);
 const address='1572 NE 58th Ave, Des Moines, IA 50313';
 await userEvent.type(screen.getByLabelText('Business or building address'),address);
 await userEvent.click(screen.getByRole('button',{name:'Find address'}));
 await screen.findByText(/This address is not in the search provider/);
 await userEvent.click(screen.getByText('Use GPS or choose manually'));await userEvent.click(screen.getByRole('button',{name:'Choose building on map'}));
 expect(saved).toHaveLength(0);
 await userEvent.click(screen.getByRole('button',{name:'Select building roof'}));
 await userEvent.clear(screen.getByLabelText('Business name *'));await userEvent.type(screen.getByLabelText('Business name *'),'My business');
 await userEvent.click(screen.getByRole('button',{name:'Select building roof'}));await waitFor(()=>expect(screen.getByLabelText('This address and building are correct')).toHaveProperty('disabled',false));await userEvent.click(screen.getByLabelText('This address and building are correct'));await userEvent.click(screen.getByRole('button',{name:'Use this building'}));
 await waitFor(()=>expect(saved).toHaveLength(1));
 expect(saved[0]).toMatchObject({address,lat:41.6,lng:-93.6,name:'My business'});
});
it('shows a sign-in recovery link for plain-text unauthorized responses',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('Unauthorized',{status:401})));
 render(<InventoryPlanner assets={[]} onSaved={()=>{}} onClose={()=>{}}/>);
 const link=await screen.findByRole('link',{name:'Sign in again'});
 expect(link.getAttribute('target')).toBe('_top');
 expect(link.getAttribute('href')).toBe('/signin-with-chatgpt?return_to=%2F');
});
it('handles gateway HTML rather than exposing a JSON parse error',async()=>{
 await expect(readApiResponse(new Response('<html>Gateway unavailable</html>',{status:502}))).rejects.toThrow('cloud connection is unavailable');
});
