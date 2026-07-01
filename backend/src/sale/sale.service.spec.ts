import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException, ConflictException,
  UnprocessableEntityException, BadRequestException,
} from '@nestjs/common';
import { SaleService } from './sale.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('SaleService', () => {
  let service: SaleService;
  let prisma: any;
  let auditLog: any;

  const mockSku = {
    id: 1n,
    color: '原色钛金属',
    spec: '256GB',
    retailPrice: 8999,
    minSalePrice: 8500,
    product: { brand: 'Apple', model: 'iPhone 16 Pro' },
  };

  const mockImeiStock = {
    id: 10n,
    shopId: 1n,
    skuId: 1n,
    imei: '356789012345678',
    status: 'locked',
    version: 3,
    costPrice: 7500,
    sku: mockSku,
  };

  const mockMember = {
    id: 5n,
    phone: '13900000001',
    name: '张先生',
    totalPoints: 500,
    deletedAt: null,
  };

  const mockOrder = {
    id: 100n,
    orderNo: 'SO202606150001',
    shopId: 1n,
    totalAmount: { toNumber: () => 8999 },
    totalCostSnapshot: { toNumber: () => 7500 },
    totalSubsidy: { toNumber: () => 500 },
    totalCommission: { toNumber: () => 449.95 },
    grossProfit: { toNumber: () => 1549.05 },
    actualPaid: { toNumber: () => 8499 },
    pointsUsedTotal: 0,
    paymentMethod: 'wechat',
    returnStatus: 'normal',
    createdAt: new Date('2026-06-15'),
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      imeiStock: {
        findUnique: jest.fn().mockResolvedValue(mockImeiStock),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      saleOrder: {
        findUnique: jest.fn().mockResolvedValue(mockOrder),
        findMany: jest.fn().mockResolvedValue([mockOrder]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockOrder),
        update: jest.fn().mockResolvedValue(mockOrder),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalAmount: { toNumber: () => 8999 }, grossProfit: { toNumber: () => 1549.05 } },
          _count: 1,
        }),
      },
      saleItem: {
        create: jest.fn().mockResolvedValue({}),
      },
      paymentFlow: {
        create: jest.fn().mockResolvedValue({
          paymentNo: 'PF202606150001', method: 'wechat', amount: { toNumber: () => 8499 },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tradeInOrder: {
        create: jest.fn().mockResolvedValue({ id: 1n }),
      },
      nationalSubsidy: {
        create: jest.fn().mockResolvedValue({ subsidyNo: 'NS202606150001' }),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      member: {
        findUnique: jest.fn().mockResolvedValue(mockMember),
        update: jest.fn().mockResolvedValue(mockMember),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pointLedger: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      commissionLedger: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      stockLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      paymentFlow_count: 0,
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        // Wire up paymentFlow.count to the transaction proxy
        if (!prisma.paymentFlow_count_setup) {
          prisma.paymentFlow.count = jest.fn().mockResolvedValue(0);
          prisma.paymentFlow_count_setup = true;
        }
        return fn(prisma);
      }),
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaleService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<SaleService>(SaleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSale', () => {
    const baseDto = {
      imei: '356789012345678',
      salePrice: 8999,
      payments: [{ method: 'wechat', amount: 8999 }],
    };

    it('应成功完成完整销售流程并返回订单详情', async () => {
      const result = await service.createSale({
        ...baseDto, salePrice: 8999, subsidyAmount: 500,
        payments: [{ method: 'wechat', amount: 8499 }],
      }, 2n, 1n, '127.0.0.1');

      expect(result.orderNo).toMatch(/^SO\d{12}$/);
      expect(result.costPriceSnapshot).toBe(7500);
      expect(result.commission).toBeDefined();
      expect(result.grossProfit).toBeDefined();
      expect(result.payments).toHaveLength(1);
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('应在事务中更新IMEI状态为sold', async () => {
      await service.createSale(baseDto, 2n, 1n);

      expect(prisma.imeiStock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            imei: '356789012345678',
            version: 3,
            status: { in: ['in_stock', 'locked'] },
          }),
          data: expect.objectContaining({ status: 'sold' }),
        }),
      );
    });

    it('IMEI不存在应抛出 NotFoundException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue(null);

      await expect(
        service.createSale(baseDto, 2n, 1n),
      ).rejects.toThrow(NotFoundException);
    });

    it('IMEI已销售应抛出 ConflictException', async () => {
      prisma.imeiStock.findUnique.mockResolvedValue({ ...mockImeiStock, status: 'sold' });

      await expect(
        service.createSale(baseDto, 2n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('售价低于最低限价应抛出 UnprocessableEntityException', async () => {
      await expect(
        service.createSale({
          ...baseDto, salePrice: 5000, payments: [{ method: 'wechat', amount: 5000 }],
        }, 2n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('收款合计与应收不符应抛出 BadRequestException', async () => {
      await expect(
        service.createSale({ ...baseDto, payments: [{ method: 'cash', amount: 5000 }] }, 2n, 1n),
      ).rejects.toThrow(BadRequestException);
    });

    it('乐观锁冲突应抛出 ConflictException', async () => {
      prisma.imeiStock.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.createSale(baseDto, 2n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(
        service.createSale({ ...baseDto, memberPhone: '13800000000' }, 2n, 1n),
      ).rejects.toThrow(NotFoundException);
    });

    it('积分不足应抛出 UnprocessableEntityException', async () => {
      await expect(
        service.createSale({ ...baseDto, memberPhone: '13900000001', pointsToUse: 99999 }, 2n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('应处理国补和以旧换新', async () => {
      const dto = {
        ...baseDto,
        salePrice: 8999,
        subsidyAmount: 500,
        tradeIn: {
          oldBrand: 'Apple', oldModel: 'iPhone 14', oldCondition: '良好',
          appraisedValue: 2000, actualDeduction: 2000,
        },
        payments: [{ method: 'wechat', amount: 6499 }], // 8999 - 500 - 2000 = 6499
      };

      const result = await service.createSale(dto, 2n, 1n);

      expect(prisma.tradeInOrder.create).toHaveBeenCalled();
      expect(prisma.nationalSubsidy.create).toHaveBeenCalled();
      expect(result.subsidyIncome).toBe(500);
      expect(result.tradeInOrderId).toBe(1);
    });

    it('应生成会员积分和提成', async () => {
      const dto = { ...baseDto, memberPhone: '13900000001', salePrice: 8999 };

      await service.createSale(dto, 2n, 1n);

      // 积分获取
      expect(prisma.pointLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberId: 5n,
            changeType: 'earn',
            orderNo: expect.stringMatching(/^SO/),
          }),
        }),
      );
      // 提成
      expect(prisma.commissionLedger.create).toHaveBeenCalled();
      // 库存流水
      expect(prisma.stockLedger.create).toHaveBeenCalled();
    });
  });

  describe('findAllOrders', () => {
    it('应返回分页列表含汇总统计', async () => {
      prisma.saleOrder.findMany.mockResolvedValue([{
        ...mockOrder,
        saleItems: [{
          imei: '356789012345678',
          sku: { product: { brand: 'Apple', model: 'iPhone 16 Pro' }, color: '原色钛金属', spec: '256GB' },
        }],
        salesperson: { id: 2n, name: '销售员B' },
        member: { id: 5n, phone: '13900000001', name: '张先生' },
      }]);

      const result = await service.findAllOrders({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.summary.totalOrders).toBe(1);
      expect(result.items[0].imei).toMatch(/\*\*\*\*/);
    });

    it('应按销售员和退货状态筛选', async () => {
      prisma.saleOrder.findMany.mockResolvedValue([{
        ...mockOrder,
        saleItems: [{
          imei: '356789012345678',
          sku: { product: { brand: 'Apple', model: 'iPhone 16 Pro' }, color: '原色钛金属', spec: '256GB' },
        }],
        salesperson: { id: 2n, name: '销售员B' },
        member: null,
      }]);

      await service.findAllOrders({ salespersonId: 2, returnStatus: 'normal' });

      const callArgs = prisma.saleOrder.findMany.mock.calls[0][0];
      expect(callArgs.where.salespersonId).toBe(2n);
      expect(callArgs.where.returnStatus).toBe('normal');
    });
  });

  describe('findOrderByOrderNo', () => {
    it('应返回完整订单详情', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        saleItems: [{
          imei: '356789012345678', salePrice: { toNumber: () => 8999 },
          costPriceSnapshot: { toNumber: () => 7500 }, subsidyIncome: { toNumber: () => 500 },
          commission: { toNumber: () => 449.95 }, grossProfit: { toNumber: () => 1549.05 },
          sku: { product: { brand: 'Apple', model: 'iPhone 16 Pro' }, color: '原色钛金属', spec: '256GB' },
        }],
        salesperson: { id: 2n, name: '销售员B' },
        member: { id: 5n, phone: '13900000001', name: '张先生' },
        paymentFlows: [{ paymentNo: 'PF01', method: 'wechat', amount: { toNumber: () => 8499 }, status: true }],
        tradeInOrders: [{ id: 1n, oldBrand: 'Apple', oldModel: 'iPhone 14', appraisedValue: { toNumber: () => 2000 }, actualDeduction: { toNumber: () => 2000 } }],
        nationalSubsidies: [{ subsidyNo: 'NS01', appliedAmount: { toNumber: () => 500 }, status: 'pending_submit' }],
      });

      const result = await service.findOrderByOrderNo('SO202606150001');

      expect(result.orderNo).toBe('SO202606150001');
      expect(result.payments).toHaveLength(1);
      expect(result.tradeIn).not.toBeNull();
      expect(result.subsidy).not.toBeNull();
    });

    it('订单不存在应抛出 NotFoundException', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.findOrderByOrderNo('SO_NOT_EXISTS'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelOrder', () => {
    it('应成功取消订单并回退库存', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        saleItems: [{ imei: '356789012345678', skuId: 1n }],
        paymentFlows: [{ paymentNo: 'PF01' }],
        member: mockMember,
      });

      const result = await service.cancelOrder('SO202606150001', '录入错误', 1n, 1n);

      expect(result.message).toBe('订单已取消');
      expect(prisma.imeiStock.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ imei: '356789012345678', status: 'sold' }),
          data: expect.objectContaining({ status: 'in_stock' }),
        }),
      );
      expect(prisma.stockLedger.create).toHaveBeenCalled();
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('已退货订单不可取消', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        returnStatus: 'returned',
      });

      await expect(
        service.cancelOrder('SO202606150001', 'test', 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('订单不存在应抛出 NotFoundException', async () => {
      prisma.saleOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelOrder('SO_NOT_EXISTS', 'test', 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
