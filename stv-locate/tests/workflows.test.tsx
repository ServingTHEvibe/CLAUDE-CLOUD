import {outlineResponse} from './outline-fixture';
import React from 'react';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../app/advanced-workspace';
import {newAsset,type Asset} from '../lib/asset';
import type {Location} from '../lib/location';
vi.mock('../components/asset-map',()=>({default:(p:any)=><div data-testid="map"><button onClick={()=>p.picking&&p.onPick(41.5901234,-93.6212345)}>Tap map spot A</button><button onClick={()=>p.picking&&p.onPick(41.5902345,-93.6213456)}>Tap map spot B</button><button onClick={()=>p.onViewChange?.({lat:41.591,lng:-93.62,zoom:120})}>Adjust map view</button><output data-testid="map-pins">{JSON.stringify(p.assets)}</output><output data-testid="map-focus">{JSON.stringify(p.focus)}</output></div>}));
vi.mock('../lib/export',()=>({download:vi.fn(),exportAssets:vi.fn(async()=>{}),importAssets:vi.fn(async()=>2)}));
vi.mock('qrcode',()=>({toDataURL:vi.fn(async()=> 'data:image/png;base64,TEST')}));
let records:Asset[],buildings:Location[],requests:{url:string,method:string,body:any}[];
const location:Location={id:'c6645139-c856-4df0-97e5-d597357cc314',name:'Test Cafe',address:'123 Test St, Des Moines',businessType:'Restaurant & cafe',lat:41.59,lng:-93.62,zoom:230,updated:'2026-10-07'};
beforeEach(()=>{records=[];buildings=[location];requests=[];vi.stubGlobal('confirm',vi.fn(()=>true));vi.stubGlobal('fetch',vi.fn(async(url:any,init:any={})=>{const method=init.method||'GET';const body=typeof init.body==='string'?JSON.parse(init.body):init.body;requests.push({url:String(url),method,body});if(String(url).startsWith('/api/building-footprint'))return outlineResponse(String(url));if(String(url).startsWith('/api/geocode'))return Response.json({results:[{place_id:1,lat:'41.592',lon:'-93.631',display_name:'456 Sample St, Des Moines',name:'Sample Office'}]});if(url==='/api/locations'){if(method==='POST'){buildings=[body,...buildings.filter(l=>l.id!==body.id)];return Response.json({location:body});}return Response.json({locations:buildings});}if(String(url).startsWith('/api/files'))return Response.json({key:'owner/test-photo'});if(method==='DELETE'){records=records.filter(a=>!String(url).includes(a.id));return Response.json({ok:true});}if(url==='/api/assets'){if(method==='POST'){records=[body,...records.filter(a=>a.id!==body.id)];return Response.json({asset:body});}return Response.json({assets:records});}throw Error('Unexpected request '+url);}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function openPlanner(){render(<Home/>);await waitFor(()=>expect(screen.queryByText('Loading your workspace…')).toBeNull());await userEvent.click(screen.getByRole('button',{name:'Add inventory'}));await screen.findByRole('button',{name:/Test Cafe/});}
async function openCafe(){await openPlanner();await userEvent.click(screen.getByRole('button',{name:/Test Cafe/}));}
async function place(){await userEvent.click(screen.getByRole('button',{name:'Add equipment pin'}));await userEvent.click(screen.getByRole('button',{name:'Tap map spot A'}));}

describe('Existing equipment workspace',()=>{
 const seed=()=>{records=[{...newAsset(),name:'Office coffee',site:'Main office',address:'123 Main St',tag:'COF-01',equipmentType:'Coffee brewer',businessType:'Office & commercial'}];};
 it('loads saved records and filters without navigation or re-fetch loops',async()=>{seed();render(<Home/>);await screen.findByText('Office coffee');await userEvent.type(screen.getByLabelText('Filter equipment'),'no-match');expect(screen.queryByText('Office coffee')).toBeNull();await userEvent.clear(screen.getByLabelText('Filter equipment'));await screen.findByText('Office coffee');expect(requests.filter(r=>r.url==='/api/assets')).toHaveLength(1);});
 it('opens the equipment profile and saves a service note',async()=>{seed();render(<Home/>);await userEvent.click(await screen.findByText('Office coffee'));await userEvent.click(screen.getByRole('button',{name:'Activity'}));await userEvent.type(screen.getByLabelText('Service note'),'Replaced filter');await userEvent.click(screen.getByRole('button',{name:'Add field note'}));await waitFor(()=>expect(records[0].history[0].text).toBe('Replaced filter'));});
 it('edits fields and uploads a landmark photo',async()=>{seed();render(<Home/>);await userEvent.click(await screen.findByText('Office coffee'));await userEvent.click(screen.getByRole('button',{name:'Edit equipment'}));const input=screen.getByLabelText('Model');await userEvent.type(input,'Brewer 600');const file=new File(['photo'],'entrance.png',{type:'image/png'});const upload=document.querySelector('.upload-card input') as HTMLInputElement;await userEvent.upload(upload,file);await waitFor(()=>expect(document.querySelector('.upload-card img')).not.toBeNull());await userEvent.click(screen.getByRole('button',{name:'Save equipment'}));await waitFor(()=>expect(records[0].model).toBe('Brewer 600'));expect(records[0].photos[0].key).toBe('owner/test-photo');});
 it('opens a QR label for the selected record',async()=>{seed();render(<Home/>);await userEvent.click(await screen.findByText('Office coffee'));await userEvent.click(screen.getByRole('button',{name:'QR label'}));await screen.findByRole('dialog',{name:'Equipment QR label'});expect(screen.getByRole('link',{name:'Download QR label'}).getAttribute('href')).toContain('data:image/png');});
 it('deletes only after confirmation',async()=>{seed();render(<Home/>);await userEvent.click(await screen.findByText('Office coffee'));await userEvent.click(screen.getByRole('button',{name:'Details'}));vi.mocked(confirm).mockReturnValueOnce(false);await userEvent.click(screen.getByRole('button',{name:'Delete asset'}));expect(records).toHaveLength(1);await userEvent.click(screen.getByRole('button',{name:'Delete asset'}));await waitFor(()=>expect(records).toHaveLength(0));});
 it('shows cloud failures with a retry, not an automatic reload',async()=>{vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:'Offline test'},{status:503}));render(<Home/>);await screen.findByText('Offline test');expect(requests).toHaveLength(0);await userEvent.click(screen.getByRole('button',{name:'Retry cloud connection'}));await screen.findByText('Make this map yours');expect(requests).toHaveLength(1);});
});








