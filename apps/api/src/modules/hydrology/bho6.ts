import {z} from 'zod';
export const BHO6_URL='https://portal1.snirh.gov.br/server/rest/services/Hosted/main_geoft_bho6_trecho_drenagem/FeatureServer/0/query';
export const BHO6_SOURCE='ANA — BHO6 / SNIRH';
const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const path=z.array(point).min(2).max(50000);
const id=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text=z.string().trim().max(500).nullable().optional();
const attributes=z.object({fid:id,cotrecho:id.nullable(),nutrjus:id.nullable(),noorigem:id.nullable(),nodestino:id.nullable(),cocursodag:text,cobacia:text,noriocomp:text,nooriginal:text,nogenerico:text,dsversao:text,nustrahler:z.number().int().nullable(),nuareamont:z.number().finite().nullable()});
const page=z.object({features:z.array(z.object({attributes,geometry:z.object({paths:z.array(path).min(1).max(1000)})})).max(200),exceededTransferLimit:z.boolean().optional(),spatialReference:z.object({wkid:z.number().optional(),latestWkid:z.number().optional()}).optional()});
const ids=z.object({objectIdFieldName:z.literal('fid'),objectIds:z.array(id).max(20000)});
export type Reach={external_id:string;name:string;source_version:string;downstream_external_id:string|null;watercourse_type:string|null;geometry:{type:'MultiLineString';coordinates:number[][][]};attributes:Record<string,unknown>};
async function query(params:Record<string,string>,signal:AbortSignal):Promise<unknown>{
 const url=new URL(BHO6_URL);url.search=new URLSearchParams({f:'json',...params}).toString();
 const response=await fetch(url,{signal,redirect:'error',headers:{Accept:'application/json'}});
 if(!response.ok||!response.body)throw Error('BHO6_HTTP_'+response.status);
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>16*1024*1024){await reader.cancel();throw Error('BHO6_RESPONSE_LIMIT');}chunks.push(value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function fetchBho6(bbox:number[]):Promise<Reach[]>{
 if(bbox.length!==4||bbox.some(n=>!Number.isFinite(n))||bbox[0]!>=bbox[2]!||bbox[1]!>=bbox[3]!||bbox[2]!-bbox[0]!>10||bbox[3]!-bbox[1]!>10)throw Error('BHO6_INVALID_EXTENT');
 const signal=AbortSignal.timeout(100000);
 const result=ids.parse(await query({where:'1=1',geometry:bbox.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnIdsOnly:'true',returnGeometry:'false'},signal));
 const all=[...new Set(result.objectIds)].sort((a,b)=>a-b);if(!all.length||all.length!==result.objectIds.length)throw Error('BHO6_EMPTY_OR_DUPLICATE_IDS');
 const rows:Reach[]=[];const keys=new Set<string>();
 for(let i=0;i<all.length;i+=100){
  const batch=all.slice(i,i+100);
  const parsed=page.parse(await query({objectIds:batch.join(','),outFields:'fid,cotrecho,nutrjus,noorigem,nodestino,cocursodag,cobacia,noriocomp,nooriginal,nogenerico,dsversao,nustrahler,nuareamont',returnGeometry:'true',outSR:'4326',returnZ:'false',returnM:'false'},signal));
  const sr=parsed.spatialReference;if(!sr||!(sr.wkid===4326||sr.latestWkid===4326))throw Error('BHO6_INVALID_CRS');
  const received=new Set(parsed.features.map(f=>f.attributes.fid));
  if(parsed.exceededTransferLimit||received.size!==batch.length||parsed.features.length!==batch.length||batch.some(x=>!received.has(x)))throw Error('BHO6_INCOMPLETE_BATCH');
  for(const feature of parsed.features){
   const a=feature.attributes;if(a.cotrecho===null)throw Error('BHO6_MISSING_REACH_ID');
   const key=String(a.cotrecho);if(keys.has(key))throw Error('BHO6_DUPLICATE_REACH');keys.add(key);
   rows.push({external_id:key,name:(a.noriocomp||a.nooriginal||'Trecho sem nome').slice(0,150),source_version:a.dsversao||'BHO6 — versão do registro não informada',downstream_external_id:a.nutrjus&&a.nutrjus>0?String(a.nutrjus):null,watercourse_type:a.nogenerico||null,geometry:{type:'MultiLineString',coordinates:feature.geometry.paths},attributes:a});
  }
 }
 return rows;
}
