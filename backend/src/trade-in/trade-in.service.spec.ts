import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { TradeInService } from './trade-in.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('TradeInService', () => {
  let service: TradeInService;
  let prisma: any;
  let auditLog: any;

  const mockTradeIn = {
    id: 1n,
    shopId: 1n,
    orderNo: 'SO2026061600001',
    oldImei: null,
    oldBrand: 'Apple',
    oldModel: 'iPhone 13',
    oldCondition: 'good',
    appraisedValue: { toNumber: () => 2500, valueOf: () => '2500' },
    actualDeduction: { toNumber: () => 2500, valueOf: () => '2500' },
    remark: null,
    createdAt: new Date('2026-06-16'),
    updatedAt: new Date('2026-06-16'),
    shop: { id: 1n, name: '旗舰店' },
    order: {
      orderNo: 'SO2026061600001', totalAmount: { toNumber: () => 6999, valueOf: () => '6999' },
      actualPaid: { toNumber: () => 4499, valueOf: () => '4499' },
      paymentMethod: 'wechat', returnStatus: 'normal', createdAt: new Date('2026-06-16'),
    },
  };

  beforeEach(async () => {
    prisma = {
      tradeInOrder: {
        findMany: jest.fn().mockResolvedValue([mockTradeIn]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(mockTradeIn),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockTradeIn),
        update: jest.fn().mockResolvedValue(mockTradeIn),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { appraisedValue: 2500, actualDeduction: 2500 },
          _count: 1,
        }),
      },
      saleOrder: { findUnique: jest.fn().mockResolvedValue({ orderNo: 'SO2026061600001', deletedAt: null }) },
      imeiStock: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      productSku: { findFirst: jest.fn().mockResolvedValue(null) },
      stockLedger: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
    };

    auditLog = { write: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradeInService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<TradeInService>(TradeInService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('应返回分页列表含汇总', async () => {
      const result = await service.findAll({});
      expect(result.items).toHaveLength(1);
      expect(result.summary.totalAppraised).toBe(2500);
    });
  });

  describe('findOne', () => {
    it('应返回详情(含派生状态)', async () => {
      const result = await service.findOne(1n);
      expect(result.status).toBe('appraised');
      expect(result.appraisedValue).toBe(2500);
    });

    it('不存在应抛出 NotFoundException', async () => {
      prisma.tradeInOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto = {
      orderNo: 'SO2026061600001', oldBrand: 'Apple', oldModel: 'iPhone 13',
      oldCondition: 'good', appraisedValue: 2500,
    };

    it('应创建以旧换新记录', async () => {
      const result = await service.create(dto, 1n, 1n);
      expect(result.status).toBe('appraised');
      expect(result.appraisedValue).toBe(2500);
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('订单不存在应抛出 NotFoundException', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue(null);
      await expect(service.create(dto, 1n, 1n)).rejects.toThrow(NotFoundException);
    });

    it('订单已存在应抛出 ConflictException', async () => {
      prisma.tradeInOrder.findFirst.mockResolvedValue(mockTradeIn);
      await expect(service.create(dto, 1n, 1n)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('应更新估值信息', async () => {
      prisma.tradeInOrder.update.mockResolvedValue({
        ...mockTradeIn, appraisedValue: { toNumber: () => 3000, valueOf: () => '3000' },
      });
      const result = await service.update(1n, { appraisedValue: 3000 }, 1n, 1n);
      expect(result.appraisedValue).toBe(3000);
    });
  });

  describe('warehouse', () => {
    it('应完成旧机入库', async () => {
      const dto = { oldImei: '123456789012345', location: 'B-01', remark: '测试入库' };
      const result = await service.warehouse(1n, dto, 1n, 1n);

      expect(result.status).toBe('warehoused');
      expect(result.oldImei).toBe('123456789012345');
      expect(prisma.imeiStock.create).toHaveBeenCalled();
      expect(prisma.stockLedger.create).toHaveBeenCalled();
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('IMEI已存在应抛出 ConflictException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ imei: '123456789012345', status: 'in_stock' });
      await expect(
        service.warehouse(1n, { oldImei: '123456789012345' }, 1n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('记录不存在应抛出 NotFoundException', async () => {
      prisma.tradeInOrder.findUnique.mockResolvedValue(null);
      await expect(
        service.warehouse(999n, { oldImei: '123456789012345' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
