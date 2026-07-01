import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DifyChatRequest {
  query: string;
  user: string;
  conversation_id?: string;
  inputs?: Record<string, any>;
}

export interface DifyChatResponse {
  event: string;
  conversation_id: string;
  message_id: string;
  answer: string;
  created_at: number;
  metadata?: {
    intent?: string;
    function_called?: string;
    confidence?: number;
  };
}

@Injectable()
export class DifyClientService {
  private readonly logger = new Logger(DifyClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs = 5000;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('dify.baseUrl') || '';
    this.apiKey = this.configService.get<string>('dify.apiKey') || '';
  }

  /** 检查 Dify 连通性 */
  async healthCheck(): Promise<{ available: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      await fetch(`${this.baseUrl}/parameters`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      return { available: true, latencyMs: Date.now() - start };
    } catch {
      return { available: false, latencyMs: Date.now() - start };
    }
  }

  /** 发送对话到 Dify */
  async chat(request: DifyChatRequest): Promise<DifyChatResponse> {
    if (!this.baseUrl || !this.apiKey) {
      this.logger.warn('Dify 未配置，返回兜底响应');
      return this.fallbackResponse(request);
    }

    const start = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.baseUrl}/chat-messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: request.query,
          user: request.user,
          conversation_id: request.conversation_id,
          inputs: request.inputs || {},
          response_mode: 'blocking',
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Dify API 返回 ${response.status}: ${response.statusText}`);
      }

      const data: DifyChatResponse = await response.json();
      this.logger.log(
        `Dify 响应: intent=${data.metadata?.intent}, confidence=${data.metadata?.confidence}, latency=${Date.now() - start}ms`,
      );

      return data;
    } catch (err: any) {
      const latency = Date.now() - start;

      if (err?.name === 'AbortError') {
        this.logger.warn(`Dify 超时 (${latency}ms)，返回降级响应`);
        return this.timeoutResponse(request, latency);
      }

      this.logger.error(`Dify 异常: ${err.message}`);
      return this.errorResponse(request, err.message);
    }
  }

  // ---- private ----

  private fallbackResponse(request: DifyChatRequest): DifyChatResponse {
    return {
      event: 'message',
      conversation_id: request.conversation_id || 'fallback',
      message_id: 'fallback',
      answer: 'AI 服务暂未配置，请联系管理员。',
      created_at: Date.now() / 1000,
      metadata: { confidence: 0, intent: 'unknown' },
    };
  }

  private timeoutResponse(request: DifyChatRequest, latencyMs: number): DifyChatResponse {
    return {
      event: 'message',
      conversation_id: request.conversation_id || 'timeout',
      message_id: 'timeout',
      answer: '系统繁忙，请稍后重试或联系人工客服。',
      created_at: Date.now() / 1000,
      metadata: { confidence: 0, intent: 'timeout' },
    };
  }

  private errorResponse(request: DifyChatRequest, error: string): DifyChatResponse {
    return {
      event: 'error',
      conversation_id: request.conversation_id || 'error',
      message_id: 'error',
      answer: '抱歉，AI 服务暂时不可用。请尝试使用手动查询功能或联系人工客服。',
      created_at: Date.now() / 1000,
      metadata: { confidence: 0, intent: 'error' },
    };
  }
}
