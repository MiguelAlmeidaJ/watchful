export async function fetchJson(url:URL):Promise<unknown>{
 const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('PROVIDER_HTTP_'+response.status);
 return response.json();
}
export function numeric(value:unknown,min:number,max:number):number|null {
 if(typeof value!=='number'&&typeof value!=='string')return null;
 if(typeof value==='string'&&!value.trim())return null;
 const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
export function utcHour(value:unknown):string|null {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return null;
 const date=new Date(value+':00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,16)===value?date.toISOString():null;
}
export function record(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_PROVIDER_PAYLOAD');
 return value as Record<string,unknown>;
}
