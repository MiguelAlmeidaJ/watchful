'use client';
import { useEffect,useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
const empty:FeatureCollection={type:'FeatureCollection',features:[]};
const keys=['municipalities','risk-areas','historical-risk-sectors','stations','forecast-locations','shelters','incidents','rivers'] as const;
export type TerritoryLayers = Partial<Record<typeof keys[number], FeatureCollection>>;
export function TerritoryMap({layers,center,styleUrl,onBounds,initialBounds}:{layers:TerritoryLayers;center:[number,number];styleUrl?:string;initialBounds?:[number,number,number,number];onBounds?:(bounds:number[])=>void}){
 const container=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(layers);
 useEffect(()=>{latest.current=layers;const m=map.current;if(m)for(const k of keys)(m.getSource(k) as maplibregl.GeoJSONSource|undefined)?.setData(layers[k]??empty);},[layers]);
 const [longitude,latitude]=center;
 const boundsKey=initialBounds?.join(',');
 useEffect(()=>{
  if(!container.current)return;
  const m=new maplibregl.Map({container:container.current,style:styleUrl??{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#e9eef2'}}]},center:[longitude,latitude],zoom:11,...(initialBounds?{bounds:initialBounds,fitBoundsOptions:{padding:32,maxZoom:13}}:{})});
  map.current=m;m.addControl(new maplibregl.NavigationControl(),'top-right');
  const report=()=>{const b=m.getBounds();onBounds?.([Math.max(-180,b.getWest()),Math.max(-90,b.getSouth()),Math.min(180,b.getEast()),Math.min(90,b.getNorth())]);};
  m.on('moveend',report);
  m.on('load',()=>{
   report();
   for(const k of keys)m.addSource(k,{type:'geojson',data:latest.current[k]??empty});
   m.addLayer({id:'municipality-fill',type:'fill',source:'municipalities',paint:{'fill-color':'#0f766e','fill-opacity':0.07}});
   m.addLayer({id:'municipality-outline',type:'line',source:'municipalities',paint:{'line-color':'#087d72','line-width':2.5}});
   m.addLayer({id:'historical-risk-fill',type:'fill',source:'historical-risk-sectors',paint:{'fill-color':'#6366f1','fill-opacity':0.18}});
   m.addLayer({id:'historical-risk-outline',type:'line',source:'historical-risk-sectors',paint:{'line-color':'#4338ca','line-width':2,'line-dasharray':[2,2]}});
   m.addLayer({id:'risk-fill',type:'fill',source:'risk-areas',paint:{'fill-color':['match',['get','classification'],'low','#65a30d','medium','#eab308','high','#f97316','very_high','#dc2626','#64748b'],'fill-opacity':0.35}});
   m.addLayer({id:'risk-outline',type:'line',source:'risk-areas',paint:{'line-color':'#475569','line-width':1}});
   m.addLayer({id:'river-lines',type:'line',source:'rivers',paint:{'line-color':'#0284c7','line-width':2}});
   for(const [k,color] of [['stations','#0369a1'],['forecast-locations','#7c3aed'],['shelters','#0f766e'],['incidents','#b91c1c']] as const)m.addLayer({id:k+'-points',type:'circle',source:k,paint:{'circle-color':color,'circle-radius':6,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   const details = new maplibregl.Popup({ focusAfterOpen: false });
   m.on('click','historical-risk-fill', event => {
    const data = event.features?.[0]?.properties;
    if (!data) return;
    const container = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = String(data.name);
    container.append(title);
    for (const value of [data.sourceHazard, data.sourceClassification, data.surveyDate, data.source]) {
     const line = document.createElement('p');
     line.textContent = String(value);
     container.append(line);
    }
    details.setLngLat(event.lngLat).setDOMContent(container).addTo(m);
   });
  });
  return()=>{map.current=null;m.remove();};
 },[longitude,latitude,styleUrl,boundsKey]);
 return <div><div ref={container} className="h-[clamp(320px,58vh,680px)] w-full overflow-hidden rounded-2xl border border-slate-200" aria-label="Mapa territorial"/>
  <p className="mt-2 text-xs">Mapa-base OpenStreetMap/OpenFreeMap quando configurado. Limites IBGE simplificados. Ausência de dados não indica segurança.</p>
  {!!layers['historical-risk-sectors']?.features.length && <p className="mt-1 text-xs">Contorno tracejado azul indica setor de levantamento histórico. Selecione um setor para ver a data e a classificação originais.</p>}
 </div>;
}
