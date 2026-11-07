import {newId} from './id.mjs';
import { z } from 'zod';
const short = z.string().trim().max(250);
export const assetSchema = z.object({
 mapProvider:z.literal('google').optional(),
 siteId: z.string().uuid().optional(), businessType: short.optional(), equipmentType: short.optional(),
 id: z.string().uuid(), name: short.min(1), category: z.enum(['Vending','Coffee','Water','Refrigeration','Other']), status: z.enum(['Operational','Needs service','Offline']),
 site: short.min(1), address: short.min(1), lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180),
 floor: short, room: short, model: short, serial: short, tag: short, entrance: z.string().max(3000), parking: z.string().max(3000), notes: z.string().max(5000),
 photos: z.array(z.object({label:short, key:z.string().max(600)})).max(3), plan: z.string().max(600), pinX:z.number().min(0).max(100), pinY:z.number().min(0).max(100),
 tourUrl: z.union([z.literal(''),z.string().url().startsWith('https://').max(2000)]),
 history: z.array(z.object({id:z.string().uuid(),date:z.string().max(50),text:z.string().max(2000)})).max(200), updated: z.string().max(50)
});
export type Asset = z.infer<typeof assetSchema>;
export function newAsset():Asset {return {id:newId(),name:'',category:'Vending',status:'Operational',site:'',address:'',lat:41.5868,lng:-93.625,floor:'1',room:'',model:'',serial:'',tag:'',entrance:'',parking:'',notes:'',photos:[],plan:'',pinX:50,pinY:50,tourUrl:'',history:[],updated:new Date().toISOString()};}
