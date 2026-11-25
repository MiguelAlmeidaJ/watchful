import { Injectable,OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
@Injectable()
export class WeatherCache implements OnModuleDestroy{
 private readonly redis=new Redis(process.env.REDIS_CACHE_URL??'redis://localhost:6379',{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,connectTimeout:1500,commandTimeout:1000});
 constructor(){this.redis.on('error',()=>{});void this.redis.connect().catch(()=>{});}
 async get<T>(key:string,loader:()=>Promise<T>,ttl=30):Promise<T>{
  try{const hit=await this.redis.get('weather:v1:'+key);if(hit)return JSON.parse(hit) as T;}catch{}
  const result=await loader();try{await this.redis.set('weather:v1:'+key,JSON.stringify(result),'EX',ttl);}catch{}return result;
 }
 onModuleDestroy(){this.redis.disconnect();}
}
