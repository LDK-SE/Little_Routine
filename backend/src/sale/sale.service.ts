import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateSaleOrderDto } from './dto/create-sale-order.dto';
import { SaleOrderQueryDto } from './dto/sale-order-query.dto';
import { maskImei, maskPhone } from '../common/utils/mask';

@Injectable()
export class SaleService {
  private readonly COMMISSION_RATE = 0.05; // 5% 提成比例
  private readonly POINTS_RATE = 10; // 每10元积1分

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * 扫码出库 — 核心销售事务
   *
   * 原子化步骤（全部在同一事务内）：
   * 1. 校验 IMEI（必须为 locked/in_stock）
   * 2. 乐观锁扣减库存（IMEI → sold）
   * 3. 固化成本价
   * 4. 校验售价（低于成本需审批）
   * 5. 计算提成
   * 6. 计算毛利 = salePrice - costPrice + subsidy - commission
   * 7. 创建销售单 + 销售明细
   * 8. 创建支付流水
   * 9. 处理以旧换新（可选）
   * 10. 处理国补（可选）
   * 11. 生成会员积分（获取+抵扣）
   * 12. 生成提成记录
   * 13. 写入库存流水
   * 14. 记录审计日志
   *
   * 任何步骤失败 → 全部回滚
   */
  async createSale(dto: CreateSaleOrderDto, operatorId: bigint, shopId: bigint, ip?: string) {
    // ---- 前置校验（事务外） ----

    // 查询 IMEI 信息
    const imeiRecord = await this.prisma.imeiStock.findUnique({
      where: { imei: dto.imei },
      include: { sku: { include: { product: true } } },
    });

    if (!imeiRecord) {
      throw new NotFoundException('IMEI不存在');
    }
    if (!imeiRecord.sku) {
      throw new UnprocessableEntityException('该IMEI未关联SKU，无法销售');
    }
    const sku = imeiRecord.sku;

    const sellableStatuses = ['in_stock', 'locked'];
    if (!sellableStatuses.includes(imeiRecord.status)) {
      const msg: Record<string, string> = {
        pending_audit: '待审核',
        sold: '已销售',
        returned: '已退货',
        scrapped: '已报废',
      };
      throw new ConflictException(`该IMEI${msg[imeiRecord.status] ?? '状态异常'}，无法出库`);
    }

    // 校验售价
    const minSalePrice = sku.minSalePrice
      ? Number(sku.minSalePrice)
      : null;
    const costPrice = imeiRecord.costPrice ? Number(imeiRecord.costPrice) : 0;

    if (minSalePrice && dto.salePrice < minSalePrice) {
      throw new UnprocessableEntityException(
        `售价 ${dto.salePrice} 低于最低限价 ${minSalePrice}`,
      );
    }

    // 售价低于成本警告（不阻断，记录即可）
    const belowCost = dto.salePrice < costPrice;

    // 会员校验
    let member: any = null;
    if (dto.memberPhone) {
      member = await this.prisma.member.findUnique({
        where: { phone: dto.memberPhone, deletedAt: null },
      });
      if (!member) {
        throw new NotFoundException('会员不存在');
      }

      if (dto.pointsToUse && dto.pointsToUse > 0) {
        if (member.totalPoints < dto.pointsToUse) {
          throw new UnprocessableEntityException(
            `积分不足：当前 ${member.totalPoints} 分，欲使用 ${dto.pointsToUse} 分`,
          );
        }
      }
    }

    // 校验收款金额合计
    const paymentsTotal = dto.payments.reduce((s, p) => s + p.amount, 0);
    const expectedTotal = dto.salePrice - (dto.tradeIn?.actualDeduction ?? 0) - (dto.subsidyAmount ?? 0);
    if (Math.abs(paymentsTotal - expectedTotal) > 0.01) {
      throw new BadRequestException(
        `收款合计 ${paymentsTotal} 不等于应收 ${expectedTotal}`,
      );
    }

    // ---- 核心事务 ----
    const commission = Math.round(dto.salePrice * this.COMMISSION_RATE * 100) / 100;
    const grossProfit = dto.salePrice - costPrice + (dto.subsidyAmount ?? 0) - commission;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const orderNo = await this.generateOrderNo('SO', tx);
        // 1. 乐观锁：IMEI 状态 → sold
        const updateResult = await tx.imeiStock.updateMany({
          where: {
            imei: dto.imei,
            version: imeiRecord.version,
            status: { in: sellableStatuses as any },
          },
          data: {
            status: 'sold',
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException('并发冲突：IMEI状态已变更，请重试');
        }

        // 2. 创建销售单
        const order = await tx.saleOrder.create({
          data: {
            shopId,
            orderNo,
            memberId: member ? member.id : null,
            salespersonId: operatorId,
            totalAmount: dto.salePrice,
            totalCostSnapshot: costPrice,
            totalSubsidy: dto.subsidyAmount ?? 0,
            totalCommission: commission,
            grossProfit,
            actualPaid: paymentsTotal,
            pointsUsedTotal: dto.pointsToUse ?? 0,
            paymentMethod: dto.payments.length === 1
              ? (dto.payments[0].method as any)
              : 'alipay', // 组合支付用 alipay 占位
          },
        });

        // 3. 创建销售明细（固化成本）
        await tx.saleItem.create({
          data: {
            orderId: order.id,
            imei: dto.imei,
            skuId: sku.id,
            salePrice: dto.salePrice,
            costPriceSnapshot: costPrice,
            subsidyIncome: dto.subsidyAmount ?? 0,
            commission,
            grossProfit,
          },
        });

        // 4. 批量创建支付流水
        const paymentRecords: any[] = [];
        for (const p of dto.payments) {
          const paymentNo = await this.generateNo(tx, 'PF');
          const record = await tx.paymentFlow.create({
            data: {
              shopId,
              paymentNo,
              orderNo,
              method: p.method as any,
              amount: p.amount,
            },
          });
          paymentRecords.push(record);
        }

        // 5. 以旧换新（可选）
        let tradeInRecord: any = null;
        if (dto.tradeIn) {
          tradeInRecord = await tx.tradeInOrder.create({
            data: {
              shopId,
              orderNo,
              oldImei: dto.tradeIn.oldImei ?? null,
              oldBrand: dto.tradeIn.oldBrand ?? null,
              oldModel: dto.tradeIn.oldModel ?? null,
              oldCondition: dto.tradeIn.oldCondition ?? null,
              appraisedValue: dto.tradeIn.appraisedValue,
              actualDeduction: dto.tradeIn.actualDeduction,
            },
          });
        }

        // 6. 国补记录（可选）
        let subsidyRecord: any = null;
        if (dto.subsidyAmount && dto.subsidyAmount > 0) {
          const subsidyNo = await this.generateNo(tx, 'NS');
          subsidyRecord = await tx.nationalSubsidy.create({
            data: {
              shopId,
              subsidyNo,
              orderNo,
              imei: dto.imei,
              appliedAmount: dto.subsidyAmount,
              status: 'pending_submit',
            },
          });
        }

        // 7. 会员积分处理
        let pointsEarned = 0;
        if (member) {
          // 积分获取 = floor((salePrice - subsidy) / 10)
          pointsEarned = Math.floor((dto.salePrice - (dto.subsidyAmount ?? 0)) / this.POINTS_RATE);

          if (pointsEarned > 0) {
            await tx.pointLedger.create({
              data: {
                memberId: member.id,
                changeType: 'earn',
                amount: pointsEarned,
                balanceAfter: member.totalPoints + pointsEarned - (dto.pointsToUse ?? 0),
                orderNo,
                productModel: `${sku.product.brand} ${sku.product.model}`,
                unitPrice: dto.salePrice,
                quantity: 1,
                remainingAmount: pointsEarned,
              },
            });
          }

          // 积分抵扣
          if (dto.pointsToUse && dto.pointsToUse > 0) {
            await tx.pointLedger.create({
              data: {
                memberId: member.id,
                changeType: 'redeem',
                amount: -dto.pointsToUse,
                balanceAfter: member.totalPoints + pointsEarned - dto.pointsToUse,
                orderNo,
                productModel: `${sku.product.brand} ${sku.product.model}`,
                unitPrice: dto.salePrice,
                quantity: 1,
                remainingAmount: 0,
              },
            });
          }

          // 更新会员总积分（乐观锁）
          const memberUpdateResult = await tx.member.updateMany({
            where: {
              id: member.id,
              totalPointsVersion: member.totalPointsVersion,
            },
            data: {
              totalPoints: member.totalPoints + pointsEarned - (dto.pointsToUse ?? 0),
              totalPointsVersion: { increment: 1 },
              lastPurchaseModel: `${sku.product.brand} ${sku.product.model}`,
            },
          });

          if (memberUpdateResult.count === 0) {
            throw new ConflictException('会员积分变更冲突，请重试');
          }
        }

        // 8. 生成提成记录
        const settlementPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
        await tx.commissionLedger.create({
          data: {
            shopId,
            salespersonId: operatorId,
            settlementPeriod,
            orderNo,
            estimatedCommission: commission,
            actualCommission: commission,
            status: 'pending',
          },
        });

        // 9. 库存流水
        await tx.stockLedger.create({
          data: {
            shopId,
            imei: dto.imei,
            changeType: 'outbound',
            fromStatus: imeiRecord.status,
            toStatus: 'sold',
            operatorId,
            orderNo,
            remark: `销售出库：${sku.product.brand} ${sku.product.model} ¥${dto.salePrice}`,
          },
        });

        return {
          order, tradeInRecord, subsidyRecord, paymentRecords,
          pointsEarned, imeiRecord,
        };
      });

      // 审计日志（事务外，失败不影响主流程）
      await this.auditLog.write({
        shopId, operatorId, module: 'sale', action: 'create_order',
        targetType: 'sale_order', targetId: result.order.orderNo,
        detailJson: {
          imei: dto.imei, salePrice: dto.salePrice, costPrice,
          commission, grossProfit, pointsEarned: result.pointsEarned,
          memberPhone: dto.memberPhone, belowCost,
          hasTradeIn: !!dto.tradeIn, hasSubsidy: !!(dto.subsidyAmount && dto.subsidyAmount > 0),
        },
        ipAddress: ip,
      });

      return {
        orderNo: result.order.orderNo,
        imei: dto.imei,
        skuInfo: {
          brand: sku.product.brand,
          model: sku.product.model,
          color: sku.color,
          spec: sku.spec,
        },
        salePrice: dto.salePrice,
        costPriceSnapshot: costPrice,
        subsidyIncome: dto.subsidyAmount ?? 0,
        commission,
        grossProfit,
        actualPaid: paymentsTotal,
        pointsUsed: dto.pointsToUse ?? 0,
        pointsEarned: result.pointsEarned,
        payments: result.paymentRecords.map((p: any) => ({
          paymentNo: p.paymentNo,
          method: p.method,
          amount: Number(p.amount),
        })),
        tradeInOrderId: result.tradeInRecord ? Number(result.tradeInRecord.id) : null,
        createdAt: result.order.createdAt,
      };
    } catch (err) {
      // 事务内异常直接抛出（ConflictException 等）
      throw err;
    }
  }

  /** 销售订单列表 */
  async findAllOrders(query: SaleOrderQueryDto) {
    const {
      salespersonId, returnStatus, startDate, endDate, keyword,
      page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    if (salespersonId) where.salespersonId = BigInt(salespersonId);
    if (returnStatus) where.returnStatus = returnStatus;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { saleItems: { some: { imei: { contains: keyword } } } },
        { saleItems: { some: { sku: { product: { brand: { contains: keyword } } } } } },
        { saleItems: { some: { sku: { product: { model: { contains: keyword } } } } } },
      ];
    }

    const allowedSort = ['createdAt', 'totalAmount', 'grossProfit'];
    const orderField = allowedSort.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total, summaryData] = await Promise.all([
      this.prisma.saleOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderField]: orderDir },
        include: {
          saleItems: {
            include: { sku: { include: { product: true } } },
          },
          salesperson: { select: { id: true, name: true } },
          member: { select: { id: true, phone: true, name: true } },
        },
      }),
      this.prisma.saleOrder.count({ where }),
      this.prisma.saleOrder.aggregate({
        where,
        _sum: { totalAmount: true, grossProfit: true },
        _count: true,
      }),
    ]);

    return {
      items: items.map((o) => {
        const firstItem = o.saleItems[0];
        return {
          orderNo: o.orderNo,
          imei: firstItem?.imei ? maskImei(firstItem.imei) : null,
          brand: firstItem?.sku?.product?.brand ?? null,
          model: firstItem?.sku?.product?.model ?? null,
          color: firstItem?.sku?.color ?? null,
          spec: firstItem?.sku?.spec ?? null,
          salePrice: Number(o.totalAmount),
          costPriceSnapshot: Number(o.totalCostSnapshot),
          grossProfit: Number(o.grossProfit),
          actualPaid: Number(o.actualPaid),
          paymentMethod: o.paymentMethod,
          salespersonName: o.salesperson?.name ?? null,
          memberPhone: o.member?.phone ? maskPhone(o.member.phone) : null,
          returnStatus: o.returnStatus,
          createdAt: o.createdAt,
        };
      }),
      summary: {
        totalOrders: summaryData._count,
        totalSales: summaryData._sum.totalAmount ? Number(summaryData._sum.totalAmount) : 0,
        totalProfit: summaryData._sum.grossProfit ? Number(summaryData._sum.grossProfit) : 0,
      },
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 订单详情 */
  async findOrderByOrderNo(orderNo: string) {
    const order = await this.prisma.saleOrder.findUnique({
      where: { orderNo, deletedAt: null },
      include: {
        saleItems: {
          include: { sku: { include: { product: true } } },
        },
        salesperson: { select: { id: true, name: true } },
        member: { select: { id: true, phone: true, name: true } },
        paymentFlows: { select: { paymentNo: true, method: true, amount: true, status: true } },
        tradeInOrders: { select: { id: true, oldBrand: true, oldModel: true, appraisedValue: true, actualDeduction: true } },
        nationalSubsidies: { select: { subsidyNo: true, appliedAmount: true, status: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return {
      orderNo: order.orderNo,
      shopId: Number(order.shopId),
      items: order.saleItems.map((item) => ({
        imei: maskImei(item.imei),
        brand: item.sku.product.brand,
        model: item.sku.product.model,
        color: item.sku.color,
        spec: item.sku.spec,
        salePrice: Number(item.salePrice),
        costPriceSnapshot: Number(item.costPriceSnapshot),
        subsidyIncome: Number(item.subsidyIncome),
        commission: Number(item.commission),
        grossProfit: Number(item.grossProfit),
      })),
      totalAmount: Number(order.totalAmount),
      totalCostSnapshot: Number(order.totalCostSnapshot),
      totalSubsidy: Number(order.totalSubsidy),
      totalCommission: Number(order.totalCommission),
      grossProfit: Number(order.grossProfit),
      actualPaid: Number(order.actualPaid),
      pointsUsedTotal: order.pointsUsedTotal,
      paymentMethod: order.paymentMethod,
      salespersonName: order.salesperson?.name ?? null,
      memberInfo: order.member
        ? { id: Number(order.member.id), phone: maskPhone(order.member.phone), name: order.member.name }
        : null,
      returnStatus: order.returnStatus,
      payments: order.paymentFlows.map((p) => ({
        paymentNo: p.paymentNo,
        method: p.method,
        amount: Number(p.amount),
        status: p.status ? 1 : 0,
      })),
      tradeIn: order.tradeInOrders[0]
        ? {
            id: Number(order.tradeInOrders[0].id),
            oldBrand: order.tradeInOrders[0].oldBrand,
            oldModel: order.tradeInOrders[0].oldModel,
            appraisedValue: Number(order.tradeInOrders[0].appraisedValue),
            actualDeduction: Number(order.tradeInOrders[0].actualDeduction),
          }
        : null,
      subsidy: order.nationalSubsidies[0]
        ? {
            subsidyNo: order.nationalSubsidies[0].subsidyNo,
            appliedAmount: Number(order.nationalSubsidies[0].appliedAmount),
            status: order.nationalSubsidies[0].status,
          }
        : null,
      createdAt: order.createdAt,
    };
  }

  /** 取消销售单（软删除+回退库存+冲正积分+作废流水） */
  async cancelOrder(orderNo: string, reason: string, operatorId: bigint, shopId: bigint, ip?: string) {
    const order = await this.prisma.saleOrder.findUnique({
      where: { orderNo, deletedAt: null },
      include: {
        saleItems: true,
        paymentFlows: true,
        member: true,
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.returnStatus !== 'normal') {
      throw new UnprocessableEntityException('该订单已退货，不可取消');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 软删除订单
      const now = new Date();
      await tx.saleOrder.update({
        where: { id: order.id },
        data: { deletedAt: now },
      });

      // 2. 回退库存：IMEI sold → in_stock
      for (const item of order.saleItems) {
        await tx.imeiStock.updateMany({
          where: { imei: item.imei, status: 'sold' },
          data: { status: 'in_stock', version: { increment: 1 } },
        });

        await tx.stockLedger.create({
          data: {
            shopId,
            imei: item.imei,
            changeType: 'return',
            fromStatus: 'sold',
            toStatus: 'in_stock',
            operatorId,
            orderNo,
            remark: `取消订单，库存回退：${reason}`,
          },
        });
      }

      // 3. 冲正积分
      if (order.member) {
        const pointsEarned = await tx.pointLedger.findFirst({
          where: { orderNo, changeType: 'earn' },
        });

        if (pointsEarned) {
          await tx.pointLedger.create({
            data: {
              memberId: order.member.id,
              changeType: 'manual_adjust',
              amount: -pointsEarned.amount,
              balanceAfter: order.member.totalPoints - pointsEarned.amount,
              orderNo,
              remark: `订单取消冲正：${reason}`,
              remainingAmount: 0,
            },
          });

          // 更新会员积分
          await tx.member.update({
            where: { id: order.member.id },
            data: { totalPoints: order.member.totalPoints - pointsEarned.amount },
          });
        }

        // 积分抵扣返还
        if (order.pointsUsedTotal > 0) {
          await tx.pointLedger.create({
            data: {
              memberId: order.member.id,
              changeType: 'manual_adjust',
              amount: order.pointsUsedTotal,
              balanceAfter: order.member.totalPoints - (pointsEarned?.amount ?? 0) + order.pointsUsedTotal,
              orderNo,
              remark: `订单取消返还积分：${reason}`,
              remainingAmount: 0,
            },
          });
        }
      }

      // 4. 作废收款流水
      for (const pf of order.paymentFlows) {
        await tx.paymentFlow.updateMany({
          where: { paymentNo: pf.paymentNo },
          data: { status: false },
        });
      }

      // 5. 作废提成 + 更新订单 totalCommission
      await tx.commissionLedger.updateMany({
        where: { orderNo },
        data: {
          adjustment: 0,
          actualCommission: 0,
          status: 'pending',
        },
      });
      await tx.saleOrder.updateMany({
        where: { orderNo },
        data: { totalCommission: 0 },
      });

      // 6. 国补召回
      await tx.nationalSubsidy.updateMany({
        where: { orderNo, status: { not: 'recalled' } },
        data: { status: 'recalled', recalledAt: now },
      });

      return { deletedAt: now };
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'sale', action: 'cancel_order',
      targetType: 'sale_order', targetId: orderNo,
      detailJson: { reason },
      ipAddress: ip,
    });

    return {
      orderNo,
      message: '订单已取消',
      deletedAt: result.deletedAt,
    };
  }

  // ---- helpers ----

  private async generateOrderNo(prefix: string, tx?: any): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const client = tx ?? this.prisma;
    const todayCount = await client.saleOrder.count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    });

    const seq = String(todayCount + 1).padStart(4, '0');
    return `${prefix}${dateStr}${seq}`;
  }

  private async generateNo(
    tx: any,
    prefix: string,
  ): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const tableName = prefix === 'PF'
      ? 'paymentFlow'
      : prefix === 'NS' ? 'nationalSubsidy' : 'saleOrder';

    const todayCount = await tx[tableName].count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    });

    const seq = String(todayCount + 1).padStart(4, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}
