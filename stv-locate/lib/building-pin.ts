import {newAsset,type Asset} from './asset';
import type {Location} from './location';
/** Display a persisted building location without creating a pretend equipment record. */
export function buildingPin(location:Location):Asset{
 return {...newAsset(),id:'building:'+location.id,name:location.name,site:location.name,address:location.address,businessType:location.businessType,equipmentType:'Building location',category:'Other',tag:'B',floor:'',lat:location.lat,lng:location.lng,mapProvider:location.mapProvider,updated:location.updated};
}
export function isBuildingPin(asset:Pick<Asset,'id'>){return asset.id.startsWith('building:');}
