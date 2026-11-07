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
it('captures a building, exact equipment pin and repair note on-device; reloads records',async()=>{const app=render(<Home/>);await screen.findByText('Cloud login needed');await userEvent.click(screen.getByRole('button',{name:'Add equipment on this device'}));await userEvent.type(screen.getByLabelText('Business or building address'),'1572 NE 58th Ave, Des Moines, IA 50313');await userEvent.click(screen.getByText('Use GPS or choose manually'));await userEvent.click(screen.getByRole('button',{name:'Choose building on map'}));await userEvent.click(screen.getByRole('button',{name:'Tap test roof'}));await screen.findByText(/Automatic outline unavailable/);await userEvent.click(screen.getByRole('button',{name:'Trace roof corners'}));for(const i of [1,2,3])await userEvent.click(screen.getByRole('button',{name:'Corner '+i}));await userEvent.click(screen.getByRole('button',{name:'Finish outline (3 corners)'}));await userEvent.click(screen.getByLabelText('This address and building are correct'));await userEvent.type(screen.getByLabelText('Business name *'),'Field test plant');await userEvent.click(screen.getByRole('button',{name:'Use this building'}));await userEvent.click(await screen.findByRole('button',{name:'Add equipment pin'}));await userEvent.click(screen.getByRole('button',{name:'Tap test roof'}));await userEvent.selectOptions(screen.getByLabelText('Equipment for this business'),'Drink vending machine');await userEvent.type(screen.getByLabelText('Exact room / position'),'Breakroom north wall');await userEvent.click(screen.getByRole('button',{name:'Save equipment pin'}));await waitFor(()=>expect(readDeviceCapture().assets).toHaveLength(1));await userEvent.click(screen.getByRole('button',{name:'Finish'}));await userEvent.click(await screen.findByRole('button',{name:/Drink vending machine/}));await userEvent.click(screen.getByRole('button',{name:'Update / repair notes'}));await userEvent.selectOptions(screen.getByLabelText('Status'),'Needs service');await userEvent.type(screen.getByLabelText('Repair / service note'),'Checked cooling deck and condenser fan');await userEvent.click(screen.getByRole('button',{name:'Save equipment'}));await waitFor(()=>expect(readDeviceCapture().assets[0].history[0].text).toContain('condenser fan'));expect(readDeviceCapture().assets[0]).toMatchObject({lat:41.5901234,lng:-93.6212345,status:'Needs service',room:'Breakroom north wall'});app.unmount();render(<Home/>);await screen.findByText(/1 equipment · 1 buildings on this device/);await userEvent.click(screen.getByRole('button',{name:'View device records'}));await screen.findByRole('button',{name:/Drink vending machine/});});
it('surfaces denied GPS without assuming a location',async()=>{Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_:any,reject:any)=>reject({code:1})}});render(<Home/>);await screen.findByText('Cloud login needed');await userEvent.click(screen.getByRole('button',{name:'Add equipment on this device'}));await userEvent.click(screen.getByText('Use GPS or choose manually'));await userEvent.click(screen.getByRole('button',{name:'Use my GPS near the building'}));await screen.findByText(/GPS permission denied or unavailable/);expect(screen.queryByRole('button',{name:'Use this building'})).toBeNull();});
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

it('starts from GPS, saves two separate machines with a camera photo and reloads them',async()=>{
 const records:any[]=[];
 let sites:any[]=[];
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:any)=>success({coords:{latitude:41.59,longitude:-93.62,accuracy:15}})}});
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:any={})=>{
  if(url==='/api/session')return Response.json({signedIn:true,user:{id:'owner-a',name:'Tester',email:'test@example.test'}});
  if(url==='/api/locations'){
   if(init.method==='POST'){const location=JSON.parse(init.body);sites.push(location);return Response.json({location});}
   return Response.json({locations:sites});
  }
  if(url==='/api/files')return Response.json({key:'owner-a/area.jpg'});
  if(url==='/api/assets'){
   if(init.method==='POST'){const asset=JSON.parse(init.body);records.push(asset);return Response.json({asset});}
   return Response.json({assets:records});
  }
  throw Error('Unexpected request '+url);
 }));
 const app=render(<Home/>);
 await screen.findByText('Cloud workspace connected');
 await userEvent.click(screen.getByRole('button',{name:'Add equipment'}));
 await userEvent.click(screen.getByRole('button',{name:'Use my GPS location'}));
 await userEvent.click(await screen.findByRole('button',{name:'Use this position & add first machine'}));
 await userEvent.selectOptions(screen.getByLabelText('Equipment for this business'),'Drink vending machine');
 await userEvent.upload(screen.getByLabelText('Equipment camera photo'),new File(['photo'],'machine.jpg',{type:'image/jpeg'}));
 await screen.findByRole('img',{name:'Equipment preview'});
 await userEvent.click(screen.getByRole('button',{name:'Save equipment pin'}));
 await screen.findByRole('article',{name:'Info sheet for Drink vending machine'});
 await userEvent.click(screen.getByRole('button',{name:'Add another machine here'}));
 await userEvent.selectOptions(screen.getByLabelText('Equipment for this business'),'Snack vending machine');
 await userEvent.click(screen.getByRole('button',{name:'Save equipment pin'}));
 await waitFor(()=>expect(records).toHaveLength(2));
 expect(sites).toHaveLength(1);
 expect(records[0].id).not.toBe(records[1].id);
 expect(records.map(a=>[a.lat,a.lng])).toEqual([[41.59,-93.62],[41.59,-93.62]]);
 expect(records[0].photos).toEqual([{label:'Equipment',key:'owner-a/area.jpg'}]);
 expect(records[1].photos).toEqual([]);
 app.unmount();
 render(<Home/>);
 await screen.findByText('2 equipment spots');
});

it('captures separate equipment areas and a device photo, then reopens and searches them',async()=>{
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:any)=>success({coords:{latitude:41.59,longitude:-93.62,accuracy:12}})}});
 const app=render(<Home/>);
 await screen.findByText('Cloud login needed');
 await userEvent.click(screen.getByRole('button',{name:'Add equipment on this device'}));
 await userEvent.click(screen.getByRole('button',{name:'Use my GPS location'}));
 await userEvent.type(screen.getByLabelText('Site name'),'Pilot building');
 await userEvent.click(screen.getByRole('button',{name:'Use this position & add first machine'}));
 await userEvent.selectOptions(screen.getByLabelText('Equipment for this business'),'Drink vending machine');
 await userEvent.type(screen.getByLabelText('Exact room / position'),'Breakroom');
 await userEvent.upload(screen.getByLabelText('Equipment camera photo'),new File(['camera'],'Equipment.jpg',{type:'image/jpeg'}));
 await screen.findByRole('img',{name:'Equipment preview'});
 await userEvent.click(screen.getByRole('button',{name:'Save equipment pin'}));
 await screen.findByRole('article',{name:'Info sheet for Drink vending machine'});
 await userEvent.click(screen.getByRole('button',{name:'Add another machine here'}));
 await userEvent.selectOptions(screen.getByLabelText('Equipment for this business'),'Coffee station');
 await userEvent.click(screen.getByRole('button',{name:'Save equipment pin'}));
 await screen.findByRole('article',{name:'Info sheet for Coffee station'});
 await userEvent.click(screen.getByRole('button',{name:'Add in another area'}));
 await userEvent.click(screen.getByRole('button',{name:'Tap test roof'}));
 await userEvent.selectOptions(screen.getByLabelText('Equipment for this business'),'Water cooler');
 await userEvent.type(screen.getByLabelText('Exact room / position'),'Warehouse');
 await userEvent.click(screen.getByRole('button',{name:'Save equipment pin'}));
 await waitFor(()=>expect(readDeviceCapture().assets).toHaveLength(3));
 const records=readDeviceCapture().assets;
 expect(new Set(records.map(asset=>asset.id)).size).toBe(3);
 expect(records.find(asset=>asset.name==='Water cooler')?.lat).toBe(41.5901234);
 expect(records.find(asset=>asset.name==='Drink vending machine')?.photos[0].key).toMatch(/^device-photo:/);
 app.unmount();render(<Home/>);
 await screen.findByText('3 equipment spots');
 await userEvent.click(screen.getByRole('button',{name:/Operational Drink vending machine/}));
 expect(screen.getByRole('img',{name:'Equipment photo'}).getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/);
 await userEvent.click(screen.getByRole('button',{name:'Close equipment profile'}));
 await userEvent.type(screen.getByRole('textbox',{name:'Search field equipment'}),'Warehouse');
 expect(screen.getByRole('button',{name:/Operational Water cooler/})).toBeDefined();
 expect(screen.queryByRole('button',{name:/Operational Coffee station/})).toBeNull();
});
