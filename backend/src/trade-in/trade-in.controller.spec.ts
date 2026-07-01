import { Test, TestingModule } from '@nestjs/testing';
import { TradeInController } from './trade-in.controller';
import { TradeInService } from './trade-in.service';

describe('TradeInController', () => {
  let controller: TradeInController;
  let service: any;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    warehouse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TradeInController],
      providers: [{ provide: TradeInService, useValue: mockService }],
    }).compile();

    controller = module.get<TradeInController>(TradeInController);
    service = module.get(TradeInService);
    jest.clearAllMocks();
  });

  it('应定义所有端点', () => {
    expect(controller).toBeDefined();
  });

  it('findAll - 应返回列表', async () => {
    mockService.findAll.mockResolvedValue({ items: [], total: 0 });
    const result = await controller.findAll({});
    expect(service.findAll).toHaveBeenCalled();
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('findOne - 应返回详情', async () => {
    mockService.findOne.mockResolvedValue({ id: 1 });
    const result = await controller.findOne('1');
    expect(service.findOne).toHaveBeenCalled();
    expect(result).toEqual({ id: 1 });
  });

  it('create - 应创建记录', async () => {
    const dto = { orderNo: 'SO001', appraisedValue: 1000, actualDeduction: 800 };
    mockService.create.mockResolvedValue({ id: 1, status: 'appraised' });
    const result = await controller.create(dto as any, { id: 1n, shopId: 1n }, {} as any);
    expect(service.create).toHaveBeenCalled();
    expect(result.status).toBe('appraised');
  });

  it('update - 应更新估值', async () => {
    const dto = { appraisedValue: 1200 };
    mockService.update.mockResolvedValue({ id: 1, appraisedValue: 1200 });
    const result = await controller.update('1', dto as any, { id: 1n, shopId: 1n }, {} as any);
    expect(service.update).toHaveBeenCalled();
    expect(result.appraisedValue).toBe(1200);
  });

  it('warehouse - 应入库', async () => {
    const dto = { oldImei: '123456789012345678', location: '旧机回收区' };
    mockService.warehouse.mockResolvedValue({ status: 'warehoused' });
    const result = await controller.warehouse('1', dto, { id: 1n, shopId: 1n }, {} as any);
    expect(service.warehouse).toHaveBeenCalled();
    expect(result.status).toBe('warehoused');
  });
});
