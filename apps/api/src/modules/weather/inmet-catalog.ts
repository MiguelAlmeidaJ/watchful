import { BadGatewayException } from '@nestjs/common';
import type { Database } from '../../common/database';
import { z } from 'zod';
const item=z.object({CD_ESTACAO:z.string().regex(/^[A-Z0-9]{2,12}$/i),DC_NOME:z.string().trim().min(1).max(150),VL_LATITUDE:z.coerce.number().finite().min(-90).max(90),VL_LONGITUDE:z.coerce.number().finite().min(-180).max(180),SG_ESTADO:z.string().optional(),CD_SITUACAO:z.string().optional()});
type Station=z.infer<typeof item>;
type Catalog={data:Station[];source:string;fetchedAt:string;stale:boolean};
let retryAfter=0;
let pending:Promise<Catalog>|undefined;
export async function inmetCatalog(db:Database):Promise<Catalog>{
 const previous=(await db.query('SELECT source,fetched_at,data FROM inmet_catalog_cache WHERE id=true')).rows[0];
 const old=previous?{data:previous.data as Station[],source:String(previous.source),fetchedAt:new Date(previous.fetched_at).toISOString(),stale:true}:null;
 if(old&&Date.now()-Date.parse(old.fetchedAt)<3600000)return {...old,stale:false};
 if(Date.now()<retryAfter){if(old)return old;throw new BadGatewayException('Catálogo INMET indisponível');}
 if(pending)return pending;
 pending=(async()=>{
  try{
   const res=await fetch('https://apitempo.inmet.gov.br/estacoes/T',{signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!res.ok||!res.body)throw Error('HTTP');
   const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4_000_000){await reader.cancel();throw Error('size');}chunks.push(value);}}finally{reader.releaseLock();}
   const raw:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!Array.isArray(raw)||raw.length>3000)throw Error('payload');
   const data=raw.flatMap(row=>{if(!row||row.VL_LATITUDE==null||row.VL_LONGITUDE==null||String(row.VL_LATITUDE).trim()===''||String(row.VL_LONGITUDE).trim()==='')return [];const p=item.safeParse(row);return p.success?[p.data]:[];});
   if(!data.length)throw Error('empty');
   const row=(await db.query("INSERT INTO inmet_catalog_cache(id,source,data) VALUES(true,'api',$1::jsonb) ON CONFLICT(id) DO UPDATE SET source=excluded.source,data=excluded.data,fetched_at=now() RETURNING fetched_at",[JSON.stringify(data)])).rows[0]!;return {data,source:'api',fetchedAt:new Date(row.fetched_at).toISOString(),stale:false};
  }catch{retryAfter=Date.now()+300000;if(old)return old;throw new BadGatewayException('Catálogo INMET indisponível ou inválido');}
 })();
 try{return await pending;}finally{pending=undefined;}
}

export function parseCatalogCsv(text:string):Station[]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 const input=text.replace(/^\uFEFF/,'');const header=input.split(/\r?\n/,1)[0]??'';const sep=header.includes(';')?';':',';
 for(let i=0;i<input.length;i++){const ch=input[i];if(ch==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&ch===sep){row.push(field);field='';}else if(!quoted&&(ch==='\n'||ch==='\r')){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.trim()))rows.push(row);row=[];field='';}else field+=ch;}
 if(quoted)throw new Error('CSV inválido');row.push(field);if(row.some(s=>s.trim()))rows.push(row);
 const keys=(rows.shift()??[]).map(v=>v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
 const index=(...names:string[])=>keys.findIndex(k=>names.includes(k));
 const code=index('CD_ESTACAO','CODIGO'),name=index('DC_NOME','NOME'),lat=index('VL_LATITUDE','LATITUDE'),lon=index('VL_LONGITUDE','LONGITUDE'),uf=index('SG_ESTADO','UF'),status=index('CD_SITUACAO','CD_SITUACA','SITUACAO');
 if([code,name,lat,lon].some(i=>i<0)||rows.length>3000)throw new Error('Colunas do catálogo não reconhecidas');
 const data=rows.map(r=>{const a=r[lat]?.trim(),b=r[lon]?.trim();if(!a||!b)throw new Error('Coordenadas ausentes');return item.parse({CD_ESTACAO:r[code]?.trim(),DC_NOME:r[name]?.trim(),VL_LATITUDE:a.replace(',','.'),VL_LONGITUDE:b.replace(',','.'),SG_ESTADO:r[uf]?.trim()||undefined,CD_SITUACAO:r[status]?.trim()||undefined});});
 if(!data.length||new Set(data.map(r=>r.CD_ESTACAO.toUpperCase())).size!==data.length)throw new Error('Catálogo vazio ou duplicado');return data;
}
