import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AlertLevel } from '@prisma/client';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private recentAlerts = new Map<string, Date>(); // 冷却期内存缓存

  constructor(private prisma: PrismaService) {}

  /** 触发预警 */
  async fire(params: {
    shopId: bigint;
    ruleId?: bigint;
    alertType: string;
    level: AlertLevel;
    message: string;
    skuId?: bigint;
    currentStock?: number;
  }) {
    // 冷却检查
    const cooldownKey = `${params.shopId}_${params.alertType}_${params.skuId ?? 'global'}`;
    const cooldownMs = 240 * 60 * 1000; // 4小时
    const now = Date.now();

    // 惰性清理过期条目，防止 Map 无限增长
    for (const [key, time] of this.recentAlerts) {
      if (now - time.getTime() > cooldownMs * 2) {
        this.recentAlerts.delete(key);
      }
    }

    const lastAlert = this.recentAlerts.get(cooldownKey);
    if (lastAlert) {
      if (now - lastAlert.getTime() < cooldownMs) {
        return null; // 冷却中，不重复触发
      }
    }

    const record = await this.prisma.alertLog.create({
      data: {
        shopId: params.shopId,
        ruleId: params.ruleId ?? null,
        alertType: params.alertType,
        level: params.level,
        message: params.message,
        skuId: params.skuId ?? null,
        currentStock: params.currentStock ?? null,
      },
    });

    this.recentAlerts.set(cooldownKey, new Date());
    this.logger.warn(`预警触发: ${params.alertType} (${params.level}) — ${params.message}`);

    return {
      id: Number(record.id),
      shopId: Number(record.shopId),
      alertType: record.alertType,
      level: record.level,
      message: record.message,
      createdAt: record.createdAt,
    };
  }

  /** 查询预警日志 */
  async findAll(query: {
    shopId?: number; alertType?: string; level?: string;
    isResolved?: boolean; page?: number; pageSize?: number;
  }) {
    const { shopId, alertType, level, isResolved, page = 1, pageSize = 20 } = query;
    const where: any = {};

    if (shopId) where.shopId = BigInt(shopId);
    if (alertType) where.alertType = alertType;
    if (level) where.level = level;
    if (isResolved !== undefined) where.isResolved = isResolved;

    const [items, total] = await Promise.all([
      this.prisma.alertLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { shop: { select: { id: true, name: true } } },
      }),
      this.prisma.alertLog.count({ where }),
    ]);

    return {
      items: items.map((a) => ({
        id: Number(a.id),
        shopId: Number(a.shopId),
        shopName: a.shop?.name ?? null,
        alertType: a.alertType,
        level: a.level,
        message: a.message,
        skuId: a.skuId ? Number(a.skuId) : null,
        currentStock: a.currentStock,
        isResolved: a.isResolved,
        createdAt: a.createdAt,
      })),
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 解决预警 */
  async resolve(id: bigint) {
    await this.prisma.alertLog.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date() },
    });
    return { id: Number(id), message: '预警已处理' };
  }

  // ---- 自动巡检 ----

  /** 低库存巡检 */
  async checkLowStock(shopId: bigint) {
    const lowThreshold = 5;

    const stocks = await this.prisma.imeiStock.groupBy({
      by: ['skuId'],
      where: { shopId, status: 'in_stock' },
      _count: { id: true },
    });

    for (const s of stocks) {
      if (s._count.id <= lowThreshold) {
        if (!s.skuId) continue;
        const sku = await this.prisma.productSku.findUnique({
          where: { id: s.skuId },
          include: { product: true },
        }) as any;

        await this.fire({
          shopId,
          alertType: 'low_stock',
          level: s._count.id === 0 ? 'urgent' : 'warning',
          message: `${sku?.product?.brand ?? ''} ${sku?.product?.model ?? ''} (${sku?.color ?? ''} ${sku?.spec ?? ''}) 仅剩 ${s._count.id} 台库存`,
          skuId: s.skuId,
          currentStock: s._count.id,
        });
      }
    }

    return { checked: stocks.length, message: '低库存巡检完成' };
  }

  /** 负毛利巡检 */
  async checkNegativeProfit(shopId: bigint) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const negativeOrders = await this.prisma.saleOrder.findMany({
      where: {
        shopId,
        deletedAt: null,
        createdAt: { gte: today },
        grossProfit: { lt: 0 },
      },
      include: { saleItems: { include: { sku: { include: { product: true } } } } },
    });

    for (const order of negativeOrders) {
      const item = order.saleItems[0];
      await this.fire({
        shopId,
        alertType: 'negative_profit',
        level: 'warning',
        message: `订单 #${order.orderNo} 负毛利 ¥${Number(order.grossProfit).toFixed(2)}: ${item?.sku.product.brand ?? ''} ${item?.sku.product.model ?? ''}`,
      });
    }

    return { negativeCount: negativeOrders.length, message: '负毛利巡检完成' };
  }
}
