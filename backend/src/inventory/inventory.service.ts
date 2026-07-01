import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { ScanInboundDto } from './dto/scan-inbound.dto';
import { AuditInboundDto } from './dto/audit-inbound.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { OutboundCheckDto } from './dto/outbound-check.dto';
import { ScrapImeiDto } from './dto/scrap-imei.dto';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 扫码入库申请 */
  async scanInbound(dto: ScanInboundDto, operatorId: bigint, shopId: bigint, ip?: string) {
    if (!/^\d{14,20}$/.test(dto.imei)) {
      throw new BadRequestException('IMEI格式错误，须为14-20位数字');
    }

    // IMEI 全局唯一
    const existing = await this.prisma.imeiStock.findUnique({
      where: { imei: dto.imei },
    });
    if (existing) {
      throw new ConflictException('该IMEI已入库');
    }

    // 验证 SKU 存在
    const sku = await this.prisma.productSku.findUnique({
      where: { id: BigInt(dto.skuId), deletedAt: null },
      include: { product: { select: { brand: true, model: true } } },
    });
    if (!sku) {
      throw new NotFoundException('SKU不存在');
    }

    const record = await this.prisma.imeiStock.create({
      data: {
        shopId,
        skuId: BigInt(dto.skuId),
        imei: dto.imei,
        batchNo: dto.batchNo ?? null,
        location: dto.location ?? null,
        costPrice: dto.costPrice ?? null,
        channel: dto.channel ?? null,
        status: 'pending_audit',
        auditStatus: 'pending',
        version: 0,
      },
      include: {
        sku: {
          include: { product: true },
        },
      },
    });

    await this.prisma.stockLedger.create({
      data: {
        shopId,
        imei: dto.imei,
        changeType: 'inbound',
        fromStatus: null,
        toStatus: 'pending_audit',
        operatorId,
        remark: `扫码入库申请：${sku.product?.brand ?? ''} ${sku.product?.model ?? ''} ${sku.color} ${sku.spec}`,
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'inventory', action: 'inbound_apply',
      targetType: 'imei_stock', targetId: dto.imei,
      detailJson: { imei: dto.imei, skuId: dto.skuId, batchNo: dto.batchNo },
      ipAddress: ip,
    });

    return this.formatImeiStock(record);
  }

  /** 待审核入库列表 */
  async findAllInbound(query: InventoryQueryDto) {
    const { auditStatus, page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (auditStatus) {
      where.auditStatus = auditStatus;
    }

    const [items, total] = await Promise.all([
      this.prisma.imeiStock.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          sku: {
            include: { product: true },
          },
        },
      }),
      this.prisma.imeiStock.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        ...this.formatImeiStock(r),
        applicantId: r.sku ? undefined : undefined,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 入库审核 */
  async auditInbound(id: bigint, dto: AuditInboundDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.imeiStock.findUnique({
      where: { id },
      include: { sku: { include: { product: true } } },
    });

    if (!record) {
      throw new NotFoundException('入库记录不存在');
    }

    if (record.auditStatus !== 'pending') {
      throw new UnprocessableEntityException('非待审核状态不可操作');
    }

    const isApproved = dto.action === 'approved';
    const newStatus = isApproved ? 'in_stock' : 'scrapped';
    const changeType = isApproved ? 'inbound_audit_approve' : 'inbound_audit_reject';

    const updated = await this.prisma.imeiStock.update({
      where: { id },
      data: {
        auditStatus: dto.action,
        status: newStatus,
      },
      include: {
        sku: { include: { product: true } },
      },
    });

    await this.prisma.stockLedger.create({
      data: {
        shopId: record.shopId,
        imei: record.imei,
        changeType,
        fromStatus: 'pending_audit',
        toStatus: newStatus,
        operatorId,
        remark: dto.remark ?? (isApproved ? '审核通过' : '审核拒绝，已报废'),
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'inventory', action: isApproved ? 'inbound_approve' : 'inbound_reject',
      targetType: 'imei_stock', targetId: record.imei,
      detailJson: { action: dto.action, remark: dto.remark },
      ipAddress: ip,
    });

    return this.formatImeiStock(updated);
  }

  /** 库存列表（多维筛选） */
  async findAllStock(query: InventoryQueryDto) {
    const {
      shopId, skuId, status, location, batchNo, keyword,
      page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (shopId) where.shopId = BigInt(shopId);
    if (skuId) where.skuId = BigInt(skuId);
    if (status) where.status = status;
    if (location) where.location = { contains: location };
    if (batchNo) where.batchNo = { contains: batchNo };

    if (keyword) {
      where.OR = [
        { imei: { contains: keyword } },
        { sku: { product: { brand: { contains: keyword } } } },
        { sku: { product: { model: { contains: keyword } } } },
        { sku: { color: { contains: keyword } } },
        { sku: { spec: { contains: keyword } } },
      ];
    }

    const allowedSortFields = ['createdAt', 'updatedAt', 'costPrice', 'location'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      this.prisma.imeiStock.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderField]: orderDir },
        include: {
          sku: { include: { product: true } },
        },
      }),
      this.prisma.imeiStock.count({ where }),
    ]);

    const now = Date.now();

    return {
      items: items.map((r) => ({
        ...this.formatImeiStock(r),
        daysInStock: Math.floor((now - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 串码生命周期追溯 */
  async findStockByImei(imei: string) {
    const record = await this.prisma.imeiStock.findUnique({
      where: { imei },
      include: {
        sku: { include: { product: true } },
      },
    });

    if (!record) {
      throw new NotFoundException('IMEI不存在');
    }

    const ledger = await this.prisma.stockLedger.findMany({
      where: { imei },
      orderBy: { createdAt: 'asc' },
      include: {
        operator: { select: { id: true, name: true, phone: true } },
      },
    });

    const timeline = ledger.map((l) => ({
      action: this.mapChangeType(l.changeType),
      operator: l.operator?.name ?? '系统',
      operatorId: Number(l.operatorId),
      time: l.createdAt,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      orderNo: l.orderNo,
      remark: l.remark,
    }));

    return {
      imei: record.imei,
      currentStatus: record.status,
      auditStatus: record.auditStatus,
      location: record.location,
      batchNo: record.batchNo,
      costPrice: record.costPrice !== null ? Number(record.costPrice) : null,
      channel: record.channel,
      version: record.version,
      skuInfo: record.sku ? {
        skuId: Number(record.skuId),
        brand: record.sku.product.brand,
        model: record.sku.product.model,
        color: record.sku.color,
        spec: record.sku.spec,
      } : null,
      timeline,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /** 库存流水查询 */
  async findLedgerByImei(imei: string, query: InventoryQueryDto) {
    const { page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.stockLedger.findMany({
        where: { imei },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          operator: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.stockLedger.count({ where: { imei } }),
    ]);

    return {
      items: items.map((l) => ({
        id: Number(l.id),
        imei: l.imei,
        changeType: l.changeType,
        action: this.mapChangeType(l.changeType),
        fromStatus: l.fromStatus,
        toStatus: l.toStatus,
        orderNo: l.orderNo,
        remark: l.remark,
        operator: l.operator ? { id: Number(l.operator.id), name: l.operator.name } : null,
        createdAt: l.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 出库校验（乐观锁锁定） */
  async outboundCheck(dto: OutboundCheckDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.imeiStock.findUnique({
      where: { imei: dto.imei },
    });

    if (!record) {
      throw new NotFoundException('IMEI不存在');
    }

    if (record.status !== 'in_stock') {
      const statusMsg: Record<string, string> = {
        pending_audit: '待审核',
        locked: '已被锁定',
        sold: '已销售',
        returned: '已退货',
        scrapped: '已报废',
      };
      throw new ConflictException(
        `该IMEI${statusMsg[record.status] ?? '状态异常'}，无法出库`,
      );
    }

    // 乐观锁更新
    const result = await this.prisma.imeiStock.updateMany({
      where: {
        imei: dto.imei,
        version: record.version,
        status: 'in_stock',
      },
      data: {
        status: 'locked',
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException('并发冲突：该IMEI状态已变更，请重试');
    }

    await this.prisma.stockLedger.create({
      data: {
        shopId: record.shopId,
        imei: dto.imei,
        changeType: 'outbound_lock',
        fromStatus: 'in_stock',
        toStatus: 'locked',
        operatorId,
        orderNo: dto.orderNo ?? null,
        remark: '出库校验通过，已锁定',
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'inventory', action: 'outbound_lock',
      targetType: 'imei_stock', targetId: dto.imei,
      detailJson: { orderNo: dto.orderNo },
      ipAddress: ip,
    });

    return {
      imei: dto.imei,
      status: 'locked',
      message: '出库校验通过，IMEI已锁定',
      skuId: Number(record.skuId),
      costPrice: record.costPrice !== null ? Number(record.costPrice) : null,
    };
  }

  /** 取消出库（解锁） */
  async cancelOutbound(imei: string, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.imeiStock.findUnique({
      where: { imei },
    });

    if (!record) {
      throw new NotFoundException('IMEI不存在');
    }

    if (record.status !== 'locked') {
      throw new UnprocessableEntityException('该IMEI非锁定状态，无需解锁');
    }

    const result = await this.prisma.imeiStock.updateMany({
      where: {
        imei,
        version: record.version,
        status: 'locked',
      },
      data: {
        status: 'in_stock',
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException('并发冲突：该IMEI状态已变更，请重试');
    }

    await this.prisma.stockLedger.create({
      data: {
        shopId: record.shopId,
        imei,
        changeType: 'outbound_unlock',
        fromStatus: 'locked',
        toStatus: 'in_stock',
        operatorId,
        remark: '取消出库，已解锁',
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'inventory', action: 'outbound_unlock',
      targetType: 'imei_stock', targetId: imei,
      ipAddress: ip,
    });

    return { imei, status: 'in_stock', message: 'IMEI已解锁' };
  }

  /** 报废 */
  async scrapImei(imei: string, dto: ScrapImeiDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const record = await this.prisma.imeiStock.findUnique({
      where: { imei },
    });

    if (!record) {
      throw new NotFoundException('IMEI不存在');
    }

    const allowedStatuses = ['in_stock', 'locked', 'returned', 'pending_audit'];
    if (!allowedStatuses.includes(record.status)) {
      throw new UnprocessableEntityException(`当前状态 ${record.status} 不允许报废`);
    }

    const result = await this.prisma.imeiStock.updateMany({
      where: {
        imei,
        version: record.version,
      },
      data: {
        status: 'scrapped',
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException('并发冲突：该IMEI状态已变更，请重试');
    }

    await this.prisma.stockLedger.create({
      data: {
        shopId: record.shopId,
        imei,
        changeType: 'scrap',
        fromStatus: record.status,
        toStatus: 'scrapped',
        operatorId,
        remark: dto.reason,
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'inventory', action: 'scrap',
      targetType: 'imei_stock', targetId: imei,
      detailJson: { reason: dto.reason, fromStatus: record.status },
      ipAddress: ip,
    });

    return { imei, status: 'scrapped', message: 'IMEI已报废' };
  }

  /** 库存汇总统计 */
  async getSummary() {
    const statuses: string[] = ['pending_audit', 'in_stock', 'locked', 'sold', 'returned', 'scrapped'];

    const counts = await Promise.all(
      statuses.map((s) =>
        this.prisma.imeiStock.count({ where: { status: s as any } }),
      ),
    );

    const byStatus: Record<string, number> = {};
    statuses.forEach((s, i) => { byStatus[s] = counts[i]; });

    const inStockValue = await this.prisma.imeiStock.aggregate({
      where: { status: 'in_stock' },
      _sum: { costPrice: true },
    });

    const lowStockSkus = await this.prisma.productSku.count({
      where: {
        deletedAt: null,
        imeiStocks: {
          some: { status: 'in_stock' },
        },
      },
    });

    return {
      totalInStock: byStatus['in_stock'],
      totalValue: inStockValue._sum.costPrice ? Number(inStockValue._sum.costPrice) : 0,
      byStatus,
      lowStockAlerts: 0,
      slowMovingCount: 0,
    };
  }

  /**
   * IMEI 并发出库模拟 — 仅用于并发测试，禁止生产调用
   * @internal
   */
  async concurrentSell(imei: string, operatorId: bigint) {
    const record = await this.prisma.imeiStock.findUnique({
      where: { imei },
    });

    if (!record) {
      throw new NotFoundException('IMEI不存在');
    }

    if (record.status !== 'in_stock') {
      return { success: false, reason: `状态不是in_stock: ${record.status}` };
    }

    const result = await this.prisma.imeiStock.updateMany({
      where: {
        imei,
        version: record.version,
        status: 'in_stock',
      },
      data: {
        status: 'sold',
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      return { success: false, reason: '并发冲突' };
    }

    await this.prisma.stockLedger.create({
      data: {
        shopId: record.shopId,
        imei,
        changeType: 'outbound',
        fromStatus: 'in_stock',
        toStatus: 'sold',
        operatorId,
        remark: '并发测试：出库',
      },
    });

    return { success: true, imei };
  }

  // ---- helpers ----

  private formatImeiStock(r: any) {
    return {
      id: Number(r.id),
      imei: r.imei,
      shopId: Number(r.shopId),
      skuId: Number(r.skuId),
      brand: r.sku?.product?.brand ?? null,
      model: r.sku?.product?.model ?? null,
      color: r.sku?.color ?? null,
      spec: r.sku?.spec ?? null,
      batchNo: r.batchNo,
      location: r.location,
      costPrice: r.costPrice !== null ? Number(r.costPrice) : null,
      channel: r.channel,
      status: r.status,
      auditStatus: r.auditStatus,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private mapChangeType(type: string): string {
    const map: Record<string, string> = {
      inbound: '入库申请',
      inbound_audit_approve: '入库审核通过',
      inbound_audit_reject: '入库审核拒绝',
      outbound: '扫码出库',
      outbound_lock: '出库锁定',
      outbound_unlock: '出库解锁',
      return: '退货入库',
      scrap: '报废',
    };
    return map[type] ?? type;
  }
}
