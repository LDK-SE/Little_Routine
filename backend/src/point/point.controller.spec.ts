import { Test, TestingModule } from '@nestjs/testing';
import { PointController } from './point.controller';
import { PointService } from './point.service';

describe('PointController', () => {
  let controller: PointController;
  let service: any;

  const mockService = {
    getBalance: jest.fn().mockResolvedValue({
      memberId: 1,
      phone: '13900000001',
      name: '张先生',
      totalPoints: 5000,
      ledgerPoints: 5000,
      isConsistent: true,
      status: 'active',
    }),
    getLedger: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    }),
    redeem: jest.fn().mockResolvedValue({
      id: 1,
      memberId: 1,
      changeType: 'redeem',
      amount: -1000,
      balanceAfter: 4000,
      cashEquivalent: '10.00 元',
      orderNo: 'SO2026061600001',
      createdAt: new Date(),
    }),
    rollback: jest.fn().mockResolvedValue({
      id: 2,
      memberId: 1,
      changeType: 'manual_adjust',
      amount: 1000,
      balanceAfter: 5000,
      originalLedgerId: 1,
      originalChangeType: 'redeem',
      originalAmount: -1000,
      reason: '订单退款',
      createdAt: new Date(),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PointController],
      providers: [{ provide: PointService, useValue: mockService }],
    }).compile();

    controller = module.get<PointController>(PointController);
    service = module.get<PointService>(PointService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /points/:memberId', () => {
    it('应调用 service.getBalance 并返回余额', async () => {
      const result = await controller.getBalance('1');

      expect(service.getBalance).toHaveBeenCalledWith(1n);
      expect(result.memberId).toBe(1);
      expect(result.totalPoints).toBe(5000);
      expect(result.isConsistent).toBe(true);
    });
  });

  describe('GET /points/:memberId/ledger', () => {
    it('应调用 service.getLedger 合并路径参数到 query', async () => {
      await controller.getLedger('1', { page: 1, pageSize: 10 });

      expect(service.getLedger).toHaveBeenCalledWith(
        expect.objectContaining({ memberId: 1, page: 1, pageSize: 10 }),
      );
    });
  });

  describe('POST /points/redeem', () => {
    it('应调用 service.redeem 并传递操作人信息', async () => {
      const dto = { memberId: 1, amount: 1000, orderNo: 'SO2026061600001' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.redeem(dto, user, req);

      expect(service.redeem).toHaveBeenCalledWith(dto, 1n, 1n, '127.0.0.1');
      expect(result.balanceAfter).toBe(4000);
      expect(result.cashEquivalent).toBe('10.00 元');
    });
  });

  describe('POST /points/:ledgerId/rollback', () => {
    it('应调用 service.rollback 并传递 ledgerId 和原因', async () => {
      const dto = { reason: '订单退款，退回积分' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.rollback('1', dto, user, req);

      expect(service.rollback).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
      expect(result.originalLedgerId).toBe(1);
      expect(result.amount).toBe(1000);
    });
  });
});
