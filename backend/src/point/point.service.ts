import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { PointLedgerQueryDto } from './dto/point-ledger-query.dto';
import { PointRedeemDto } from './dto/point-redeem.dto';
import { PointRollbackDto } from './dto/point-rollback.dto';

@Injectable()
export class PointService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 积分余额查询 */
  async getBalance(memberId: bigint) {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        name: true,
        totalPoints: true,
        totalPointsVersion: true,
        status: true,
      },
    });

    if (!member) {
      throw new NotFoundException('会员不存在');
    }

    // 从流水汇总验证余额一致性
    const aggregation = await this.prisma.pointLedger.aggregate({
      where: { memberId },
      _sum: { amount: true },
    });

    const ledgerSum = aggregation._sum.amount ?? 0;

    return {
      memberId: Number(member.id),
      phone: member.phone,
      name: member.name,
      totalPoints: member.totalPoints,
      ledgerPoints: ledgerSum,
      isConsistent: member.totalPoints === ledgerSum,
      status: member.status,
    };
  }

  /** 积分流水查询 (分页) */
  async getLedger(query: PointLedgerQueryDto) {
    const {
      memberId,
      changeType,
      startDate,
      endDate,
      orderNo,
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    if (!memberId) {
      throw new BadRequestException('会员ID不能为空');
    }

    const skip = (page - 1) * pageSize;

    const allowedSortFields = ['createdAt', 'amount', 'changeType', 'id'];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = { memberId: BigInt(memberId) };

    if (changeType) {
      where.changeType = changeType;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate + 'T00:00:00+08:00');
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate + 'T23:59:59+08:00');
      }
    }

    if (orderNo) {
      where.orderNo = orderNo;
    }

    const [items, total] = await Promise.all([
      this.prisma.pointLedger.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderBy]: orderDir },
      }),
      this.prisma.pointLedger.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: Number(r.id),
        memberId: Number(r.memberId),
        changeType: r.changeType,
        amount: r.amount,
        balanceAfter: r.balanceAfter,
        orderNo: r.orderNo,
        orderTime: r.orderTime,
        productModel: r.productModel,
        unitPrice: r.unitPrice ? Number(r.unitPrice) : null,
        quantity: r.quantity,
        expiresAt: r.expiresAt,
        expiredAmount: r.expiredAmount,
        remainingAmount: r.remainingAmount,
        remark: r.remark,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 积分抵扣 (抵现/换购) */
  async redeem(dto: PointRedeemDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const memberId = BigInt(dto.memberId);

    // 最多重试3次 (乐观锁)
    for (let attempt = 0; attempt < 3; attempt++) {
      const member = await this.prisma.member.findUnique({
        where: { id: memberId, deletedAt: null },
      });

      if (!member) {
        throw new NotFoundException('会员不存在');
      }

      if (member.status !== 'active') {
        throw new UnprocessableEntityException('会员状态异常，无法使用积分');
      }

      // 积分不足
      if (member.totalPoints < dto.amount) {
        throw new UnprocessableEntityException(
          `积分不足：当前 ${member.totalPoints} 积分，需要 ${dto.amount} 积分`,
        );
      }

      // 换购门槛: 会员总积分需 >= 3000
      if (member.totalPoints < 3000) {
        throw new UnprocessableEntityException(
          `积分不满 3000 分，无法使用积分抵扣。当前积分：${member.totalPoints}`,
        );
      }

      const newBalance = member.totalPoints - dto.amount;

      // 乐观锁更新
      const updateResult = await this.prisma.member.updateMany({
        where: {
          id: memberId,
          totalPointsVersion: member.totalPointsVersion,
        },
        data: {
          totalPoints: newBalance,
          totalPointsVersion: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        continue;
      }

      // 写入流水 (INSERT ONLY)
      const ledger = await this.prisma.pointLedger.create({
        data: {
          memberId,
          changeType: 'redeem',
          amount: -dto.amount,
          balanceAfter: newBalance,
          orderNo: dto.orderNo,
          productModel: dto.productModel ?? null,
          unitPrice: dto.unitPrice ?? null,
          remainingAmount: 0,
          remark: dto.remark ?? null,
        },
      });

      await this.auditLog.write({
        shopId,
        operatorId,
        module: 'point',
        action: 'redeem',
        targetType: 'point_ledger',
        targetId: String(ledger.id),
        detailJson: {
          memberId: Number(memberId),
          amount: dto.amount,
          orderNo: dto.orderNo,
          balanceAfter: newBalance,
          cashEquivalent: (dto.amount / 100).toFixed(2),
        },
        ipAddress: ip,
      });

      return {
        id: Number(ledger.id),
        memberId: Number(memberId),
        changeType: 'redeem',
        amount: -dto.amount,
        balanceAfter: newBalance,
        cashEquivalent: `${(dto.amount / 100).toFixed(2)} 元`,
        orderNo: dto.orderNo,
        createdAt: ledger.createdAt,
      };
    }

    throw new ConflictException('积分余额已被其他操作修改，请重试');
  }

  /** 积分回滚 (冲正指定流水记录) */
  async rollback(
    ledgerId: bigint,
    dto: PointRollbackDto,
    operatorId: bigint,
    shopId: bigint,
    ip?: string,
  ) {
    // 查找原始流水 (composite PK，用 findFirst)
    const original = await this.prisma.pointLedger.findFirst({
      where: { id: ledgerId },
      orderBy: { createdAt: 'desc' },
    });

    if (!original) {
      throw new NotFoundException('积分流水记录不存在');
    }

    // 只有 earn 和 redeem 类型可回滚
    if (original.changeType !== 'earn' && original.changeType !== 'redeem') {
      throw new UnprocessableEntityException(
        `该类型流水不支持回滚：${original.changeType}`,
      );
    }

    // 检查是否已被回滚 (查找关联回滚记录)
    const alreadyRolledBack = await this.prisma.pointLedger.findFirst({
      where: {
        memberId: original.memberId,
        changeType: 'manual_adjust',
        remark: { contains: `ROLLBACK:${ledgerId}` },
      },
    });

    if (alreadyRolledBack) {
      throw new ConflictException('该流水记录已被回滚');
    }

    const memberId = original.memberId;
    const reverseAmount = -original.amount; // 反向冲正

    // 最多重试3次
    for (let attempt = 0; attempt < 3; attempt++) {
      const member = await this.prisma.member.findUnique({
        where: { id: memberId, deletedAt: null },
      });

      if (!member) {
        throw new NotFoundException('会员不存在');
      }

      const newBalance = member.totalPoints + reverseAmount;

      if (newBalance < 0) {
        throw new UnprocessableEntityException(
          `回滚后积分余额为负 (${newBalance})，无法执行`,
        );
      }

      const updateResult = await this.prisma.member.updateMany({
        where: {
          id: memberId,
          totalPointsVersion: member.totalPointsVersion,
        },
        data: {
          totalPoints: newBalance,
          totalPointsVersion: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        continue;
      }

      // 写入冲正流水 (INSERT ONLY)
      const ledger = await this.prisma.pointLedger.create({
        data: {
          memberId,
          changeType: 'manual_adjust',
          amount: reverseAmount,
          balanceAfter: newBalance,
          orderNo: original.orderNo,
          productModel: original.productModel,
          unitPrice: original.unitPrice,
          remainingAmount: 0,
          remark: `ROLLBACK:${ledgerId} | ${dto.reason}`,
        },
      });

      await this.auditLog.write({
        shopId,
        operatorId,
        module: 'point',
        action: 'rollback',
        targetType: 'point_ledger',
        targetId: String(ledger.id),
        detailJson: {
          originalLedgerId: Number(ledgerId),
          originalChangeType: original.changeType,
          originalAmount: original.amount,
          reverseAmount,
          balanceAfter: newBalance,
          reason: dto.reason,
        },
        ipAddress: ip,
      });

      return {
        id: Number(ledger.id),
        memberId: Number(memberId),
        changeType: 'manual_adjust',
        amount: reverseAmount,
        balanceAfter: newBalance,
        originalLedgerId: Number(ledgerId),
        originalChangeType: original.changeType,
        originalAmount: original.amount,
        reason: dto.reason,
        createdAt: ledger.createdAt,
      };
    }

    throw new ConflictException('积分余额已被其他操作修改，请重试');
  }
}
