import {z} from 'zod';
import {outlineSchema} from './building-outline';
import {interiorLayoutSchema} from './interior-layout';
const baseLocationSchema=z.object({outline:outlineSchema.optional(),interior:z.object({model:z.object({key:z.string().min(1).max(600),label:z.string().max(250)}).optional(),modelPins:z.array(z.object({assetId:z.string().uuid(),x:z.number().finite(),y:z.number().finite(),z:z.number().finite()})).max(200).optional(),notes:z.string().max(5000),photos:z.array(z.object({key:z.string().max(600),label:z.string().max(250)})).max(12),section:z.object({key:z.string().max(600),label:z.string().max(250)}).optional()}).optional(),mapView:z.object({lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),zoom:z.number().min(30).max(20000000)}).optional(),mapProvider:z.literal('google').optional(),id:z.string().uuid(),name:z.string().trim().min(1).max(250),address:z.string().trim().min(1).max(250),businessType:z.string().trim().min(1).max(250),lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),zoom:z.number().min(30).max(20000000),updated:z.string().max(50)});
export const locationSchema=baseLocationSchema.extend({layout:interiorLayoutSchema.optional()});
export type Location=z.infer<typeof locationSchema>;
export const equipmentByBusiness:Record<string,string[]>={
 'Vending & micro markets':['Snack vending machine','Drink vending machine','Combo vending machine','Micro-market kiosk','Coffee station','Water cooler'],
 'Restaurant & cafe':['Espresso machine','Coffee brewer','Ice machine','Walk-in cooler','Freezer','Dishwasher','Oven','POS terminal'],
 'Office & commercial':['Printer / copier','Coffee machine','Water dispenser','Vending machine','HVAC unit','Network cabinet'],
 'Hotel & hospitality':['Ice machine','Laundry washer','Laundry dryer','Coffee machine','Vending machine','Refrigerator'],
 'Warehouse & industrial':['Forklift','Pallet jack','Conveyor','Compressor','Generator','Charging station'],
 'Healthcare & fitness':['Treadmill','Exercise bike','Medical refrigerator','Water dispenser','Vending machine'],
 'Retail':['POS terminal','Display cooler','Freezer','Security equipment','Kiosk'],
 'Other business':['Custom equipment']
};
export function equipmentCategory(type:string):'Vending'|'Coffee'|'Water'|'Refrigeration'|'Other'{if(/vending|kiosk/i.test(type))return 'Vending';if(/coffee|espresso/i.test(type))return 'Coffee';if(/water/i.test(type))return 'Water';if(/cooler|freezer|refrigerator|ice machine/i.test(type))return 'Refrigeration';return 'Other';}
