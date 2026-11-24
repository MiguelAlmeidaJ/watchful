import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
@Catch()
export class ErrorsFilter implements ExceptionFilter {
 private readonly logger=new Logger('HTTP');
 catch(error:unknown,host:ArgumentsHost){
  const ctx=host.switchToHttp(),res=ctx.getResponse<Response>(),req=ctx.getRequest<Request>();
  const status=error instanceof HttpException?error.getStatus():500;
  if(status>=500)this.logger.error(JSON.stringify({status,method:req.method,path:req.path,error:error instanceof Error?error.name:'Unknown'}));
  const body=error instanceof HttpException && status<500?error.getResponse():{message:status===503?'Serviço indisponível':status===502?'Fonte externa indisponível':'Erro interno'};
  res.status(status).json({statusCode:status,error:body,timestamp:new Date().toISOString()});
 }
}
