import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

describe('PurchaseController', () => {
  let controller: PurchaseController;
  let service: any;

  const mockService = {
    createOrder: jest.fn().mockResolvedValue({
      id: 1, orderNo: 'PO202606150001', status: 'pending', itemCount: 2, totalAmount: 15000,
    }),
    findAllOrders: jest.fn().mockResolvedValue({
      items: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
    }),
    findOrderById: jest.fn().mockResolvedValue({
      id: 1, orderNo: 'PO202606150001', supplierName: '供应商', totalAmount: 15000,
      status: 'pending', items: [], remark: '备注',
    }),
    auditOrder: jest.fn().mockResolvedValue({
      id: 1, orderNo: 'PO202606150001', status: 'received',
      receivedCount: 2, stockLedgerEntries: 2, message: '审核通过，已自动入库',
    }),
    cancelOrder: jest.fn().mockResolvedValue({
      id: 1, orderNo: 'PO202606150001', status: 'cancelled', message: '采购单已取消',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseController],
      providers: [{ provide: PurchaseService, useValue: mockService }],
    }).compile();

    controller = module.get<PurchaseController>(PurchaseController);
    service = module.get<PurchaseService>(PurchaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /purchase/orders', () => {
    it('应调用 service.createOrder', async () => {
      const dto = {
        supplierName: '供应商',
        items: [{ skuId: 1, imei: '356789012345678', unitCost: 7500 }],
      };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.createOrder(dto, user, req);

      expect(service.createOrder).toHaveBeenCalledWith(dto, 1n, 1n, '127.0.0.1');
      expect(result.orderNo).toBe('PO202606150001');
    });
  });

  describe('GET /purchase/orders', () => {
    it('应调用 service.findAllOrders', async () => {
      const query = { page: 1, pageSize: 20, status: 'pending' };

      await controller.findAllOrders(query);

      expect(service.findAllOrders).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /purchase/orders/:id', () => {
    it('应调用 service.findOrderById', async () => {
      const result = await controller.findOrderById('1');

      expect(service.findOrderById).toHaveBeenCalledWith(1n);
      expect(result.orderNo).toBe('PO202606150001');
    });
  });

  describe('POST /purchase/orders/:id/audit', () => {
    it('应调用 service.auditOrder', async () => {
      const dto = { action: 'approved' as const };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.auditOrder('1', dto, user, req);

      expect(service.auditOrder).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
      expect(result.message).toContain('自动入库');
    });
  });

  describe('POST /purchase/orders/:id/cancel', () => {
    it('应调用 service.cancelOrder', async () => {
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.cancelOrder('1', user, req);

      expect(service.cancelOrder).toHaveBeenCalledWith(1n, 1n, 1n, '127.0.0.1');
      expect(result.status).toBe('cancelled');
    });
  });
});
