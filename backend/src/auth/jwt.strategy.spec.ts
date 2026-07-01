import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: any;
  let blacklist: any;

  const mockUser = {
    id: 1n,
    phone: '13800138000',
    name: '张三',
    shopId: 1n,
    status: 'active',
    deletedAt: null,
    userRoles: [{ role: { code: 'salesperson', name: '销售员' } }],
  };

  beforeEach(async () => {
    prisma = {
      sysUser: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
      },
    };

    blacklist = {
      isBlacklisted: jest.fn().mockResolvedValue(false),
      blacklist: jest.fn().mockResolvedValue(undefined),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'jwt.secret') return 'test-secret';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prisma },
        { provide: TokenBlacklistService, useValue: blacklist },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    const payload: JwtPayload = {
      sub: 1,
      phone: '13800138000',
      roles: ['salesperson'],
      shopId: 1,
    };

    it('应成功验证并返回用户信息', async () => {
      const mockReq = { headers: { authorization: 'Bearer valid-token' } };

      const result = await strategy.validate(mockReq, payload);

      expect(result.id).toBe(1);
      expect(result.phone).toBe('13800138000');
      expect(result.roles).toContain('salesperson');
    });

    it('应检查 token 黑名单 (ExtractJwt 会剥离 Bearer 前缀)', async () => {
      const mockReq = { headers: { authorization: 'Bearer valid-token' } };

      await strategy.validate(mockReq, payload);

      expect(blacklist.isBlacklisted).toHaveBeenCalledWith('valid-token');
    });

    it('黑名单 token 应抛出 UnauthorizedException', async () => {
      blacklist.isBlacklisted.mockResolvedValue(true);
      const mockReq = { headers: { authorization: 'Bearer blacklisted-token' } };

      await expect(
        strategy.validate(mockReq, payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('用户不存在时应抛出 UnauthorizedException', async () => {
      prisma.sysUser.findUnique.mockResolvedValue(null);
      const mockReq = { headers: { authorization: 'Bearer token' } };

      await expect(
        strategy.validate(mockReq, payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('离职用户应抛出 UnauthorizedException', async () => {
      prisma.sysUser.findUnique.mockResolvedValue({ ...mockUser, status: 'inactive' });
      const mockReq = { headers: { authorization: 'Bearer token' } };

      await expect(
        strategy.validate(mockReq, payload),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('无 token 请求应跳过黑名单检查', async () => {
      const reqWithoutToken = { headers: {} };

      const result = await strategy.validate(reqWithoutToken, payload);

      expect(blacklist.isBlacklisted).not.toHaveBeenCalled();
      expect(result.id).toBe(1);
    });
  });
});
