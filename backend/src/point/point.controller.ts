import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PointService } from './point.service';
import { PointLedgerQueryDto } from './dto/point-ledger-query.dto';
import { PointRedeemDto } from './dto/point-redeem.dto';
import { PointRollbackDto } from './dto/point-rollback.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('积分管理')
@Controller('points')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Get(':memberId')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '积分余额查询', description: '查询会员积分余额，含流水汇总校验' })
  @ApiResponse({ status: 200, description: '积分余额' })
  @ApiResponse({ status: 404, description: '会员不存在' })
  getBalance(@Param('memberId') memberId: string) {
    return this.pointService.getBalance(BigInt(memberId));
  }

  @Get(':memberId/ledger')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '积分流水查询', description: '分页查询积分变动流水，支持按类型/日期/订单号筛选' })
  @ApiResponse({ status: 200, description: '分页流水列表' })
  getLedger(
    @Param('memberId') memberId: string,
    @Query() query: PointLedgerQueryDto,
  ) {
    return this.pointService.getLedger({ ...query, memberId: Number(memberId) });
  }

  @Post('redeem')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '积分抵扣',
    description: '使用积分抵扣现金 (100积分=1元)，满3000积分才可使用',
  })
  @ApiResponse({ status: 201, description: '抵扣成功' })
  @ApiResponse({ status: 422, description: '积分不足 / 不满足抵扣门槛' })
  redeem(
    @Body() dto: PointRedeemDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.pointService.redeem(
      dto,
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }

  @Post(':ledgerId/rollback')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '积分回滚',
    description: '冲正指定流水记录 (仅 earn/redeem 类型)，生成 manual_adjust 冲正记录',
  })
  @ApiResponse({ status: 201, description: '回滚成功' })
  @ApiResponse({ status: 404, description: '流水记录不存在' })
  @ApiResponse({ status: 409, description: '已被回滚' })
  @ApiResponse({ status: 422, description: '不支持回滚 / 余额不足' })
  rollback(
    @Param('ledgerId') ledgerId: string,
    @Body() dto: PointRollbackDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.pointService.rollback(
      BigInt(ledgerId),
      dto,
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }
}
