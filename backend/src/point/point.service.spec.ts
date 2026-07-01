import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PointService } from './point.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('PointService', () => {
  let service: PointService;
  let prisma: any;
  let auditLog: any;

  const mockMember = {
    id: 1n,
    phone: '13900000001',
    name: '张先生',
    totalPoints: 5000,
    totalPointsVersion: 3,
    status: 'active',
  };

  const mockLedgerEntry = {
    id: 10n,
    memberId: 1n,
    changeType: 'earn',
    amount: 5000,
    balanceAfter: 5000,
    orderNo: 'SO2026061000001',
    orderTime: new Date('2026-06-10'),
    productModel: 'iPhone 16 Pro',
    unitPrice: { toNumber: () => 6999, valueOf: () => '6999' },
    quantity: 1,
    expiresAt: new Date('2027-06-10'),
    expiredAmount: 0,
    remainingAmount: 5000,
    remark: '购买赠送积分',
    createdAt: new Date('2026-06-10'),
  };

  const mockRedeemEntry = {
    id: 11n,
    memberId: 1n,
    changeType: 'redeem',
    amount: -1000,
    balanceAfter: 4000,
    orderNo: 'SO2026061600001',
    orderTime: null,
    productModel: null,
    unitPrice: null,
    quantity: 1,
    expiresAt: null,
    expiredAmount: 0,
    remainingAmount: 0,
    remark: null,
    createdAt: new Date('2026-06-16'),
  };

  beforeEach(async () => {
    prisma = {
      member: {
        findUnique: jest.fn().mockResolvedValue(mockMember),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pointLedger: {
        findMany: jest.fn().mockResolvedValue([mockLedgerEntry, mockRedeemEntry]),
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockResolvedValue(mockRedeemEntry),
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 4000 } }),
      },
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<PointService>(PointService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalance', () => {
    it('应返回会员积分余额及流水汇总', async () => {
      const result = await service.getBalance(1n);

      expect(result.memberId).toBe(1);
      expect(result.totalPoints).toBe(5000);
      expect(result.ledgerPoints).toBe(4000);
      expect(result.isConsistent).toBe(false);
      expect(prisma.member.findUnique).toHaveBeenCalledWith({
        where: { id: 1n, deletedAt: null },
        select: expect.objectContaining({ totalPoints: true }),
      });
      expect(prisma.pointLedger.aggregate).toHaveBeenCalledWith({
        where: { memberId: 1n },
        _sum: { amount: true },
      });
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(service.getBalance(999n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLedger', () => {
    it('应返回分页流水列表', async () => {
      const result = await service.getLedger({ memberId: 1 });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items[0].changeType).toBe('earn');
      expect(result.items[0].unitPrice).toBe(6999);
    });

    it('memberId 为空应抛出 BadRequestException', async () => {
      await expect(service.getLedger({} as any)).rejects.toThrow(BadRequestException);
    });

    it('应按 changeType 筛选', async () => {
      await service.getLedger({ memberId: 1, changeType: 'redeem' });

      const callArgs = prisma.pointLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.changeType).toBe('redeem');
    });

    it('应按日期范围筛选', async () => {
      await service.getLedger({ memberId: 1, startDate: '2026-06-01', endDate: '2026-06-30' });

      const callArgs = prisma.pointLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt.gte).toBeDefined();
      expect(callArgs.where.createdAt.lte).toBeDefined();
    });

    it('应按订单号筛选', async () => {
      await service.getLedger({ memberId: 1, orderNo: 'SO2026061600001' });

      const callArgs = prisma.pointLedger.findMany.mock.calls[0][0];
      expect(callArgs.where.orderNo).toBe('SO2026061600001');
    });
  });

  describe('redeem', () => {
    const redeemDto = {
      memberId: 1,
      amount: 1000,
      orderNo: 'SO2026061600001',
      productModel: 'iPhone 16 Pro',
      unitPrice: 6999,
    };

    it('应成功抵扣积分', async () => {
      const result = await service.redeem(redeemDto, 1n, 1n, '127.0.0.1');

      expect(result.changeType).toBe('redeem');
      expect(result.amount).toBe(-1000);
      expect(result.cashEquivalent).toContain('10.00');
      expect(prisma.member.updateMany).toHaveBeenCalledWith({
        where: { id: 1n, totalPointsVersion: 3 },
        data: { totalPoints: 4000, totalPointsVersion: { increment: 1 } },
      });
      expect(prisma.pointLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          memberId: 1n,
          changeType: 'redeem',
          amount: -1000,
          balanceAfter: 4000,
        }),
      });
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(service.redeem(redeemDto, 1n, 1n)).rejects.toThrow(NotFoundException);
    });

    it('会员状态异常应抛出 UnprocessableEntityException', async () => {
      prisma.member.findUnique.mockResolvedValue({ ...mockMember, status: 'inactive' });

      await expect(service.redeem(redeemDto, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });

    it('积分不足应抛出 UnprocessableEntityException', async () => {
      prisma.member.findUnique.mockResolvedValue({ ...mockMember, totalPoints: 100 });

      await expect(service.redeem(redeemDto, 1n, 1n)).rejects.toThrow(UnprocessableEntityException);
    });

    it('不满 3000 积分应抛出 UnprocessableEntityException', async () => {
      prisma.member.findUnique.mockResolvedValue({ ...mockMember, totalPoints: 2000 });

      await expect(
        service.redeem({ ...redeemDto, amount: 500 }, 1n, 1n),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('乐观锁冲突重试后应成功', async () => {
      prisma.member.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.redeem(redeemDto, 1n, 1n);

      expect(prisma.member.updateMany).toHaveBeenCalledTimes(2);
      expect(result.changeType).toBe('redeem');
    });

    it('乐观锁3次全部失败应抛出 ConflictException', async () => {
      prisma.member.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.redeem(redeemDto, 1n, 1n)).rejects.toThrow(ConflictException);
      expect(prisma.member.updateMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('rollback', () => {
    const rollbackDto = { reason: '订单退款，退回积分' };

    it('应成功回滚 redeem 流水', async () => {
      prisma.pointLedger.findFirst.mockResolvedValueOnce(mockRedeemEntry);

      const result = await service.rollback(11n, rollbackDto, 1n, 1n, '127.0.0.1');

      expect(result.changeType).toBe('manual_adjust');
      expect(result.amount).toBe(1000); // -(-1000)
      expect(result.originalLedgerId).toBe(11);
      expect(prisma.pointLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changeType: 'manual_adjust',
          remark: expect.stringContaining('ROLLBACK:11'),
        }),
      });
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('应成功回滚 earn 流水', async () => {
      prisma.pointLedger.findFirst.mockResolvedValueOnce(mockLedgerEntry);

      const result = await service.rollback(10n, rollbackDto, 1n, 1n);

      expect(result.amount).toBe(-5000); // reverse of +5000 earn
      expect(result.originalChangeType).toBe('earn');
    });

    it('流水不存在应抛出 NotFoundException', async () => {
      await expect(service.rollback(999n, rollbackDto, 1n, 1n)).rejects.toThrow(NotFoundException);
    });

    it('不支持回滚的类型应抛出 UnprocessableEntityException', async () => {
      prisma.pointLedger.findFirst.mockResolvedValueOnce({
        ...mockLedgerEntry,
        changeType: 'manual_adjust',
      });

      await expect(service.rollback(10n, rollbackDto, 1n, 1n)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('已被回滚应抛出 ConflictException', async () => {
      prisma.pointLedger.findFirst
        .mockResolvedValueOnce(mockRedeemEntry)
        .mockResolvedValueOnce({ id: 99n });

      await expect(service.rollback(11n, rollbackDto, 1n, 1n)).rejects.toThrow(ConflictException);
    });

    it('回滚后余额为负应抛出 UnprocessableEntityException', async () => {
      prisma.pointLedger.findFirst.mockResolvedValueOnce(mockLedgerEntry);
      prisma.member.findUnique.mockResolvedValue({ ...mockMember, totalPoints: 3000 });

      await expect(service.rollback(10n, rollbackDto, 1n, 1n)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('乐观锁冲突重试后应成功', async () => {
      prisma.pointLedger.findFirst.mockResolvedValueOnce(mockRedeemEntry);
      prisma.member.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.rollback(11n, rollbackDto, 1n, 1n);

      expect(prisma.member.updateMany).toHaveBeenCalledTimes(2);
      expect(result.changeType).toBe('manual_adjust');
    });
  });
});
