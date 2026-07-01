import { Test, TestingModule } from '@nestjs/testing';
import { NationalSubsidyController } from './national-subsidy.controller';
import { NationalSubsidyService } from './national-subsidy.service';

describe('NationalSubsidyController', () => {
  let controller: NationalSubsidyController;
  let service: any;

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    submit: jest.fn(),
    startReview: jest.fn(),
    review: jest.fn(),
    disburse: jest.fn(),
    recall: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NationalSubsidyController],
      providers: [{ provide: NationalSubsidyService, useValue: mockService }],
    }).compile();

    controller = module.get<NationalSubsidyController>(NationalSubsidyController);
    service = module.get(NationalSubsidyService);
    jest.clearAllMocks();
  });

  it('应定义所有端点', () => {
    expect(controller).toBeDefined();
  });

  it('findAll - 应调用 service.findAll', async () => {
    mockService.findAll.mockResolvedValue({ items: [], total: 0 });
    const result = await controller.findAll({});
    expect(service.findAll).toHaveBeenCalled();
    expect(result).toEqual({ items: [], total: 0 });
  });

  it('findOne - 应调用 service.findOne', async () => {
    mockService.findOne.mockResolvedValue({ id: 1 });
    const result = await controller.findOne('1');
    expect(service.findOne).toHaveBeenCalled();
    expect(result).toEqual({ id: 1 });
  });

  it('submit - 应提交申请', async () => {
    mockService.submit.mockResolvedValue({ status: 'submitted' });
    const result = await controller.submit('1', { id: 1n, shopId: 1n }, {} as any);
    expect(service.submit).toHaveBeenCalled();
    expect(result.status).toBe('submitted');
  });

  it('review - 应审核通过', async () => {
    mockService.review.mockResolvedValue({ status: 'approved' });
    const result = await controller.review('1', { action: 'approved' }, { id: 1n, shopId: 1n }, {} as any);
    expect(service.review).toHaveBeenCalled();
    expect(result.status).toBe('approved');
  });

  it('disburse - 应打款', async () => {
    mockService.disburse.mockResolvedValue({ status: 'disbursed' });
    const result = await controller.disburse('1', { disbursedAmount: 500, externalRefNo: 'REF001' }, { id: 1n, shopId: 1n }, {} as any);
    expect(service.disburse).toHaveBeenCalled();
    expect(result.status).toBe('disbursed');
  });

  it('recall - 应召回', async () => {
    mockService.recall.mockResolvedValue({ status: 'recalled' });
    const result = await controller.recall('1', '违规', { id: 1n, shopId: 1n }, {} as any);
    expect(service.recall).toHaveBeenCalled();
    expect(result.status).toBe('recalled');
  });
});
