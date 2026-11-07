export function outlineAround(lat:number,lng:number){return {source:'osm',points:[{lat:lat-.0002,lng:lng-.0002},{lat:lat-.0002,lng:lng+.0002},{lat:lat+.0002,lng:lng+.0002},{lat:lat+.0002,lng:lng-.0002}]};}
export function outlineResponse(url:string){const p=new URL(url,'https://test.local').searchParams;return Response.json({outline:outlineAround(Number(p.get('lat')),Number(p.get('lng')))});}
