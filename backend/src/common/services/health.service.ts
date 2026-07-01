import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  checks: {
    database: { status: 'ok' | 'down'; latencyMs: number };
    redis: { status: 'ok' | 'down'; latencyMs: number };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const database = dbResult.status === 'fulfilled'
      ? dbResult.value
      : { status: 'down' as const, latencyMs: 0 };

    const redis = redisResult.status === 'fulfilled'
      ? redisResult.value
      : { status: 'down' as const, latencyMs: 0 };

    const overall = (database.status === 'ok' && redis.status === 'ok')
      ? 'ok' as const
      : 'degraded' as const;

    if (overall !== 'ok') {
      this.logger.warn(`健康检查降级: DB=${database.status} Redis=${redis.status}`);
    }

    return {
      status: overall,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: { database, redis },
    };
  }

  private async checkDatabase() {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    };
  }

  private async checkRedis() {
    const start = Date.now();
    await this.redis.client.ping();
    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    };
  }
}
