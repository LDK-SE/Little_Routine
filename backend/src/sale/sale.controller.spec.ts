import { Test, TestingModule } from '@nestjs/testing';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';

describe('SaleController', () => {
  let controller: SaleController;
  let service: any;

  const mockService = {
    createSale: jest.fn().mockResolvedValue({
      orderNo: 'SO202606150001', imei: '356789012345678',
      salePrice: 8999, costPriceSnapshot: 7500,
      commission: 449.95, grossProfit: 1549.05,
      payments: [{ paymentNo: 'PF01', method: 'wechat', amount: 8499 }],
      tradeInOrderId: null, pointsEarned: 569,
    }),
    findAllOrders: jest.fn().mockResolvedValue({
      items: [], summary: { totalOrders: 0, totalSales: 0, totalProfit: 0 },
      total: 0, page: 1, pageSize: 20, totalPages: 0,
    }),
    findOrderByOrderNo: jest.fn().mockResolvedValue({
      orderNo: 'SO202606150001', totalAmount: 8999, items: [],
      payments: [], tradeIn: null, subsidy: null,
    }),
    cancelOrder: jest.fn().mockResolvedValue({
      orderNo: 'SO202606150001', message: '订单已取消',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SaleController],
      providers: [{ provide: SaleService, useValue: mockService }],
    }).compile();

    controller = module.get<SaleController>(SaleController);
    service = module.get<SaleService>(SaleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /sale/outbound/scan', () => {
    it('应调用 service.createSale', async () => {
      const dto = {
        imei: '356789012345678', salePrice: 8999,
        payments: [{ method: 'wechat', amount: 8999 }],
      };
      const user = { id: 2, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.createSale(dto, user, req);

      expect(service.createSale).toHaveBeenCalledWith(dto, 2n, 1n, '127.0.0.1');
      expect(result.orderNo).toBe('SO202606150001');
    });
  });

  describe('GET /sale/orders', () => {
    it('应调用 service.findAllOrders', async () => {
      const query = { page: 1, pageSize: 20 };
      await controller.findAllOrders(query);
      expect(service.findAllOrders).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /sale/orders/:orderNo', () => {
    it('应调用 service.findOrderByOrderNo', async () => {
      const result = await controller.findOrderByOrderNo('SO202606150001');
      expect(service.findOrderByOrderNo).toHaveBeenCalledWith('SO202606150001');
      expect(result.orderNo).toBe('SO202606150001');
    });
  });

  describe('DELETE /sale/orders/:orderNo', () => {
    it('应调用 service.cancelOrder', async () => {
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.cancelOrder('SO202606150001', '录入错误', user, req);

      expect(service.cancelOrder).toHaveBeenCalledWith('SO202606150001', '录入错误', 1n, 1n, '127.0.0.1');
      expect(result.message).toBe('订单已取消');
    });
  });
});
