import { createHash } from 'node:crypto';
export type Level='unknown'|'normal'|'attention'|'warning'|'severe';
export function evaluate(input:{hours:number;readings:{id:string;mm:number;observedAt:string}[];eligible:boolean;attention:number;warning:number;severe:number}):{level:Level;totalMm:number|null;coverage:number}{
 const coverage=input.readings.length/input.hours;
 if(!input.eligible||coverage!==1||input.readings.some(r=>!Number.isFinite(r.mm)||r.mm<0))return {level:'unknown',totalMm:null,coverage};
 const totalMm=input.readings.reduce((sum,r)=>sum+r.mm,0);
 return {level:totalMm>=input.severe?'severe':totalMm>=input.warning?'warning':totalMm>=input.attention?'attention':'normal',totalMm,coverage};
}
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
