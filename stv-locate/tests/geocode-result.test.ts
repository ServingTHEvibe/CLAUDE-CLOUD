import {it,expect} from 'vitest';
import {usableAddressResults} from '../lib/geocode-result';
const candidate=(address:any)=>({lat:'41.6',lon:'-93.6',display_name:'Test result',address});
it('rejects a returned house number that conflicts with the requested number',()=>{expect(usableAddressResults([candidate({house_number:'22'})],'123 Main St','')).toHaveLength(0);});
it('rejects conflicting explicit ZIP codes but accepts equivalent ZIP+4',()=>{expect(usableAddressResults([candidate({house_number:'123',postcode:'90210'})],'123 Main St','50313')).toHaveLength(0);expect(usableAddressResults([candidate({house_number:'123',postcode:'50313-1234'})],'123 Main St','50313')).toHaveLength(1);});
it('labels broad street or city results approximate instead of house-level',()=>{expect(usableAddressResults([candidate({road:'Main St',city:'Des Moines'})],'123 Main St','50313')[0].location_hint).toBe('approximate_area');});
it('keeps a compatible house-level candidate without claiming survey accuracy',()=>{expect(usableAddressResults([candidate({house_number:'123',postcode:'50313'})],'123 Main St','50313')[0].location_hint).toBe('building_address');});
it('does not turn missing coordinates into an accidental zero coordinate',()=>{expect(usableAddressResults([{lat:null,lon:'',display_name:'Invalid'}],'','')).toHaveLength(0);});
