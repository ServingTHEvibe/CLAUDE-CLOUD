import {newId} from './id.mjs';
import {z} from 'zod';

export const roomSchema=z.object({
 id:z.string().uuid(),name:z.string().trim().min(1).max(80),
 x:z.number().min(0).max(500),z:z.number().min(0).max(500),
 width:z.number().min(2).max(300),depth:z.number().min(2).max(300),
 height:z.number().min(2).max(6),finish:z.enum(['stone','oak','sage']),
});
export const indoorPinSchema=z.object({assetId:z.string().uuid(),roomId:z.string().uuid(),x:z.number().min(.05).max(.95),z:z.number().min(.05).max(.95)});
export const interiorLayoutSchema=z.object({
 version:z.literal(1),floor:z.string().trim().min(1).max(80),
 basis:z.enum(['estimated','measured']),rooms:z.array(roomSchema).max(12),
 pins:z.array(indoorPinSchema).max(200),
 reference:z.object({key:z.string().min(1).max(600),label:z.string().max(250),width:z.number().min(2).max(500),depth:z.number().min(2).max(500),crop:z.object({left:z.number().min(0).max(.95),top:z.number().min(0).max(.95),right:z.number().min(.05).max(1),bottom:z.number().min(.05).max(1)}).refine(c=>c.right-c.left>=.05&&c.bottom-c.top>=.05,'Keep a visible crop area.')}).optional(),
 sketch:z.array(z.array(z.object({x:z.number().min(0).max(500),z:z.number().min(0).max(500)})).min(2).max(80)).max(30).optional(),
 planPins:z.array(z.object({assetId:z.string().uuid(),x:z.number().min(0).max(500),z:z.number().min(0).max(500)})).max(200).optional(),
}).superRefine((layout,ctx)=>{
 const ids=new Set(layout.rooms.map(r=>r.id));
 if(ids.size!==layout.rooms.length)ctx.addIssue({code:'custom',message:'Each room needs its own ID.'});
 for(let i=0;i<layout.rooms.length;i++){
  const a=layout.rooms[i];
  if(a.x+a.width>500||a.z+a.depth>500)ctx.addIssue({code:'custom',message:'Keep the layout within 500 × 500 metres.'});
  for(const b of layout.rooms.slice(i+1))if(a.x<b.x+b.width-.01&&a.x+a.width>b.x+.01&&a.z<b.z+b.depth-.01&&a.z+a.depth>b.z+.01)ctx.addIssue({code:'custom',message:'Rooms overlap. Adjust their left/top positions.'});
 }
 if(new Set(layout.pins.map(p=>p.assetId)).size!==layout.pins.length)ctx.addIssue({code:'custom',message:'Place each machine once in this layout.'});
 if(layout.pins.some(p=>!ids.has(p.roomId)))ctx.addIssue({code:'custom',message:'A machine points to a missing room.'});
 if(new Set((layout.planPins||[]).map(p=>p.assetId)).size!==(layout.planPins||[]).length)ctx.addIssue({code:'custom',message:'Place each machine once on the reference plan.'});
});
export type InteriorLayout=z.infer<typeof interiorLayoutSchema>;
export type InteriorRoom=z.infer<typeof roomSchema>;
export type IndoorPin=z.infer<typeof indoorPinSchema>;
export function starterLayout():InteriorLayout{
 return {version:1,floor:'Ground floor',basis:'estimated',rooms:[
  {id:newId(),name:'Entrance',x:0,z:0,width:8,depth:4,height:3,finish:'stone'},
  {id:newId(),name:'Breakroom',x:0,z:4,width:8,depth:6,height:3,finish:'oak'},
  {id:newId(),name:'Service room',x:0,z:10,width:8,depth:4,height:3,finish:'sage'},
 ],pins:[]};
}
export function layoutBounds(layout:InteriorLayout){return {width:Math.max(layout.reference?.width||(!layout.rooms.length?20:2),...layout.rooms.map(r=>r.x+r.width),...(layout.sketch||[]).flatMap(s=>s.map(p=>p.x))),depth:Math.max(layout.reference?.depth||(!layout.rooms.length?20:2),...layout.rooms.map(r=>r.z+r.depth),...(layout.sketch||[]).flatMap(s=>s.map(p=>p.z)))};}
export function pinPosition(layout:InteriorLayout,pin:IndoorPin){const r=layout.rooms.find(r=>r.id===pin.roomId);return r?{x:r.x+r.width*pin.x,z:r.z+r.depth*pin.z}:null;}
export function remapInteriorPins(layout:InteriorLayout|undefined,ids:Map<string,string>){return layout?{...layout,pins:layout.pins.flatMap(p=>ids.has(p.assetId)?[{...p,assetId:ids.get(p.assetId)!}]:[]),planPins:layout.planPins?.flatMap(p=>ids.has(p.assetId)?[{...p,assetId:ids.get(p.assetId)!}]:[])}:undefined;}
