import {
  Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TradeInService } from './trade-in.service';
import { TradeInQueryDto } from './dto/trade-in-query.dto';
import { CreateTradeInDto } from './dto/create-trade-in.dto';
import { UpdateTradeInDto } from './dto/update-trade-in.dto';
import { TradeInWarehouseDto } from './dto/trade-in-warehouse.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('以旧换新管理')
@Controller('trade-ins')
export class TradeInController {
  constructor(private readonly service: TradeInService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '以旧换新列表', description: '分页查询以旧换新记录含汇总' })
  findAll(@Query() query: TradeInQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '以旧换新详情', description: '含关联订单和旧机信息' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(BigInt(id));
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建以旧换新记录', description: '旧机估值，关联销售订单' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '订单已存在以旧换新记录' })
  create(
    @Body() dto: CreateTradeInDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.create(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新以旧换新信息', description: '修改估值/抵扣金额/设备信息' })
  update(
    @Param('id') id: string, @Body() dto: UpdateTradeInDto,
    @CurrentUser() user: any, @Req() req: Request,
  ) {
    return this.service.update(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/warehouse')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '旧机入库', description: '将旧机收入库存 (创建IMEI记录+流水)' })
  @ApiResponse({ status: 201, description: '入库成功' })
  @ApiResponse({ status: 409, description: 'IMEI已在库存中' })
  warehouse(
    @Param('id') id: string, @Body() dto: TradeInWarehouseDto,
    @CurrentUser() user: any, @Req() req: Request,
  ) {
    return this.service.warehouse(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }
}
