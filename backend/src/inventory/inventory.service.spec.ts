import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;
  let auditLog: any;

  const mockSku = {
    id: 1n,
    color: '原色钛金属',
    spec: '256GB',
    product: { brand: 'Apple', model: 'iPhone 16 Pro' },
  };

  const mockImeiStock = {
    id: 10n,
    shopId: 1n,
    skuId: 1n,
    imei: '356789012345678',
    batchNo: 'B2026001',
    location: 'A-03',
    costPrice: { toNumber: () => 7500 },
    channel: '官方渠道',
    status: 'pending_audit',
    auditStatus: 'pending',
    version: 0,
    createdAt: new Date('2026-06-10'),
    updatedAt: new Date('2026-06-10'),
    sku: mockSku,
  };

  beforeEach(async () => {
    prisma = {
      imeiStock: {
        findUnique: jest.fn().mockResolvedValue(mockImeiStock),
        findMany: jest.fn().mockResolvedValue([mockImeiStock]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockImeiStock),
        update: jest.fn().mockResolvedValue(mockImeiStock),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { costPrice: 750000 } }),
      },
      stockLedger: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productSku: {
        findUnique: jest.fn().mockResolvedValue(mockSku),
        count: jest.fn().mockResolvedValue(3),
      },
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scanInbound', () => {
    const dto = {
      imei: '356789012345678',
      skuId: 1,
      batchNo: 'B2026001',
      location: 'A-03',
      costPrice: 7500,
      channel: '官方渠道',
    };

    it('应成功创建入库记录并写流水', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(null);

      const result = await service.scanInbound(dto, 1n, 1n, '127.0.0.1');

      expect(result.imei).toBe('356789012345678');
      expect(result.status).toBe('pending_audit');
      expect(prisma.stockLedger.create).toHaveBeenCalled();
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('IMEI格式错误应抛出 BadRequestException', async () => {
      await expect(
        service.scanInbound({ ...dto, imei: 'abc' }, 1n, 1n),
      ).rejects.toThrow(BadRequestException);
    });

    it('IMEI已存在应抛出 ConflictException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(mockImeiStock);

      await expect(
        service.scanInbound(dto, 1n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('SKU不存在应抛出 NotFoundException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(null);
      prisma.productSku.findUnique.mockResolvedValue(null);

      await expect(
        service.scanInbound(dto, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('auditInbound', () => {
    it('审核通过应更新状态为 in_stock', async () => {
      prisma.imeiStock.update.mockResolvedValue({ ...mockImeiStock, status: 'in_stock', auditStatus: 'approved' });

      const result = await service.auditInbound(10n, { action: 'approved' }, 1n, 1n, '127.0.0.1');

      expect(result.status).toBe('in_stock');
      expect(prisma.stockLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: 'inbound_audit_approve', toStatus: 'in_stock' }),
        }),
      );
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('审核拒绝应更新状态为 scrapped', async () => {
      prisma.imeiStock.update.mockResolvedValue({ ...mockImeiStock, status: 'scrapped', auditStatus: 'rejected' });

      const result = await service.auditInbound(10n, { action: 'rejected', remark: 'IMEI重复' }, 1n, 1n);

      expect(result.status).toBe('scrapped');
      expect(prisma.stockLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: 'inbound_audit_reject' }),
        }),
      );
    });

    it('入库记录不存在应抛出 NotFoundException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(null);

      await expect(
        service.auditInbound(999n, { action: 'approved' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });

    it('非待审核状态不可操作', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, auditStatus: 'approved' });

      await expect(
        service.auditInbound(10n, { action: 'approved' }, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('findAllStock', () => {
    it('应返回分页列表含 daysInStock', async () => {
      const result = await service.findAllStock({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].daysInStock).toBeDefined();
      expect(result.total).toBe(1);
    });

    it('应按 status 和 location 筛选', async () => {
      await service.findAllStock({ status: 'in_stock', location: 'A-03' });

      const callArgs = prisma.imeiStock.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('in_stock');
      expect(callArgs.where.location).toEqual({ contains: 'A-03' });
    });
  });

  describe('findStockByImei', () => {
    it('应返回详情含时间线', async () => {
      prisma.stockLedger.findMany.mockResolvedValue([
        {
          changeType: 'inbound', fromStatus: null, toStatus: 'pending_audit',
          operatorId: 1n, createdAt: new Date('2026-06-10'),
          orderNo: null, remark: 'test',
          operator: { id: 1n, name: '仓管员', phone: '13900000001' },
        },
      ]);

      const result = await service.findStockByImei('356789012345678');

      expect(result.imei).toBe('356789012345678');
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].action).toBe('入库申请');
      expect(result.skuInfo!.brand).toBe('Apple');
    });

    it('IMEI不存在应抛出 NotFoundException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(null);

      await expect(
        service.findStockByImei('000000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('outboundCheck', () => {
    it('在库IMEI应成功锁定', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'in_stock', version: 3 });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.outboundCheck({ imei: '356789012345678' }, 1n, 1n, '127.0.0.1');

      expect(result.status).toBe('locked');
      expect(result.message).toContain('锁定');
      expect(prisma.imeiStock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { imei: '356789012345678', version: 3, status: 'in_stock' },
          data: { status: 'locked', version: { increment: 1 } },
        }),
      );
    });

    it('非在库IMEI应拒绝出库', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'sold' });

      await expect(
        service.outboundCheck({ imei: '356789012345678' }, 1n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('乐观锁冲突应抛出 ConflictException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'in_stock', version: 3 });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.outboundCheck({ imei: '356789012345678' }, 1n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('IMEI不存在应抛出 NotFoundException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(null);

      await expect(
        service.outboundCheck({ imei: '000000000000000' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelOutbound', () => {
    it('锁定IMEI应成功解锁', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'locked', version: 5 });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancelOutbound('356789012345678', 1n, 1n);

      expect(result.status).toBe('in_stock');
    });

    it('非锁定状态无需解锁', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'in_stock' });

      await expect(
        service.cancelOutbound('356789012345678', 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('scrapImei', () => {
    it('应成功报废 IMEI', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'in_stock', version: 2 });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.scrapImei('356789012345678', { reason: '屏幕损坏' }, 1n, 1n);

      expect(result.status).toBe('scrapped');
      expect(prisma.stockLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: 'scrap', toStatus: 'scrapped' }),
        }),
      );
    });

    it('已销售IMEI不允许报废', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'sold' });

      await expect(
        service.scrapImei('356789012345678', { reason: 'test' }, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('getSummary', () => {
    it('应返回各状态数量统计', async () => {
      const result = await service.getSummary();

      expect(result.byStatus).toBeDefined();
      expect(result.byStatus).toHaveProperty('in_stock');
      expect(result.byStatus).toHaveProperty('sold');
      expect(result.byStatus).toHaveProperty('scrapped');
      expect(result.totalValue).toBe(750000);
    });
  });

  describe('concurrentSell', () => {
    it('在库IMEI应成功销售', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'in_stock', version: 3 });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.concurrentSell('356789012345678', 1n);

      expect(result.success).toBe(true);
      expect(result.imei).toBe('356789012345678');
    });

    it('乐观锁冲突应返回失败', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'in_stock', version: 3 });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.concurrentSell('356789012345678', 1n);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('并发冲突');
    });

    it('非在库状态应返回失败', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'sold', version: 3 });

      const result = await service.concurrentSell('356789012345678', 1n);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('不是in_stock');
    });
  });
});
