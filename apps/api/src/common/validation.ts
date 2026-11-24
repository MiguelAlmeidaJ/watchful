import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export function parse<T extends z.ZodTypeAny>(schema:T,value:unknown):z.infer<T> {
 const result=schema.safeParse(value);
 if(!result.success) throw new BadRequestException({message:'Dados inválidos',issues:result.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
 return result.data;
}
export const uuid=z.string().uuid();
export const email=z.string().trim().email().max(254).transform(v=>v.toLowerCase());
export const password=z.string().min(12).max(128);
