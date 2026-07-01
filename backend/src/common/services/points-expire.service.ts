import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PointsExpireService {
  private readonly logger = new Logger(PointsExpireService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * FIFO 积分过期处理
   *
   * 逻辑：
   * 1. 查询所有 expiresAt <= now 且 remainingAmount > 0 的 earn 流水（按 created_at ASC，先产生的先过期）
   * 2. 对每条流水：
   *    - 如果 remainingAmount > 0，该会员 totalPoints -= remainingAmount
   *    - 写入 expire 流水
   *    - 更新 remainingAmount = 0
   * 3. 记录 PointsExpireLog
   */
  async processExpiry() {
    const now = new Date();
    const expiredRecords = await this.prisma.pointLedger.findMany({
      where: {
        changeType: 'earn',
        expiresAt: { lte: now },
        remainingAmount: { gt: 0 },
      },
      orderBy: { createdAt: 'asc' },
      include: { member: true },
    });

    if (expiredRecords.length === 0) {
      this.logger.log('无到期积分需要处理');
      return { processedCount: 0, totalExpired: 0 };
    }

    let totalExpired = 0;
    let successCount = 0;
    const errors: { ledgerId: bigint; error: string }[] = [];

    // 按会员分组处理
    const byMember = new Map<bigint, typeof expiredRecords>();
    for (const r of expiredRecords) {
      if (!byMember.has(r.memberId)) byMember.set(r.memberId, []);
      byMember.get(r.memberId)!.push(r);
    }

    for (const [memberId, records] of byMember) {
      const member = records[0].member;

      try {
        let memberTotalExpired = 0;

        await this.prisma.$transaction(async (tx) => {
          // 在事务内跟踪版本号和积分数，避免循环内乐观锁冲突
          let currentVersion = member.totalPointsVersion;
          let currentPoints = member.totalPoints;

          for (const record of records) {
            // 乐观锁更新
            const updateResult = await tx.member.updateMany({
              where: {
                id: memberId,
                totalPointsVersion: currentVersion,
              },
              data: {
                totalPoints: { decrement: record.remainingAmount },
                totalPointsVersion: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              throw new Error(`乐观锁冲突: memberId=${memberId}`);
            }

            currentVersion += 1;
            currentPoints -= record.remainingAmount;

            // 写入过期流水
            await tx.pointLedger.create({
              data: {
                memberId,
                changeType: 'expire',
                amount: -record.remainingAmount,
                balanceAfter: currentPoints,
                remainingAmount: 0,
                remark: `FIFO 到期: 原始流水 #${record.id}, 到期日 ${record.expiresAt?.toISOString().slice(0, 10)}`,
              },
            });

            // 标记原流水已过期
            await tx.pointLedger.updateMany({
              where: { id: record.id },
              data: { remainingAmount: 0, expiredAmount: record.remainingAmount },
            });

            memberTotalExpired += record.remainingAmount;
          }
        });

        totalExpired += memberTotalExpired;
        successCount += records.length;

        // 记录过期执行日志
        await this.prisma.pointsExpireLog.create({
          data: {
            memberId,
            totalExpired: memberTotalExpired,
            affectedRows: records.length,
            executedAt: now,
            status: 'success',
          },
        });
      } catch (err: any) {
        this.logger.error(`会员 ${memberId} 积分过期处理失败: ${err.message}`);
        for (const r of records) {
          errors.push({ ledgerId: r.id, error: err.message });
        }

        await this.prisma.pointsExpireLog.create({
          data: {
            memberId,
            totalExpired: 0,
            affectedRows: records.length,
            executedAt: now,
            status: 'failed',
            errorMsg: err.message,
          },
        });
      }
    }

    this.logger.log(
      `积分过期处理完成: ${successCount}/${expiredRecords.length} 条成功, ${totalExpired} 分到期`,
    );

    return {
      processedCount: expiredRecords.length,
      successCount,
      totalExpired,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /** 查询过期执行日志 */
  async getExpireLogs(memberId?: bigint, status?: string, page = 1, pageSize = 20) {
    const where: any = {};
    if (memberId) where.memberId = memberId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.pointsExpireLog.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pointsExpireLog.count({ where }),
    ]);

    return {
      items: items.map((l) => ({
        id: Number(l.id),
        memberId: Number(l.memberId),
        totalExpired: l.totalExpired,
        affectedRows: l.affectedRows,
        executedAt: l.executedAt,
        status: l.status,
        errorMsg: l.errorMsg,
        createdAt: l.createdAt,
      })),
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
