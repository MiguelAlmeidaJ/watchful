'use client';
import { browserApiBase } from '../lib/browser-api';
import {useEffect,useState,type ComponentProps,type ReactNode} from 'react';
import {ShieldAlert,ExternalLink,TriangleAlert,CloudLightning,Sun,Phone,Info,CalendarDays,Clock,ChevronDown,CloudRain,Wind,MapPin} from 'lucide-react';
import dynamic from 'next/dynamic';
import type {MultiPolygon} from 'geojson';
import { useNearViewport } from './use-near-viewport';

const WeatherMap=dynamic(()=>import('./maps/public-weather-map').then(m=>m.PublicWeatherMap),{ssr:false,loading:()=> <MapPlaceholder/>});

function MapPlaceholder() {
 return <section className="pm-card pm-map-placeholder">
  <h2>Mapa meteorológico</h2>
  <div className="pm-live-map"/>
 </section>;
}

function MapNearViewport(props: ComponentProps<typeof WeatherMap>) {
 const { ref, near } = useNearViewport();
 return <div ref={ref}>{near ? <WeatherMap {...props}/> : <MapPlaceholder/>}</div>;
}
type Warning={id:string;event:string;severity:string;startsAt:string;endsAt:string;description:string;instruction:string;url:string;geometry:MultiPolygon|null};
type Result={status:string;fetchedAt:string|null;warnings:Warning[]};
const rank:Record<string,number>={Extreme:4,Severe:3,Moderate:2,Minor:1,Unknown:0};
const label:Record<string,string>={Extreme:'Severidade extrema',Severe:'Severidade severa',Moderate:'Severidade moderada',Minor:'Severidade menor',Unknown:'Severidade não informada'};
const time=(s:string)=>new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
export function PublicWarnings({city,center,temperature,revision,municipalityName,children}:{municipalityName:string;children:ReactNode;city:string;center:[number,number]|null;temperature:number|null;revision:number}){
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(false),[expanded,setExpanded]=useState<string[]>([]);
 useEffect(()=>{let live=true;setResult(null);setError(false);const load=()=>fetch((browserApiBase)+'/public/municipalities/'+city+'/warnings',{credentials:'omit',cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json() as Promise<Result>;}).then(r=>{if(live){setResult(r);setError(false);}}).catch(()=>{if(live)setError(true);});void load();const timer=setInterval(()=>void load(),120000);return()=>{live=false;clearInterval(timer);};},[city,revision]);
 const warnings=(result?.warnings??[]).filter(w=>Date.parse(w.endsAt)>Date.now()).sort((a,b)=>(rank[b.severity]??0)-(rank[a.severity]??0));const fresh=!error&&result?.status==='available';const active=warnings.filter(w=>Date.parse(w.startsAt)<=Date.now());const upcoming=warnings.filter(w=>Date.parse(w.startsAt)>Date.now());const [showUpcoming,setShowUpcoming]=useState(false);
 const lead=active[0];const eventIcon=(event:string)=>/tempestade/i.test(event)?CloudLightning:/chuva/i.test(event)?CloudRain:/calor/i.test(event)?Sun:/vento/i.test(event)?Wind:TriangleAlert;
 const summaryText=(w:Warning)=>w.description.replace(/^INMET publica aviso iniciando em:.*?\.\s*/i,'').trim();
 return <><section id="avisos" className="pm-alert-section"><div className="pm-alert-top"><h2>Avisos oficiais</h2><div className="pm-alert-place"><MapPin size={15}/>{municipalityName} <span>· Fonte oficial: INMET</span></div></div>
 <div className={'pm-alert-overview '+(fresh&&lead?'pm-level-'+lead.severity.toLowerCase():'')} role="status"><ShieldAlert size={23}/><div><strong>{!result&&!error?'Consultando avisos oficiais…':!fresh?'Consulta não confirmada':lead?(label[lead.severity]??lead.severity)+' em vigor':'Nenhum aviso vigente retornado'}</strong><p>{!fresh?'Consulte o INMET diretamente para confirmar a situação.':lead?'Acompanhe a vigência e siga as orientações de prevenção.':'A ausência de avisos não significa ausência de risco.'}</p></div>{result?.fetchedAt&&<small>Consulta: {time(result.fetchedAt)}</small>}</div>
 <div className="pm-alert-tabs" role="group" aria-label="Período dos avisos"><button type="button" aria-pressed={!showUpcoming} onClick={()=>setShowUpcoming(false)}>Em vigor <span>{active.length}</span></button><button type="button" aria-pressed={showUpcoming} onClick={()=>setShowUpcoming(true)}>Próximos <span>{upcoming.length}</span></button></div>
 <div className="pm-alert-list">{(showUpcoming?upcoming:active).map((w,i)=>{const Icon=eventIcon(w.event);const opened=expanded.includes(w.id);return <article className={'pm-warning pm-warning-'+w.severity.toLowerCase()} key={w.id}><div className="pm-warning-head"><span className="pm-event-icon"><Icon size={25}/></span><div><div className="pm-event-labels"><span className="pm-event-level">{label[w.severity]??w.severity}</span>{!showUpcoming&&i===0&&fresh&&<span className="pm-event-priority">Maior severidade vigente</span>}{!fresh&&<span>Não confirmado</span>}</div><h3>{w.event}</h3></div></div><div className="pm-event-time"><span><CalendarDays size={16}/> Início: {time(w.startsAt)}</span><span><Clock size={16}/> Término: {time(w.endsAt)}</span></div><p className="pm-event-description">{summaryText(w)||'Consulte o aviso original para conhecer os riscos potenciais.'}</p><div className="pm-event-actions"><button type="button" className="pm-detail-button" aria-expanded={opened} onClick={()=>setExpanded(old=>opened?old.filter(id=>id!==w.id):[...old,w.id])}>{opened?'Ocultar orientações':'Como se proteger'}<ChevronDown size={17} className={opened?'pm-chevron-open':''}/></button><a href={w.url} target="_blank" rel="noreferrer">Aviso oficial <ExternalLink size={14}/></a></div>{opened&&<div className="pm-warning-text"><strong>Orientações do INMET</strong><p>{w.instruction||'Consulte o aviso original.'}</p><div className="pm-event-emergency"><a href="tel:199">Defesa Civil: 199</a><a href="tel:193">Bombeiros: 193</a></div></div>}</article>;})}</div>
 {result&&showUpcoming&&!upcoming.length&&<p className="pm-note">Nenhum aviso futuro retornado nesta consulta.</p>}<div className="pm-alert-footer"><span>Horários de Brasília · Avisos distintos podem se sobrepor.</span><a className="pm-source-link" href="https://avisos.inmet.gov.br/" target="_blank" rel="noreferrer">Todos os avisos do INMET <ExternalLink size={14}/></a></div></section>{center&&<MapNearViewport municipalityName={municipalityName} center={center} temperature={temperature} warnings={active} stale={!fresh}/>}{children}<section id="orientacoes" className="pm-guidance"><div className="pm-card-head"><div><h2>Orientações de prevenção</h2></div><Info size={24}/></div><div className="pm-guide-grid"><article><CloudLightning size={26}/><h3>Durante tempestades</h3><p>Procure abrigo em construção segura. Evite árvores, postes e áreas alagadas. Nunca atravesse água em movimento.</p></article><article><Sun size={26}/><h3>Em dias de calor intenso</h3><p>Beba água regularmente, procure sombra e ambientes frescos. Evite esforço nas horas mais quentes e cuide de idosos e crianças.</p></article><article><Phone size={26}/><h3>Em uma emergência</h3><p>Siga as instruções da Defesa Civil. Em caso de perigo, procure local seguro.</p><div className="pm-emergency"><a href="tel:199">Defesa Civil · 199</a><a href="tel:193">Bombeiros · 193</a></div></article></div></section></>;
}
