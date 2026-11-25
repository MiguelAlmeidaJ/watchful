import { BadGatewayException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { areaGeometry } from './geo.schemas';
const collection=z.object({type:z.literal('FeatureCollection'),features:z.array(z.object({type:z.literal('Feature'),geometry:z.unknown(),properties:z.object({codarea:z.union([z.string(),z.number()])}).passthrough()})).length(1)});
export function parseIbgeBoundary(raw:unknown,code:string){
 const parsed=collection.safeParse(raw);
 if(!parsed.success||String(parsed.data.features[0]!.properties.codarea)!==code)throw new BadGatewayException('Malha IBGE não corresponde ao município solicitado');
 const geometry=areaGeometry.safeParse(parsed.data.features[0]!.geometry);
 if(!geometry.success)throw new BadGatewayException('Geometria IBGE inválida ou superior ao limite suportado');
 return geometry.data;
}
export async function fetchIbgeBoundary(code:string){
 if(!/^\d{7}$/.test(code))throw new BadGatewayException('Código IBGE inválido');
 const url=new URL('https://servicodados.ibge.gov.br/api/v3/malhas/municipios/'+code);
 url.searchParams.set('formato','application/vnd.geo+json');url.searchParams.set('qualidade','intermediaria');
 let raw:unknown;
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error',headers:{Accept:'application/vnd.geo+json, application/json'}});
  if(!response.ok||!response.body)throw Error('HTTP');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw Error('size');}chunks.push(value);}}finally{reader.releaseLock();}
  raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{throw new BadGatewayException('Não foi possível obter a malha do IBGE. Tente novamente mais tarde.');}
 const geometry=parseIbgeBoundary(raw,code);
 const version='v3-intermediaria-'+createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
 return {geometry,version,source:'IBGE — API de Malhas v3 (intermediária)'};
}
