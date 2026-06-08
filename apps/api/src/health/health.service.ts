import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth() {
    return {
      status: 'ok',
      service: 'surewina-api',
      timestamp: new Date().toISOString(),
    };
  }
}