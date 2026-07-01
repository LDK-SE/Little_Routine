import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('PurchaseService', () => {
  let service: PurchaseService;
  let prisma: any;
  let auditLog: any;

  const mockOrder = {
    id: 1n,
    orderNo: 'PO202606150001',
    shopId: 1n,
    supplierName: '官方授权经销商',
    supplierContact: '13800000000',
    totalAmount: { toNumber: () => 15000 },
    status: 'pending',
    approvedBy: null,
    approvedAt: null,
    receivedAt: null,
    remark: '补货iPhone 16 Pro',
    deletedAt: null,
    createdAt: new Date('2026-06-15'),
    updatedAt: new Date('2026-06-15'),
    _count: { items: 2 },
  };

  const mockItems = [
    { id: 1n, purchaseOrderId: 1n, skuId: 1n, imei: '356789012345678', quantity: 1, unitCost: { toNumber: () => 7500 }, subtotal: { toNumber: () => 7500 } },
    { id: 2n, purchaseOrderId: 1n, skuId: 1n, imei: '356789012345679', quantity: 1, unitCost: { toNumber: () => 7500 }, subtotal: { toNumber: () => 7500 } },
  ];

  beforeEach(async () => {
    prisma = {
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue(mockOrder),
        findMany: jest.fn().mockResolvedValue([mockOrder]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockOrder),
        update: jest.fn().mockResolvedValue(mockOrder),
      },
      purchaseItem: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      productSku: {
        findUnique: jest.fn().mockResolvedValue({ id: 1n, color: '原色钛金属', spec: '256GB' }),
      },
      imeiStock: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      stockLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        // Simple mock: execute the callback with prisma
        return fn(prisma);
      }),
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<PurchaseService>(PurchaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    const dto = {
      supplierName: '官方授权经销商',
      supplierContact: '13800000000',
      items: [
        { skuId: 1, imei: '356789012345678', unitCost: 7500 },
        { skuId: 1, imei: '356789012345679', unitCost: 7500 },
      ],
      remark: '补货iPhone 16 Pro',
    };

    it('应成功创建采购单并记录审计日志', async () => {
      const result = await service.createOrder(dto, 1n, 1n, '127.0.0.1');

      expect(result.orderNo).toMatch(/^PO\d{12}$/);
      expect(result.status).toBe('pending');
      expect(result.itemCount).toBe(2);
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('应在事务中创建订单和明细', async () => {
      await service.createOrder(dto, 1n, 1n);

      expect(prisma.purchaseOrder.create).toHaveBeenCalled();
      expect(prisma.purchaseItem.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ imei: '356789012345678', unitCost: 7500 }),
        ]),
      });
    });

    it('IMEI已入库应抛出 ConflictException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ imei: '356789012345678' });

      await expect(
        service.createOrder(dto, 1n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('SKU不存在应抛出 NotFoundException', async () => {
      prisma.productSku.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrder(dto, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllOrders', () => {
    it('应返回分页列表', async () => {
      const result = await service.findAllOrders({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('应按状态筛选', async () => {
      await service.findAllOrders({ status: 'pending' });

      const callArgs = prisma.purchaseOrder.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('pending');
    });

    it('应按日期范围筛选', async () => {
      await service.findAllOrders({ startDate: '2026-06-01', endDate: '2026-06-14' });

      const callArgs = prisma.purchaseOrder.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
      expect(callArgs.where.createdAt.lte).toBeInstanceOf(Date);
    });
  });

  describe('findOrderById', () => {
    it('应返回订单详情含采购明细', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        items: mockItems.map((item) => ({
          ...item,
          sku: { product: { brand: 'Apple', model: 'iPhone 16 Pro' }, color: '原色钛金属', spec: '256GB' },
        })),
        approver: null,
      });

      const result = await service.findOrderById(1n);

      expect(result.orderNo).toBe('PO202606150001');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].brand).toBe('Apple');
    });

    it('采购单不存在应抛出 NotFoundException', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null);

      await expect(service.findOrderById(999n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('auditOrder', () => {
    it('审核通过应自动入库', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        items: mockItems,
      });

      const result = await service.auditOrder(1n, { action: 'approved' }, 1n, 1n, '127.0.0.1');

      expect(result.status).toBe('received');
      expect(result.message).toContain('自动入库');
      expect(prisma.imeiStock.create).toHaveBeenCalledTimes(2);
      expect(prisma.stockLedger.create).toHaveBeenCalledTimes(2);
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('审核拒绝应取消采购单', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        items: mockItems,
      });

      const result = await service.auditOrder(1n, { action: 'rejected', remark: '不符合采购要求' }, 1n, 1n);

      expect(result.status).toBe('cancelled');
      expect(result.message).toContain('不符合采购要求');
    });

    it('采购单不存在应抛出 NotFoundException', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.auditOrder(999n, { action: 'approved' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });

    it('非待审核状态不可操作', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({ ...mockOrder, status: 'received' });

      await expect(
        service.auditOrder(1n, { action: 'approved' }, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('cancelOrder', () => {
    it('应成功取消待审核采购单', async () => {
      prisma.purchaseOrder.update.mockResolvedValue({
        ...mockOrder,
        status: 'cancelled',
        deletedAt: new Date(),
      });

      const result = await service.cancelOrder(1n, 1n, 1n, '127.0.0.1');

      expect(result.status).toBe('cancelled');
      expect(result.message).toBe('采购单已取消');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('非待审核状态不可取消', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue({ ...mockOrder, status: 'approved' });

      await expect(
        service.cancelOrder(1n, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('采购单不存在应抛出 NotFoundException', async () => {
      prisma.purchaseOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelOrder(999n, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
