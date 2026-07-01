import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { AuditPurchaseOrderDto } from './dto/audit-purchase-order.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';

@Injectable()
export class PurchaseService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 创建采购单 */
  async createOrder(dto: CreatePurchaseOrderDto, operatorId: bigint, shopId: bigint, ip?: string) {
    // 检查 IMEI 是否都已入库
    for (const item of dto.items) {
      const existing = await this.prisma.imeiStock.findUnique({
        where: { imei: item.imei },
      });
      if (existing) {
        throw new ConflictException(`IMEI ${item.imei} 已入库`);
      }
    }

    // 验证所有 SKU 存在
    for (const item of dto.items) {
      const sku = await this.prisma.productSku.findUnique({
        where: { id: BigInt(item.skuId), deletedAt: null },
      });
      if (!sku) {
        throw new NotFoundException(`SKU ID ${item.skuId} 不存在`);
      }
    }

    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.unitCost,
      0,
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNo = await this.generateOrderNo(tx);

      const created = await tx.purchaseOrder.create({
        data: {
          shopId,
          orderNo,
          supplierName: dto.supplierName ?? null,
          supplierContact: dto.supplierContact ?? null,
          totalAmount,
          remark: dto.remark ?? null,
          status: 'pending',
        },
      });

      await tx.purchaseItem.createMany({
        data: dto.items.map((item) => ({
          purchaseOrderId: created.id,
          skuId: BigInt(item.skuId),
          imei: item.imei,
          quantity: 1,
          unitCost: item.unitCost,
          subtotal: item.unitCost,
        })),
      });

      return created;
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'purchase', action: 'create_order',
      targetType: 'purchase_order', targetId: order.orderNo,
      detailJson: {
        orderNo: order.orderNo, itemCount: dto.items.length, totalAmount,
        supplierName: dto.supplierName,
      },
      ipAddress: ip,
    });

    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      totalAmount: Number(order.totalAmount),
      itemCount: dto.items.length,
      status: 'pending',
      createdAt: order.createdAt,
    };
  }

  /** 采购单列表 */
  async findAllOrders(query: PurchaseOrderQueryDto) {
    const { status, startDate, endDate, page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    if (status) where.status = status;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      items: items.map((o) => ({
        id: Number(o.id),
        orderNo: o.orderNo,
        supplierName: o.supplierName,
        totalAmount: Number(o.totalAmount),
        itemCount: o._count.items,
        status: o.status,
        createdAt: o.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 采购单详情 */
  async findOrderById(id: bigint) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id, deletedAt: null },
      include: {
        items: {
          include: {
            sku: { include: { product: { select: { brand: true, model: true } } } },
          },
        },
        approver: { select: { id: true, name: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('采购单不存在');
    }

    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      supplierName: order.supplierName,
      supplierContact: order.supplierContact,
      totalAmount: Number(order.totalAmount),
      status: order.status,
      approvedBy: order.approver ? { id: Number(order.approver.id), name: order.approver.name } : null,
      approvedAt: order.approvedAt,
      items: order.items.map((item) => ({
        id: Number(item.id),
        skuId: Number(item.skuId),
        imei: item.imei,
        brand: item.sku.product.brand,
        model: item.sku.product.model,
        color: item.sku.color,
        spec: item.sku.spec,
        quantity: item.quantity,
        unitCost: Number(item.unitCost),
        subtotal: Number(item.subtotal),
      })),
      remark: order.remark,
      receivedAt: order.receivedAt,
      createdAt: order.createdAt,
    };
  }

  /** 审核采购单（审核通过后自动入库） */
  async auditOrder(id: bigint, dto: AuditPurchaseOrderDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('采购单不存在');
    }

    if (order.status !== 'pending') {
      throw new UnprocessableEntityException('非待审核状态不可操作');
    }

    const isApproved = dto.action === 'approved';

    if (isApproved) {
      // 审核通过 → 自动入库
      const now = new Date();

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. 更新采购单状态
        const updated = await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: 'received',
            approvedBy: operatorId,
            approvedAt: now,
            receivedAt: now,
          },
        });

        // 2. 逐条自动入库：创建 ImeiStock + StockLedger
        let stockEntries = 0;
        for (const item of order.items) {
          // 检查 IMEI 是否已存在
          const existingImei = await tx.imeiStock.findUnique({
            where: { imei: item.imei },
          });
          if (existingImei) {
            throw new ConflictException(`IMEI ${item.imei} 已入库，无法重复入库`);
          }

          await tx.imeiStock.create({
            data: {
              shopId: order.shopId,
              skuId: item.skuId,
              imei: item.imei,
              costPrice: item.unitCost,
              status: 'in_stock',
              auditStatus: 'approved',
              version: 0,
            },
          });

          await tx.stockLedger.create({
            data: {
              shopId: order.shopId,
              imei: item.imei,
              changeType: 'inbound',
              fromStatus: null,
              toStatus: 'in_stock',
              operatorId,
              orderNo: order.orderNo,
              remark: `采购审核入库：${order.orderNo}`,
            },
          });

          stockEntries++;
        }

        return { updated, stockEntries };
      });

      await this.auditLog.write({
        shopId, operatorId, module: 'purchase', action: 'approve_order',
        targetType: 'purchase_order', targetId: order.orderNo,
        detailJson: {
          action: dto.action, remark: dto.remark,
          itemCount: order.items.length,
          stockEntries: result.stockEntries,
        },
        ipAddress: ip,
      });

      return {
        id: Number(order.id),
        orderNo: order.orderNo,
        status: 'received',
        receivedCount: order.items.length,
        stockLedgerEntries: result.stockEntries,
        receivedAt: now,
        message: '审核通过，已自动入库',
      };
    } else {
      // 审核拒绝 → 取消采购单
      const updated = await this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      await this.auditLog.write({
        shopId, operatorId, module: 'purchase', action: 'reject_order',
        targetType: 'purchase_order', targetId: order.orderNo,
        detailJson: { action: dto.action, remark: dto.remark },
        ipAddress: ip,
      });

      return {
        id: Number(order.id),
        orderNo: order.orderNo,
        status: 'cancelled',
        message: dto.remark ?? '审核拒绝，已取消',
      };
    }
  }

  /** 取消采购单 */
  async cancelOrder(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id, deletedAt: null },
    });

    if (!order) {
      throw new NotFoundException('采购单不存在');
    }

    if (order.status !== 'pending') {
      throw new UnprocessableEntityException('非待审核状态不可取消');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'cancelled',
        deletedAt: new Date(),
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'purchase', action: 'cancel_order',
      targetType: 'purchase_order', targetId: order.orderNo,
      ipAddress: ip,
    });

    return {
      id: Number(order.id),
      orderNo: order.orderNo,
      status: 'cancelled',
      message: '采购单已取消',
      cancelledAt: updated.deletedAt,
    };
  }

  /** 生成采购单号 PO + 日期 + 4位序号（原子：count 与 create 在同一事务内） */
  private async generateOrderNo(tx?: any): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const client = tx ?? this.prisma;
    const todayCount = await client.purchaseOrder.count({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
    });

    const seq = String(todayCount + 1).padStart(4, '0');
    return `PO${dateStr}${seq}`;
  }
}
