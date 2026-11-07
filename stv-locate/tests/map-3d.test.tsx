import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';
import ThreeDMap from '../components/asset-map-3d';
const state=vi.hoisted(()=>({viewer:null as any}));
vi.mock('../lib/vendor/imagery',()=>({createEsriImagery:async()=>({provider:'esri'}),createOsmImagery:()=>({provider:'osm'})}));
vi.mock('cesium',()=>({
 Ion:{defaultAccessToken:''},Color:{fromCssColorString:(c:string)=>c,WHITE:'white'},
 Cartesian3:{fromDegrees:(lng:number,lat:number,height=0)=>({lng,lat,height})},Cartesian2:class{constructor(public x:number,public y:number){}},
 Cartographic:{fromCartesian:(v:any)=>v},Math:{toRadians:(n:number)=>n*Math.PI/180,toDegrees:(n:number)=>n*180/Math.PI},
 Matrix4:{IDENTITY:'identity'},HeadingPitchRange:class{constructor(public heading:number,public pitch:number,public range:number){}},DistanceDisplayCondition:class{},ScreenSpaceEventType:{LEFT_CLICK:'click'},
 Viewer:class{camera={setView:vi.fn(),lookAt:vi.fn(),lookAtTransform:vi.fn(),positionCartographic:{height:230},moveEnd:{addEventListener:vi.fn()},pickEllipsoid:vi.fn()};scene={globe:{baseColor:'',tileCacheSize:0,ellipsoid:{}},renderError:{addEventListener:vi.fn()},requestRender:vi.fn(),pick:vi.fn()};entities={removeAll:vi.fn(),add:vi.fn()};canvas=document.createElement('canvas');imageryLayers={addImageryProvider:vi.fn(),removeAll:vi.fn()};screenSpaceEventHandler={setInputAction:vi.fn()};destroy=vi.fn();isDestroyed=()=>false;constructor(){state.viewer=this;}}
}));
afterEach(cleanup);
it('centers both overhead and tilted views on the requested coordinates and destroys its viewer',async()=>{const app=render(<ThreeDMap assets={[]} selected="" onSelect={()=>{}} onPick={()=>{}} focus={{lat:41.6,lng:-93.6,zoom:230}} picking={false}/>);await waitFor(()=>expect(state.viewer?.camera.lookAt).toHaveBeenCalled());expect(state.viewer.camera.lookAt.mock.lastCall[0]).toEqual({lng:-93.6,lat:41.6,height:0});fireEvent.click(screen.getByRole('button',{name:'Toggle angled view'}));await waitFor(()=>expect(state.viewer.camera.lookAt.mock.lastCall[1].pitch).toBeCloseTo(-Math.PI/4));expect(state.viewer.camera.lookAt.mock.lastCall[0]).toEqual({lng:-93.6,lat:41.6,height:0});const v=state.viewer;app.unmount();expect(v.destroy).toHaveBeenCalledTimes(1);});
