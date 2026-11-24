import { BadGatewayException } from '@nestjs/common';
import { z } from 'zod';
const item=z.object({CD_ESTACAO:z.string().regex(/^[A-Z0-9]{2,12}$/i),DC_NOME:z.string().trim().min(1).max(150),VL_LATITUDE:z.coerce.number().finite().min(-90).max(90),VL_LONGITUDE:z.coerce.number().finite().min(-180).max(180),SG_ESTADO:z.string().optional(),CD_SITUACAO:z.string().optional()});
type Station=z.infer<typeof item>;
let cached:{until:number;data:Station[]}|undefined;
let pending:Promise<Station[]>|undefined;
export async function inmetCatalog():Promise<Station[]>{
 if(cached&&cached.until>Date.now())return cached.data;
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
   cached={until:Date.now()+3600000,data};return data;
  }catch{throw new BadGatewayException('Catálogo INMET indisponível ou inválido');}
 })();
 try{return await pending;}finally{pending=undefined;}
}
