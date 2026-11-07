import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PilotCheck from '../components/pilot-check';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('checks login and both private lists without creating records',async()=>{const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:any,init:any)=>{calls.push({url,init});if(url==='/api/status')return Response.json({ready:true});if(url==='/api/session')return Response.json({signedIn:true});if(url==='/api/assets')return Response.json({assets:[]});return Response.json({locations:[]});}));render(<PilotCheck/>);await userEvent.click(screen.getByRole('button',{name:'Client pilot checklist'}));await userEvent.click(screen.getByRole('button',{name:'Run connection check'}));await screen.findByText('Your equipment and building lists loaded successfully.');expect(calls).toHaveLength(4);expect(calls.every(c=>!c.init.method||c.init.method==='GET')).toBe(true);});
it('stops user-owned inventory checks at a missing login',async()=>{vi.stubGlobal('fetch',vi.fn(async(url:any)=>Response.json(url==='/api/status'?{ready:true}:{signedIn:false})));render(<PilotCheck/>);await userEvent.click(screen.getByRole('button',{name:'Client pilot checklist'}));await userEvent.click(screen.getByRole('button',{name:'Run connection check'}));await screen.findByText('Log in with ChatGPT, then run this check again.');expect(fetch).toHaveBeenCalledTimes(2);expect(screen.queryByText('Your cloud inventory')).toBeNull();});
