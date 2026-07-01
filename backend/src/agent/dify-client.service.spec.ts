import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DifyClientService } from './dify-client.service';

describe('DifyClientService', () => {
  let service: DifyClientService;
  let originalFetch: typeof global.fetch;

  const mockConfig = {
    'dify.baseUrl': 'https://dify.example.com/v1',
    'dify.apiKey': 'app-test-key-123',
  };

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function createTestingModule(config?: Record<string, string>) {
    const configService = {
      get: jest.fn((key: string) => (config || mockConfig)[key] || ''),
    };
    return Test.createTestingModule({
      providers: [
        DifyClientService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
  }

  describe('with valid Dify config', () => {
    beforeEach(async () => {
      global.fetch = jest.fn() as any;
      const module = await createTestingModule();
      service = module.get<DifyClientService>(DifyClientService);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('healthCheck', () => {
      it('Dify 可用时应返回 available=true', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

        const result = await service.healthCheck();

        expect(result.available).toBe(true);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://dify.example.com/v1/parameters',
          expect.objectContaining({
            headers: { Authorization: 'Bearer app-test-key-123' },
          }),
        );
      });

      it('Dify 不可用时应返回 available=false', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

        const result = await service.healthCheck();

        expect(result.available).toBe(false);
      });
    });

    describe('chat', () => {
      const request = {
        query: 'iPhone 16 Pro 还有货吗',
        user: '1',
        conversation_id: 'conv_abc',
        inputs: { userPhone: '13900000001', userRole: 'owner' },
      };

      const mockDifyResponseBody = {
        event: 'message',
        conversation_id: 'conv_abc',
        message_id: 'msg_001',
        answer: 'iPhone 16 Pro 目前库存充足，共 27 台。',
        created_at: Date.now() / 1000,
        metadata: {
          intent: 'query_inventory',
          function_called: 'query_inventory',
          confidence: 0.98,
        },
      };

      it('应成功调用 Dify API 并返回响应', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockDifyResponseBody),
        });

        const result = await service.chat(request);

        expect(result.event).toBe('message');
        expect(result.answer).toContain('iPhone 16 Pro');
        expect(result.metadata?.intent).toBe('query_inventory');
        expect(result.metadata?.confidence).toBe(0.98);
      });

      it('Dify 超时时应返回降级响应', async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        (global.fetch as jest.Mock).mockRejectedValue(err);

        const result = await service.chat(request);

        expect(result.answer).toContain('系统繁忙');
        expect(result.metadata?.intent).toBe('timeout');
      });

      it('Dify 异常时应返回错误响应', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Internal Server Error'));

        const result = await service.chat(request);

        expect(result.event).toBe('error');
        expect(result.answer).toContain('暂时不可用');
        expect(result.metadata?.intent).toBe('error');
      });
    });
  });

  describe('with empty Dify config', () => {
    it('应返回兜底响应', async () => {
      global.fetch = jest.fn() as any;
      const module = await createTestingModule({ 'dify.baseUrl': '', 'dify.apiKey': '' });
      const svc = module.get<DifyClientService>(DifyClientService);

      const result = await svc.chat({
        query: 'test',
        user: '1',
      });

      expect(result.answer).toBe('AI 服务暂未配置，请联系管理员。');
      expect(result.metadata?.confidence).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
