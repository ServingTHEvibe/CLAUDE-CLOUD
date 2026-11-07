'use client';
import {Component,lazy,Suspense,useCallback,useEffect,useState,type ComponentProps,type ReactNode} from 'react';
import AerialMap from './asset-map';
import {isBuildingPin} from '../lib/building-pin';
import {nearbyPins} from '../lib/pin-area';
import {useGoogleKey} from '../lib/google-maps';
const GoogleMap=lazy(()=>import('./google-map'));
const ThreeDMap=lazy(()=>import('./asset-map-3d'));
type Props=ComponentProps<typeof AerialMap>&{requiresGoogle?:boolean;excludeFromPicker?:string};
class MapBoundary extends Component<{onFail:()=>void,children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onFail();}
 render(){return this.state.failed?<div className="map-needs-key"><p>The map could not render.</p><a href="/settings/maps">Open Maps setup</a><button onClick={()=>window.location.reload()}>Reload map</button></div>:this.props.children;}
}
export default function EquipmentMap(props:Props){
 const [picker,setPicker]=useState<{anchor:string|null}|null>(null),[query,setQuery]=useState('');
 const eligible=props.assets.filter(a=>a.id!=='building-preview'&&!isBuildingPin(a)&&a.id!==props.excludeFromPicker);
 const anchor=picker?.anchor?eligible.find(a=>a.id===picker.anchor):null;
 const choices=(anchor?nearbyPins(eligible,anchor):eligible).filter(a=>`${a.name} ${a.tag} ${a.room} ${a.floor} ${a.model}`.toLowerCase().includes(query.toLowerCase()));
 function selectPin(id:string){const a=eligible.find(a=>a.id===id);if(a&&nearbyPins(eligible,a).length>1){setQuery('');setPicker({anchor:id});}else{setPicker(null);props.onSelect(id);}}
 useEffect(()=>{if(props.picking)setPicker(null);},[props.picking]);
 const mapProps={...props,onSelect:selectPin};
 const googleKey=useGoogleKey();const googleRequired=props.requiresGoogle||props.assets.some(a=>a.mapProvider==='google');
 const [mode,setMode]=useState<'2d'|'3d'>('2d'),[warning,setWarning]=useState('');
 useEffect(()=>{try{if(localStorage.getItem('stv-map-view')==='3d')setMode('3d');}catch{}},[]);
 const unavailable=useCallback(()=>{setMode('2d');setWarning('3D could not run on this device. Showing the 2D aerial map; your saved pins are unchanged.');try{localStorage.setItem('stv-map-view','2d');}catch{}},[]);
 function choose(next:'2d'|'3d'){setWarning('');setMode(next);try{localStorage.setItem('stv-map-view',next);}catch{}}
 return <div className="equipment-map-view"><div className="map-view-switch" aria-label="Map viewer"><button aria-pressed={mode==='2d'} onClick={()=>choose('2d')}>2D aerial</button><button aria-pressed={mode==='3d'} onClick={()=>choose('3d')}>God’s Eye 3D</button><button disabled={!eligible.length} aria-expanded={Boolean(picker)} onClick={()=>{setQuery('');setPicker(picker?null:{anchor:null});}}>{eligible.length} equipment pins</button>{!googleKey&&<a className="map-setup-link" href="/settings/maps">Maps setup</a>}</div>{!googleKey&&googleRequired?<div className="map-needs-key"><p>This saved location uses Google Maps. Connect a browser key to view it.</p><a className="primary" href="/settings/maps">Connect Google Maps</a></div>:googleKey?<MapBoundary key={'google-'+mode} onFail={unavailable}><Suspense fallback={<div className="map-loading" role="status">Connecting Google Maps…</div>}><GoogleMap {...mapProps} apiKey={googleKey} topDown={props.picking} threeD={mode==='3d'} onUnavailable={unavailable}/></Suspense></MapBoundary>:mode==='2d'?<AerialMap {...mapProps}/>:<MapBoundary onFail={unavailable}><Suspense fallback={<div className="map-loading" role="status">Loading God’s Eye 3D aerial viewer…</div>}><ThreeDMap {...mapProps} topDown={false} onUnavailable={unavailable}/></Suspense></MapBoundary>}{props.buildingOutline?.length?<div className="outline-attribution">Building outlines: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> / manual tracing</div>:null}{picker&&<section className="map-pin-picker" aria-label="Choose equipment pin"><header><div><strong>{anchor?'Pins in this area':'Equipment on this map'}</strong><small>{anchor?'Within 15 m · choose an individual info sheet':'Each pin has its own equipment info sheet'}</small></div><button aria-label="Close pin chooser" onClick={()=>setPicker(null)}>×</button></header><label>Find a pin<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, room, floor or tag"/></label><div className="map-pin-choices">{choices.map(a=><button key={a.id} aria-label={'Open info sheet: '+a.name+(a.tag?' · '+a.tag:'')} onClick={()=>{setPicker(null);props.onSelect(a.id);}}><strong>{a.name}</strong><span>{a.equipmentType||a.category} · {a.tag||'No tag'}</span><small>Floor {a.floor||'—'} · {a.room||'Room not recorded'} · {a.status}</small></button>)}{!choices.length&&<p>No matching pins.</p>}</div></section>}{warning&&<div className="map-fallback-warning" role="status">{warning}</div>}</div>;
}
