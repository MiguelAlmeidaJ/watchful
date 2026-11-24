import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {GeoModule} from '../geo/geo.module';
import {EnvironmentController} from './environment.controller';
@Module({imports:[AuthModule,GeoModule],controllers:[EnvironmentController]})
export class EnvironmentModule{}
