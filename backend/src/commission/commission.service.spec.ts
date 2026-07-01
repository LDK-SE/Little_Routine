import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommissionService } from './commission.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('CommissionService', () => {
  let service: CommissionService;
  let prisma: any;
  let auditLog: any;

  const mockCommissionLedger = {
    id: 1n,
    shopId: 1n,
    salespersonId: 2n,
    settlementPeriod: '2026-06',
    orderNo: 'SO2026061600001',
    estimatedCommission: { toNumber: () => 350, valueOf: () => '350' },
    adjustment: { toNumber: () => 0, valueOf: () => '0' },
    actualCommission: { toNumber: () => 350, valueOf: () => '350' },
    status: 'pending',
    confirmedBy: null,
    confirmedAt: null,
    createdAt: new Date('2026-06-16'),
    updatedAt: new Date('2026-06-16'),
    salesperson: { id: 2n, name: '销售员A', phone: '13900000002' },
    order: {
      orderNo: 'SO2026061600001',
      totalAmount: { toNumber: () => 6999, valueOf: () => '6999' },
      grossProfit: { toNumber: () => 999, valueOf: () => '999' },
    },
    shop: { id: 1n, name: '旗舰店' },
    confirmer: null,
  };

  const mockRule = {
    id: 1n,
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    minPrice: { toNumber: () => 5000, valueOf: () => '5000' },
    maxPrice: { toNumber: () => 10000, valueOf: () => '10000' },
    commissionType: 'percentage',
    commissionValue: { toNumber: () => 5, valueOf: () => '5' },
    priority: 10,
    status: true,
    createdAt: new Date('2026-06-10'),
    updatedAt: new Date('2026-06-10'),
  };

  beforeEach(async () => {
    prisma = {
      commissionLedger: {
        findMany: jest.fn().mockResolvedValue([mockCommissionLedger]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(mockCommissionLedger),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockCommissionLedger),
        update: jest.fn().mockResolvedValue(mockCommissionLedger),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { estimatedCommission: 350, actualCommission: 350 },
        }),
      },
      commissionRule: {
        findMany: jest.fn().mockResolvedValue([mockRule]),
        findUnique: jest.fn().mockResolvedValue(mockRule),
        create: jest.fn().mockResolvedValue(mockRule),
        update: jest.fn().mockResolvedValue(mockRule),
      },
      saleOrder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<CommissionService>(CommissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('应返回分页列表含汇总', async () => {
      const result = await service.findAll({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].orderNo).toBe('SO2026061600001');
      expect(result.summary.totalEstimated).toBe(350);
      expect(result.total).toBe(1);
    });

    it('应按状态筛选', async () => {
      await service.findAll({ status: 'pending' });

      const callArgs = prisma.commissionLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('pending');
    });

    it('应按结算周期筛选', async () => {
      await service.findAll({ settlementPeriod: '2026-06' });

      const callArgs = prisma.commissionLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.settlementPeriod).toBe('2026-06');
    });

    it('应按销售人员筛选', async () => {
      await service.findAll({ salespersonId: 2 });

      const callArgs = prisma.commissionLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.salespersonId).toBe(2n);
    });
  });

  describe('findOne', () => {
    it('应返回提成详情含订单信息', async () => {
      const result = await service.findOne(1n);

      expect(result.id).toBe(1);
      expect(result.order.orderNo).toBe('SO2026061600001');
      expect(result.estimatedCommission).toBe(350);
    });

    it('记录不存在应抛出 NotFoundException', async () => {
      prisma.commissionLedger.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSettlementSummary', () => {
    it('应按销售人员聚合提成', async () => {
      const result = await service.getSettlementSummary('2026-06');

      expect(result.period).toBe('2026-06');
      expect(result.salespersonCount).toBe(1);
      expect(result.salespersons[0].totalEstimated).toBe(350);
    });
  });

  describe('calculatePreview', () => {
    it('应匹配规则并按 percentage 计算', async () => {
      const result = await service.calculatePreview({
        brand: 'Apple', model: 'iPhone 16 Pro', salePrice: 6999, costPrice: 5500,
      });

      expect(result.matchedRule.id).toBe(1);
      expect(result.matchedRule.basis).toBe('金额');
      expect(result.estimatedCommission).toBeGreaterThan(0);
    });

    it('应使用默认规则当无匹配时', async () => {
      prisma.commissionRule.findMany.mockResolvedValue([]);

      const result = await service.calculatePreview({
        salePrice: 5000, costPrice: 4000,
      });

      expect(result.matchedRule.id).toBeNull();
      expect(result.matchedRule.remark).toContain('默认');
    });

    it('fixed 类型应为按台数计算', async () => {
      prisma.commissionRule.findMany.mockResolvedValue([{
        ...mockRule, commissionType: 'fixed', commissionValue: { toNumber: () => 100, valueOf: () => '100' },
      }]);

      const result = await service.calculatePreview({
        salePrice: 6999, quantity: 3,
      });

      expect(result.calculation.basis).toBe('台数');
      expect(result.estimatedCommission).toBe(300);
    });

    it('tiered 类型应为按毛利计算', async () => {
      prisma.commissionRule.findMany.mockResolvedValue([{
        ...mockRule, commissionType: 'tiered', commissionValue: { toNumber: () => 10, valueOf: () => '10' },
      }]);

      const result = await service.calculatePreview({
        salePrice: 6999, costPrice: 5500, subsidyAmount: 500,
      });

      expect(result.calculation.basis).toBe('毛利');
    });

    it('品牌不匹配应跳过规则', async () => {
      const result = await service.calculatePreview({
        brand: 'Samsung', model: 'Galaxy S25', salePrice: 6999,
      });

      expect(result.matchedRule.id).toBeNull();
    });
  });

  describe('createRule', () => {
    it('应创建提成规则', async () => {
      const dto = { commissionType: 'percentage', commissionValue: 5 };
      const result = await service.createRule(dto, 1n, 1n);

      expect(result.commissionType).toBe('percentage');
      expect(result.commissionValue).toBe(5);
      expect(auditLog.write).toHaveBeenCalled();
    });
  });

  describe('updateRule', () => {
    it('应更新提成规则', async () => {
      prisma.commissionRule.update.mockResolvedValue({ ...mockRule, commissionType: 'fixed', commissionValue: { toNumber: () => 50, valueOf: () => '50' } });

      const result = await service.updateRule(1n, { commissionType: 'fixed', commissionValue: 50 }, 1n, 1n);

      expect(result.commissionType).toBe('fixed');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('规则不存在应抛出 NotFoundException', async () => {
      prisma.commissionRule.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRule(999n, { commissionValue: 50 }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleRule', () => {
    it('应切换规则状态', async () => {
      prisma.commissionRule.update.mockResolvedValue({ ...mockRule, status: false });

      const result = await service.toggleRule(1n, 1n, 1n);

      expect(result.status).toBe(false);
      expect(result.message).toBe('规则已禁用');
    });

    it('规则不存在应抛出 NotFoundException', async () => {
      prisma.commissionRule.findUnique.mockResolvedValue(null);

      await expect(service.toggleRule(999n, 1n, 1n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmLedger', () => {
    it('应确认单条提成', async () => {
      prisma.commissionLedger.update.mockResolvedValue({
        ...mockCommissionLedger, status: 'confirmed', confirmedAt: new Date(),
      });

      const result = await service.confirmLedger(1n, 1n, 1n);

      expect(result.status).toBe('confirmed');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('非 pending 状态应拒绝', async () => {
      prisma.commissionLedger.findUnique.mockResolvedValue({
        ...mockCommissionLedger, status: 'confirmed',
      });

      await expect(service.confirmLedger(1n, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });

    it('记录不存在应抛出 NotFoundException', async () => {
      prisma.commissionLedger.findUnique.mockResolvedValue(null);

      await expect(service.confirmLedger(999n, 1n, 1n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('batchConfirm', () => {
    it('应批量确认提成', async () => {
      prisma.commissionLedger.findMany.mockResolvedValue([{ id: 1n }, { id: 2n }]);

      const result = await service.batchConfirm('2026-06', 2n, 1n, 1n);

      expect(result.confirmedCount).toBe(2);
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('无待确认记录应抛出 NotFoundException', async () => {
      prisma.commissionLedger.findMany.mockResolvedValue([]);

      await expect(service.batchConfirm('2026-06', 2n, 1n, 1n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('rollbackByOrder', () => {
    it('应回滚整单提成', async () => {
      const result = await service.rollbackByOrder(
        'SO2026061600001', { reason: '退款' }, 1n, 1n,
      );

      expect(result.rolledBackCount).toBe(1);
      expect(result.totalRollback).toBe(350);
      expect(prisma.saleOrder.updateMany).toHaveBeenCalled();
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('订单无提成记录应抛出 NotFoundException', async () => {
      prisma.commissionLedger.findMany.mockResolvedValue([]);

      await expect(
        service.rollbackByOrder('SO999', { reason: '退款' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });

    it('存在已支付记录应拒绝', async () => {
      prisma.commissionLedger.findMany.mockResolvedValue([
        { ...mockCommissionLedger, status: 'paid' },
      ]);

      await expect(
        service.rollbackByOrder('SO2026061600001', { reason: '退款' }, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('rollbackByLedger', () => {
    it('应回滚单条提成', async () => {
      const result = await service.rollbackByLedger(1n, { reason: '误操作' }, 1n, 1n);

      expect(result.rollbackAmount).toBe(350);
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('记录不存在应抛出 NotFoundException', async () => {
      prisma.commissionLedger.findUnique.mockResolvedValue(null);

      await expect(
        service.rollbackByLedger(999n, { reason: '误操作' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });

    it('已支付应拒绝', async () => {
      prisma.commissionLedger.findUnique.mockResolvedValue({
        ...mockCommissionLedger, status: 'paid',
        order: { orderNo: 'SO2026061600001' },
      });

      await expect(
        service.rollbackByLedger(1n, { reason: '误操作' }, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
