import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get('live') live() { return { status: 'ok', service: 'watchful-api', timestamp: new Date().toISOString() }; }
}
