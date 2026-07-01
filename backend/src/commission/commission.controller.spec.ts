import { Test, TestingModule } from '@nestjs/testing';
import { CommissionController } from './commission.controller';
import { CommissionService } from './commission.service';

describe('CommissionController', () => {
  let controller: CommissionController;
  let service: any;

  const mockService = {
    findAll: jest.fn().mockResolvedValue({
      items: [], summary: { totalEstimated: 0, totalActual: 0 },
      total: 0, page: 1, pageSize: 20, totalPages: 0,
    }),
    findOne: jest.fn().mockResolvedValue({
      id: 1, order: { orderNo: 'SO2026061600001', grossProfit: 999 },
      estimatedCommission: 350, actualCommission: 350, status: 'pending',
    }),
    getSettlementSummary: jest.fn().mockResolvedValue({
      period: '2026-06', salespersonCount: 1,
      grandTotalEstimated: 3500, grandTotalActual: 3500, salespersons: [],
    }),
    calculatePreview: jest.fn().mockResolvedValue({
      input: {}, matchedRule: {}, calculation: {}, estimatedCommission: 350,
    }),
    findAllRules: jest.fn().mockResolvedValue([]),
    createRule: jest.fn().mockResolvedValue({
      id: 1, commissionType: 'percentage', commissionValue: 5,
    }),
    updateRule: jest.fn().mockResolvedValue({
      id: 1, commissionType: 'fixed', commissionValue: 50,
    }),
    toggleRule: jest.fn().mockResolvedValue({
      id: 1, status: false, message: '规则已禁用',
    }),
    confirmLedger: jest.fn().mockResolvedValue({
      id: 1, orderNo: 'SO2026061600001', status: 'confirmed', actualCommission: 350,
    }),
    batchConfirm: jest.fn().mockResolvedValue({
      period: '2026-06', salespersonId: 1, confirmedCount: 3, totalActual: 1050,
    }),
    rollbackByOrder: jest.fn().mockResolvedValue({
      orderNo: 'SO2026061600001', rolledBackCount: 1, totalRollback: 350,
    }),
    rollbackByLedger: jest.fn().mockResolvedValue({
      id: 1, orderNo: 'SO2026061600001', rollbackAmount: 350,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommissionController],
      providers: [{ provide: CommissionService, useValue: mockService }],
    }).compile();

    controller = module.get<CommissionController>(CommissionController);
    service = module.get<CommissionService>(CommissionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /commissions', () => {
    it('应调用 service.findAll', async () => {
      await controller.findAll({ page: 1, pageSize: 20 });
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /commissions/:id', () => {
    it('应调用 service.findOne', async () => {
      const result = await controller.findOne('1');
      expect(service.findOne).toHaveBeenCalledWith(1n);
      expect(result.status).toBe('pending');
    });
  });

  describe('GET /commissions/settlement/:period', () => {
    it('应调用 service.getSettlementSummary', async () => {
      const result = await controller.getSettlementSummary('2026-06');
      expect(service.getSettlementSummary).toHaveBeenCalledWith('2026-06', undefined);
      expect(result.period).toBe('2026-06');
    });
  });

  describe('POST /commissions/calculate', () => {
    it('应调用 service.calculatePreview', async () => {
      const dto = { salePrice: 6999, costPrice: 5500 };
      await controller.calculatePreview(dto);
      expect(service.calculatePreview).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /commissions/rules', () => {
    it('应调用 service.createRule', async () => {
      const dto = { commissionType: 'percentage', commissionValue: 5 };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.createRule(dto, user, req);
      expect(service.createRule).toHaveBeenCalledWith(dto, 1n, 1n, '127.0.0.1');
    });
  });

  describe('PUT /commissions/rules/:id', () => {
    it('应调用 service.updateRule', async () => {
      const dto = { commissionValue: 50 };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.updateRule('1', dto, user, req);
      expect(service.updateRule).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
    });
  });

  describe('PUT /commissions/rules/:id/toggle', () => {
    it('应调用 service.toggleRule', async () => {
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.toggleRule('1', user, req);
      expect(service.toggleRule).toHaveBeenCalledWith(1n, 1n, 1n, '127.0.0.1');
      expect(result.message).toBe('规则已禁用');
    });
  });

  describe('POST /commissions/:id/confirm', () => {
    it('应调用 service.confirmLedger', async () => {
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.confirmLedger('1', user, req);
      expect(service.confirmLedger).toHaveBeenCalledWith(1n, 1n, 1n, '127.0.0.1');
      expect(result.status).toBe('confirmed');
    });
  });

  describe('POST /commissions/batch-confirm', () => {
    it('应调用 service.batchConfirm', async () => {
      const body = { period: '2026-06', salespersonId: 1 };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.batchConfirm(body, user, req);
      expect(service.batchConfirm).toHaveBeenCalledWith('2026-06', 1n, 1n, 1n, '127.0.0.1');
    });
  });

  describe('POST /commissions/rollback/order', () => {
    it('应调用 service.rollbackByOrder', async () => {
      const body = { orderNo: 'SO2026061600001', reason: '退款' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.rollbackByOrder(body, user, req);
      expect(service.rollbackByOrder).toHaveBeenCalledWith(
        'SO2026061600001', { reason: '退款' }, 1n, 1n, '127.0.0.1',
      );
    });
  });

  describe('POST /commissions/:id/rollback', () => {
    it('应调用 service.rollbackByLedger', async () => {
      const dto = { reason: '误操作回滚' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.rollbackByLedger('1', dto, user, req);
      expect(service.rollbackByLedger).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
    });
  });
});
