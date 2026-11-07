import assert from 'node:assert/strict';
import {assetSchema,newAsset} from '../lib/asset.ts';
const a={...newAsset(),name:'Coffee machine',site:'Test site',address:'Test address'};
assert.equal(assetSchema.safeParse(a).success,true);
for(const change of [{lat:91},{lng:181},{pinX:-1},{pinY:101},{tourUrl:'javascript:alert(1)'},{tourUrl:'http://insecure.example'},{name:''},{status:'unknown'},{photos:Array(4).fill({label:'test',key:'test'})}]){assert.equal(assetSchema.safeParse({...a,...change}).success,false,JSON.stringify(change));}
assert.equal(assetSchema.safeParse({...a,tourUrl:'https://example.com/tour'}).success,true);
assert.notEqual(newAsset().id,newAsset().id);
console.log('PASS: asset schema, coordinates, pin bounds, URL restrictions, photo limits, unique IDs');
