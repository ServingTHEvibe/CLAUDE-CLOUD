const zlib = require('zlib'), fs = require('fs');
function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);}
function png(w,h,rgb){const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const i=y*(w*3+1)+1+x*3;raw[i]=(rgb[0]+x*2)&255;raw[i+1]=(rgb[1]+y*2)&255;raw[i+2]=rgb[2];}}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
fs.writeFileSync('machine1.png',png(96,96,[200,30,30]));
fs.writeFileSync('machine2.png',png(96,96,[30,160,40]));
fs.writeFileSync('area.png',png(128,96,[40,60,200]));
fs.writeFileSync('plan.png',png(160,120,[230,230,210]));
// Minimal GLB: a 4x3 m floor quad (2 triangles) + a box-ish wall triangle.
const pos=new Float32Array([0,0,0, 4,0,0, 4,0,3, 0,0,3, 0,2.5,0, 4,2.5,0]);
const idx=new Uint16Array([0,1,2, 0,2,3, 0,1,5, 0,5,4]);
const bin=Buffer.concat([Buffer.from(pos.buffer),Buffer.from(idx.buffer)]);
const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[0.8,0.8,0.75,1]},doubleSided:true}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:pos.byteLength,target:34962},{buffer:0,byteOffset:pos.byteLength,byteLength:idx.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[0,0,0],max:[4,2.5,3]},{bufferView:1,componentType:5123,count:12,type:'SCALAR'}]};
let js=Buffer.from(JSON.stringify(json));while(js.length%4)js=Buffer.concat([js,Buffer.from(' ')]);
let b=bin;while(b.length%4)b=Buffer.concat([b,Buffer.alloc(1)]);
const total=12+8+js.length+8+b.length;const h=Buffer.alloc(12);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(total,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(js.length,0);jh.writeUInt32LE(0x4e4f534a,4);const bh=Buffer.alloc(8);bh.writeUInt32LE(b.length,0);bh.writeUInt32LE(0x004e4942,4);
fs.writeFileSync('room.glb',Buffer.concat([h,jh,js,bh,b]));
// RoomPlan room JSON: 4 m x 3 m room, walls rotated 20 degrees.
const t=20*Math.PI/180;function wall(cx,cz,len,ang){const a=ang+t;return {identifier:'w',category:{wall:{}},confidence:{high:{}},dimensions:[len,2.6,0],transform:[Math.cos(a),0,-Math.sin(a),0, 0,1,0,0, Math.sin(a),0,Math.cos(a),0, cx*Math.cos(t)+cz*Math.sin(t),1.3,-cx*Math.sin(t)+cz*Math.cos(t),1]};}
fs.writeFileSync('room-0.json',JSON.stringify({version:2,walls:[wall(2,0,4,0),wall(4,1.5,3,Math.PI/2),wall(2,3,4,0),wall(0,1.5,3,Math.PI/2)],doors:[],windows:[],openings:[],objects:[],floors:[],sections:[]}));
console.log('fixtures ok');
