import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WeatherController } from './weather.controller';
import { WeatherCache } from './weather-cache';
@Module({imports:[AuthModule],controllers:[WeatherController],providers:[WeatherCache]})
export class WeatherModule {}
