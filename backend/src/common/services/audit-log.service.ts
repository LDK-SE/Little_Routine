import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogEntry {
  shopId: bigint;
  operatorId: bigint;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detailJson?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  async write(entry: AuditLogEntry) {
    try {
      await this.prisma.systemLog.create({
        data: {
          shopId: entry.shopId,
          operatorId: entry.operatorId,
          module: entry.module,
          action: entry.action,
          targetType: entry.targetType ?? '',
          targetId: entry.targetId ?? null,
          detailJson: (entry.detailJson as any) ?? undefined,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error('审计日志写入失败', err);
    }
  }

  /** 快捷方法: 登录 */
  async logLogin(userId: bigint, shopId: bigint, ip?: string) {
    await this.write({
      shopId,
      operatorId: userId,
      module: 'auth',
      action: 'login',
      targetType: 'sys_user',
      targetId: String(userId),
      ipAddress: ip,
    });
  }

  /** 快捷方法: 登出 */
  async logLogout(userId: bigint, shopId: bigint, ip?: string) {
    await this.write({
      shopId,
      operatorId: userId,
      module: 'auth',
      action: 'logout',
      targetType: 'sys_user',
      targetId: String(userId),
      ipAddress: ip,
    });
  }

  /** 快捷方法: 刷新令牌 */
  async logTokenRefresh(userId: bigint, shopId: bigint, ip?: string) {
    await this.write({
      shopId,
      operatorId: userId,
      module: 'auth',
      action: 'token_refresh',
      targetType: 'sys_user',
      targetId: String(userId),
      ipAddress: ip,
    });
  }
}
