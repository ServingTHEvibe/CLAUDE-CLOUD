type Candidate={lat:unknown,lon:unknown,display_name:unknown,address?:Record<string,unknown>,[key:string]:unknown};
/** Reject explicit conflicts; missing building detail is kept but labeled approximate. */
export function usableAddressResults(raw:unknown,street:string,postal:string){
 if(!Array.isArray(raw))throw Error('Invalid geocoder response');
 const house=street.trim().match(/^(\d+[a-z]?(?:-\d+)?)\s/i)?.[1].toLowerCase();
 const zip=postal.trim().toLowerCase().replace(/\s/g,'');
 return raw.filter((r:Candidate)=>r&&typeof r.display_name==='string'&&r.lat!==null&&r.lon!==null&&String(r.lat).trim()!==''&&String(r.lon).trim()!==''&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))&&Math.abs(Number(r.lat))<=85&&Math.abs(Number(r.lon))<=180).filter((r:Candidate)=>{
  const foundHouse=String(r.address?.house_number||'').trim().toLowerCase();
  const foundZip=String(r.address?.postcode||'').trim().toLowerCase().replace(/\s/g,'');
  if(house&&foundHouse&&house!==foundHouse)return false;
  if(zip&&foundZip&&zip!==foundZip&&!( /^\d{5}(?:-\d{4})?$/.test(zip)&&/^\d{5}(?:-\d{4})?$/.test(foundZip)&&zip.slice(0,5)===foundZip.slice(0,5)))return false;
  return true;
 }).map((r:Candidate)=>({...r,name:typeof r.name==='string'?r.name.slice(0,250):'',location_hint:r.address?.house_number?'building_address':'approximate_area'}));
}
