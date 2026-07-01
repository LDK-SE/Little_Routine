import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { FunctionHandlerService } from './function-handler.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { AiChatLogQueryDto } from './dto/ai-chat-log-query.dto';
import { TransferHumanDto } from './dto/transfer-human.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('AI 智能体')
@Controller('ai')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly functionHandler: FunctionHandlerService,
  ) {}

  // ==================== AI 对话 ====================

  @Post('chat')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI 对话', description: '发送消息给 AI 智能体，支持 Function Calling 和置信度判断' })
  @ApiResponse({ status: 201, description: 'AI 回复' })
  chat(@Body() dto: AiChatDto, @CurrentUser() user: any) {
    return this.agentService.chat(dto, BigInt(user.id), user.role);
  }

  // ==================== Function Calling 接口 ====================

  @Get('inventory/query')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询库存', description: '按机型名称查询当前库存（AI Function Calling）' })
  @ApiResponse({ status: 200, description: '库存查询结果' })
  queryInventory(
    @Query('keyword') keyword: string,
    @Query('location') location?: string,
  ) {
    return this.functionHandler.queryInventory(keyword, location);
  }

  @Get('finance/gross-profit')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询毛利', description: '查询今日/本周/本月毛利（AI Function Calling）' })
  @ApiResponse({ status: 200, description: '毛利数据' })
  queryGrossProfit(@Query('period') period?: string) {
    return this.functionHandler.queryGrossProfit(period);
  }

  @Get('member/points')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询积分', description: '按手机号查询会员积分余额（AI Function Calling）' })
  @ApiResponse({ status: 200, description: '积分信息' })
  queryMemberPoints(@Query('phone') phone: string) {
    return this.functionHandler.queryMemberPoints(phone);
  }

  @Get('finance/performance')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询员工业绩', description: '按姓名查询员工提成/业绩（AI Function Calling）' })
  @ApiResponse({ status: 200, description: '业绩数据' })
  queryPerformance(
    @Query('name') name: string,
    @Query('period') period?: string,
  ) {
    return this.functionHandler.querySalespersonPerformance(name, period);
  }

  @Get('member/orders')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询订单', description: '按手机号查询会员购买记录（AI Function Calling）' })
  @ApiResponse({ status: 200, description: '订单记录' })
  queryMemberOrders(@Query('phone') phone: string) {
    return this.functionHandler.queryMemberOrders(phone);
  }

  // ==================== 转人工 / 健康检查 / 日志 ====================

  @Post('transfer-human')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '转人工客服', description: '手动或自动将对话转接至人工客服' })
  @ApiResponse({ status: 201, description: '转接成功' })
  transferToHuman(@Body() dto: TransferHumanDto) {
    return this.agentService.transferToHuman(dto);
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'AI 健康检查', description: '检查 Dify 平台连通性（无需认证）' })
  @ApiResponse({ status: 200, description: '连通状态' })
  healthCheck() {
    return this.agentService.healthCheck();
  }

  @Get('logs')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI 对话日志', description: '分页查询 AI 对话日志，支持多维度筛选' })
  @ApiResponse({ status: 200, description: '日志列表' })
  getLogs(@Query() query: AiChatLogQueryDto) {
    return this.agentService.getLogs(query);
  }
}
