import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { TokenBlacklistService } from './token-blacklist.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let auditLog: any;
  let blacklist: any;

  const mockUser = {
    id: 1n,
    phone: '13800138000',
    name: '张三',
    passwordHash: '',
    shopId: 1n,
    status: 'active',
    shop: { id: 1n, name: '总店' },
    userRoles: [{ role: { code: 'salesperson', name: '销售员' } }],
  };

  let newUserName = '李四';

  beforeEach(async () => {
    prisma = {
      sysUser: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        create: jest.fn().mockImplementation((args: any) =>
          Promise.resolve({
            ...mockUser,
            phone: args.data.phone,
            name: args.data.name,
            passwordHash: args.data.passwordHash,
          }),
        ),
      },
      sysRole: {
        findUnique: jest.fn().mockResolvedValue({ id: 1n, code: 'salesperson', name: '销售员' }),
        create: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-token'),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.refreshExpiresIn') return '30d';
        if (key === 'jwt.secret') return 'test-secret';
        return null;
      }),
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
      logLogin: jest.fn().mockResolvedValue(undefined),
      logLogout: jest.fn().mockResolvedValue(undefined),
      logTokenRefresh: jest.fn().mockResolvedValue(undefined),
    };

    blacklist = {
      blacklist: jest.fn().mockResolvedValue(undefined),
      isBlacklisted: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: AuditLogService, useValue: auditLog },
        { provide: TokenBlacklistService, useValue: blacklist },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('应成功登录并返回 accessToken', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      prisma.sysUser.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
        name: '张三',
      });

      const result = await service.login({ phone: '13800138000', password: 'password123' });

      expect(result.accessToken).toBe('mock-token');
      expect(result.user.phone).toBe('13800138000');
      expect(result.user.roles).toContain('salesperson');
      expect(auditLog.logLogin).toHaveBeenCalled();
    });

    it('密码错误时应抛出 UnauthorizedException', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 10);
      prisma.sysUser.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: hashedPassword,
      });

      await expect(
        service.login({ phone: '13800138000', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('用户不存在时应抛出 UnauthorizedException', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ phone: '00000000000', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('离职用户应抛出 UnauthorizedException', async () => {
      prisma.sysUser.findUnique.mockResolvedValue({ ...mockUser, status: 'inactive' });

      await expect(
        service.login({ phone: '13800138000', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('应成功注册新用户', async () => {
      prisma.sysUser.findUnique.mockResolvedValueOnce(null);
      const hashedPassword = await bcrypt.hash('password123', 10);

      const result = await service.register({
        phone: '13900139000',
        password: 'password123',
        name: '李四',
        shopId: 1,
      });

      expect(result.accessToken).toBe('mock-token');
      expect(result.user.name).toBe('李四');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('手机号已注册时应抛出 ConflictException', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          phone: '13800138000',
          password: 'password123',
          name: '张三',
          shopId: 1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('logout', () => {
    it('应将 token 加入黑名单并记录审计日志', async () => {
      await service.logout('Bearer test-token', {
        sub: 1,
        phone: '13800138000',
        roles: ['salesperson'],
        shopId: 1,
      });

      expect(blacklist.blacklist).toHaveBeenCalledWith('Bearer test-token');
      expect(auditLog.logLogout).toHaveBeenCalledWith(1n, 1n);
    });
  });

  describe('refreshToken', () => {
    it('应返回新的 accessToken 并记录审计日志', async () => {
      const result = await service.refreshToken('Bearer old-token', {
        sub: 1,
        phone: '13800138000',
        roles: ['salesperson'],
        shopId: 1,
      });

      expect(result.accessToken).toBe('mock-token');
      expect(auditLog.logTokenRefresh).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('应返回当前用户完整信息', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(1n);

      expect(result.id).toBe(1);
      expect(result.phone).toBe('13800138000');
      expect(result.shopName).toBe('总店');
      expect(result.roles).toContain('salesperson');
    });

    it('用户不存在时应抛出 UnauthorizedException', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(null);

      await expect(service.getProfile(999n)).rejects.toThrow(UnauthorizedException);
    });
  });
});
