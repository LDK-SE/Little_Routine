import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { FunctionHandlerService } from './function-handler.service';
import { HealthService } from '../common/services/health.service';

describe('AgentController', () => {
  let controller: AgentController;
  let agentService: any;
  let functionHandler: any;
  let healthService: any;

  const mockHealthService = {
    check: jest.fn().mockResolvedValue({
      status: 'ok' as const,
      uptime: 3600,
      checks: {
        database: { status: 'ok' as const, latencyMs: 3 },
        redis: { status: 'ok' as const, latencyMs: 1 },
      },
    }),
  };

  const mockAgentService = {
    chat: jest.fn().mockResolvedValue({
      reply: 'iPhone 16 Pro 目前库存充足，共 27 台。',
      intent: 'query_inventory',
      functionCalled: 'query_inventory',
      functionResult: { function: 'query_inventory', result: [] },
      confidence: 0.98,
      isTransferred: false,
      ticketId: null,
      conversationId: 'conv_001',
      latencyMs: 320,
    }),
    healthCheck: jest.fn().mockResolvedValue({ available: true, latencyMs: 45 }),
    getLogs: jest.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    }),
    transferToHuman: jest.fn().mockResolvedValue({
      ticketId: 'TK20260616A1B2',
      status: 'queued',
      message: '已为您转接人工客服，预计等待 2 分钟',
    }),
  };

  const mockFunctionHandler = {
    queryInventory: jest.fn().mockResolvedValue({
      function: 'query_inventory',
      result: [{ model: 'iPhone 16 Pro', inStockCount: 27 }],
      searchedAt: new Date().toISOString(),
    }),
    queryGrossProfit: jest.fn().mockResolvedValue({
      function: 'query_gross_profit',
      result: { grossProfit: 33375, orderCount: 14 },
    }),
    queryMemberPoints: jest.fn().mockResolvedValue({
      function: 'query_member_points',
      result: { phone: '139****0001', totalPoints: 3680 },
    }),
    querySalespersonPerformance: jest.fn().mockResolvedValue({
      function: 'query_salesperson_performance',
      result: [{ name: '李明', totalCommission: 12680 }],
    }),
    queryMemberOrders: jest.fn().mockResolvedValue({
      function: 'query_member_orders',
      result: { phone: '139****0001', orders: [] },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        { provide: AgentService, useValue: mockAgentService },
        { provide: FunctionHandlerService, useValue: mockFunctionHandler },
        { provide: HealthService, useValue: mockHealthService },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    agentService = module.get<AgentService>(AgentService);
    functionHandler = module.get<FunctionHandlerService>(FunctionHandlerService);
    healthService = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /ai/chat', () => {
    it('应调用 agentService.chat 并传递用户信息', async () => {
      const dto = { query: 'iPhone 16 Pro 还有货吗', conversationId: 'conv_001' };
      const user = { id: 1, role: 'owner' };

      const result = await controller.chat(dto, user);

      expect(agentService.chat).toHaveBeenCalledWith(dto, 1n, 'owner');
      expect(result.confidence).toBe(0.98);
      expect(result.functionCalled).toBe('query_inventory');
    });
  });

  describe('GET /ai/inventory/query', () => {
    it('应调用 functionHandler.queryInventory', async () => {
      const result = await controller.queryInventory('iPhone');

      expect(functionHandler.queryInventory).toHaveBeenCalledWith('iPhone', undefined);
      expect(result.function).toBe('query_inventory');
      expect(result.result[0].model).toBe('iPhone 16 Pro');
    });

    it('应传递 location 参数', async () => {
      await controller.queryInventory('iPhone', 'A-03');

      expect(functionHandler.queryInventory).toHaveBeenCalledWith('iPhone', 'A-03');
    });
  });

  describe('GET /ai/finance/gross-profit', () => {
    it('应调用 functionHandler.queryGrossProfit', async () => {
      await controller.queryGrossProfit('today');

      expect(functionHandler.queryGrossProfit).toHaveBeenCalledWith('today');
    });

    it('period 可选', async () => {
      await controller.queryGrossProfit();

      expect(functionHandler.queryGrossProfit).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /ai/member/points', () => {
    it('应调用 functionHandler.queryMemberPoints', async () => {
      const result = await controller.queryMemberPoints('13900000001');

      expect(functionHandler.queryMemberPoints).toHaveBeenCalledWith('13900000001');
      expect(result.result!.totalPoints).toBe(3680);
    });
  });

  describe('GET /ai/finance/performance', () => {
    it('应调用 functionHandler.querySalespersonPerformance', async () => {
      await controller.queryPerformance('李明', 'this_month');

      expect(functionHandler.querySalespersonPerformance).toHaveBeenCalledWith('李明', 'this_month');
    });

    it('period 可选', async () => {
      await controller.queryPerformance('李明');

      expect(functionHandler.querySalespersonPerformance).toHaveBeenCalledWith('李明', undefined);
    });
  });

  describe('GET /ai/member/orders', () => {
    it('应调用 functionHandler.queryMemberOrders', async () => {
      const result = await controller.queryMemberOrders('13900000001');

      expect(functionHandler.queryMemberOrders).toHaveBeenCalledWith('13900000001');
      expect(result.function).toBe('query_member_orders');
    });
  });

  describe('POST /ai/transfer-human', () => {
    it('应调用 agentService.transferToHuman', async () => {
      const dto = {
        userPhone: '13900000001',
        lastQuery: '这个和华为哪个好',
        confidence: 0.52,
      };

      const result = await controller.transferToHuman(dto);

      expect(agentService.transferToHuman).toHaveBeenCalledWith(dto);
      expect(result.ticketId).toBe('TK20260616A1B2');
      expect(result.status).toBe('queued');
    });
  });

  describe('GET /ai/health', () => {
    it('应同时检查 Dify 和基础设施连通性', async () => {
      const result = await controller.healthCheck() as any;

      expect(agentService.healthCheck).toHaveBeenCalled();
      expect(healthService.check).toHaveBeenCalled();
      expect(result.dify.available).toBe(true);
      expect(result.dify.latencyMs).toBe(45);
      expect(result.status).toBe('ok');
    });
  });

  describe('GET /ai/logs', () => {
    it('应调用 agentService.getLogs', async () => {
      const query = { page: 1, pageSize: 20, userRole: 'owner' };

      await controller.getLogs(query);

      expect(agentService.getLogs).toHaveBeenCalledWith(query);
    });
  });
});
