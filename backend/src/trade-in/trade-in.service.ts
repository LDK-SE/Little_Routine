import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { TradeInQueryDto } from './dto/trade-in-query.dto';
import { CreateTradeInDto } from './dto/create-trade-in.dto';
import { UpdateTradeInDto } from './dto/update-trade-in.dto';
import { TradeInWarehouseDto } from './dto/trade-in-warehouse.dto';
import { maskImei } from '../common/utils/mask';

@Injectable()
export class TradeInService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 列表查询 */
  async findAll(query: TradeInQueryDto) {
    const {
      shopId, orderNo, oldImei, oldBrand, oldModel, startDate, endDate,
      page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * pageSize;
    const allowedSortFields = ['createdAt', 'appraisedValue', 'actualDeduction'];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = {};
    if (shopId) where.shopId = BigInt(shopId);
    if (orderNo) where.orderNo = orderNo;
    if (oldImei) where.oldImei = oldImei;
    if (oldBrand) where.oldBrand = { contains: oldBrand };
    if (oldModel) where.oldModel = { contains: oldModel };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate + 'T00:00:00+08:00');
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59+08:00');
    }

    const [items, total, aggregation] = await Promise.all([
      this.prisma.tradeInOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderBy]: orderDir },
        include: {
          order: { select: { orderNo: true, totalAmount: true, paymentMethod: true } },
          shop: { select: { id: true, name: true } },
        },
      }),
      this.prisma.tradeInOrder.count({ where }),
      this.prisma.tradeInOrder.aggregate({
        where,
        _sum: { appraisedValue: true, actualDeduction: true },
        _count: true,
      }),
    ]);

    return {
      items: items.map((r) => ({
        id: Number(r.id),
        shopId: Number(r.shopId),
        shopName: r.shop?.name ?? null,
        orderNo: r.orderNo,
        oldImei: r.oldImei ? maskImei(r.oldImei) : null,
        oldBrand: r.oldBrand,
        oldModel: r.oldModel,
        oldCondition: r.oldCondition,
        appraisedValue: Number(r.appraisedValue),
        actualDeduction: Number(r.actualDeduction),
        status: this.deriveStatus(r),
        createdAt: r.createdAt,
      })),
      summary: {
        totalCount: aggregation._count,
        totalAppraised: aggregation._sum.appraisedValue ? Number(aggregation._sum.appraisedValue) : 0,
        totalDeducted: aggregation._sum.actualDeduction ? Number(aggregation._sum.actualDeduction) : 0,
      },
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 详情 */
  async findOne(id: bigint) {
    const record = await this.prisma.tradeInOrder.findUnique({
      where: { id },
      include: {
        shop: { select: { id: true, name: true } },
        order: {
          select: {
            orderNo: true, totalAmount: true, actualPaid: true,
            paymentMethod: true, returnStatus: true, createdAt: true,
          },
        },
      },
    });

    if (!record) throw new NotFoundException('以旧换新记录不存在');

    return {
      id: Number(record.id),
      shop: { id: Number(record.shop.id), name: record.shop.name },
      orderNo: record.orderNo,
      oldDevice: {
        imei: record.oldImei,
        brand: record.oldBrand,
        model: record.oldModel,
        condition: record.oldCondition,
      },
      appraisedValue: Number(record.appraisedValue),
      actualDeduction: Number(record.actualDeduction),
      remark: record.remark,
      status: this.deriveStatus(record),
      order: {
        orderNo: record.order.orderNo,
        totalAmount: Number(record.order.totalAmount),
        actualPaid: Number(record.order.actualPaid),
        paymentMethod: record.order.paymentMethod,
        returnStatus: record.order.returnStatus,
        createdAt: record.order.createdAt,
      },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** 创建: 旧机估值 */
  async create(dto: CreateTradeInDto, operatorId: bigint, shopId: bigint, ip?: string) {
    // 校验订单存在且未被软删除
    const order = await this.prisma.saleOrder.findUnique({
      where: { orderNo: dto.orderNo, deletedAt: null },
    });

    if (!order) throw new NotFoundException('关联销售订单不存在');

    // 检查是否已有 trade-in
    const existing = await this.prisma.tradeInOrder.findFirst({
      where: { orderNo: dto.orderNo },
    });

    if (existing) throw new ConflictException('该订单已存在以旧换新记录');

    const record = await this.prisma.tradeInOrder.create({
      data: {
        shopId,
        orderNo: dto.orderNo,
        oldImei: dto.oldImei ?? null,
        oldBrand: dto.oldBrand ?? null,
        oldModel: dto.oldModel ?? null,
        oldCondition: dto.oldCondition ?? null,
        appraisedValue: dto.appraisedValue,
        actualDeduction: dto.actualDeduction ?? dto.appraisedValue,
        remark: dto.remark ?? null,
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'trade_in', action: 'create',
      targetType: 'trade_in_order', targetId: String(record.id),
      detailJson: {
        orderNo: dto.orderNo, oldBrand: dto.oldBrand, oldModel: dto.oldModel,
        appraisedValue: dto.appraisedValue, actualDeduction: dto.actualDeduction,
      },
      ipAddress: ip,
    });

    return {
      id: Number(record.id),
      orderNo: record.orderNo,
      oldBrand: record.oldBrand,
      oldModel: record.oldModel,
      oldCondition: record.oldCondition,
      appraisedValue: Number(record.appraisedValue),
      actualDeduction: Number(record.actualDeduction),
      status: 'appraised',
      createdAt: record.createdAt,
    };
  }

  /** 更新估值信息 */
  async update(id: bigint, dto: UpdateTradeInDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const existing = await this.prisma.tradeInOrder.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('以旧换新记录不存在');

    const data: any = {};
    if (dto.oldImei !== undefined) data.oldImei = dto.oldImei;
    if (dto.oldBrand !== undefined) data.oldBrand = dto.oldBrand;
    if (dto.oldModel !== undefined) data.oldModel = dto.oldModel;
    if (dto.oldCondition !== undefined) data.oldCondition = dto.oldCondition;
    if (dto.appraisedValue !== undefined) data.appraisedValue = dto.appraisedValue;
    if (dto.actualDeduction !== undefined) data.actualDeduction = dto.actualDeduction;
    if (dto.remark !== undefined) data.remark = dto.remark;

    const record = await this.prisma.tradeInOrder.update({ where: { id }, data });

    await this.auditLog.write({
      shopId, operatorId, module: 'trade_in', action: 'update',
      targetType: 'trade_in_order', targetId: String(id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return {
      id: Number(record.id),
      orderNo: record.orderNo,
      oldBrand: record.oldBrand,
      oldModel: record.oldModel,
      oldCondition: record.oldCondition,
      appraisedValue: Number(record.appraisedValue),
      actualDeduction: Number(record.actualDeduction),
      status: this.deriveStatus(record),
      updatedAt: record.updatedAt,
    };
  }

  /** 旧机入库 */
  async warehouse(id: bigint, dto: TradeInWarehouseDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const existing = await this.prisma.tradeInOrder.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!existing) throw new NotFoundException('以旧换新记录不存在');

    // 更新 trade-in 的 oldImei
    await this.prisma.tradeInOrder.update({
      where: { id },
      data: { oldImei: dto.oldImei },
    });

    // 查找对应 SKU (按品牌+型号匹配)
    let sku: any = null;
    if (existing.oldBrand && existing.oldModel) {
      sku = await this.prisma.productSku.findFirst({
        where: {
          product: { brand: existing.oldBrand, model: existing.oldModel, deletedAt: null },
        },
        include: { product: true },
      });
    }

    // 入库旧机 (创建 IMEI 库存记录) — 事务内检查+创建，避免TOCTOU
    await this.prisma.$transaction(async (tx) => {
      const existingStock = await tx.imeiStock.findUnique({
        where: { imei: dto.oldImei },
      });

      if (existingStock) {
        throw new ConflictException(`旧机IMEI ${dto.oldImei} 已在库存中 (状态: ${existingStock.status})`);
      }

      const imeiRecord = await tx.imeiStock.create({
        data: {
          shopId,
          imei: dto.oldImei,
          skuId: sku?.id ?? null,
          batchNo: `TRADEIN-${existing.id}`,
          location: dto.location ?? '旧机回收区',
          costPrice: 0,
          channel: '以旧换新',
          status: 'pending_audit',
        },
      });

      // 库存流水
      await tx.stockLedger.create({
        data: {
          shopId,
          imei: dto.oldImei,
          changeType: 'inbound',
          fromStatus: null,
          toStatus: 'pending_audit',
          operatorId,
          orderNo: existing.orderNo,
          remark: `以旧换新入库 (TradeIn #${existing.id}): ${existing.oldBrand} ${existing.oldModel} | ${dto.remark ?? ''}`,
        },
      });
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'trade_in', action: 'warehouse',
      targetType: 'trade_in_order', targetId: String(id),
      detailJson: {
        orderNo: existing.orderNo, oldImei: dto.oldImei,
        oldBrand: existing.oldBrand, oldModel: existing.oldModel,
        location: dto.location,
      },
      ipAddress: ip,
    });

    return {
      id: Number(existing.id),
      orderNo: existing.orderNo,
      oldImei: dto.oldImei,
      oldBrand: existing.oldBrand,
      oldModel: existing.oldModel,
      status: 'warehoused',
      location: dto.location ?? '旧机回收区',
      message: '旧机已入库，等待审核',
    };
  }

  // ---- helpers ----

  /** 推导状态 */
  private deriveStatus(r: any): string {
    // warehoused: 已有 oldImei 且库存中存在
    // appraised: 有估值
    // pending: 刚创建无估值
    if (r.oldImei) return 'warehoused';
    if (Number(r.appraisedValue) > 0) return 'appraised';
    return 'pending_appraisal';
  }
}
