'use client';
import { useEffect,useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
export type TerritoryLayers=Partial<Record<'municipalities'|'risk-areas'|'stations'|'forecast-locations'|'shelters'|'incidents'|'rivers',FeatureCollection>>;
const empty:FeatureCollection={type:'FeatureCollection',features:[]};
const keys=['municipalities','risk-areas','stations','forecast-locations','shelters','incidents','rivers'] as const;
export function TerritoryMap({layers,center,styleUrl,onBounds}:{layers:TerritoryLayers;center:[number,number];styleUrl?:string;onBounds?:(bounds:number[])=>void}){
 const container=useRef<HTMLDivElement>(null),map=useRef<maplibregl.Map|null>(null),latest=useRef(layers);
 useEffect(()=>{latest.current=layers;const m=map.current;if(m)for(const k of keys)(m.getSource(k) as maplibregl.GeoJSONSource|undefined)?.setData(layers[k]??empty);},[layers]);
 const [longitude,latitude]=center;
 useEffect(()=>{
  if(!container.current)return;
  const m=new maplibregl.Map({container:container.current,style:styleUrl??{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#e9eef2'}}]},center:[longitude,latitude],zoom:11});
  map.current=m;m.addControl(new maplibregl.NavigationControl(),'top-right');
  const report=()=>{const b=m.getBounds();onBounds?.([Math.max(-180,b.getWest()),Math.max(-90,b.getSouth()),Math.min(180,b.getEast()),Math.min(90,b.getNorth())]);};
  m.on('moveend',report);
  m.on('load',()=>{
   report();
   for(const k of keys)m.addSource(k,{type:'geojson',data:latest.current[k]??empty});
   m.addLayer({id:'municipality-outline',type:'line',source:'municipalities',paint:{'line-color':'#334155','line-width':2}});
   m.addLayer({id:'risk-fill',type:'fill',source:'risk-areas',paint:{'fill-color':['match',['get','classification'],'low','#65a30d','medium','#eab308','high','#f97316','very_high','#dc2626','#64748b'],'fill-opacity':0.35}});
   m.addLayer({id:'risk-outline',type:'line',source:'risk-areas',paint:{'line-color':'#475569','line-width':1}});
   m.addLayer({id:'river-lines',type:'line',source:'rivers',paint:{'line-color':'#0284c7','line-width':2}});
   for(const [k,color] of [['stations','#0369a1'],['forecast-locations','#7c3aed'],['shelters','#0f766e'],['incidents','#b91c1c']] as const)m.addLayer({id:k+'-points',type:'circle',source:k,paint:{'circle-color':color,'circle-radius':6,'circle-stroke-color':'#fff','circle-stroke-width':2}});
  });
  return()=>{map.current=null;m.remove();};
 },[longitude,latitude,styleUrl]);
 return <div><div ref={container} className="h-[480px] w-full rounded-lg" aria-label="Mapa territorial"/><p className="mt-2 text-xs text-slate-600">Classificação territorial cadastrada, não alerta em tempo real. Ausência de dados não indica segurança.</p></div>;
}
