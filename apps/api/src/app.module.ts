import { Module } from '@nestjs/common';
import { DatabaseModule } from './common/database';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsController } from './modules/organizations/organizations.controller';
import { TerritoryController } from './modules/territory/territory.controller';
import { HealthController } from './modules/health/health.controller';
import { WeatherModule } from './modules/weather/weather.module';
import { GeoModule } from './modules/geo/geo.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { EnvironmentModule } from './modules/environment/environment.module';
@Module({imports:[DatabaseModule,AuthModule,WeatherModule,GeoModule,AlertsModule,EnvironmentModule],controllers:[HealthController,OrganizationsController,TerritoryController]})
export class AppModule {}
