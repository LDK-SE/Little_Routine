import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DifyClientService } from './dify-client.service';
import { FunctionHandlerService } from './function-handler.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiChatLogQueryDto } from './dto/ai-chat-log-query.dto';
import { TransferHumanDto } from './dto/transfer-human.dto';
import { maskPhone } from '../common/utils/mask';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly CONFIDENCE_THRESHOLD = 0.85;

  constructor(
    private prisma: PrismaService,
    private difyClient: DifyClientService,
    private functionHandler: FunctionHandlerService,
  ) {}

  /** 主对话入口：发送消息 → Dify → 置信度判断 → 记录日志 → 返回 */
  async chat(dto: AiChatDto, userId: bigint, userRole: string) {
    const start = Date.now();

    const difyRes = await this.difyClient.chat({
      query: dto.query,
      user: userId.toString(),
      conversation_id: dto.conversationId,
      inputs: { userPhone: dto.userPhone, userRole },
    });

    const latencyMs = Date.now() - start;
    const intent = difyRes.metadata?.intent ?? null;
    const functionCalled = difyRes.metadata?.function_called ?? null;
    const confidence = difyRes.metadata?.confidence ?? null;
    const isTransferred = confidence !== null && confidence < this.CONFIDENCE_THRESHOLD;
    const ticketId = isTransferred ? this.generateTicketId() : null;

    // 如果 Dify 指定了 function 调用，本地执行获取结构化结果
    let functionResult: any = null;
    if (functionCalled && !isTransferred) {
      functionResult = await this.executeFunction(functionCalled, dto);
    }

    // 记录 AI 对话日志
    await this.logChat({
      userId,
      userRole,
      query: dto.query,
      intent,
      functionCalled,
      confidence,
      reply: difyRes.answer,
      isTransferred,
      ticketId,
      latencyMs,
    });

    return {
      reply: isTransferred
        ? this.transferReply(ticketId!)
        : difyRes.answer,
      intent,
      functionCalled,
      functionResult,
      confidence,
      isTransferred,
      ticketId,
      conversationId: difyRes.conversation_id,
      latencyMs,
    };
  }

  /** Dify 连通性检查 */
  async healthCheck() {
    return this.difyClient.healthCheck();
  }

  /** 查询 AI 对话日志 */
  async getLogs(query: AiChatLogQueryDto) {
    const { userId, userRole, intent, functionCalled, isTransferred, minConfidence, startDate, endDate, page = 1, pageSize = 20 } = query;

    const where: any = {};

    if (userId !== undefined) where.userId = BigInt(userId);
    if (userRole) where.userRole = userRole;
    if (intent) where.intent = intent;
    if (functionCalled) where.functionCalled = functionCalled;
    if (isTransferred !== undefined) where.isTransferred = isTransferred;
    if (minConfidence !== undefined) where.confidence = { gte: minConfidence };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [items, total] = await Promise.all([
      this.prisma.aiChatLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiChatLog.count({ where }),
    ]);

    return {
      items: items.map((log) => ({
        ...log,
        id: log.id.toString(),
        userId: log.userId.toString(),
        confidence: log.confidence ? Number(log.confidence) : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 转人工 */
  async transferToHuman(dto: TransferHumanDto) {
    const ticketId = this.generateTicketId();

    this.logger.warn(
      `转人工: phone=${dto.userPhone}, confidence=${dto.confidence}, intent=${dto.intent}`,
    );

    return {
      ticketId,
      status: 'queued',
      message: '已为您转接人工客服，预计等待 2 分钟',
      userPhone: maskPhone(dto.userPhone),
      lastQuery: dto.lastQuery,
      confidence: dto.confidence,
    };
  }

  // ---- private ----

  /** 根据 function_called 路由到本地查询方法 */
  private async executeFunction(name: string, dto: AiChatDto): Promise<any> {
    try {
      switch (name) {
        case 'query_inventory':
          return this.functionHandler.queryInventory(dto.query);
        case 'query_gross_profit':
          return this.functionHandler.queryGrossProfit('today');
        case 'query_member_points':
          return this.functionHandler.queryMemberPoints(dto.userPhone || '');
        case 'query_salesperson_performance':
          return this.functionHandler.querySalespersonPerformance(dto.query);
        case 'query_member_orders':
          return this.functionHandler.queryMemberOrders(dto.userPhone || '');
        default:
          this.logger.warn(`未知 function: ${name}`);
          return null;
      }
    } catch (err: any) {
      this.logger.error(`Function ${name} 执行失败: ${err.message}`);
      return { error: err.message };
    }
  }

  private async logChat(data: {
    userId: bigint;
    userRole: string;
    query: string;
    intent: string | null;
    functionCalled: string | null;
    confidence: number | null;
    reply: string;
    isTransferred: boolean;
    ticketId: string | null;
    latencyMs: number;
  }) {
    try {
      await this.prisma.aiChatLog.create({
        data: {
          userId: data.userId,
          userRole: data.userRole,
          query: data.query,
          intent: data.intent,
          functionCalled: data.functionCalled,
          confidence: data.confidence,
          reply: data.reply,
          isTransferred: data.isTransferred,
          ticketId: data.ticketId,
          latencyMs: data.latencyMs,
        },
      });
    } catch (err: any) {
      this.logger.error(`AI 日志写入失败: ${err.message}`);
    }
  }

  private generateTicketId(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const rand = crypto.randomUUID().slice(0, 6).toUpperCase();
    return `TK${date}${rand}`;
  }

  private transferReply(ticketId: string): string {
    return `您的问题比较专业，我暂时无法给出准确建议。已为您转接人工客服（工单号：${ticketId}），预计等待 2 分钟。您也可以拨打门店电话直接咨询。`;
  }
}
