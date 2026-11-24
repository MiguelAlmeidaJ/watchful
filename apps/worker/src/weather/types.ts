export interface StationTarget { id:string; external_id:string; }
export interface ForecastTarget { id:string; latitude:number; longitude:number; }
export type MeasurementQuality = 'valid' | 'suspect' | 'missing';
export interface Observation {
 observedAt:string; precipitationMm:number|null; temperatureC:number|null;
 humidityPct:number|null; windKmh:number|null; gustKmh:number|null; pressureHpa:number|null;
 quality:MeasurementQuality; precipitationQuality:MeasurementQuality; raw:Record<string,unknown>;
}
export interface ForecastPoint {
 validAt:string; precipitationMm:number|null; probabilityPct:number|null; temperatureC:number|null;
 humidityPct:number|null; windKmh:number|null; gustKmh:number|null;
}
export interface ObservationProvider { readonly name:string; collect(target:StationTarget,now:Date):Promise<Observation[]>; }
export interface ForecastProvider { readonly name:string; collect(target:ForecastTarget):Promise<ForecastPoint[]>; }
