import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly prefix = 'token:blacklist:';

  constructor(
    private redis: RedisService,
  ) {}

  /** 将 token 加入黑名单 */
  async blacklist(token: string): Promise<void> {
    const jti = this.extractJti(token);
    const ttl = this.getRemainingTtl(token);

    if (ttl > 0) {
      await this.redis.client.set(`${this.prefix}${jti}`, '1', 'EX', ttl);
      this.logger.log(`Token 已加入黑名单, ttl=${ttl}s`);
    }
  }

  /** 检查 token 是否已被加入黑名单 */
  async isBlacklisted(token: string): Promise<boolean> {
    const jti = this.extractJti(token);
    const exists = await this.redis.client.exists(`${this.prefix}${jti}`);
    return exists === 1;
  }

  /** 使用 SHA-256 哈希作为 token 唯一标识，避免冲突和泄露 */
  private extractJti(token: string): string {
    const clean = token.replace('Bearer ', '');
    return createHash('sha256').update(clean).digest('hex').substring(0, 32);
  }

  /** 估算 token 剩余有效时间(秒) */
  private getRemainingTtl(token: string): number {
    try {
      const clean = token.replace('Bearer ', '');
      const payloadBase64 = clean.split('.')[1];
      if (!payloadBase64) return 3600;

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
    return 3600;
  }
}
