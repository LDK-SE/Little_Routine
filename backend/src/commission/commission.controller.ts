import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CommissionService } from './commission.service';
import { CommissionQueryDto } from './dto/commission-query.dto';
import { CreateCommissionRuleDto, UpdateCommissionRuleDto } from './dto/commission-rule.dto';
import { CommissionCalculateDto } from './dto/commission-calculate.dto';
import { CommissionRollbackDto } from './dto/commission-rollback.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('提成管理')
@Controller('commissions')
export class CommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  // ============================================================
  // 提成流水
  // ============================================================

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提成流水列表', description: '分页查询提成流水，支持多条件筛选' })
  @ApiResponse({ status: 200, description: '分页列表含汇总' })
  findAll(@Query() query: CommissionQueryDto) {
    return this.commissionService.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提成流水详情', description: '含订单信息和确认人' })
  @ApiResponse({ status: 200, description: '提成详情' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  findOne(@Param('id') id: string) {
    return this.commissionService.findOne(BigInt(id));
  }

  @Get('settlement/:period')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '结算周期汇总', description: '按销售人员聚合指定结算周期的提成' })
  @ApiResponse({ status: 200, description: '周期汇总' })
  getSettlementSummary(
    @Param('period') period: string,
    @Query('shopId') shopId?: string,
  ) {
    return this.commissionService.getSettlementSummary(period, shopId ? BigInt(shopId) : undefined);
  }

  // ============================================================
  // 提成试算
  // ============================================================

  @Post('calculate')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提成试算', description: '根据品牌/型号/售价匹配规则并计算预估提成' })
  @ApiResponse({ status: 201, description: '计算结果含匹配规则' })
  calculatePreview(@Body() dto: CommissionCalculateDto) {
    return this.commissionService.calculatePreview(dto);
  }

  // ============================================================
  // 提成规则管理
  // ============================================================

  @Get('rules/list')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提成规则列表', description: '按优先级排序的所有规则' })
  @ApiResponse({ status: 200, description: '规则列表' })
  findAllRules() {
    return this.commissionService.findAllRules();
  }

  @Post('rules')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建提成规则', description: '按品牌/型号/售价区间+提成类型创建规则' })
  @ApiResponse({ status: 201, description: '规则已创建' })
  createRule(
    @Body() dto: CreateCommissionRuleDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.createRule(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Put('rules/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新提成规则' })
  @ApiResponse({ status: 200, description: '规则已更新' })
  @ApiResponse({ status: 404, description: '规则不存在' })
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionRuleDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.updateRule(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Put('rules/:id/toggle')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '启用/禁用提成规则' })
  @ApiResponse({ status: 200, description: '操作成功' })
  @ApiResponse({ status: 404, description: '规则不存在' })
  toggleRule(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.toggleRule(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  // ============================================================
  // 提成确认
  // ============================================================

  @Post(':id/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '确认单条提成', description: '将 pending 提成确认为 confirmed' })
  @ApiResponse({ status: 201, description: '确认成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  @ApiResponse({ status: 422, description: '状态不允许确认' })
  confirmLedger(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.confirmLedger(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post('batch-confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量确认提成', description: '按结算周期+销售人员批量确认' })
  @ApiResponse({ status: 201, description: '批量确认成功' })
  @ApiResponse({ status: 404, description: '无待确认记录' })
  batchConfirm(
    @Body() body: { period: string; salespersonId: number },
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.batchConfirm(
      body.period,
      BigInt(body.salespersonId),
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }

  // ============================================================
  // 提成回滚
  // ============================================================

  @Post('rollback/order')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '按订单回滚提成', description: '退货/取消订单时冲正整单提成' })
  @ApiResponse({ status: 201, description: '回滚成功' })
  @ApiResponse({ status: 404, description: '订单无提成记录' })
  rollbackByOrder(
    @Body() body: { orderNo: string } & CommissionRollbackDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.rollbackByOrder(
      body.orderNo,
      { reason: body.reason },
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }

  @Post(':id/rollback')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '单条提成回滚', description: '回滚指定提成流水记录' })
  @ApiResponse({ status: 201, description: '回滚成功' })
  @ApiResponse({ status: 404, description: '记录不存在' })
  @ApiResponse({ status: 422, description: '已支付不可回滚' })
  rollbackByLedger(
    @Param('id') id: string,
    @Body() dto: CommissionRollbackDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.commissionService.rollbackByLedger(
      BigInt(id),
      dto,
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }
}
