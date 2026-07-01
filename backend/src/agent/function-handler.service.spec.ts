import { Test, TestingModule } from '@nestjs/testing';
import { FunctionHandlerService } from './function-handler.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FunctionHandlerService', () => {
  let service: FunctionHandlerService;
  let prisma: any;

  const mockStock = {
    skuId: 1n,
    location: 'A-03',
    sku: {
      color: '原色钛金属',
      spec: '256GB',
      product: {
        brand: 'Apple',
        model: 'iPhone 16 Pro',
        deletedAt: null,
      },
    },
  };

  const mockStock2 = {
    skuId: 1n,
    location: 'B-07',
    sku: {
      color: '原色钛金属',
      spec: '256GB',
      product: {
        brand: 'Apple',
        model: 'iPhone 16 Pro',
        deletedAt: null,
      },
    },
  };

  const mockSaleAggregation = {
    _sum: {
      totalAmount: { toNumber: () => 186500, valueOf: () => '186500' },
      totalCostSnapshot: { toNumber: () => 152300, valueOf: () => '152300' },
      totalSubsidy: { toNumber: () => 8500, valueOf: () => '8500' },
      totalCommission: { toNumber: () => 9325, valueOf: () => '9325' },
      grossProfit: { toNumber: () => 33375, valueOf: () => '33375' },
    },
    _count: 14,
  };

  const mockMember = {
    phone: '13900000001',
    name: '张先生',
    totalPoints: 3680,
    pointLedgers: [
      {
        changeType: 'earn',
        amount: 5699,
        createdAt: new Date('2026-06-10'),
        productModel: 'iPhone 16 Pro',
      },
      {
        changeType: 'redeem',
        amount: -500,
        createdAt: new Date('2026-06-15'),
        productModel: null,
      },
    ],
  };

  const mockUser = {
    id: 1n,
    name: '李明',
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      imeiStock: {
        findMany: jest.fn().mockResolvedValue([mockStock, mockStock2]),
      },
      saleOrder: {
        aggregate: jest.fn().mockResolvedValue(mockSaleAggregation),
        findMany: jest.fn().mockResolvedValue([]),
      },
      member: {
        findUnique: jest.fn().mockResolvedValue(mockMember),
      },
      sysUser: {
        findMany: jest.fn().mockResolvedValue([mockUser]),
      },
      commissionLedger: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { actualCommission: { toNumber: () => 12680, valueOf: () => '12680' } },
          _count: 42,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunctionHandlerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FunctionHandlerService>(FunctionHandlerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queryInventory', () => {
    it('应按关键词搜索库存并聚合', async () => {
      const result = await service.queryInventory('iPhone');

      expect(result.function).toBe('query_inventory');
      expect(result.result).toHaveLength(1);
      expect(result.result[0].model).toBe('iPhone 16 Pro');
      expect(result.result[0].color).toBe('原色钛金属');
      expect(result.result[0].inStockCount).toBe(2);
      expect(result.result[0].locations).toContain('A-03');
      expect(result.result[0].locations).toContain('B-07');
      expect(result.searchedAt).toBeDefined();
    });

    it('应按 location 筛选', async () => {
      await service.queryInventory('iPhone', 'A-03');

      const callArgs = prisma.imeiStock.findMany.mock.calls[0][0];
      expect(callArgs.where.location).toEqual({ contains: 'A-03' });
    });

    it('无匹配时应返回空数组', async () => {
      prisma.imeiStock.findMany.mockResolvedValue([]);

      const result = await service.queryInventory('不存在的型号');

      expect(result.result).toHaveLength(0);
    });
  });

  describe('queryGrossProfit', () => {
    it('应查询今日毛利', async () => {
      const result = await service.queryGrossProfit('today');

      expect(result.function).toBe('query_gross_profit');
      expect(result.result.totalRevenue).toBe(186500);
      expect(result.result.totalCost).toBe(152300);
      expect(result.result.grossProfit).toBe(33375);
      expect(result.result.orderCount).toBe(14);
    });

    it('默认 period 应为 today', async () => {
      await service.queryGrossProfit();

      const callArgs = prisma.saleOrder.aggregate.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeDefined();
      expect(callArgs.where.createdAt.lte).toBeDefined();
    });

    it('应查询本月毛利', async () => {
      await service.queryGrossProfit('this_month');

      const callArgs = prisma.saleOrder.aggregate.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeDefined();
    });
  });

  describe('queryMemberPoints', () => {
    it('应返回会员积分信息', async () => {
      const result = await service.queryMemberPoints('13900000001');

      expect(result.function).toBe('query_member_points');
      expect(result.result!.phone).toBe('139****0001');
      expect(result.result!.name).toBe('张先生');
      expect(result.result!.totalPoints).toBe(3680);
      expect(result.result!.recentEarn).toHaveLength(1);
      expect(result.result!.recentEarn[0].type).toBe('消费得积分');
      expect(result.result!.recentEarn[0].amount).toBe(5699);
    });

    it('会员不存在应返回 null', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      const result = await service.queryMemberPoints('13999999999');

      expect(result.result).toBeNull();
      expect(result.message).toBe('未找到该会员');
    });
  });

  describe('querySalespersonPerformance', () => {
    it('应返回员工业绩数据', async () => {
      const result = await service.querySalespersonPerformance('李明');

      expect(result.function).toBe('query_salesperson_performance');
      const data = result.result as any[];
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('李明');
      expect(data[0].totalCommission).toBe(12680);
    });

    it('员工不存在应返回 null', async () => {
      prisma.sysUser.findMany.mockResolvedValue([]);

      const result = await service.querySalespersonPerformance('不存在');

      expect(result.result).toBeNull();
      expect(result.message).toBe('未找到该员工');
    });
  });

  describe('queryMemberOrders', () => {
    it('应返回会员购买记录', async () => {
      prisma.saleOrder.findMany.mockResolvedValue([
        {
          orderNo: 'SO2026061000123',
          totalAmount: { toNumber: () => 8999, valueOf: () => '8999' },
          createdAt: new Date('2026-06-10T15:30:00'),
          saleItems: [
            {
              imei: '356789012345678',
              sku: {
                color: '原色钛金属',
                spec: '256GB',
                product: { model: 'iPhone 16 Pro', brand: 'Apple' },
              },
            },
          ],
        },
      ]);

      const result = await service.queryMemberOrders('13900000001');

      expect(result.function).toBe('query_member_orders');
      expect(result.result!.phone).toBe('139****0001');
      expect(result.result!.orders).toHaveLength(1);
      expect(result.result!.orders[0].orderNo).toBe('SO2026061000123');
      expect(result.result!.orders[0].model).toBe('iPhone 16 Pro');
      expect(result.result!.orders[0].price).toBe(8999);
    });

    it('会员不存在应返回 null', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      const result = await service.queryMemberOrders('13999999999');

      expect(result.result).toBeNull();
      expect(result.message).toBe('未找到该会员');
    });
  });
});
