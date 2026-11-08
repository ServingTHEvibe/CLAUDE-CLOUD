import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../app/page';
import {newAsset} from '../lib/asset';
import {readDeviceCapture} from '../lib/field-store';
vi.mock('../components/asset-map',()=>({default:(p:any)=><div><button onClick={()=>p.picking&&p.onPick(41.5901234,-93.6212345)}>Tap test roof</button>{[[41.59,-93.622],[41.59,-93.62],[41.591,-93.621]].map(([lat,lng],i)=><button key={i} onClick={()=>p.onPick(lat,lng)}>Corner {i+1}</button>)}</div>}));
beforeEach(()=>{localStorage.clear();vi.stubGlobal('confirm',vi.fn(()=>true));vi.stubGlobal('fetch',vi.fn(async(url:any)=>{if(url==='/api/session')return Response.json({signedIn:false,user:null});if(url==='/api/locations')return Response.json({locations:[]});if(url==='/api/assets')return Response.json({assets:[]});if(String(url).startsWith('/api/geocode'))return Response.json({results:[]});throw Error('Unexpected request '+url);}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('does not label a failed cloud inventory load as connected',async()=>{vi.stubGlobal('fetch',vi.fn(async(url:any)=>url==='/api/session'?Response.json({signedIn:true,user:{id:'owner-a',name:'Tester',email:'test@example.test'}}):Response.json({error:'Cloud database unavailable'},{status:503})));render(<Home/>);await screen.findByText('Cloud connection needs attention');expect(screen.queryByText('Cloud workspace connected')).toBeNull();await screen.findByText('Cloud database unavailable');});
it('always shows visible login and add equipment, with an explicit storage choice',async()=>{render(<Home/>);expect(screen.getByRole('link',{name:'Log in'}).getAttribute('target')).toBe('_top');await userEvent.click(screen.getByRole('button',{name:'Add equipment'}));await screen.findByRole('dialog',{name:'Choose equipment storage'});expect(readDeviceCapture().assets).toHaveLength(0);});


it('loads cloud inventory and saves a repair update with stable ID',async()=>{const a={...newAsset(),name:'Field brewer',site:'Office',address:'123 Test St'};let record=a;vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>{if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a',name:'Tester',email:'test@example.test'}});if(url==='/api/assets'&&init.method==='POST'){record=JSON.parse(init.body);return Response.json({asset:record});}return Response.json({assets:[record]});}));render(<Home/>);await userEvent.click(await screen.findByRole('button',{name:/Field brewer/}));await userEvent.click(screen.getByRole('button',{name:'Update / repair notes'}));await userEvent.type(screen.getByLabelText('Repair / service note'),'Replaced filter');await userEvent.click(screen.getByRole('button',{name:'Save equipment'}));await waitFor(()=>expect(record.history[0].text).toBe('Replaced filter'));expect(record.id).toBe(a.id);});
it('keeps repair changes editable after a cloud save failure',async()=>{const a={...newAsset(),name:'Repair machine',site:'Office',address:'123 Test St'};vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>url==='/api/session'?Response.json({signedIn:true,user:{id:'owner-a',name:'Tester',email:'test@example.test'}}):init.method==='POST'?new Response('Unauthorized',{status:401}):Response.json({assets:[a]})));render(<Home/>);await userEvent.click(await screen.findByRole('button',{name:/Repair machine/}));await userEvent.click(screen.getByRole('button',{name:'Update / repair notes'}));await userEvent.type(screen.getByLabelText('Repair / service note'),'Pending repair');await userEvent.click(screen.getByRole('button',{name:'Save equipment'}));await waitFor(()=>expect(screen.getAllByText(/Sign in again to access/).length).toBeGreaterThan(0));expect((screen.getByLabelText('Repair / service note') as HTMLTextAreaElement).value).toBe('Pending repair');});

it('shows loading copy while signed-in inventory is still pending',async()=>{
  let finishInventory!: (response: Response) => void;
  const pendingInventory=new Promise<Response>(resolve=>{finishInventory=resolve;});
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a',name:'Tester',email:'test@example.test'}});
    return pendingInventory;
  }));
  render(<Home/>);
  await screen.findByText('Tester');
  expect(screen.getByText('Loading your private equipment records…')).toBeTruthy();
  expect(screen.queryByText(/cloud inventory could not load/)).toBeNull();
  finishInventory(Response.json({assets:[]}));
  await screen.findByText('Cloud workspace connected');
});

it('shows saved landmark and equipment photos when a field profile reopens',async()=>{
  const asset={
    ...newAsset(),name:'Field vending',site:'Office',address:'123 Test St',
    photos:[{label:'Entrance',key:'owner-a/door photo.png'},{label:'Equipment',key:'owner-a/vend.png'}],
  };
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a',name:'Tester',email:'test@example.test'}});
    return Response.json({assets:[asset]});
  }));
  render(<Home/>);
  for(let attempt=0;attempt<2;attempt++){
    await userEvent.click(await screen.findByRole('button',{name:/Field vending/}));
    expect(screen.getByRole('img',{name:'Entrance photo'}).getAttribute('src')).toBe('/api/files?key=owner-a%2Fdoor%20photo.png');
    expect(screen.getByRole('img',{name:'Equipment photo'}).getAttribute('src')).toBe('/api/files?key=owner-a%2Fvend.png');
    await userEvent.click(screen.getByRole('button',{name:'Close equipment profile'}));
  }
});




