import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class DailyReconcileService {
  private readonly logger = new Logger(DailyReconcileService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 执行单类对账 */
  async runCheck(
    shopId: bigint,
    checkType: 'stock_vs_order' | 'points_vs_ledger' | 'payment_vs_order' | 'subsidy_vs_sales',
    operatorId: bigint,
  ) {
    const reconcileDate = new Date();
    reconcileDate.setHours(0, 0, 0, 0);

    let result: { expectedCount: number; actualCount: number; diffDetail?: any };

    switch (checkType) {
      case 'stock_vs_order':
        result = await this.checkStockVsOrder(shopId);
        break;
      case 'points_vs_ledger':
        result = await this.checkPointsVsLedger();
        break;
      case 'payment_vs_order':
        result = await this.checkPaymentVsOrder(shopId);
        break;
      case 'subsidy_vs_sales':
        result = await this.checkSubsidyVsSales(shopId);
        break;
      default:
        throw new BadRequestException(`未知对账类型: ${checkType}`);
    }

    const diffCount = result.expectedCount - result.actualCount;
    const status = diffCount === 0 ? 'pass' : 'fail';

    const record = await this.prisma.dailyReconcile.create({
      data: {
        shopId,
        reconcileDate,
        checkType,
        expectedCount: result.expectedCount,
        actualCount: result.actualCount,
        diffCount: Math.abs(diffCount),
        diffDetail: diffCount !== 0 ? (result.diffDetail ?? null) : undefined,
        status,
        resolvedBy: null,
      },
    });

    this.logger.log(
      `对账完成: ${checkType}, 状态=${status}, 差异=${diffCount}`,
    );

    return {
      id: Number(record.id),
      shopId: Number(record.shopId),
      checkType: record.checkType,
      expectedCount: record.expectedCount,
      actualCount: record.actualCount,
      diffCount: record.diffCount,
      status: record.status,
      reconcileDate: record.reconcileDate,
      createdAt: record.createdAt,
    };
  }

  /** 查询对账记录 */
  async findAll(shopId?: bigint, checkType?: string, startDate?: string, endDate?: string, page = 1, pageSize = 20) {
    const where: any = {};
    if (shopId) where.shopId = shopId;
    if (checkType) where.checkType = checkType;
    if (startDate || endDate) {
      where.reconcileDate = {};
      if (startDate) where.reconcileDate.gte = new Date(startDate);
      if (endDate) where.reconcileDate.lte = new Date(endDate);
    }

    const [items, total] = await Promise.all([
      this.prisma.dailyReconcile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { shop: { select: { id: true, name: true } } },
      }),
      this.prisma.dailyReconcile.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: Number(r.id),
        shopId: Number(r.shopId),
        shopName: r.shop?.name ?? null,
        checkType: r.checkType,
        expectedCount: r.expectedCount,
        actualCount: r.actualCount,
        diffCount: r.diffCount,
        status: r.status,
        reconcileDate: r.reconcileDate,
        resolvedBy: r.resolvedBy ? Number(r.resolvedBy) : null,
        createdAt: r.createdAt,
      })),
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 解决差异 */
  async resolve(id: bigint, operatorId: bigint) {
    const record = await this.prisma.dailyReconcile.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('对账记录不存在');
    if (record.status === 'pass') throw new BadRequestException('无差异无需解决');

    await this.prisma.dailyReconcile.update({
      where: { id },
      data: { resolvedBy: operatorId, resolvedAt: new Date() },
    });

    return { id: Number(id), message: '差异已标记为已处理' };
  }

  // ---- 各检查逻辑 ----

  private async checkStockVsOrder(shopId: bigint) {
    // 今日 sale_item 数量 vs 今日库存 sold 状态数量
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [soldStock, saleItems] = await Promise.all([
      this.prisma.imeiStock.count({
        where: { shopId, status: 'sold', updatedAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.saleItem.count({
        where: { createdAt: { gte: today, lt: tomorrow } },
      }),
    ]);

    return { expectedCount: soldStock, actualCount: saleItems };
  }

  private async checkPointsVsLedger() {
    // 总积分 vs 流水汇总
    const [members, ledgerSum] = await Promise.all([
      this.prisma.member.aggregate({
        where: { deletedAt: null },
        _sum: { totalPoints: true },
      }),
      this.prisma.pointLedger.aggregate({
        _sum: { amount: true },
      }),
    ]);

    const memberPoints = members._sum.totalPoints ?? 0;
    const ledgerPoints = ledgerSum._sum.amount ?? 0;

    return {
      expectedCount: memberPoints,
      actualCount: ledgerPoints,
      diffDetail: { memberTotal: memberPoints, ledgerTotal: ledgerPoints },
    };
  }

  private async checkPaymentVsOrder(shopId: bigint) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [paymentTotal, orderTotal] = await Promise.all([
      this.prisma.paymentFlow.aggregate({
        where: { shopId, createdAt: { gte: today, lt: tomorrow }, status: true },
        _sum: { amount: true },
      }),
      this.prisma.saleOrder.aggregate({
        where: { shopId, createdAt: { gte: today, lt: tomorrow }, deletedAt: null },
        _sum: { actualPaid: true },
      }),
    ]);

    return {
      expectedCount: Math.round(Number(paymentTotal._sum.amount ?? 0) * 100),
      actualCount: Math.round(Number(orderTotal._sum.actualPaid ?? 0) * 100),
    };
  }

  private async checkSubsidyVsSales(shopId: bigint) {
    const [subsidyTotal, salesSubsidyTotal] = await Promise.all([
      this.prisma.nationalSubsidy.aggregate({
        where: { shopId, status: { not: 'recalled' } },
        _sum: { approvedAmount: true },
      }),
      this.prisma.saleOrder.aggregate({
        where: { shopId, deletedAt: null },
        _sum: { totalSubsidy: true },
      }),
    ]);

    return {
      expectedCount: Math.round(Number(subsidyTotal._sum.approvedAmount ?? 0) * 100),
      actualCount: Math.round(Number(salesSubsidyTotal._sum.totalSubsidy ?? 0) * 100),
    };
  }
}
