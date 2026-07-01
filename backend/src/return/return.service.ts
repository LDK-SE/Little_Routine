import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { AuditReturnDto } from './dto/audit-return.dto';
import { ReturnQueryDto } from './dto/return-query.dto';
import { maskImei } from '../common/utils/mask';

@Injectable()
export class ReturnService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 创建退货申请 */
  async create(dto: CreateReturnDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const order = await this.prisma.saleOrder.findUnique({
      where: { orderNo: dto.originalOrderNo, deletedAt: null },
      include: { saleItems: true },
    });

    if (!order) {
      throw new NotFoundException('原销售订单不存在');
    }

    if (order.returnStatus !== 'normal') {
      throw new UnprocessableEntityException('该订单已在退货流程中');
    }

    // 校验 IMEI 是否属于该订单
    const saleItem = order.saleItems.find((si) => si.imei === dto.imei);
    if (!saleItem) {
      throw new NotFoundException('IMEI不属于该订单');
    }

    // 校验 IMEI 当前状态为 sold
    const imeiStock = await this.prisma.imeiStock.findUnique({
      where: { imei: dto.imei },
    });
    if (!imeiStock || imeiStock.status !== 'sold') {
      throw new UnprocessableEntityException('该IMEI状态不是已售，无法退货');
    }

    // 校验退款金额不超过原始售价
    if (Number(dto.refundAmount) > Number(saleItem.salePrice)) {
      throw new UnprocessableEntityException(
        `退款金额(${dto.refundAmount})不可超过原始售价(${saleItem.salePrice})`,
      );
    }

    // 检查是否已有退货单
    const existing = await this.prisma.returnOrder.findFirst({
      where: { originalOrderNo: dto.originalOrderNo, imei: dto.imei, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('该订单+IMEI已有退货申请');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const returnNo = await this.generateReturnNo(tx);
      const record = await tx.returnOrder.create({
        data: {
          shopId,
          returnNo,
          originalOrderNo: dto.originalOrderNo,
          imei: dto.imei,
          returnReason: dto.returnReason,
          returnType: dto.returnType as any,
          refundAmount: dto.refundAmount,
          pointsRecalled: dto.pointsRecalled ?? 0,
          commissionRecalled: dto.commissionRecalled ?? 0,
          subsidyRecalled: dto.subsidyRecalled ?? 0,
          auditStatus: 'pending',
        },
      });

      // 更新订单 returnStatus
      await tx.saleOrder.update({
        where: { id: order.id },
        data: { returnStatus: 'return_requested' },
      });

      // 库存流水
      await tx.stockLedger.create({
        data: {
          shopId,
          imei: dto.imei,
          changeType: 'return',
          fromStatus: 'sold',
          toStatus: 'return_requested',
          operatorId,
          orderNo: dto.originalOrderNo,
          remark: `退货申请 #${returnNo}: ${dto.returnReason}`,
        },
      });

      return record;
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'return', action: 'create',
      targetType: 'return_order', targetId: String(result.id),
      detailJson: { returnNo: result.returnNo, originalOrderNo: dto.originalOrderNo, imei: dto.imei, refundAmount: dto.refundAmount },
      ipAddress: ip,
    });

    return {
      id: Number(result.id),
      returnNo: result.returnNo,
      originalOrderNo: result.originalOrderNo,
      imei: dto.imei,
      returnType: result.returnType,
      refundAmount: Number(result.refundAmount),
      auditStatus: result.auditStatus,
      createdAt: result.createdAt,
    };
  }

  /** 查询退货单列表 */
  async findAll(query: ReturnQueryDto) {
    const {
      shopId, originalOrderNo, imei, auditStatus, returnType,
      startDate, endDate, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * pageSize;
    const allowedSortFields = ['createdAt', 'refundAmount', 'auditStatus'];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = { deletedAt: null };
    if (shopId) where.shopId = BigInt(shopId);
    if (originalOrderNo) where.originalOrderNo = originalOrderNo;
    if (imei) where.imei = imei;
    if (auditStatus) where.auditStatus = auditStatus;
    if (returnType) where.returnType = returnType;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate + 'T00:00:00+08:00');
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59+08:00');
    }

    const [items, total, aggregation] = await Promise.all([
      this.prisma.returnOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderBy]: orderDir },
        include: {
          shop: { select: { id: true, name: true } },
          originalOrder: { select: { orderNo: true, totalAmount: true } },
        },
      }),
      this.prisma.returnOrder.count({ where }),
      this.prisma.returnOrder.aggregate({
        where,
        _sum: { refundAmount: true, pointsRecalled: true, commissionRecalled: true, subsidyRecalled: true },
      }),
    ]);

    return {
      items: items.map((r) => ({
        id: Number(r.id),
        shopId: Number(r.shopId),
        shopName: r.shop?.name ?? null,
        returnNo: r.returnNo,
        originalOrderNo: r.originalOrderNo,
        imei: maskImei(r.imei),
        returnReason: r.returnReason,
        returnType: r.returnType,
        refundAmount: Number(r.refundAmount),
        pointsRecalled: r.pointsRecalled,
        commissionRecalled: Number(r.commissionRecalled),
        subsidyRecalled: Number(r.subsidyRecalled),
        auditStatus: r.auditStatus,
        createdAt: r.createdAt,
      })),
      summary: {
        totalRefund: aggregation._sum.refundAmount ? Number(aggregation._sum.refundAmount) : 0,
        totalPointsRecalled: aggregation._sum.pointsRecalled ?? 0,
        totalCommissionRecalled: aggregation._sum.commissionRecalled ? Number(aggregation._sum.commissionRecalled) : 0,
        totalSubsidyRecalled: aggregation._sum.subsidyRecalled ? Number(aggregation._sum.subsidyRecalled) : 0,
      },
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 退货单详情 */
  async findOne(id: bigint) {
    const record = await this.prisma.returnOrder.findUnique({
      where: { id },
      include: {
        shop: { select: { id: true, name: true } },
        originalOrder: {
          include: {
            saleItems: { include: { sku: { include: { product: true } } } },
            salesperson: { select: { id: true, name: true } },
            member: { select: { id: true, phone: true, name: true } },
          },
        },
        auditor: { select: { id: true, name: true } },
        imeiRef: { select: { id: true, status: true } },
      },
    });

    if (!record) throw new NotFoundException('退货单不存在');

    return {
      id: Number(record.id),
      shop: { id: Number(record.shop.id), name: record.shop.name },
      returnNo: record.returnNo,
      originalOrderNo: record.originalOrderNo,
      imei: record.imei,
      returnReason: record.returnReason,
      returnType: record.returnType,
      refundAmount: Number(record.refundAmount),
      pointsRecalled: record.pointsRecalled,
      commissionRecalled: Number(record.commissionRecalled),
      subsidyRecalled: Number(record.subsidyRecalled),
      auditStatus: record.auditStatus,
      auditor: record.auditor ? { id: Number(record.auditor.id), name: record.auditor.name } : null,
      auditedAt: record.auditedAt,
      completedAt: record.completedAt,
      originalOrder: {
        orderNo: record.originalOrder.orderNo,
        totalAmount: Number(record.originalOrder.totalAmount),
        salespersonName: record.originalOrder.salesperson?.name ?? null,
        memberPhone: record.originalOrder.member?.phone ?? null,
        item: record.originalOrder.saleItems[0] ? {
          brand: record.originalOrder.saleItems[0].sku.product.brand,
          model: record.originalOrder.saleItems[0].sku.product.model,
          salePrice: Number(record.originalOrder.saleItems[0].salePrice),
        } : null,
      },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** 审核退货 (approve / reject) */
  async audit(id: bigint, dto: AuditReturnDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.returnOrder.findUnique({
      where: { id },
      include: { originalOrder: { include: { member: true } } },
    });

    if (!record) throw new NotFoundException('退货单不存在');
    if (record.auditStatus !== 'pending') {
      throw new UnprocessableEntityException('该退货单已审核');
    }

    const isApproved = dto.action === 'approved';
    const now = new Date();

    const updated = await this.prisma.returnOrder.update({
      where: { id },
      data: {
        auditStatus: isApproved ? 'approved' : 'rejected',
        auditedBy: operatorId,
        auditedAt: now,
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'return', action: dto.action,
      targetType: 'return_order', targetId: String(id),
      detailJson: { returnNo: record.returnNo, action: dto.action, remark: dto.remark },
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      returnNo: updated.returnNo,
      auditStatus: updated.auditStatus,
      auditedAt: updated.auditedAt,
      message: isApproved ? '退货审核通过' : '退货审核拒绝',
    };
  }

  /** 完成退货（审核通过后执行实际退货操作） */
  async complete(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.returnOrder.findUnique({
      where: { id },
      include: {
        originalOrder: { include: { member: true } },
        imeiRef: { select: { version: true } },
      },
    });

    if (!record) throw new NotFoundException('退货单不存在');
    if (record.auditStatus !== 'approved') {
      throw new UnprocessableEntityException('需审核通过后才能完成退货');
    }
    if (record.completedAt) {
      throw new UnprocessableEntityException('该退货单已完成');
    }

    const imeiVersion = record.imeiRef?.version ?? 0;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // 1. IMEI 回退：sold -> returned (乐观锁)
      const updateResult = await tx.imeiStock.updateMany({
        where: { imei: record.imei, status: 'sold', version: imeiVersion },
        data: { status: 'returned', version: { increment: 1 } },
      });
      if (updateResult.count === 0) {
        throw new ConflictException('IMEI状态已变更，请重试');
      }

      // 2. 库存流水
      await tx.stockLedger.create({
        data: {
          shopId,
          imei: record.imei,
          changeType: 'return',
          fromStatus: 'sold',
          toStatus: 'returned',
          operatorId,
          orderNo: record.originalOrderNo,
          remark: `退货完成 #${record.returnNo}`,
        },
      });

      // 3. 退款流水
      const refundNo = `RF${now.toISOString().slice(0, 10).replace(/-/g, '')}${String(record.id).padStart(4, '0')}`;
      await tx.paymentFlow.create({
        data: {
          shopId: record.shopId,
          paymentNo: refundNo,
          orderNo: record.originalOrderNo,
          method: 'refund',
          amount: record.refundAmount,
          paymentType: 'refund',
        },
      });

      // 4. 积分回退
      if (record.originalOrder.member && record.pointsRecalled > 0) {
        const member = record.originalOrder.member;
        await tx.pointLedger.create({
          data: {
            memberId: member.id,
            changeType: 'manual_adjust',
            amount: -record.pointsRecalled,
            balanceAfter: member.totalPoints - record.pointsRecalled,
            orderNo: record.originalOrderNo,
            remark: `退货冲正 #${record.returnNo}`,
            remainingAmount: 0,
          },
        });
        await tx.member.update({
          where: { id: member.id },
          data: { totalPoints: member.totalPoints - record.pointsRecalled },
        });
      }

      // 5. 提成回退
      if (Number(record.commissionRecalled) > 0) {
        await tx.commissionLedger.updateMany({
          where: { orderNo: record.originalOrderNo },
          data: {
            adjustment: 0,
            actualCommission: 0,
            status: 'pending',
          },
        });
        await tx.saleOrder.updateMany({
          where: { orderNo: record.originalOrderNo },
          data: { totalCommission: 0 },
        });
      }

      // 6. 国补召回
      if (Number(record.subsidyRecalled) > 0) {
        await tx.nationalSubsidy.updateMany({
          where: { orderNo: record.originalOrderNo, status: { in: ['approved', 'disbursed'] } },
          data: { status: 'recalled', recalledAt: now },
        });
      }

      // 7. 更新退货单完成时间
      await tx.returnOrder.update({
        where: { id },
        data: { completedAt: now },
      });

      // 8. 更新订单 returnStatus
      await tx.saleOrder.updateMany({
        where: { orderNo: record.originalOrderNo },
        data: { returnStatus: 'returned' },
      });
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'return', action: 'complete',
      targetType: 'return_order', targetId: String(id),
      detailJson: {
        returnNo: record.returnNo, originalOrderNo: record.originalOrderNo,
        refundAmount: Number(record.refundAmount), pointsRecalled: record.pointsRecalled,
        commissionRecalled: Number(record.commissionRecalled), subsidyRecalled: Number(record.subsidyRecalled),
      },
      ipAddress: ip,
    });

    return {
      id: Number(record.id),
      returnNo: record.returnNo,
      status: 'completed',
      completedAt: now,
      message: '退货已完成',
    };
  }

  /** 取消退货（软删除） */
  async cancel(id: bigint, reason: string, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.returnOrder.findUnique({
      where: { id },
    });

    if (!record) throw new NotFoundException('退货单不存在');
    if (record.auditStatus === 'approved' && record.completedAt) {
      throw new UnprocessableEntityException('已完成的退货单不可取消');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.returnOrder.update({
        where: { id },
        data: { deletedAt: now },
      });

      // 恢复订单 returnStatus
      await tx.saleOrder.updateMany({
        where: { orderNo: record.originalOrderNo },
        data: { returnStatus: 'normal' },
      });

      // 库存流水
      await tx.stockLedger.create({
        data: {
          shopId,
          imei: record.imei,
          changeType: 'return',
          fromStatus: 'return_requested',
          toStatus: 'sold',
          operatorId,
          orderNo: record.originalOrderNo,
          remark: `退货取消 #${record.returnNo}: ${reason}`,
        },
      });
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'return', action: 'cancel',
      targetType: 'return_order', targetId: String(id),
      detailJson: { returnNo: record.returnNo, reason },
      ipAddress: ip,
    });

    return {
      id: Number(record.id),
      returnNo: record.returnNo,
      message: '退货单已取消',
    };
  }

  private async generateReturnNo(tx?: any): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const client = tx ?? this.prisma;
    const todayCount = await client.returnOrder.count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    });
    return `RT${dateStr}${String(todayCount + 1).padStart(4, '0')}`;
  }
}
