import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: any;

  const mockAuthService = {
    login: jest.fn().mockResolvedValue({ accessToken: 'token', user: { id: 1, phone: '13800138000' } }),
    register: jest.fn().mockResolvedValue({ accessToken: 'token', user: { id: 2, phone: '13900139000' } }),
    logout: jest.fn().mockResolvedValue(null),
    refreshToken: jest.fn().mockResolvedValue({ accessToken: 'new-token', refreshToken: 'new-refresh-token' }),
    getProfile: jest.fn().mockResolvedValue({ id: 1, phone: '13800138000', name: '张三' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('应调用 authService.login 并返回结果', async () => {
      const dto = { phone: '13800138000', password: 'password123' };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.login(dto, req);

      expect(service.login).toHaveBeenCalledWith(dto, '127.0.0.1');
      expect(result.accessToken).toBe('token');
    });
  });

  describe('POST /auth/register', () => {
    it('应调用 authService.register 并返回结果', async () => {
      const dto = { phone: '13900139000', password: 'pass', name: '新用户', shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.register(dto, req);

      expect(service.register).toHaveBeenCalledWith(dto, '127.0.0.1');
      expect(result.accessToken).toBe('token');
    });
  });

  describe('POST /auth/logout', () => {
    it('应调用 authService.logout 并传入 token', async () => {
      const req = {
        ip: '127.0.0.1',
        headers: { authorization: 'Bearer test-token' },
      } as any;
      const user = { sub: 1, phone: '13800138000', roles: ['salesperson'], shopId: 1 };

      await controller.logout(req, user);

      expect(service.logout).toHaveBeenCalledWith('Bearer test-token', user);
    });
  });

  describe('POST /auth/refresh', () => {
    it('应调用 authService.refreshToken 并返回新 token', async () => {
      const req = {
        ip: '127.0.0.1',
        headers: { authorization: 'Bearer old-token' },
      } as any;
      const user = { sub: 1, phone: '13800138000', roles: ['salesperson'], shopId: 1 };

      const result = await controller.refresh(req, user);

      expect(service.refreshToken).toHaveBeenCalledWith('Bearer old-token', user, '127.0.0.1');
      expect(result.accessToken).toBe('new-token');
    });
  });

  describe('GET /auth/profile', () => {
    it('应调用 authService.getProfile 并返回用户信息', async () => {
      const user = { sub: 1, phone: '13800138000', roles: ['salesperson'], shopId: 1 };

      const result = await controller.getProfile(user);

      expect(service.getProfile).toHaveBeenCalledWith(1n);
      expect(result.name).toBe('张三');
    });
  });
});
