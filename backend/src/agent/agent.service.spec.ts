import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { DifyClientService } from './dify-client.service';
import { FunctionHandlerService } from './function-handler.service';

describe('AgentService', () => {
  let service: AgentService;
  let prisma: any;
  let difyClient: any;
  let functionHandler: any;

  const mockDifyHighConfidence = {
    event: 'message',
    conversation_id: 'conv_001',
    message_id: 'msg_001',
    answer: 'iPhone 16 Pro 目前库存充足，共 27 台。',
    created_at: Date.now() / 1000,
    metadata: {
      intent: 'query_inventory',
      function_called: 'query_inventory',
      confidence: 0.98,
    },
  };

  const mockDifyLowConfidence = {
    event: 'message',
    conversation_id: 'conv_002',
    message_id: 'msg_002',
    answer: '您的问题比较专业，我暂时无法给出准确建议。',
    created_at: Date.now() / 1000,
    metadata: {
      intent: 'chat',
      function_called: null,
      confidence: 0.52,
    },
  };

  const mockFunctionResult = {
    function: 'query_inventory',
    result: [{ model: 'iPhone 16 Pro', inStockCount: 27 }],
    searchedAt: new Date().toISOString(),
  };

  const mockChatLog = {
    id: 1n,
    userId: 1n,
    userRole: 'owner',
    query: 'iPhone 16 Pro 还有货吗',
    intent: 'query_inventory',
    functionCalled: 'query_inventory',
    confidence: { toNumber: () => 0.98 },
    reply: 'iPhone 16 Pro 目前库存充足',
    isTransferred: false,
    ticketId: null,
    latencyMs: 320,
  };

  beforeEach(async () => {
    prisma = {
      aiChatLog: {
        create: jest.fn().mockResolvedValue(mockChatLog),
        findMany: jest.fn().mockResolvedValue([mockChatLog]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    difyClient = {
      chat: jest.fn().mockResolvedValue(mockDifyHighConfidence),
      healthCheck: jest.fn().mockResolvedValue({ available: true, latencyMs: 45 }),
    };

    functionHandler = {
      queryInventory: jest.fn().mockResolvedValue(mockFunctionResult),
      queryGrossProfit: jest.fn(),
      queryMemberPoints: jest.fn(),
      querySalespersonPerformance: jest.fn(),
      queryMemberOrders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: PrismaService, useValue: prisma },
        { provide: DifyClientService, useValue: difyClient },
        { provide: FunctionHandlerService, useValue: functionHandler },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('chat', () => {
    const chatDto = {
      query: 'iPhone 16 Pro 还有货吗',
      conversationId: 'conv_001',
      userPhone: '13900000001',
    };

    it('高置信度时应返回 AI 回复，不转人工', async () => {
      const result = await service.chat(chatDto, 1n, 'owner');

      expect(result.isTransferred).toBe(false);
      expect(result.confidence).toBe(0.98);
      expect(result.intent).toBe('query_inventory');
      expect(result.functionCalled).toBe('query_inventory');
      expect(result.functionResult).toBeDefined();
      expect(result.functionResult.function).toBe('query_inventory');
      expect(difyClient.chat).toHaveBeenCalled();
      expect(functionHandler.queryInventory).toHaveBeenCalled();
      expect(prisma.aiChatLog.create).toHaveBeenCalled();
    });

    it('低置信度（<85%）时应自动转人工', async () => {
      difyClient.chat.mockResolvedValue(mockDifyLowConfidence);

      const result = await service.chat(chatDto, 1n, 'owner');

      expect(result.isTransferred).toBe(true);
      expect(result.ticketId).toMatch(/^TK\d{8}[A-F0-9]{6}$/);
      expect(result.reply).toContain('转接人工客服');
      expect(prisma.aiChatLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isTransferred: true,
          ticketId: expect.any(String),
        }),
      });
    });

    it('低置信度时不应执行本地 function', async () => {
      difyClient.chat.mockResolvedValue({
        ...mockDifyLowConfidence,
        metadata: { ...mockDifyLowConfidence.metadata, function_called: 'query_inventory' },
      });

      await service.chat(chatDto, 1n, 'owner');

      expect(functionHandler.queryInventory).not.toHaveBeenCalled();
    });

    it('应记录 AI 对话日志', async () => {
      await service.chat(chatDto, 1n, 'owner');

      expect(prisma.aiChatLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1n,
          userRole: 'owner',
          query: 'iPhone 16 Pro 还有货吗',
          intent: 'query_inventory',
          functionCalled: 'query_inventory',
          confidence: 0.98,
          latencyMs: expect.any(Number),
        }),
      });
    });

    it('日志写入失败不应阻断对话', async () => {
      prisma.aiChatLog.create.mockRejectedValue(new Error('DB error'));

      const result = await service.chat(chatDto, 1n, 'owner');

      expect(result.reply).toBeDefined();
      expect(result.isTransferred).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('应返回 Dify 连通性状态', async () => {
      const result = await service.healthCheck();

      expect(result.available).toBe(true);
      expect(result.latencyMs).toBe(45);
      expect(difyClient.healthCheck).toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('应返回分页日志列表', async () => {
      const result = await service.getLogs({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(prisma.aiChatLog.findMany).toHaveBeenCalled();
      expect(prisma.aiChatLog.count).toHaveBeenCalled();
    });

    it('应按筛选条件查询', async () => {
      await service.getLogs({
        userRole: 'owner',
        intent: 'query_inventory',
        minConfidence: 0.8,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        page: 1,
        pageSize: 10,
      });

      const findManyCall = prisma.aiChatLog.findMany.mock.calls[0][0];
      expect(findManyCall.where.userRole).toBe('owner');
      expect(findManyCall.where.intent).toBe('query_inventory');
      expect(findManyCall.where.confidence).toEqual({ gte: 0.8 });
      expect(findManyCall.where.createdAt.gte).toBeDefined();
      expect(findManyCall.where.createdAt.lte).toBeDefined();
    });
  });

  describe('transferToHuman', () => {
    it('应生成工单号并返回排队状态', async () => {
      const dto = {
        userPhone: '13900000001',
        lastQuery: '这个和华为哪个好',
        confidence: 0.52,
        conversationSummary: '用户咨询对比类问题',
        intent: 'chat',
      };

      const result = await service.transferToHuman(dto);

      expect(result.ticketId).toMatch(/^TK\d{8}[A-F0-9]{6}$/);
      expect(result.status).toBe('queued');
      expect(result.message).toContain('已为您转接人工客服');
      expect(result.userPhone).toBe('139****0001');
    });
  });
});
