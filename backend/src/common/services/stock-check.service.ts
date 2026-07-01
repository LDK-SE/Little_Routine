import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

@Injectable()
export class StockCheckService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 创建盘点任务 */
  async create(params: {
    shopId: bigint; type: string; operatorId: bigint; category?: string;
  }) {
    // 如果是按品类盘点，统计预期数量
    let expectedCount = 0;
    if (params.type === 'category' && params.category) {
      expectedCount = await this.prisma.imeiStock.count({
        where: {
          shopId: params.shopId,
          status: 'in_stock',
          sku: { product: { category: params.category } },
        },
      });
    } else {
      expectedCount = await this.prisma.imeiStock.count({
        where: { shopId: params.shopId, status: { in: ['in_stock', 'locked'] } },
      });
    }

    const record = await this.prisma.$transaction(async (tx) => {
      const checkNo = await this.generateCheckNo(tx);

      return tx.stockCheck.create({
        data: {
          shopId: params.shopId,
          checkNo,
          type: params.type as any,
          operatorId: params.operatorId,
          status: 'in_progress',
          expectedCount,
        },
      });
    });

    await this.auditLog.write({
      shopId: params.shopId,
      operatorId: params.operatorId,
      module: 'stock_check',
      action: 'create',
      targetType: 'stock_check',
      targetId: String(record.id),
      detailJson: { checkNo: record.checkNo, type: params.type, expectedCount },
    });

    return {
      id: Number(record.id),
      checkNo: record.checkNo,
      type: record.type,
      status: record.status,
      expectedCount: record.expectedCount,
      createdAt: record.createdAt,
    };
  }

  /** 盘点单列表 */
  async findAll(query: {
    shopId?: number; status?: string; page?: number; pageSize?: number;
  }) {
    const { shopId, status, page = 1, pageSize = 20 } = query;
    const where: any = {};
    if (shopId) where.shopId = BigInt(shopId);
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.stockCheck.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          operator: { select: { id: true, name: true } },
          shop: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockCheck.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: Number(c.id),
        shopId: Number(c.shopId),
        shopName: c.shop?.name ?? null,
        checkNo: c.checkNo,
        type: c.type,
        status: c.status,
        operatorName: c.operator?.name ?? null,
        expectedCount: c.expectedCount,
        actualCount: c.actualCount,
        surplusCount: c.surplusCount,
        deficitCount: c.deficitCount,
        createdAt: c.createdAt,
      })),
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 盘点单详情 */
  async findOne(id: bigint) {
    const record = await this.prisma.stockCheck.findUnique({
      where: { id },
      include: {
        shop: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
        items: { include: { check: false } },
      },
    });

    if (!record) throw new NotFoundException('盘点单不存在');

    return {
      id: Number(record.id),
      checkNo: record.checkNo,
      type: record.type,
      status: record.status,
      shop: { id: Number(record.shop.id), name: record.shop.name },
      operator: { id: Number(record.operator.id), name: record.operator.name },
      expectedCount: record.expectedCount,
      actualCount: record.actualCount,
      surplusCount: record.surplusCount,
      deficitCount: record.deficitCount,
      items: record.items.map((i) => ({
        id: Number(i.id),
        imei: i.imei.length > 8 ? i.imei.slice(0, 6) + '****' + i.imei.slice(-4) : i.imei,
        systemStatus: i.systemStatus,
        actualStatus: i.actualStatus,
        systemLocation: i.systemLocation,
        actualLocation: i.actualLocation,
        remark: i.remark,
      })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** 盘点录入 (扫码一个 IMEI) */
  async scanItem(checkId: bigint, imei: string, actualStatus: string, actualLocation?: string, remark?: string) {
    const check = await this.prisma.stockCheck.findUnique({ where: { id: checkId } });
    if (!check) throw new NotFoundException('盘点单不存在');
    if (check.status !== 'in_progress') throw new UnprocessableEntityException('盘点单非进行中');

    const systemRecord = await this.prisma.imeiStock.findUnique({
      where: { imei },
    });

    await this.prisma.stockCheckItem.create({
      data: {
        checkId,
        imei,
        systemStatus: systemRecord?.status ?? null,
        actualStatus: actualStatus as any,
        systemLocation: systemRecord?.location ?? null,
        actualLocation: actualLocation ?? null,
        remark: remark ?? null,
      },
    });

    return {
      checkId: Number(checkId),
      imei: imei.length > 8 ? imei.slice(0, 6) + '****' + imei.slice(-4) : imei,
      systemStatus: systemRecord?.status ?? 'unknown',
      actualStatus,
    };
  }

  /** 提交盘点结果 */
  async commit(checkId: bigint) {
    const check = await this.prisma.stockCheck.findUnique({
      where: { id: checkId },
      include: { items: true },
    });

    if (!check) throw new NotFoundException('盘点单不存在');
    if (check.status !== 'in_progress') throw new UnprocessableEntityException('盘点单已提交');

    const foundItems = check.items.filter((i) => i.actualStatus === 'found').length;
    const missingItems = check.items.filter((i) => i.actualStatus === 'missing').length;
    const extraItems = check.items.filter((i) => i.actualStatus === 'extra').length;
    const wrongLocationItems = check.items.filter((i) => i.actualStatus === 'wrong_location').length;
    const damagedItems = check.items.filter((i) => i.actualStatus === 'damaged').length;

    // 实物数量 = 找到的 + 多出的 + 错位的 + 损坏的（均被实际观察到）
    const actualCount = foundItems + extraItems + wrongLocationItems + damagedItems;
    const deficitCount = missingItems; // 系统有但实物没有
    const surplusCount = extraItems; // 系统无但实物有

    const updated = await this.prisma.stockCheck.update({
      where: { id: checkId },
      data: {
        status: 'committed',
        actualCount,
        surplusCount,
        deficitCount,
      },
    });

    return {
      id: Number(updated.id),
      checkNo: updated.checkNo,
      status: updated.status,
      expectedCount: updated.expectedCount,
      actualCount,
      surplusCount,
      deficitCount,
      foundCount: foundItems,
      wrongLocationCount: wrongLocationItems,
      damagedCount: damagedItems,
    };
  }

  /** 确认盘点 */
  async confirm(checkId: bigint, confirmedBy: bigint) {
    const check = await this.prisma.stockCheck.findUnique({ where: { id: checkId } });
    if (!check) throw new NotFoundException('盘点单不存在');
    if (check.status !== 'committed') throw new UnprocessableEntityException('需先提交盘点结果');

    const updated = await this.prisma.stockCheck.update({
      where: { id: checkId },
      data: { status: 'confirmed', confirmedBy, confirmedAt: new Date() },
    });

    return {
      id: Number(updated.id),
      checkNo: updated.checkNo,
      status: updated.status,
      confirmedAt: updated.confirmedAt,
      message: '盘点已确认',
    };
  }

  private async generateCheckNo(tx?: any): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const client = tx ?? this.prisma;
    const todayCount = await client.stockCheck.count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    });
    return `CK${dateStr}${String(todayCount + 1).padStart(4, '0')}`;
  }
}
