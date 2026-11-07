import {newAsset,type Asset} from './asset';
import type {Location} from './location';
/** Close pins remain independent records; never offset their stored coordinates. */
export function nearbyPins(assets:Asset[],point:{lat:number,lng:number},radiusMeters=15){
 const radians=(n:number)=>n*Math.PI/180;
 return assets.filter(a=>{const dLat=radians(a.lat-point.lat),dLng=radians(a.lng-point.lng);const h=Math.sin(dLat/2)**2+Math.cos(radians(point.lat))*Math.cos(radians(a.lat))*Math.sin(dLng/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))<=radiusMeters;});
}
export function newPinAt(location:Location,point:{lat:number,lng:number,floor?:string,room?:string}):Asset{
 return {...newAsset(),siteId:location.id,site:location.name,address:location.address,businessType:location.businessType,mapProvider:location.mapProvider,lat:point.lat,lng:point.lng,floor:point.floor||'1',room:point.room||'',name:'',equipmentType:''};
}
