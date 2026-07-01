import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { ReturnService } from './return.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('ReturnService', () => {
  let service: ReturnService;
  let prisma: any;
  let auditLog: any;

  const mockPrisma = {
    returnOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    saleOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    imeiStock: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    stockLedger: { create: jest.fn() },
    paymentFlow: { create: jest.fn() },
    pointLedger: { create: jest.fn() },
    commissionLedger: { updateMany: jest.fn() },
    nationalSubsidy: { updateMany: jest.fn() },
    member: { update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: { write: jest.fn(), logLogin: jest.fn(), logLogout: jest.fn(), logTokenRefresh: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReturnService>(ReturnService);
    prisma = module.get(PrismaService);
    auditLog = module.get(AuditLogService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      originalOrderNo: 'SO202606160001',
      imei: '123456789012345678',
      returnReason: '屏幕坏点',
      returnType: 'full_return',
      refundAmount: 5999,
    };

    it('应成功创建退货申请', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        id: 1n,
        orderNo: 'SO202606160001',
        returnStatus: 'normal',
        saleItems: [{ imei: '123456789012345678', skuId: 1n }],
      });
      prisma.imeiStock.findUnique.mockResolvedValue({ imei: '123456789012345678', status: 'sold' });
      prisma.returnOrder.findFirst.mockResolvedValue(null);
      prisma.returnOrder.create.mockResolvedValue({
        id: 1n,
        returnNo: 'RT202606160001',
        originalOrderNo: 'SO202606160001',
        imei: '123456789012345678',
        returnType: 'full_return',
        refundAmount: 5999,
        auditStatus: 'pending',
        createdAt: new Date(),
      });

      const result = await service.create(dto as any, 2n, 1n);
      expect(result.returnNo).toBe('RT202606160001');
      expect(result.auditStatus).toBe('pending');
    });

    it('原订单不存在应抛出 NotFoundException', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue(null);
      await expect(service.create(dto as any, 2n, 1n)).rejects.toThrow(NotFoundException);
    });

    it('订单已在退货中应拒绝', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        id: 1n,
        orderNo: 'SO202606160001',
        returnStatus: 'return_requested',
        saleItems: [{ imei: '123456789012345678', skuId: 1n }],
      });
      await expect(service.create(dto as any, 2n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });

    it('IMEI状态不是sold应拒绝', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        id: 1n,
        orderNo: 'SO202606160001',
        returnStatus: 'normal',
        saleItems: [{ imei: '123456789012345678', skuId: 1n }],
      });
      prisma.imeiStock.findUnique.mockResolvedValue({ imei: '123456789012345678', status: 'in_stock' });
      await expect(service.create(dto as any, 2n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });

    it('已有退货单应拒绝', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        id: 1n,
        orderNo: 'SO202606160001',
        returnStatus: 'normal',
        saleItems: [{ imei: '123456789012345678', skuId: 1n }],
      });
      prisma.imeiStock.findUnique.mockResolvedValue({ imei: '123456789012345678', status: 'sold' });
      prisma.returnOrder.findFirst.mockResolvedValue({ id: 1n });
      await expect(service.create(dto as any, 2n, 1n)).rejects.toThrow(ConflictException);
    });
  });

  describe('audit', () => {
    it('审核通过应返回approved', async () => {
      prisma.returnOrder.findUnique.mockResolvedValue({
        id: 1n, returnNo: 'RT001', auditStatus: 'pending',
        originalOrder: { member: null },
      });
      prisma.returnOrder.update.mockResolvedValue({
        id: 1n, returnNo: 'RT001', auditStatus: 'approved', auditedAt: new Date(),
      });

      const result = await service.audit(1n, { action: 'approved' }, 2n, 1n);
      expect(result.auditStatus).toBe('approved');
    });

    it('非待审核状态应拒绝', async () => {
      prisma.returnOrder.findUnique.mockResolvedValue({
        id: 1n, returnNo: 'RT001', auditStatus: 'approved',
        originalOrder: { member: null },
      });
      await expect(service.audit(1n, { action: 'approved' }, 2n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('complete', () => {
    it('应完成退货：IMEI回退+退款+积分+提成+国补', async () => {
      prisma.returnOrder.findUnique.mockResolvedValue({
        id: 1n,
        shopId: 1n,
        returnNo: 'RT001',
        originalOrderNo: 'SO001',
        imei: '123456789012345678',
        auditStatus: 'approved',
        completedAt: null,
        refundAmount: 5999,
        pointsRecalled: 599,
        commissionRecalled: 299.95,
        subsidyRecalled: 500,
        imeiRef: { version: 5 },
        originalOrder: { member: { id: 1n, totalPoints: 1000 } },
      });
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.complete(1n, 2n, 1n);
      expect(result.status).toBe('completed');
    });

    it('未审核通过应拒绝', async () => {
      prisma.returnOrder.findUnique.mockResolvedValue({
        id: 1n, auditStatus: 'pending', completedAt: null,
        originalOrder: { member: null },
      });
      await expect(service.complete(1n, 2n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });

    it('已完成应拒绝重复', async () => {
      prisma.returnOrder.findUnique.mockResolvedValue({
        id: 1n, auditStatus: 'approved', completedAt: new Date(),
        originalOrder: { member: null },
      });
      await expect(service.complete(1n, 2n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('findAll', () => {
    it('应返回分页列表', async () => {
      prisma.returnOrder.findMany.mockResolvedValue([
        { id: 1n, shopId: 1n, shop: { id: 1n, name: '门店A' }, returnNo: 'RT001', originalOrderNo: 'SO001', imei: '123456789012345678', returnReason: '坏', returnType: 'full_return', refundAmount: 5999, pointsRecalled: 0, commissionRecalled: 0, subsidyRecalled: 0, auditStatus: 'pending', createdAt: new Date() },
      ]);
      prisma.returnOrder.count.mockResolvedValue(1);
      prisma.returnOrder.aggregate.mockResolvedValue({ _sum: { refundAmount: 5999, pointsRecalled: 0, commissionRecalled: 0, subsidyRecalled: 0 } });

      const result = await service.findAll({});
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
    });
  });
});
