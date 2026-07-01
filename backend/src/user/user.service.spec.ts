import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('UserService', () => {
  let service: UserService;
  let prisma: any;

  const mockUser = {
    id: 1n, phone: '13800138000', name: '张三', passwordHash: 'hash',
    status: 'active', shopId: 1n, deletedAt: null,
    shop: { id: 1n, name: '旗舰店' },
    userRoles: [{ role: { id: 1n, code: 'salesperson', name: '销售员' } }],
    createdAt: new Date(), updatedAt: new Date(),
  };

  const mockPrisma = {
    sysUser: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sysRole: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sysUserRole: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    shop: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: { write: jest.fn() } },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('应返回分页用户列表', async () => {
      prisma.sysUser.findMany.mockResolvedValue([mockUser]);
      prisma.sysUser.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.items.length).toBe(1);
      expect(result.items[0].phone).toBe('13800138000');
      expect(result.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('应返回用户详情', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);
      const result = await service.findOne(1n);
      expect(result.phone).toBe('13800138000');
      expect(result.roles.length).toBe(1);
    });

    it('用户不存在应抛异常', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(null);
      await expect(service.findOne(1n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('应成功创建用户', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(null);
      prisma.shop.findUnique.mockResolvedValue({ id: 1n, name: '旗舰店' });
      prisma.sysRole.findMany.mockResolvedValue([{ id: 1n, code: 'salesperson' }]);
      prisma.sysUser.create.mockResolvedValue(mockUser);
      const result = await service.create({
        phone: '13800138000', name: '张三', password: 'pass123', shopId: 1, roleIds: [1],
      }, 1n);
      expect(result.phone).toBe('13800138000');
    });

    it('手机号已存在应抛异常', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);
      await expect(service.create({
        phone: '13800138000', name: '张三', password: 'pass123', shopId: 1,
      }, 1n)).rejects.toThrow(ConflictException);
    });

    it('门店不存在应抛异常', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(null);
      prisma.shop.findUnique.mockResolvedValue(null);
      await expect(service.create({
        phone: '13800138000', name: '张三', password: 'pass123', shopId: 999,
      }, 1n)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('应成功更新用户', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);
      prisma.sysUser.update.mockResolvedValue({ ...mockUser, name: '李四' });
      const result = await service.update(1n, { name: '李四' }, 1n);
      expect(result.name).toBe('李四');
    });
  });

  describe('remove', () => {
    it('应软删除用户', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);
      prisma.sysUser.update.mockResolvedValue({});
      const result = await service.remove(1n, 1n);
      expect(result.message).toContain('已删除');
    });
  });

  describe('assignRole', () => {
    it('应分配角色', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);
      prisma.sysRole.findUnique.mockResolvedValue({ id: 2n, code: 'owner' });
      prisma.sysUserRole.findUnique.mockResolvedValue(null);
      prisma.sysUserRole.create.mockResolvedValue({ id: 2n });
      const result = await service.assignRole(1n, 2n, 1n);
      expect(result.message).toContain('已分配');
    });

    it('已有角色应抛异常', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);
      prisma.sysRole.findUnique.mockResolvedValue({ id: 1n });
      prisma.sysUserRole.findUnique.mockResolvedValue({ id: 1n });
      await expect(service.assignRole(1n, 1n, 1n)).rejects.toThrow(ConflictException);
    });
  });

  describe('roles', () => {
    it('应返回角色列表', async () => {
      prisma.sysRole.findMany.mockResolvedValue([
        { id: 1n, code: 'salesperson', name: '销售员', description: null, userRoles: [], createdAt: new Date(), updatedAt: new Date() },
      ]);
      const result = await service.findAllRoles();
      expect(result.length).toBe(1);
    });

    it('应创建角色', async () => {
      prisma.sysRole.findUnique.mockResolvedValue(null);
      prisma.sysRole.create.mockResolvedValue({ id: 2n, code: 'manager', name: '店长', description: null, createdAt: new Date(), updatedAt: new Date() });
      const result = await service.createRole({ code: 'manager', name: '店长' }, 1n, 1n);
      expect(result.code).toBe('manager');
    });

    it('角色编码已存在应抛异常', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({ id: 1n, code: 'salesperson' });
      await expect(service.createRole({ code: 'salesperson', name: 'dup' }, 1n, 1n)).rejects.toThrow(ConflictException);
    });

    it('有用户的角色不可删除', async () => {
      prisma.sysRole.findUnique.mockResolvedValue({
        id: 1n, code: 'salesperson', name: '销售员',
        userRoles: [{ userId: 1n }],
      });
      await expect(service.deleteRole(1n, 1n, 1n)).rejects.toThrow(ConflictException);
    });
  });
});
