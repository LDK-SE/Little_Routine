import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly prefix = 'token:blacklist:';

  constructor(
    private redis: RedisService,
    private configService: ConfigService,
  ) {}

  /** 将 token 加入黑名单 */
  async blacklist(token: string): Promise<void> {
    const jti = this.extractJti(token);
    // 解析 token 剩余有效期作为 Redis key 的 TTL
    const ttl = this.getRemainingTtl(token);

    if (ttl > 0) {
      await this.redis.client.set(`${this.prefix}${jti}`, '1', 'EX', ttl);
      this.logger.log(`Token 已加入黑名单, jti=${jti}, ttl=${ttl}s`);
    }
  }

  /** 检查 token 是否已被加入黑名单 */
  async isBlacklisted(token: string): Promise<boolean> {
    const jti = this.extractJti(token);
    const exists = await this.redis.client.exists(`${this.prefix}${jti}`);
    return exists === 1;
  }

  /** 从 token 中提取 JTI (JWT ID) */
  private extractJti(token: string): string {
    // 从 token payload 中提取 hash 作为唯一标识
    // 使用 token 的前后各 20 字符拼接作为标识
    const clean = token.replace('Bearer ', '');
    if (clean.length <= 40) return clean;
    return clean.substring(0, 20) + clean.substring(clean.length - 20);
  }

  /** 估算 token 剩余有效时间(秒) */
  private getRemainingTtl(token: string): number {
    try {
      const clean = token.replace('Bearer ', '');
      const payloadBase64 = clean.split('.')[1];
      if (!payloadBase64) return 3600; // 默认 1 小时

      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString('utf8'),
      );

      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        return Math.max(0, payload.exp - now);
      }
    } catch {
      // ignore decode errors
    }
    return 3600; // 默认 TTL
  }
}
