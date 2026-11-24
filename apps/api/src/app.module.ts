import { Module } from '@nestjs/common';
import { DatabaseModule } from './common/database';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsController } from './modules/organizations/organizations.controller';
import { TerritoryController } from './modules/territory/territory.controller';
import { HealthController } from './modules/health/health.controller';
@Module({imports:[DatabaseModule,AuthModule],controllers:[HealthController,OrganizationsController,TerritoryController]})
export class AppModule {}
