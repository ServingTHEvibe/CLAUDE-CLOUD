'use client';
import {useState,type ReactNode,type CSSProperties} from 'react';
export default function PlanViewport({children}:{children:ReactNode}){
 const [zoom,setZoom]=useState(1);
 return <><div className="plan-zoom"><button type="button" className="secondary" aria-label="Zoom out floor plan" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.5))}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" className="secondary" aria-label="Zoom in floor plan" disabled={zoom>=5} onClick={()=>setZoom(z=>Math.min(5,z+.5))}>+</button><button type="button" className="secondary" onClick={()=>setZoom(1)}>Fit plan</button><small>Scroll to pan when zoomed.</small></div><div className="plan-viewport" style={{'--plan-zoom':zoom} as CSSProperties}>{children}</div></>;
}
