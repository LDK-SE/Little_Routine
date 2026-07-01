import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { NationalSubsidyService } from './national-subsidy.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('NationalSubsidyService', () => {
  let service: NationalSubsidyService;
  let prisma: any;
  let auditLog: any;

  const mockSubsidy = {
    id: 1n,
    shopId: 1n,
    subsidyNo: 'NS202606160001',
    orderNo: 'SO2026061600001',
    imei: '356789012345678',
    appliedAmount: { toNumber: () => 500, valueOf: () => '500' },
    approvedAmount: null,
    status: 'pending_submit',
    externalRefNo: null,
    remark: null,
    submittedAt: null,
    reviewedAt: null,
    disbursedAt: null,
    recalledAt: null,
    createdAt: new Date('2026-06-16'),
    updatedAt: new Date('2026-06-16'),
    shop: { id: 1n, name: '旗舰店' },
    order: {
      orderNo: 'SO2026061600001', totalAmount: { toNumber: () => 6999, valueOf: () => '6999' },
      grossProfit: { toNumber: () => 999, valueOf: () => '999' },
      actualPaid: { toNumber: () => 6499, valueOf: () => '6499' },
      paymentMethod: 'wechat', returnStatus: 'normal',
    },
  };

  beforeEach(async () => {
    prisma = {
      nationalSubsidy: {
        findMany: jest.fn().mockResolvedValue([mockSubsidy]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(mockSubsidy),
        update: jest.fn().mockResolvedValue(mockSubsidy),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { appliedAmount: 500, approvedAmount: null },
        }),
      },
      saleOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      paymentFlow: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
    };

    auditLog = { write: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NationalSubsidyService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<NationalSubsidyService>(NationalSubsidyService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('应返回分页列表含汇总', async () => {
      const result = await service.findAll({});
      expect(result.items).toHaveLength(1);
      expect(result.summary.totalApplied).toBe(500);
    });
  });

  describe('findOne', () => {
    it('应返回详情', async () => {
      const result = await service.findOne(1n);
      expect(result.subsidyNo).toBe('NS202606160001');
    });
  });

  describe('submit', () => {
    it('pending_submit → submitted', async () => {
      prisma.nationalSubsidy.update.mockResolvedValue({ ...mockSubsidy, status: 'submitted', submittedAt: new Date() });
      const result = await service.submit(1n, 1n, 1n);
      expect(result.status).toBe('submitted');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('非 pending_submit 应拒绝', async () => {
      prisma.nationalSubsidy.findUnique.mockResolvedValue({ ...mockSubsidy, status: 'submitted' });
      await expect(service.submit(1n, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('startReview', () => {
    it('submitted → under_review', async () => {
      prisma.nationalSubsidy.findUnique.mockResolvedValue({ ...mockSubsidy, status: 'submitted' });
      prisma.nationalSubsidy.update.mockResolvedValue({ ...mockSubsidy, status: 'under_review' });
      const result = await service.startReview(1n, 1n, 1n);
      expect(result.status).toBe('under_review');
    });

    it('非 submitted 应拒绝', async () => {
      await expect(service.startReview(1n, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('review', () => {
    it('approved: under_review → approved', async () => {
      prisma.nationalSubsidy.findUnique.mockResolvedValue({ ...mockSubsidy, status: 'under_review' });
      prisma.nationalSubsidy.update.mockResolvedValue({
        ...mockSubsidy, status: 'approved', approvedAmount: { toNumber: () => 500, valueOf: () => '500' }, reviewedAt: new Date(),
      });
      const result = await service.review(1n, { action: 'approved' }, 1n, 1n);
      expect(result.status).toBe('approved');
    });

    it('rejected: under_review → rejected', async () => {
      prisma.nationalSubsidy.findUnique.mockResolvedValue({ ...mockSubsidy, status: 'under_review' });
      prisma.nationalSubsidy.update.mockResolvedValue({ ...mockSubsidy, status: 'rejected', reviewedAt: new Date() });
      const result = await service.review(1n, { action: 'rejected' }, 1n, 1n);
      expect(result.status).toBe('rejected');
    });

    it('非 under_review 应拒绝', async () => {
      await expect(service.review(1n, { action: 'approved' }, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('disburse', () => {
    it('approved → disbursed', async () => {
      prisma.nationalSubsidy.findUnique.mockResolvedValue({ ...mockSubsidy, status: 'approved' });
      prisma.nationalSubsidy.update.mockResolvedValue({ ...mockSubsidy, status: 'disbursed', disbursedAt: new Date() });
      const result = await service.disburse(1n, { disbursedAmount: 500 }, 1n, 1n);
      expect(result.status).toBe('disbursed');
      expect(prisma.paymentFlow.create).toHaveBeenCalled();
    });

    it('非 approved 应拒绝', async () => {
      await expect(service.disburse(1n, { disbursedAmount: 500 }, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('recall', () => {
    it('disbursed → recalled', async () => {
      prisma.nationalSubsidy.findUnique.mockResolvedValue({
        ...mockSubsidy, status: 'disbursed', approvedAmount: { toNumber: () => 500, valueOf: () => '500' },
      });
      prisma.nationalSubsidy.update.mockResolvedValue({ ...mockSubsidy, status: 'recalled', recalledAt: new Date() });
      const result = await service.recall(1n, '退货召回', 1n, 1n);
      expect(result.status).toBe('recalled');
    });

    it('非 disbursed 应拒绝', async () => {
      await expect(service.recall(1n, 'test', 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
