import { fetchJson,numeric,record,utcHour } from './http';
import type { MeasurementQuality, ObservationProvider,StationTarget,Observation } from './types';

function precipitationQuality(raw: unknown, value: number | null): MeasurementQuality {
 if (value !== null) return 'valid';
 return raw == null || (typeof raw === 'string' && raw.trim() === '') ? 'missing' : 'suspect';
}
export class InmetProvider implements ObservationProvider {
 readonly name='inmet';
 async collect(target:StationTarget,now:Date):Promise<Observation[]>{
  if(!/^[A-Z0-9]{2,12}$/i.test(target.external_id))throw new Error('INVALID_STATION_CODE');
  const from=new Date(now.getTime()-48*3600000).toISOString().slice(0,10);
  const to=now.toISOString().slice(0,10);
  const earliest = Date.parse(from + 'T00:00:00Z');
  const url=new URL('https://apitempo.inmet.gov.br/estacao/'+from+'/'+to+'/'+encodeURIComponent(target.external_id));
  const payload=await fetchJson(url);
  if(!Array.isArray(payload)||payload.length>500)throw new Error('INVALID_PROVIDER_PAYLOAD');
  const observations = new Map<string, Observation>();
  for(const item of payload){
   const row=record(item);
   if(String(row.CD_ESTACAO??'').toUpperCase()!==target.external_id.toUpperCase())continue;
   const day=row.DT_MEDICAO,hour=row.HR_MEDICAO;
   if(typeof day!=='string'||typeof hour!=='string'||!/^\d{4}$/.test(hour))continue;
   const observedAt=utcHour(day+'T'+hour.slice(0,2)+':'+hour.slice(2));
   if (!observedAt || hour.slice(2) !== '00') continue;
   const timestamp = Date.parse(observedAt);
   if (timestamp < earliest || timestamp > now.getTime()) continue;
   const precipitationMm=numeric(row.CHUVA,0,500);
   const temperatureC=numeric(row.TEM_INS,-90,65);
   const humidityPct=numeric(row.UMD_INS,0,100);
   const speed=numeric(row.VEN_VEL,0,150),gust=numeric(row.VEN_RAJ,0,150);
   const pressureHpa=numeric(row.PRE_INS,300,1100);
   const fields=[precipitationMm,temperatureC,humidityPct,speed,gust,pressureHpa];
   const metrics: Omit<Observation, 'raw'> = {
    observedAt, precipitationMm, temperatureC, humidityPct, pressureHpa,
    windKmh: speed === null ? null : speed * 3.6,
    gustKmh: gust === null ? null : gust * 3.6,
    quality: fields.every(value => value === null) ? 'missing' : fields.some(value => value === null) ? 'suspect' : 'valid',
    precipitationQuality: precipitationQuality(row.CHUVA, precipitationMm)
   };
   const existing = observations.get(observedAt);
   if (existing) {
    const { raw: _raw, ...previousMetrics } = existing;
    if (JSON.stringify(previousMetrics) !== JSON.stringify(metrics)) throw new Error('CONFLICTING_OBSERVATIONS');
   } else {
    observations.set(observedAt, { ...metrics, raw: row });
   }
  }
  const output = [...observations.values()];
  if (!output.some(row => row.quality !== 'missing')) throw new Error('NO_OBSERVATIONS');
  return output;
 }
}
