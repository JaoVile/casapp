import { Global, Module } from '@nestjs/common';
import { StructuredLoggerService } from '../services/structured-logger.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [StructuredLoggerService, RedisService],
  exports: [StructuredLoggerService, RedisService],
})
export class RedisModule {}

