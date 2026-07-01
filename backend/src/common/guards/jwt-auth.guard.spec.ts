import { JwtAuthGuard } from './jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';

// Mock passport 模块以避免 "Unknown authentication strategy" 错误
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    return class {
      canActivate() {
        return true;
      }
    };
  },
}));

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  describe('canActivate', () => {
    it('标记 @Public() 的路由应直接返回 true', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const ctx = {
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
        switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
      } as any;

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('非公开路由应委托给父类处理', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const ctx = {
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
        switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
      } as any;

      // 父类被 mock 为返回 true
      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });

  describe('handleRequest', () => {
    it('返回 user 对象', () => {
      const user = { id: 1, name: 'test' };
      const result = guard.handleRequest(null, user);
      expect(result).toBe(user);
    });

    it('无 user 时应抛出 UnauthorizedException', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
    });

    it('有 error 时应抛出', () => {
      const err = new Error('test error');
      expect(() => guard.handleRequest(err, null)).toThrow('test error');
    });
  });
});
