import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module';
import {GeoModule} from '../geo/geo.module';
import {HydrologyController} from './hydrology.controller';
@Module({imports:[AuthModule,GeoModule],controllers:[HydrologyController]})
export class HydrologyModule{}
