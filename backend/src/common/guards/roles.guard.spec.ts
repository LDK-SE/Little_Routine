import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Role } from '../enums/role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockContext(user: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  describe('canActivate', () => {
    it('无 requiredRoles 时应放行', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const ctx = mockContext(null);

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('requiredRoles 为空数组时应放行', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const ctx = mockContext(null);

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('用户无 roles 数组时应抛出 ForbiddenException', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
      const ctx = mockContext({ roles: [] });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('用户拥有所需角色时应放行', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SALESPERSON]);
      const ctx = mockContext({ roles: ['salesperson'] });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('用户不拥有所需角色时应抛出 ForbiddenException', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
      const ctx = mockContext({ roles: ['salesperson'] });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('SUPER_ADMIN 拥有所有权限', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER]);
      const ctx = mockContext({ roles: ['super_admin'] });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it('未登录用户应抛出 ForbiddenException', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.SALESPERSON]);
      const ctx = mockContext(null);

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('用户拥有多种角色之一即可通过', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.OWNER, Role.SALESPERSON]);
      const ctx = mockContext({ roles: ['salesperson'] });

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
    });
  });
});
