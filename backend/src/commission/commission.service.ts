import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CommissionQueryDto } from './dto/commission-query.dto';
import { CreateCommissionRuleDto, UpdateCommissionRuleDto } from './dto/commission-rule.dto';
import { CommissionCalculateDto } from './dto/commission-calculate.dto';
import { CommissionRollbackDto } from './dto/commission-rollback.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CommissionService {
  private readonly DEFAULT_RATE = 5; // 默认提成比例 5%

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ============================================================
  // 提成流水查询
  // ============================================================

  /** 提成流水列表 (分页+筛选) */
  async findAll(query: CommissionQueryDto) {
    const {
      shopId, salespersonId, settlementPeriod, status, orderNo,
      startDate, endDate, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * pageSize;

    const allowedSortFields = ['createdAt', 'estimatedCommission', 'actualCommission', 'id'];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = {};

    if (shopId) where.shopId = BigInt(shopId);
    if (salespersonId) where.salespersonId = BigInt(salespersonId);
    if (settlementPeriod) where.settlementPeriod = settlementPeriod;
    if (status) where.status = status;
    if (orderNo) where.orderNo = orderNo;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate + 'T00:00:00+08:00');
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59+08:00');
    }

    const [items, total, aggregation] = await Promise.all([
      this.prisma.commissionLedger.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderBy]: orderDir },
        include: {
          salesperson: { select: { id: true, name: true, phone: true } },
          order: { select: { orderNo: true, totalAmount: true, grossProfit: true } },
        },
      }),
      this.prisma.commissionLedger.count({ where }),
      this.prisma.commissionLedger.aggregate({
        where,
        _sum: { estimatedCommission: true, actualCommission: true },
      }),
    ]);

    return {
      items: items.map((r) => ({
        id: Number(r.id),
        shopId: Number(r.shopId),
        salespersonId: Number(r.salespersonId),
        salespersonName: r.salesperson?.name ?? null,
        settlementPeriod: r.settlementPeriod,
        orderNo: r.orderNo,
        orderAmount: r.order ? Number(r.order.totalAmount) : null,
        orderProfit: r.order ? Number(r.order.grossProfit) : null,
        estimatedCommission: Number(r.estimatedCommission),
        adjustment: Number(r.adjustment),
        actualCommission: Number(r.actualCommission),
        status: r.status,
        confirmedBy: r.confirmedBy ? Number(r.confirmedBy) : null,
        confirmedAt: r.confirmedAt,
        createdAt: r.createdAt,
      })),
      summary: {
        totalEstimated: aggregation._sum.estimatedCommission
          ? Number(aggregation._sum.estimatedCommission)
          : 0,
        totalActual: aggregation._sum.actualCommission
          ? Number(aggregation._sum.actualCommission)
          : 0,
      },
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 提成流水详情 */
  async findOne(id: bigint) {
    const record = await this.prisma.commissionLedger.findUnique({
      where: { id },
      include: {
        shop: { select: { id: true, name: true } },
        salesperson: { select: { id: true, name: true, phone: true } },
        order: {
          select: {
            orderNo: true,
            totalAmount: true,
            totalCostSnapshot: true,
            totalSubsidy: true,
            grossProfit: true,
            actualPaid: true,
            paymentMethod: true,
            returnStatus: true,
            createdAt: true,
          },
        },
        confirmer: { select: { id: true, name: true } },
      },
    });

    if (!record) {
      throw new NotFoundException('提成记录不存在');
    }

    return {
      id: Number(record.id),
      shop: { id: Number(record.shop.id), name: record.shop.name },
      salesperson: {
        id: Number(record.salesperson.id),
        name: record.salesperson.name,
        phone: record.salesperson.phone,
      },
      settlementPeriod: record.settlementPeriod,
      order: {
        orderNo: record.order.orderNo,
        totalAmount: Number(record.order.totalAmount),
        totalCostSnapshot: Number(record.order.totalCostSnapshot),
        totalSubsidy: Number(record.order.totalSubsidy),
        grossProfit: Number(record.order.grossProfit),
        actualPaid: Number(record.order.actualPaid),
        paymentMethod: record.order.paymentMethod,
        returnStatus: record.order.returnStatus,
        createdAt: record.order.createdAt,
      },
      estimatedCommission: Number(record.estimatedCommission),
      adjustment: Number(record.adjustment),
      actualCommission: Number(record.actualCommission),
      status: record.status,
      confirmedBy: record.confirmer ? { id: Number(record.confirmer.id), name: record.confirmer.name } : null,
      confirmedAt: record.confirmedAt,
      createdAt: record.createdAt,
    };
  }

  /** 结算周期汇总 (按销售人员聚合) */
  async getSettlementSummary(period: string, shopId?: bigint) {
    const where: any = { settlementPeriod: period };
    if (shopId) where.shopId = shopId;

    const records = await this.prisma.commissionLedger.findMany({
      where,
      include: {
        salesperson: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { salespersonId: 'asc' },
    });

    // 按销售人员聚合
    const grouped = new Map<bigint, {
      salespersonId: bigint;
      salespersonName: string;
      salespersonPhone: string;
      totalEstimated: number;
      totalAdjustment: number;
      totalActual: number;
      pendingCount: number;
      confirmedCount: number;
      paidCount: number;
      details: any[];
    }>();

    for (const r of records) {
      const key = r.salespersonId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          salespersonId: r.salespersonId,
          salespersonName: r.salesperson?.name ?? '未知',
          salespersonPhone: r.salesperson?.phone ?? '',
          totalEstimated: 0,
          totalAdjustment: 0,
          totalActual: 0,
          pendingCount: 0,
          confirmedCount: 0,
          paidCount: 0,
          details: [],
        });
      }

      const entry = grouped.get(key)!;
      entry.totalEstimated += Number(r.estimatedCommission);
      entry.totalAdjustment += Number(r.adjustment);
      entry.totalActual += Number(r.actualCommission);

      if (r.status === 'pending') entry.pendingCount++;
      else if (r.status === 'confirmed') entry.confirmedCount++;
      else if (r.status === 'paid') entry.paidCount++;

      entry.details.push({
        id: Number(r.id),
        orderNo: r.orderNo,
        estimatedCommission: Number(r.estimatedCommission),
        actualCommission: Number(r.actualCommission),
        status: r.status,
      });
    }

    return {
      period,
      shopId: shopId ? Number(shopId) : null,
      salespersonCount: grouped.size,
      grandTotalEstimated: [...grouped.values()].reduce((s, e) => s + e.totalEstimated, 0),
      grandTotalActual: [...grouped.values()].reduce((s, e) => s + e.totalActual, 0),
      salespersons: [...grouped.values()].map((e) => ({
        salespersonId: Number(e.salespersonId),
        salespersonName: e.salespersonName,
        salespersonPhone: e.salespersonPhone,
        totalEstimated: e.totalEstimated,
        totalAdjustment: e.totalAdjustment,
        totalActual: e.totalActual,
        pendingCount: e.pendingCount,
        confirmedCount: e.confirmedCount,
        paidCount: e.paidCount,
        detailCount: e.details.length,
      })),
    };
  }

  // ============================================================
  // 提成计算
  // ============================================================

  /** 规则匹配 + 提成试算 */
  async calculatePreview(dto: CommissionCalculateDto) {
    const { brand, model, salePrice, costPrice = 0, subsidyAmount = 0, quantity = 1 } = dto;

    const grossProfit = salePrice - costPrice + subsidyAmount;

    // 匹配规则
    const rules = await this.prisma.commissionRule.findMany({
      where: { status: true },
      orderBy: { priority: 'desc' },
    });

    let matchedRule: any = null;
    for (const rule of rules) {
      if (rule.brand && brand && rule.brand !== brand) continue;
      if (rule.model && model && rule.model !== model) continue;
      if (rule.minPrice && salePrice < Number(rule.minPrice)) continue;
      if (rule.maxPrice && salePrice > Number(rule.maxPrice)) continue;
      matchedRule = rule;
      break;
    }

    const commissionType = matchedRule?.commissionType ?? 'percentage';
    const commissionValue = matchedRule ? Number(matchedRule.commissionValue) : this.DEFAULT_RATE;

    let unitCommission: number;
    let basis: string;

    switch (commissionType) {
      case 'fixed':
        unitCommission = commissionValue;
        basis = '台数';
        break;
      case 'tiered':
        unitCommission = Math.round(grossProfit * commissionValue) / 100;
        basis = '毛利';
        break;
      case 'percentage':
      default:
        unitCommission = Math.round(salePrice * commissionValue * 100) / 10000;
        basis = '金额';
        break;
    }

    const totalCommission = Math.round(unitCommission * quantity * 100) / 100;

    return {
      input: { brand, model, salePrice, costPrice, subsidyAmount, grossProfit, quantity },
      matchedRule: matchedRule
        ? {
            id: Number(matchedRule.id),
            brand: matchedRule.brand,
            model: matchedRule.model,
            commissionType: matchedRule.commissionType,
            commissionValue: Number(matchedRule.commissionValue),
            priority: matchedRule.priority,
            basis,
          }
        : {
            id: null,
            brand: null,
            model: null,
            commissionType: 'percentage',
            commissionValue: this.DEFAULT_RATE,
            priority: 0,
            basis: '金额',
            remark: '无匹配规则，使用默认5%按金额计算',
          },
      calculation: {
        basis,
        commissionType,
        commissionValue,
        unitCommission,
        quantity,
        formula:
          commissionType === 'fixed'
            ? `${commissionValue} 元/台 × ${quantity} 台`
            : commissionType === 'tiered'
              ? `${grossProfit.toFixed(2)} × ${commissionValue}% × ${quantity} 台`
              : `${salePrice.toFixed(2)} × ${commissionValue}% × ${quantity} 台`,
      },
      estimatedCommission: totalCommission,
    };
  }

  // ============================================================
  // 提成规则管理
  // ============================================================

  /** 规则列表 */
  async findAllRules() {
    const rules = await this.prisma.commissionRule.findMany({
      orderBy: [{ status: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });

    return rules.map((r) => ({
      id: Number(r.id),
      brand: r.brand,
      model: r.model,
      minPrice: r.minPrice ? Number(r.minPrice) : null,
      maxPrice: r.maxPrice ? Number(r.maxPrice) : null,
      commissionType: r.commissionType,
      commissionValue: Number(r.commissionValue),
      priority: r.priority,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** 创建规则 */
  async createRule(dto: CreateCommissionRuleDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const rule = await this.prisma.commissionRule.create({
      data: {
        brand: dto.brand ?? null,
        model: dto.model ?? null,
        minPrice: dto.minPrice ?? null,
        maxPrice: dto.maxPrice ?? null,
        commissionType: dto.commissionType as any,
        commissionValue: dto.commissionValue,
        priority: dto.priority ?? 0,
      },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: 'create_rule',
      targetType: 'commission_rule',
      targetId: String(rule.id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return {
      id: Number(rule.id),
      brand: rule.brand,
      model: rule.model,
      minPrice: rule.minPrice ? Number(rule.minPrice) : null,
      maxPrice: rule.maxPrice ? Number(rule.maxPrice) : null,
      commissionType: rule.commissionType,
      commissionValue: Number(rule.commissionValue),
      priority: rule.priority,
      status: rule.status,
      createdAt: rule.createdAt,
    };
  }

  /** 更新规则 */
  async updateRule(id: bigint, dto: UpdateCommissionRuleDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('提成规则不存在');
    }

    const data: any = {};
    if (dto.brand !== undefined) data.brand = dto.brand;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.minPrice !== undefined) data.minPrice = dto.minPrice;
    if (dto.maxPrice !== undefined) data.maxPrice = dto.maxPrice;
    if (dto.commissionType !== undefined) data.commissionType = dto.commissionType;
    if (dto.commissionValue !== undefined) data.commissionValue = dto.commissionValue;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.status !== undefined) data.status = dto.status;

    const rule = await this.prisma.commissionRule.update({ where: { id }, data });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: 'update_rule',
      targetType: 'commission_rule',
      targetId: String(id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return {
      id: Number(rule.id),
      brand: rule.brand,
      model: rule.model,
      minPrice: rule.minPrice ? Number(rule.minPrice) : null,
      maxPrice: rule.maxPrice ? Number(rule.maxPrice) : null,
      commissionType: rule.commissionType,
      commissionValue: Number(rule.commissionValue),
      priority: rule.priority,
      status: rule.status,
      updatedAt: rule.updatedAt,
    };
  }

  /** 启用/禁用规则 */
  async toggleRule(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('提成规则不存在');
    }

    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: { status: !existing.status },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: rule.status ? 'enable_rule' : 'disable_rule',
      targetType: 'commission_rule',
      targetId: String(id),
      detailJson: { previousStatus: existing.status, newStatus: rule.status },
      ipAddress: ip,
    });

    return {
      id: Number(rule.id),
      status: rule.status,
      message: rule.status ? '规则已启用' : '规则已禁用',
    };
  }

  // ============================================================
  // 提成确认
  // ============================================================

  /** 确认单条提成 */
  async confirmLedger(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const existing = await this.prisma.commissionLedger.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('提成记录不存在');
    }

    if (existing.status !== 'pending') {
      throw new UnprocessableEntityException(`当前状态为 ${existing.status}，不可确认`);
    }

    const record = await this.prisma.commissionLedger.update({
      where: { id },
      data: {
        status: 'confirmed',
        confirmedBy: operatorId,
        confirmedAt: new Date(),
      },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: 'confirm',
      targetType: 'commission_ledger',
      targetId: String(id),
      detailJson: { orderNo: record.orderNo, actualCommission: Number(record.actualCommission) },
      ipAddress: ip,
    });

    return {
      id: Number(record.id),
      orderNo: record.orderNo,
      status: record.status,
      actualCommission: Number(record.actualCommission),
      confirmedAt: record.confirmedAt,
    };
  }

  /** 批量确认 (按结算周期+销售人员) */
  async batchConfirm(
    period: string,
    salespersonId: bigint,
    operatorId: bigint,
    shopId: bigint,
    ip?: string,
  ) {
    const pendingRecords = await this.prisma.commissionLedger.findMany({
      where: { settlementPeriod: period, salespersonId, status: 'pending' },
      select: { id: true },
    });

    if (pendingRecords.length === 0) {
      throw new NotFoundException('该周期无待确认提成记录');
    }

    const ids = pendingRecords.map((r) => r.id);
    const now = new Date();

    await this.prisma.commissionLedger.updateMany({
      where: { id: { in: ids } },
      data: { status: 'confirmed', confirmedBy: operatorId, confirmedAt: now },
    });

    const aggregation = await this.prisma.commissionLedger.aggregate({
      where: { id: { in: ids } },
      _sum: { actualCommission: true },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: 'batch_confirm',
      targetType: 'commission_ledger',
      targetId: `${period}/${salespersonId}`,
      detailJson: { period, salespersonId: Number(salespersonId), count: ids.length, totalActual: Number(aggregation._sum.actualCommission ?? 0) },
      ipAddress: ip,
    });

    return {
      period,
      salespersonId: Number(salespersonId),
      confirmedCount: ids.length,
      totalActual: aggregation._sum.actualCommission ? Number(aggregation._sum.actualCommission) : 0,
      confirmedAt: now,
    };
  }

  // ============================================================
  // 提成回滚
  // ============================================================

  /** 按订单回滚提成 (用于退货/取消场景) */
  async rollbackByOrder(
    orderNo: string,
    dto: CommissionRollbackDto,
    operatorId: bigint,
    shopId: bigint,
    ip?: string,
  ) {
    const records = await this.prisma.commissionLedger.findMany({
      where: { orderNo },
    });

    if (records.length === 0) {
      throw new NotFoundException('该订单无提成记录');
    }

    // 检查是否有已支付不可回滚的
    const paidRecords = records.filter((r) => r.status === 'paid');
    if (paidRecords.length > 0) {
      throw new UnprocessableEntityException('存在已支付的提成记录，需先撤销支付');
    }

    const now = new Date();
    const ids = records.map((r) => r.id);
    const totalRollback = records.reduce((s, r) => s + Number(r.actualCommission), 0);

    await this.prisma.commissionLedger.updateMany({
      where: { id: { in: ids } },
      data: {
        adjustment: 0,
        actualCommission: 0,
        status: 'pending',
      },
    });

    // 同步更新对应订单的 totalCommission
    await this.prisma.saleOrder.updateMany({
      where: { orderNo },
      data: { totalCommission: 0 },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: 'rollback_order',
      targetType: 'commission_ledger',
      targetId: orderNo,
      detailJson: {
        orderNo,
        reason: dto.reason,
        recordCount: ids.length,
        totalRollback,
        rolledBackIds: ids.map(Number),
      },
      ipAddress: ip,
    });

    return {
      orderNo,
      rolledBackCount: ids.length,
      totalRollback,
      reason: dto.reason,
      rolledBackAt: now,
    };
  }

  /** 按流水回滚单条提成 */
  async rollbackByLedger(
    id: bigint,
    dto: CommissionRollbackDto,
    operatorId: bigint,
    shopId: bigint,
    ip?: string,
  ) {
    const existing = await this.prisma.commissionLedger.findUnique({
      where: { id },
      include: { order: { select: { orderNo: true } } },
    });

    if (!existing) {
      throw new NotFoundException('提成记录不存在');
    }

    if (existing.status === 'paid') {
      throw new UnprocessableEntityException('提成已支付，需先撤销支付再回滚');
    }

    const rollbackAmount = Number(existing.actualCommission);

    await this.prisma.$transaction(async (tx) => {
      await tx.commissionLedger.update({
        where: { id },
        data: {
          adjustment: 0,
          actualCommission: 0,
          status: 'pending',
        },
      });

      // 更新订单的 totalCommission
      const remainingCommission = await tx.commissionLedger.aggregate({
        where: { orderNo: existing.orderNo },
        _sum: { actualCommission: true },
      });

      await tx.saleOrder.updateMany({
        where: { orderNo: existing.orderNo },
        data: { totalCommission: remainingCommission._sum.actualCommission ?? 0 },
      });
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'commission',
      action: 'rollback_ledger',
      targetType: 'commission_ledger',
      targetId: String(id),
      detailJson: {
        orderNo: existing.orderNo,
        reason: dto.reason,
        rollbackAmount,
        salespersonId: Number(existing.salespersonId),
      },
      ipAddress: ip,
    });

    return {
      id: Number(id),
      orderNo: existing.orderNo,
      rollbackAmount,
      reason: dto.reason,
      rolledBackAt: new Date(),
    };
  }
}
