import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorsFilter } from './common/errors.filter';
import { AppModule } from './app.module';
config({ path: resolve(__dirname, '../../../.env') });
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ErrorsFilter());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Watchful API').setVersion('1').addBearerAuth().build());
  if (process.env.NODE_ENV !== 'production') SwaggerModule.setup('docs', app, doc);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}
bootstrap().catch(error => { console.error(error); process.exit(1); });
