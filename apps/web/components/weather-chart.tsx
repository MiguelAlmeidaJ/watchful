'use client';
import { useMemo,useState } from 'react';
import { ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,BarChart,Bar } from 'recharts';
import type { Row } from '@watchful/api-client';
import { formatDate } from '@watchful/api-client';
type Metric='precipitation_mm'|'temperature_c'|'humidity_pct';
const metrics=[{key:'precipitation_mm',name:'Chuva',unit:'mm'},{key:'temperature_c',name:'Temperatura',unit:'°C'},{key:'humidity_pct',name:'Umidade',unit:'%'}] as const;
export function WeatherChart({rows,timeKey='observed_at',forecast=false}:{rows:Row[];timeKey?:string;forecast?:boolean}){
 const [selected,setSelected]=useState<Metric>('precipitation_mm');const options=forecast?metrics.filter(m=>m.key!=='humidity_pct'):metrics;
 const chosen=options.find(m=>m.key===selected)??options[0]!;
 const data=useMemo(()=>{
  const points=new Map<number,number|null>();
  for(const row of rows){const stamp=Date.parse(String(row[timeKey]??''));if(!Number.isFinite(stamp))continue;
   const raw=row[chosen.key];
   const invalidRainfall = !forecast && chosen.key === 'precipitation_mm' &&
    (row.precipitation_quality ?? row.quality) !== 'valid';
   const value=raw===null||raw===undefined||raw===''||row.quality==='missing'||invalidRainfall?null:Number(raw);
   points.set(stamp,value!==null&&Number.isFinite(value)?value:null);}
  const sorted=[...points.keys()].sort((a,b)=>a-b);const start=sorted[0],end=sorted[sorted.length-1];if(start===undefined||end===undefined)return [];
  const result:{time:number;value:number|null}[]=[];
  for(let t=start;t<=end&&result.length<1000;t+=3600000)result.push({time:t,value:points.get(t)??null});
  return result;
 },[rows,timeKey,chosen.key,forecast]);
 const tick=(v:number)=>new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
 const count=data.filter(x=>x.value!==null).length;
 return <div className="chart-section"><div className="chart-toolbar"><div className="segmented" aria-label="Variável meteorológica">{options.map(m=><button key={m.key} type="button" aria-pressed={chosen.key===m.key} onClick={()=>setSelected(m.key)}>{m.name}</button>)}</div><span className="chart-caption">{count} valores exibidos</span></div>{!count?<p className="empty-state">Sem valores disponíveis para esta variável.</p>:<div className="chart-area" role="img" aria-label={chosen.name+' em '+chosen.unit+'; dados ausentes não são interpolados'}><ResponsiveContainer width="100%" height="100%">{chosen.key==='precipitation_mm'?<BarChart data={data}><CartesianGrid vertical={false} stroke="var(--wf-line)"/><XAxis dataKey="time" tickFormatter={tick} minTickGap={28} tick={{fill:'var(--wf-muted)',fontSize:11}}/><YAxis width={42} tick={{fill:'var(--wf-muted)',fontSize:11}}/><Tooltip labelFormatter={v=>formatDate(new Date(Number(v)).toISOString())} formatter={v=>[String(v)+' '+chosen.unit,chosen.name]} contentStyle={{background:'var(--wf-surface)',border:'1px solid var(--wf-line)',borderRadius:10,color:'var(--wf-ink)'}}/><Bar dataKey="value" fill="var(--wf-primary)" radius={[4,4,0,0]} isAnimationActive={false}/></BarChart>:<LineChart data={data}><CartesianGrid vertical={false} stroke="var(--wf-line)"/><XAxis dataKey="time" tickFormatter={tick} minTickGap={28} tick={{fill:'var(--wf-muted)',fontSize:11}}/><YAxis width={42} tick={{fill:'var(--wf-muted)',fontSize:11}} domain={['auto','auto']}/><Tooltip labelFormatter={v=>formatDate(new Date(Number(v)).toISOString())} formatter={v=>[String(v)+' '+chosen.unit,chosen.name]} contentStyle={{background:'var(--wf-surface)',border:'1px solid var(--wf-line)',borderRadius:10,color:'var(--wf-ink)'}}/><Line dataKey="value" stroke="var(--wf-primary)" strokeWidth={2.5} connectNulls={false} dot={false} activeDot={{r:4}} isAnimationActive={false}/></LineChart>}</ResponsiveContainer></div>}<p className="chart-caption">{forecast?'Estimativas do modelo.':chosen.key==='precipitation_mm'?'Chuva medida com qualidade válida.':'Observações da estação.'} Lacunas representam ausência de dados; zero é uma medição válida. Horários locais do dispositivo.</p></div>;
}
