export type Tokens={accessToken:string;refreshToken:string;expiresIn:number};
export type Organization={id:string;name:string;role:string|null};
export type Municipality={id:string;name:string;state:string};
export type Station={id:string;name:string;provider:string;latitude:number;longitude:number;municipality_id:string};
export type Profile={id:string;email:string;platformAdmin:boolean};
export type Alert={id:string;title:string;message:string;severity:string;origin:string;status:string;starts_at:string;expires_at:string;source:string};
export type Notice={id:string;title:string;event_type:string;read_at:string|null;created_at:string;severity:string};
export type Reading={temperature_c:string|number|null;precipitation_mm:string|number|null;humidity_pct:string|number|null;wind_kmh:string|number|null;observed_at:string;quality:string};
export type Current={status:string;reading:Reading|null;ageMinutes:number|null};
export type Rainfall={windows:{hours:number;totalMm:number|null;partialMm:number|null;coverage:number;complete:boolean}[]};
export type Forecast={status:string;fetchedAt:string|null;data:{valid_at:string;temperature_c:string|null;precipitation_mm:string|null;precipitation_probability_pct:string|null}[]};
export type Row=Record<string,unknown>;
export class ApiError extends Error{constructor(readonly status:number,message:string){super(message);}}
export function createClient(base:string,onExpired:()=>void){
 let tokens:Tokens|null=null,refreshing:Promise<void>|null=null,generation=0;
 async function raw<T>(path:string,method='GET',body?:unknown,access?:string):Promise<T>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch(base.replace(/\/$/,'')+path,{method,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(access?{Authorization:'Bearer '+access}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:controller.signal});
   if(!response.ok){let message='Falha na solicitação ('+response.status+')';try{const data=await response.json();const value=data.error?.message??data.message??data.error;if(typeof value==='string')message=value;}catch{}throw new ApiError(response.status,message);}
   return await response.json() as T;
  }finally{clearTimeout(timer);}
 }
 async function refresh(){
  if(refreshing)return refreshing;
  const old=tokens,g=generation;if(!old)throw new ApiError(401,'Sessão encerrada');
  const task=raw<Tokens>('/auth/refresh','POST',{refreshToken:old.refreshToken}).then(next=>{if(g!==generation)throw new ApiError(401,'Sessão encerrada');tokens=next;}).catch(error=>{if(g===generation&&error instanceof ApiError&&error.status===401){tokens=null;generation++;onExpired();}throw error;});
  refreshing=task;try{await task;}finally{if(refreshing===task)refreshing=null;}
 }
 return {
  async login(email:string,password:string){const g=++generation;tokens=null;const next=await raw<Tokens>('/auth/login','POST',{email,password});if(g!==generation)throw new ApiError(401,'Sessão encerrada');tokens=next;},
  async logout(){const old=tokens;tokens=null;generation++;try{if(old)await raw('/auth/logout','POST',{refreshToken:old.refreshToken});}catch{}},
  async request<T>(path:string,method='GET',body?:unknown):Promise<T>{
   const g=generation,access=tokens?.accessToken;if(!access)throw new ApiError(401,'Entre novamente');
   try{return await raw<T>(path,method,body,access);}catch(error){if(!(error instanceof ApiError)||error.status!==401||g!==generation)throw error;if(tokens?.accessToken===access)await refresh();if(g!==generation||!tokens)throw new ApiError(401,'Sessão encerrada');return raw<T>(path,method,body,tokens.accessToken);}
  }
 };
}
export type Client=ReturnType<typeof createClient>;
export const query=(values:Record<string,string|number>)=>'?'+Object.entries(values).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
export const formatDate=(v:unknown)=>typeof v==='string'&&!Number.isNaN(Date.parse(v))?new Date(v).toLocaleString('pt-BR'):'—';
export const metric=(v:unknown,unit:string)=>v===null||v===undefined?'Indisponível':String(v)+' '+unit;
export const labels:Record<string,string>={available:'Disponível',degraded:'Degradado',stale:'Desatualizado',unknown:'Indeterminado',disabled:'Desativado',draft:'Rascunho',approved:'Aprovado',published:'Publicado internamente',cancelled:'Cancelado',expired:'Expirado',attention:'Atenção',warning:'Alerta',severe:'Severo',normal:'Abaixo do limiar',official:'Oficial (importado)',manual:'Manual',calculated:'Calculado',reported:'Registrado',verified:'Verificado',resolved:'Resolvido',dismissed:'Descartado',unverified:'Não verificado',full:'Lotado',unavailable:'Indisponível'};
export const label=(v:unknown)=>labels[String(v)]??String(v??'—');
