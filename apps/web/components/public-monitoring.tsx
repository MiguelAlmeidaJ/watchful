'use client';
import { browserApiBase } from '../lib/browser-api';
import {useEffect,useState} from 'react';
import {MapPin,LocateFixed,CloudSun,CloudRain,Droplets,Wind,RefreshCw,CalendarDays,Info,Cloud,CloudLightning,CloudFog,Moon,Sun} from 'lucide-react';
import {PublicWarnings} from './public-warnings';
import {PublicRiverFlow,type PublicRiver} from './public-river-flow';
import {isWeatherAnchor,usePublicAnchor} from './public-navigation';
type City={ibge_code:string;name:string;state:string};
type Weather={weather_code?:number|null;is_day?:boolean|null;cloud_cover_pct?:number|null;apparent_temperature_c?:number|null;temperature_c:number|null;humidity_pct:number|null;wind_kmh:number|null;precipitation_mm:number|null;valid_at?:string;observed_at?:string;name?:string};
type Day={date:string;hours:number;min_c:number|null;max_c:number|null;rain_mm:number|null;rain_probability_pct:number|null};
type Dashboard={municipality:City&{main_river:string|null;longitude:number|null;latitude:number|null};weather:{observation:Weather|null;forecast:{status:string;fetchedAt:string;current:Weather|null;daily:Day[];today:Day|null}|null};river:PublicRiver|null};
const stateNames:Record<string,string>={AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'};
const base=browserApiBase;
async function request<T>(path:string,body?:unknown):Promise<T>{const r=await fetch(base+'/public'+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit'});if(!r.ok)throw Error('Não foi possível consultar os dados.');return r.json();}
const val=(n:number|null|undefined,unit:string)=>n==null?'—':n.toLocaleString('pt-BR',{maximumFractionDigits:1})+unit;
const time=(s?:string|null)=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
export function PublicMonitoring(){
 const anchor=usePublicAnchor();
 const showWeather=isWeatherAnchor(anchor);
 const [cities,setCities]=useState<City[]>([]),[city,setCity]=useState(''),[uf,setUf]=useState(''),[data,setData]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[location,setLocation]=useState(''),[locating,setLocating]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;request<City[]>('/municipalities').then(rows=>{if(!active)return;setCities(rows);setCity(old=>rows.some(x=>x.ibge_code===old)?old:rows.find(x=>x.ibge_code==='3101508')?.ibge_code??rows[0]?.ibge_code??'');setError('');}).catch(()=>{if(active)setError('Lista de municípios indisponível.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[revision]);
 useEffect(()=>{setData(null);if(!city)return;let active=true;setLoading(true);const load=()=>request<Dashboard>('/municipalities/'+city+'/dashboard').then(d=>{if(active){setData(d);setError('');}}).catch(()=>{if(active){setData(null);setError('Monitoramento temporariamente indisponível.');}}).finally(()=>{if(active)setLoading(false);});void load();const timer=setInterval(()=>void load(),60000);return()=>{active=false;clearInterval(timer);};},[city,revision]);
 function locate(){setLocation('');if(!navigator.geolocation){setLocation('Localização indisponível. Selecione o município manualmente.');return;}setLocating(true);navigator.geolocation.getCurrentPosition(async p=>{try{const r=await request<{municipality:City|null}>('/locate',{latitude:p.coords.latitude,longitude:p.coords.longitude});if(r.municipality&&cities.some(c=>c.ibge_code===r.municipality!.ibge_code)){setUf(r.municipality.state);setCity(r.municipality.ibge_code);setLocation('Município identificado pela localização.');}else setLocation('Não encontramos um município cadastrado com malha correspondente. Selecione manualmente.');}catch{setLocation('Não foi possível identificar o município.');}finally{setLocating(false);}},()=>{setLocating(false);setLocation('Localização não autorizada ou indisponível. Escolha manualmente.');},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});}
 const d=data?.municipality.ibge_code===city?data:null;const current=d?.weather.observation??d?.weather.forecast?.current;const measured=!!d?.weather.observation;const selected=cities.find(c=>c.ibge_code===city);const states=[...new Set(cities.map(c=>c.state))].sort((a,b)=>(stateNames[a]??a).localeCompare(stateNames[b]??b,'pt-BR'));const selectedUf=selected?.state??(states.includes(uf)?uf:states[0]??'');const today=d?.weather.forecast?.today;const sky=d?.weather.forecast?.current;const code=sky?.weather_code;const night=sky?.is_day===false;const storm=code!=null&&[95,96,99].includes(code);const rain=code!=null&&[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code);const fog=code===45||code===48;const overcast=code===3;const clear=code===0;const partly=code===1||code===2;const condition=storm?'Tempestade prevista':rain?'Chuva prevista':fog?'Neblina prevista':overcast?'Nublado':clear?(night?'Céu limpo à noite':'Ensolarado'):partly?'Parcialmente nublado':'Condição do céu indisponível';const WeatherIcon=storm?CloudLightning:rain?CloudRain:fog?CloudFog:overcast?Cloud:night?Moon:clear?Sun:CloudSun;
 const hasMunicipality=!!selected;
 useEffect(()=>{
  if (anchor === '#monitoramento' || isWeatherAnchor(anchor)) {
   document.getElementById(anchor.slice(1))?.scrollIntoView();
  }
 },[anchor,hasMunicipality]);
 return (
  <section id={showWeather ? 'tempo' : 'monitoramento'} className="public-monitor public-container" tabIndex={-1}>
   <div className="pm-heading">
    <div>
     <p className="pm-heading-context">{showWeather ? 'Tempo e avisos' : 'Monitoramento municipal'}</p>
     <h1>{selected?.name ?? 'Selecione seu município'}</h1>
     {selected && <p className="pm-heading-location"><MapPin size={16} aria-hidden="true"/>{stateNames[selected.state] ?? selected.state}</p>}
    </div>
    <span className="pm-timezone">Horário de Brasília (UTC−3)</span>
   </div>

   <div className="pm-picker">
    <label>
     Estado
     <select value={selectedUf} onChange={e => {
      const next = e.target.value;
      setUf(next);
      setCity(cities.find(c => c.state === next)?.ibge_code ?? '');
      setLocation('');
     }}>
      <option value="">Selecione</option>
      {states.map(uf => <option key={uf} value={uf}>{stateNames[uf] ?? uf}</option>)}
     </select>
    </label>
    <label>
     Município
     <select value={city} onChange={e => { setCity(e.target.value); setLocation(''); }}>
      <option value="">Selecione um município</option>
      {cities.filter(c => c.state === selectedUf).map(c => <option key={c.ibge_code} value={c.ibge_code}>{c.name} — {c.state}</option>)}
     </select>
    </label>
    <button disabled={locating || !cities.length} className="public-button pm-location-button" onClick={locate}>
     <LocateFixed size={18} aria-hidden="true"/>{locating ? 'Localizando…' : 'Usar localização'}
    </button>
    <button className="pm-refresh pm-dashboard-refresh" onClick={() => setRevision(x => x + 1)} aria-label="Atualizar dados">
     <RefreshCw size={16} aria-hidden="true"/> Atualizar
    </button>
   </div>
   {location && <p role="status" className="pm-note">{location}</p>}
   {loading && <p role="status" className="pm-note">Consultando dados disponíveis…</p>}
   {error && <p role="alert" className="pm-note">{error}</p>}
   {!loading && !cities.length && !error && <p className="pm-note">Nenhum município vinculado a uma organização está disponível.</p>}

   {selected && (showWeather ? <>
    <section className="pm-weather" aria-labelledby="pm-weather-title">
     <div className="pm-weather-head">
      <h2 id="pm-weather-title">Tempo agora</h2>
      <small>{measured ? 'Temperatura INMET · céu estimado Open-Meteo' : 'Estimativa Open-Meteo'} · {time(current?.observed_at ?? current?.valid_at)}</small>
     </div>
     <div className="pm-weather-content">
      <div className="pm-weather-main">
       <WeatherIcon size={46} strokeWidth={1.5} aria-hidden="true"/>
       <div>
        <div className="pm-temp">{val(current?.temperature_c, '°C')}</div>
        <p>{condition}</p>
        {sky?.apparent_temperature_c != null && <small>Sensação prevista: {val(sky.apparent_temperature_c, '°C')}</small>}
       </div>
      </div>
      <dl className="pm-weather-stats">
       <div><dt><Droplets size={16} aria-hidden="true"/>Umidade</dt><dd>{val(current?.humidity_pct, '%')}</dd></div>
       <div><dt><Wind size={16} aria-hidden="true"/>Vento</dt><dd>{val(current?.wind_kmh, ' km/h')}</dd></div>
       <div><dt><CloudRain size={16} aria-hidden="true"/>Chuva na hora</dt><dd>{val(current?.precipitation_mm, ' mm')}</dd></div>
       <div><dt><CalendarDays size={16} aria-hidden="true"/>Chuva prevista hoje</dt><dd>{val(today?.rain_mm, ' mm')}</dd></div>
       {today && (today.min_c != null || today.max_c != null) && <div>
        <dt><CloudSun size={16} aria-hidden="true"/>Máx. / mín. de hoje</dt><dd>{val(today.max_c, '°')} / {val(today.min_c, '°')}</dd>
       </div>}
      </dl>
     </div>
    </section>

    <PublicWarnings
     key={city}
     city={city}
     revision={revision}
     center={d?.municipality.longitude != null && d.municipality.latitude != null ? [d.municipality.longitude, d.municipality.latitude] : null}
     temperature={current?.temperature_c ?? null}
     municipalityName={selected.name}
    >
     <section className="pm-card pm-forecast">
      <div className="pm-card-head">
       <div>
        <h2>Previsão para os próximos 5 dias</h2>
        <small>Open-Meteo · estimativas para o ponto municipal · {d?.weather.forecast?.fetchedAt ? 'Atualização: ' + time(d.weather.forecast.fetchedAt) : 'Sem atualização'}</small>
       </div>
       <CalendarDays size={24} aria-hidden="true"/>
      </div>
      {d?.weather.forecast?.status === 'stale' && <p className="pm-note">Previsão desatualizada ou última coleta com falha.</p>}
      <div className="pm-days">
       {Array.from({ length: 5 }, (_, i) => {
        const date = d?.weather.forecast?.daily[i];
        return <div className="pm-day" key={i}>
         <strong>{date ? new Date(date.date + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : 'Dia ' + (i + 1)}</strong>
         {date?.rain_mm != null && date.rain_mm > 0 ? <CloudRain size={26} aria-hidden="true"/> : <CloudSun size={26} aria-hidden="true"/>}
         <div className="pm-day-temp">{val(date?.max_c, '°')} <span>{val(date?.min_c, '°')}</span></div>
         <small><Droplets size={14} aria-hidden="true"/>{val(date?.rain_mm, ' mm')}</small>
         <small>Prob. máx.: {val(date?.rain_probability_pct, '%')}</small>
         {(!date || date.hours !== 24) && <small>Dados incompletos</small>}
        </div>;
       })}
      </div>
      <small>Máxima chance de chuva em uma hora do dia. Totais e temperaturas diárias exigem dados completos. <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Dados meteorológicos por Open-Meteo</a>.</small>
     </section>
    </PublicWarnings>
    <div className="pm-notice"><Info size={19} aria-hidden="true"/><p>Portal em validação. Informações ambientais não substituem alertas oficiais ou instruções de evacuação da Defesa Civil.</p></div>
   </> : <PublicRiverFlow river={d?.river ?? null} riverName={d?.municipality.main_river ?? null} municipality={selected.name} municipalityCode={selected.ibge_code} dashboardReady={d !== null || !!error}/>)}
  </section>
 );
}
