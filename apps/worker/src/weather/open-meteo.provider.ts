import { fetchJson,numeric,record,utcHour } from './http';
import type { ForecastProvider,ForecastTarget,ForecastPoint } from './types';
export class OpenMeteoProvider implements ForecastProvider {
 readonly name='open-meteo';
 async collect(target:ForecastTarget):Promise<ForecastPoint[]>{
  const url=new URL(process.env.OPEN_METEO_BASE_URL??'https://api.open-meteo.com/v1/forecast');
  const fields=['temperature_2m','relative_humidity_2m','precipitation','precipitation_probability','wind_speed_10m','wind_gusts_10m'];
  url.searchParams.set('latitude',String(target.latitude));url.searchParams.set('longitude',String(target.longitude));
  url.searchParams.set('hourly',fields.join(','));url.searchParams.set('timezone','GMT');url.searchParams.set('forecast_days','7');
  url.searchParams.set('wind_speed_unit','kmh');url.searchParams.set('precipitation_unit','mm');url.searchParams.set('temperature_unit','celsius');
  if(process.env.OPEN_METEO_API_KEY)url.searchParams.set('apikey',process.env.OPEN_METEO_API_KEY);
  const payload=record(await fetchJson(url)),hourly=record(payload.hourly),units=record(payload.hourly_units);
  const expected:Record<string,string>={temperature_2m:'°C',relative_humidity_2m:'%',precipitation:'mm',precipitation_probability:'%',wind_speed_10m:'km/h',wind_gusts_10m:'km/h'};
  for(const field of fields)if(units[field]!==expected[field])throw new Error('INVALID_FORECAST_UNITS');
  const time=hourly.time;if(!Array.isArray(time)||!time.length||time.length>200)throw new Error('INVALID_FORECAST_TIME');
  for(const field of fields)if(!Array.isArray(hourly[field])||(hourly[field] as unknown[]).length!==time.length)throw new Error('INVALID_FORECAST_SERIES');
  const at=(field:string,i:number,min:number,max:number)=>numeric((hourly[field] as unknown[])[i],min,max);
  const output:ForecastPoint[]=[];
  const now = Date.now();
  let previousTime = '';
  for(let i=0;i<time.length;i++){
   const validAt = utcHour(time[i]);
   if (!validAt || validAt.slice(14, 16) !== '00' || validAt <= previousTime) throw new Error('INVALID_FORECAST_TIME');
   previousTime = validAt;
   output.push({validAt,precipitationMm:at('precipitation',i,0,500),probabilityPct:at('precipitation_probability',i,0,100),temperatureC:at('temperature_2m',i,-90,65),humidityPct:at('relative_humidity_2m',i,0,100),windKmh:at('wind_speed_10m',i,0,540),gustKmh:at('wind_gusts_10m',i,0,540)});
  }
  if (!output.some(point => Date.parse(point.validAt) >= now && (point.precipitationMm !== null || point.temperatureC !== null))) {
   throw new Error('NO_FORECAST_DATA');
  }
  return output;
 }
}
