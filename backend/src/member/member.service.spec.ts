import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { MemberService } from './member.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('MemberService', () => {
  let service: MemberService;
  let prisma: any;
  let auditLog: any;

  const mockMember = {
    id: 1n,
    phone: '13900000001',
    name: '张先生',
    address: '广东省广州市天河区',
    licensePlate: '粤A12345',
    backupPhone: '13900000002',
    lastPurchaseModel: 'iPhone 16 Pro',
    totalPoints: 3680,
    status: 'active',
    referrerId: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
  };

  beforeEach(async () => {
    prisma = {
      member: {
        findUnique: jest.fn().mockResolvedValue(mockMember),
        findMany: jest.fn().mockResolvedValue([mockMember]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockMember),
        update: jest.fn().mockResolvedValue(mockMember),
      },
      memberReferral: {
        create: jest.fn().mockResolvedValue({}),
      },
      pointLedger: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<MemberService>(MemberService);
  });

  describe('register', () => {
    it('应成功注册新会员并写入审计日志', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      const result = await service.register(
        { phone: '13900000001', name: '张先生' },
        0n, 0n, '127.0.0.1',
      );

      expect(result.phone).toBe('13900000001');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('手机号已注册时应抛出 ConflictException', async () => {
      prisma.member.findUnique.mockResolvedValue(mockMember);

      await expect(
        service.register({ phone: '13900000001' }, 0n, 0n),
      ).rejects.toThrow(ConflictException);
    });

    it('已软删除的会员重新注册应恢复', async () => {
      prisma.member.findUnique.mockResolvedValue({
        ...mockMember,
        deletedAt: new Date('2026-03-01'),
      });
      prisma.member.update.mockResolvedValue({ ...mockMember, deletedAt: null });

      const result = await service.register(
        { phone: '13900000001', name: '张先生' },
        0n, 0n,
      );

      expect(result.status).toBe('active');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('自己推荐自己应抛出 UnprocessableEntityException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(
        service.register({
          phone: '13900000001',
          referrerPhone: '13900000001',
        }, 0n, 0n),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('推荐人不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique
        .mockResolvedValueOnce(null) // 手机号不存在
        .mockResolvedValueOnce(null); // 推荐人不存在

      await expect(
        service.register({
          phone: '13900000001',
          referrerPhone: '13800000000',
        }, 0n, 0n),
      ).rejects.toThrow(NotFoundException);
    });

    it('有推荐人时应创建推荐关系', async () => {
      prisma.member.findUnique
        .mockResolvedValueOnce({ ...mockMember, id: 5n, phone: '13800000000' }) // 推荐人查找（事务外）
        .mockResolvedValueOnce(null); // 手机号唯一检查（事务内）

      await service.register(
        { phone: '13900000001', referrerPhone: '13800000000' },
        0n, 0n,
      );

      expect(prisma.memberReferral.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('应返回分页列表', async () => {
      prisma.member.findMany.mockResolvedValue([mockMember]);
      prisma.member.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('应按关键词搜索姓名和手机号', async () => {
      await service.findAll({ keyword: '张三' });

      const callArgs = prisma.member.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual([
        { name: { contains: '张三' } },
        { phone: { contains: '张三' } },
      ]);
    });

    it('应按状态筛选', async () => {
      await service.findAll({ status: 'active' });

      const callArgs = prisma.member.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('active');
    });

    it('应只查询未删除的会员', async () => {
      await service.findAll({});

      const callArgs = prisma.member.findMany.mock.calls[0][0];
      expect(callArgs.where.deletedAt).toBeNull();
    });
  });

  describe('findOne', () => {
    it('应返回会员详情含推荐人信息', async () => {
      prisma.member.findUnique.mockResolvedValue({
        ...mockMember,
        referrer: { id: 5n, phone: '138****5678', name: '李女士' },
        _count: { referrals: 3 },
      });

      const result = await service.findOne(1n);

      expect(result.phone).toBe('13900000001');
      expect(result.referrer).not.toBeNull();
      expect(result.referralCount).toBe(3);
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('应成功编辑会员信息并记录审计日志', async () => {
      prisma.member.update.mockResolvedValue({
        ...mockMember,
        name: '新名字',
        address: '新地址',
      });

      const result = await service.update(
        1n,
        { name: '新名字', address: '新地址' },
        1n, 1n, '127.0.0.1',
      );

      expect(result.name).toBe('新名字');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(
        service.update(999n, { name: 'test' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('应软删除会员并记录审计日志', async () => {
      const deletedAt = new Date();
      prisma.member.update.mockResolvedValue({
        ...mockMember,
        deletedAt,
        status: 'inactive',
      });

      const result = await service.remove(1n, '用户主动注销', 1n, 1n, '127.0.0.1');

      expect(result.message).toBe('会员已注销');
      expect(result.deletedAt).toBeDefined();
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(
        service.remove(999n, 'test', 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('应成功禁用会员', async () => {
      prisma.member.update.mockResolvedValue({ ...mockMember, status: 'inactive' });

      const result = await service.updateStatus(
        1n,
        { status: 'inactive', reason: '违规' },
        1n, 1n, '127.0.0.1',
      );

      expect(result.status).toBe('inactive');
      expect(result.message).toBe('会员已禁用');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('应成功启用会员', async () => {
      prisma.member.update.mockResolvedValue({ ...mockMember, status: 'active' });

      const result = await service.updateStatus(
        1n,
        { status: 'active', reason: '' },
        1n, 1n,
      );

      expect(result.message).toBe('会员已启用');
    });

    it('会员不存在应抛出 NotFoundException', async () => {
      prisma.member.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(999n, { status: 'active' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
