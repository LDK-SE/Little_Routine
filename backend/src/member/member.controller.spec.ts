import { Test, TestingModule } from '@nestjs/testing';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

describe('MemberController', () => {
  let controller: MemberController;
  let service: any;

  const mockService = {
    register: jest.fn().mockResolvedValue({ id: 1, phone: '13900000001', name: '张先生' }),
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    findOne: jest.fn().mockResolvedValue({
      id: 1, phone: '13900000001', name: '张先生',
      address: '广州', licensePlate: '粤A12345',
      backupPhone: null, lastPurchaseModel: 'iPhone 16',
      totalPoints: 100, referrer: null, referralCount: 0,
      status: 'active', createdAt: new Date(),
    }),
    update: jest.fn().mockResolvedValue({ id: 1, name: '新名字' }),
    remove: jest.fn().mockResolvedValue({ message: '会员已注销', deletedAt: new Date() }),
    updateStatus: jest.fn().mockResolvedValue({ message: '会员已禁用', status: 'inactive' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemberController],
      providers: [{ provide: MemberService, useValue: mockService }],
    }).compile();

    controller = module.get<MemberController>(MemberController);
    service = module.get<MemberService>(MemberService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /members/register', () => {
    it('应调用 service.register', async () => {
      const dto = { phone: '13900000001', name: '张先生' };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.register(dto, req);

      expect(service.register).toHaveBeenCalledWith(dto, undefined, undefined, '127.0.0.1');
      expect(result.name).toBe('张先生');
    });
  });

  describe('GET /members', () => {
    it('应调用 service.findAll 并传入查询参数', async () => {
      const query = { page: 1, pageSize: 20, keyword: '张三' };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /members/:id', () => {
    it('应调用 service.findOne', async () => {
      const result = await controller.findOne('1');

      expect(service.findOne).toHaveBeenCalledWith(1n);
      expect(result.phone).toBe('13900000001');
    });
  });

  describe('PUT /members/:id', () => {
    it('应调用 service.update', async () => {
      const dto = { name: '新名字', address: '新地址' };
      const user = { id: 1, shopId: 1, roles: ['owner'] };
      const req = { ip: '127.0.0.1' } as any;

      await controller.update('1', dto, user, req);

      expect(service.update).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
    });
  });

  describe('DELETE /members/:id', () => {
    it('应调用 service.remove 并传入原因', async () => {
      const dto = { reason: '测试删除' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.remove('1', dto, user, req);

      expect(service.remove).toHaveBeenCalledWith(1n, '测试删除', 1n, 1n, '127.0.0.1');
      expect(result.message).toBe('会员已注销');
    });

    it('未传原因时使用默认值', async () => {
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      await controller.remove('1', {}, user, req);

      expect(service.remove).toHaveBeenCalledWith(1n, '管理员注销', 1n, 1n, '127.0.0.1');
    });
  });

  describe('PUT /members/:id/status', () => {
    it('应调用 service.updateStatus', async () => {
      const dto = { status: 'inactive', reason: '违规' };
      const user = { id: 1, shopId: 1 };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.updateStatus('1', dto, user, req);

      expect(service.updateStatus).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
      expect(result.message).toBe('会员已禁用');
    });
  });
});
