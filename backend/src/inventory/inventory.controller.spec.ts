import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: any;

  const mockService = {
    scanInbound: jest.fn().mockResolvedValue({
      id: 1, imei: '356789012345678', status: 'pending_audit',
    }),
    findAllInbound: jest.fn().mockResolvedValue({
      items: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
    }),
    auditInbound: jest.fn().mockResolvedValue({
      id: 1, imei: '356789012345678', status: 'in_stock',
    }),
    findAllStock: jest.fn().mockResolvedValue({
      items: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
    }),
    findStockByImei: jest.fn().mockResolvedValue({
      imei: '356789012345678', currentStatus: 'in_stock', timeline: [],
    }),
    findLedgerByImei: jest.fn().mockResolvedValue({
      items: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
    }),
    outboundCheck: jest.fn().mockResolvedValue({
      imei: '356789012345678', status: 'locked', message: '已锁定',
    }),
    cancelOutbound: jest.fn().mockResolvedValue({
      imei: '356789012345678', status: 'in_stock', message: '已解锁',
    }),
    scrapImei: jest.fn().mockResolvedValue({
      imei: '356789012345678', status: 'scrapped', message: '已报废',
    }),
    getSummary: jest.fn().mockResolvedValue({
      totalInStock: 100, totalValue: 750000, byStatus: { in_stock: 100 },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: mockService }],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    service = module.get<InventoryService>(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /inventory/inbound/scan', () => {
    it('应调用 service.scanInbound', async () => {
      const dto = { imei: '356789012345678', skuId: 1 };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.scanInbound(dto, user, req);

      expect(service.scanInbound).toHaveBeenCalledWith(dto, 1n, 1n, '127.0.0.1');
      expect(result.imei).toBe('356789012345678');
    });
  });

  describe('GET /inventory/inbound/audit-list', () => {
    it('应调用 service.findAllInbound', async () => {
      await controller.findAllInbound({ page: 1, pageSize: 20 });
      expect(service.findAllInbound).toHaveBeenCalled();
    });
  });

  describe('POST /inventory/inbound/audit/:id', () => {
    it('应调用 service.auditInbound', async () => {
      const dto = { action: 'approved' as const };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.auditInbound('10', dto, user, req);

      expect(service.auditInbound).toHaveBeenCalledWith(10n, dto, 1n, 1n, '127.0.0.1');
    });
  });

  describe('GET /inventory/stock', () => {
    it('应调用 service.findAllStock', async () => {
      await controller.findAllStock({ page: 1, pageSize: 20 });
      expect(service.findAllStock).toHaveBeenCalled();
    });
  });

  describe('GET /inventory/stock/summary', () => {
    it('应调用 service.getSummary', async () => {
      const result = await controller.getSummary();
      expect(result.totalInStock).toBe(100);
    });
  });

  describe('GET /inventory/stock/:imei', () => {
    it('应调用 service.findStockByImei', async () => {
      const result = await controller.findStockByImei('356789012345678');
      expect(service.findStockByImei).toHaveBeenCalledWith('356789012345678');
      expect(result.imei).toBe('356789012345678');
    });
  });

  describe('GET /inventory/stock/:imei/ledger', () => {
    it('应调用 service.findLedgerByImei', async () => {
      await controller.findLedgerByImei('356789012345678', {});
      expect(service.findLedgerByImei).toHaveBeenCalled();
    });
  });

  describe('POST /inventory/outbound/check', () => {
    it('应调用 service.outboundCheck', async () => {
      const dto = { imei: '356789012345678' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.outboundCheck(dto, user, req);

      expect(service.outboundCheck).toHaveBeenCalledWith(dto, 1n, 1n, '127.0.0.1');
      expect(result.status).toBe('locked');
    });
  });

  describe('POST /inventory/outbound/cancel', () => {
    it('应调用 service.cancelOutbound', async () => {
      const dto = { imei: '356789012345678' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.cancelOutbound(dto, user, req);

      expect(service.cancelOutbound).toHaveBeenCalledWith('356789012345678', 1n, 1n, '127.0.0.1');
      expect(result.message).toBe('已解锁');
    });
  });

  describe('POST /inventory/stock/:imei/scrap', () => {
    it('应调用 service.scrapImei', async () => {
      const dto = { reason: '损坏' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.scrapImei('356789012345678', dto, user, req);

      expect(service.scrapImei).toHaveBeenCalledWith('356789012345678', dto, 1n, 1n, '127.0.0.1');
      expect(result.status).toBe('scrapped');
    });
  });
});
