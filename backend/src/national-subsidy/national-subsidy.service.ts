import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { SubsidyQueryDto } from './dto/subsidy-query.dto';
import { SubsidyReviewDto, SubsidyDisburseDto } from './dto/subsidy-review.dto';

@Injectable()
export class NationalSubsidyService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 补贴列表 (分页+筛选) */
  async findAll(query: SubsidyQueryDto) {
    const {
      shopId, status, orderNo, imei, startDate, endDate,
      page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * pageSize;
    const allowedSortFields = ['createdAt', 'appliedAmount', 'approvedAmount', 'status'];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = {};
    if (shopId) where.shopId = BigInt(shopId);
    if (status) where.status = status;
    if (orderNo) where.orderNo = orderNo;
    if (imei) where.imei = imei;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate + 'T00:00:00+08:00');
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59+08:00');
    }

    const [items, total, aggregation] = await Promise.all([
      this.prisma.nationalSubsidy.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderBy]: orderDir },
        include: {
          order: { select: { orderNo: true, totalAmount: true, salespersonId: true } },
        },
      }),
      this.prisma.nationalSubsidy.count({ where }),
      this.prisma.nationalSubsidy.aggregate({
        where,
        _sum: { appliedAmount: true, approvedAmount: true },
      }),
    ]);

    return {
      items: items.map((r) => ({
        id: Number(r.id),
        shopId: Number(r.shopId),
        subsidyNo: r.subsidyNo,
        orderNo: r.orderNo,
        imei: r.imei,
        appliedAmount: Number(r.appliedAmount),
        approvedAmount: r.approvedAmount ? Number(r.approvedAmount) : null,
        status: r.status,
        externalRefNo: r.externalRefNo,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt,
        disbursedAt: r.disbursedAt,
        recalledAt: r.recalledAt,
        createdAt: r.createdAt,
      })),
      summary: {
        totalApplied: aggregation._sum.appliedAmount ? Number(aggregation._sum.appliedAmount) : 0,
        totalApproved: aggregation._sum.approvedAmount ? Number(aggregation._sum.approvedAmount) : 0,
      },
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 补贴详情 */
  async findOne(id: bigint) {
    const record = await this.prisma.nationalSubsidy.findUnique({
      where: { id },
      include: {
        shop: { select: { id: true, name: true } },
        order: {
          select: {
            orderNo: true, totalAmount: true, grossProfit: true,
            actualPaid: true, paymentMethod: true, returnStatus: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('补贴记录不存在');
    }

    return {
      id: Number(record.id),
      shop: { id: Number(record.shop.id), name: record.shop.name },
      subsidyNo: record.subsidyNo,
      orderNo: record.orderNo,
      imei: record.imei,
      appliedAmount: Number(record.appliedAmount),
      approvedAmount: record.approvedAmount ? Number(record.approvedAmount) : null,
      status: record.status,
      externalRefNo: record.externalRefNo,
      remark: record.remark,
      order: {
        orderNo: record.order.orderNo,
        totalAmount: Number(record.order.totalAmount),
        grossProfit: Number(record.order.grossProfit),
        actualPaid: Number(record.order.actualPaid),
        paymentMethod: record.order.paymentMethod,
        returnStatus: record.order.returnStatus,
      },
      submittedAt: record.submittedAt,
      reviewedAt: record.reviewedAt,
      disbursedAt: record.disbursedAt,
      recalledAt: record.recalledAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** 提交补贴申请: pending_submit → submitted */
  async submit(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.nationalSubsidy.findUnique({ where: { id } });

    if (!record) throw new NotFoundException('补贴记录不存在');
    if (record.status !== 'pending_submit') {
      throw new UnprocessableEntityException(`当前状态 ${record.status} 不可提交`);
    }

    const updated = await this.prisma.nationalSubsidy.update({
      where: { id },
      data: { status: 'submitted', submittedAt: new Date() },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'national_subsidy', action: 'submit',
      targetType: 'national_subsidy', targetId: String(id),
      detailJson: { subsidyNo: record.subsidyNo, orderNo: record.orderNo },
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      subsidyNo: updated.subsidyNo,
      status: updated.status,
      submittedAt: updated.submittedAt,
    };
  }

  /** 进入审核: submitted → under_review */
  async startReview(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.nationalSubsidy.findUnique({ where: { id } });

    if (!record) throw new NotFoundException('补贴记录不存在');
    if (record.status !== 'submitted') {
      throw new UnprocessableEntityException(`当前状态 ${record.status} 不可审核`);
    }

    const updated = await this.prisma.nationalSubsidy.update({
      where: { id },
      data: { status: 'under_review' },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'national_subsidy', action: 'start_review',
      targetType: 'national_subsidy', targetId: String(id),
      detailJson: { subsidyNo: record.subsidyNo },
      ipAddress: ip,
    });

    return { id: Number(updated.id), subsidyNo: updated.subsidyNo, status: updated.status };
  }

  /** 审核完成: under_review → approved / rejected */
  async review(id: bigint, dto: SubsidyReviewDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.nationalSubsidy.findUnique({ where: { id } });

    if (!record) throw new NotFoundException('补贴记录不存在');
    if (record.status !== 'under_review') {
      throw new UnprocessableEntityException(`当前状态 ${record.status} 不可进行审核`);
    }

    const now = new Date();
    const isApproved = dto.action === 'approved';

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.nationalSubsidy.update({
        where: { id },
        data: {
          status: isApproved ? 'approved' : 'rejected',
          approvedAmount: isApproved ? (dto.approvedAmount ?? Number(record.appliedAmount)) : null,
          externalRefNo: dto.externalRefNo ?? record.externalRefNo,
          reviewedAt: now,
          remark: dto.remark ?? record.remark,
        },
      });

      // 如果审核通过，同步更新订单的 totalSubsidy
      if (isApproved && result.approvedAmount) {
        await tx.saleOrder.updateMany({
          where: { orderNo: record.orderNo },
          data: { totalSubsidy: result.approvedAmount },
        });
      }

      return result;
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'national_subsidy', action: isApproved ? 'approve' : 'reject',
      targetType: 'national_subsidy', targetId: String(id),
      detailJson: {
        subsidyNo: record.subsidyNo, action: dto.action,
        approvedAmount: updated.approvedAmount ? Number(updated.approvedAmount) : null,
        remark: dto.remark,
      },
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      subsidyNo: updated.subsidyNo,
      status: updated.status,
      approvedAmount: updated.approvedAmount ? Number(updated.approvedAmount) : null,
      reviewedAt: updated.reviewedAt,
    };
  }

  /** 补贴打款: approved → disbursed */
  async disburse(id: bigint, dto: SubsidyDisburseDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.nationalSubsidy.findUnique({ where: { id } });

    if (!record) throw new NotFoundException('补贴记录不存在');
    if (record.status !== 'approved') {
      throw new UnprocessableEntityException(`当前状态 ${record.status} 不可打款`);
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.nationalSubsidy.update({
        where: { id },
        data: {
          status: 'disbursed',
          disbursedAt: now,
          externalRefNo: dto.externalRefNo ?? record.externalRefNo,
          remark: dto.remark ?? record.remark,
        },
      });

      // 生成打款流水
      const paymentNo = `SP${now.toISOString().slice(0, 10).replace(/-/g, '')}${String(id).padStart(4, '0')}`;
      await tx.paymentFlow.create({
        data: {
          shopId: record.shopId,
          paymentNo,
          orderNo: record.orderNo,
          method: 'bank_transfer',
          amount: dto.disbursedAmount,
        },
      });

      return result;
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'national_subsidy', action: 'disburse',
      targetType: 'national_subsidy', targetId: String(id),
      detailJson: {
        subsidyNo: record.subsidyNo, disbursedAmount: dto.disbursedAmount,
        externalRefNo: dto.externalRefNo,
      },
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      subsidyNo: updated.subsidyNo,
      status: updated.status,
      disbursedAt: updated.disbursedAt,
    };
  }

  /** 补贴召回: disbursed → recalled */
  async recall(id: bigint, reason: string, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.nationalSubsidy.findUnique({ where: { id } });

    if (!record) throw new NotFoundException('补贴记录不存在');
    if (record.status !== 'disbursed') {
      throw new UnprocessableEntityException(`当前状态 ${record.status} 不可召回`);
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.nationalSubsidy.update({
        where: { id },
        data: { status: 'recalled', recalledAt: now },
      });

      // 退款流水
      const paymentNo = `SR${now.toISOString().slice(0, 10).replace(/-/g, '')}${String(id).padStart(4, '0')}`;
      await tx.paymentFlow.create({
        data: {
          shopId: record.shopId,
          paymentNo,
          orderNo: record.orderNo,
          method: 'bank_transfer',
          amount: record.approvedAmount ? -Number(record.approvedAmount) : -Number(record.appliedAmount),
        },
      });

      return result;
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'national_subsidy', action: 'recall',
      targetType: 'national_subsidy', targetId: String(id),
      detailJson: { subsidyNo: record.subsidyNo, reason, recalledAmount: Number(record.approvedAmount ?? record.appliedAmount) },
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      subsidyNo: updated.subsidyNo,
      status: updated.status,
      recalledAt: updated.recalledAt,
      reason,
    };
  }
}
