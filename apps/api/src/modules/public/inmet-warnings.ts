const root='https://apiprevmet3.inmet.gov.br/avisos/rss';
export type Warning={id:string;event:string;severity:string;startsAt:string;endsAt:string;description:string;instruction:string;url:string;municipalities:string[];polygons:number[][][]};
type Snapshot={warnings:Warning[];fetchedAt:number;status:'available'|'unavailable'};
let snapshot:Snapshot={warnings:[],fetchedAt:0,status:'unavailable'},attempt=0,pending:Promise<Snapshot>|null=null;
function decode(s:string){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,m=>{const k=m.slice(1,-1);if(k[0]==='#'){const n=k[1]?.toLowerCase()==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[k]??m;}).trim();}
function blocks(xml:string,tag:string){return [...xml.matchAll(new RegExp('<(?:[\\w.-]+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+tag+'\\s*>','gi'))].map(m=>m[1]!);}
function field(xml:string,tag:string){return decode(blocks(xml,tag)[0]??'');}
function safeXml(xml:string){if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('unsafe XML');return xml;}
export function parseWarning(xml:string,id:string):Warning|null{
 safeXml(xml);const alert=blocks(xml,'alert')[0];if(!alert)throw Error('CAP ausente');
 if(field(alert,'status')!=='Actual'||field(alert,'scope')!=='Public'||!['Alert','Update'].includes(field(alert,'msgType')))return null;
 const infos=blocks(alert,'info');const info=infos.find(i=>/^pt(?:-|$)/i.test(field(i,'language')))||infos[0];if(!info)throw Error('info ausente');
 const startsAt=field(info,'onset')||field(info,'effective')||field(alert,'sent'),endsAt=field(info,'expires');
 if(![startsAt,endsAt].every(x=>/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x)))||Date.parse(endsAt)<=Date.parse(startsAt))throw Error('vigência inválida');
 const event=field(info,'event');const severity=field(info,'severity');if(!event||!['Minor','Moderate','Severe','Extreme','Unknown'].includes(severity))throw Error('severidade inválida');
 const municipalities=new Set<string>(),polygons:number[][][]=[];
 for(const area of blocks(info,'area')){
  for(const g of blocks(area,'geocode')){if(/ibge/i.test(field(g,'valueName')))for(const m of field(g,'value').matchAll(/\b\d{7}\b/g))municipalities.add(m[0]);}
  for(const m of field(area,'areaDesc').matchAll(/\((\d{7})\)/g))municipalities.add(m[1]!);
  for(const raw of blocks(area,'polygon')){const points=decode(raw).split(/\s+/).map(p=>p.split(',').map(Number));if(points.length<4||points.length>30000||points.some(p=>p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0]!)>90||Math.abs(p[1]!)>180))throw Error('polígono inválido');const ring=points.map(p=>[p[1]!,p[0]!]);if(ring[0]![0]!==ring.at(-1)![0]||ring[0]![1]!==ring.at(-1)![1])throw Error('polígono aberto');polygons.push(ring);}
 }
 if(!municipalities.size&&!polygons.length)throw Error('área ausente');
 return {id,event,severity,startsAt,endsAt,description:field(info,'description').slice(0,12000),instruction:field(info,'instruction').slice(0,12000),url:'https://avisos.inmet.gov.br/'+id,municipalities:[...municipalities],polygons};
}
async function download(url:string){const res=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{'User-Agent':'Watchful/0.1 (+https://github.com/MiguelAlmeidaJ/watchful)',Accept:'application/rss+xml, application/xml, text/xml'}});if(!res.ok||!res.body)throw Error('INMET HTTP '+res.status);const reader=res.body.getReader();let n=0;const chunks:Uint8Array[]=[];try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>5*1024*1024){await reader.cancel();throw Error('limite de resposta');}chunks.push(value);}}finally{reader.releaseLock();}return safeXml(Buffer.concat(chunks).toString('utf8'));}
export async function getWarnings():Promise<Snapshot>{
 if(pending)return pending;if(Date.now()-attempt<300000)return snapshot;attempt=Date.now();
 pending=(async()=>{try{const rss=await download(root);if(!/<rss\b/i.test(rss)||!/<channel\b/i.test(rss))throw Error('RSS inválido');const items=blocks(rss,'item');const ids=new Set<string>();for(const item of items){const links=[field(item,'link'),field(item,'guid'),...blocks(item,'description').map(decode)];const id=links.map(l=>l.match(/https?:\/\/(?:apiprevmet3\.inmet\.gov\.br\/avisos\/rss\/|avisos\.inmet\.gov\.br\/)(\d{1,12})(?=[^\d]|$)/)?.[1]).find(Boolean);if(!id)throw Error('identificador RSS não reconhecido');ids.add(id);}if(ids.size>150)throw Error('limite de avisos');const warnings:Warning[]=[];const list=[...ids];for(let i=0;i<list.length;i+=5){const batch=await Promise.all(list.slice(i,i+5).map(async id=>parseWarning(await download(root+'/'+id),id)));for(const w of batch)if(w)warnings.push(w);}snapshot={warnings,fetchedAt:Date.now(),status:'available'};}catch{snapshot={...snapshot,status:'unavailable'};}return snapshot;})().finally(()=>{pending=null;});return pending;
}
