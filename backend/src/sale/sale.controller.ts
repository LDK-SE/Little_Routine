import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { SaleService } from './sale.service';
import { CreateSaleOrderDto } from './dto/create-sale-order.dto';
import { SaleOrderQueryDto } from './dto/sale-order-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('销售管理')
@Controller('sale')
export class SaleController {
  constructor(private readonly saleService: SaleService) {}

  @Post('outbound/scan')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '扫码出库（核心事务）', description: '原子化销售流程：校验IMEI→扣减库存→固化成本→计算毛利→生成积分→生成提成' })
  @ApiResponse({ status: 201, description: '出库成功' })
  @ApiResponse({ status: 409, description: 'IMEI状态异常/并发冲突' })
  @ApiResponse({ status: 422, description: '售价低于限价/积分不足' })
  @ApiResponse({ status: 404, description: 'IMEI/会员不存在' })
  @ApiResponse({ status: 400, description: '收款金额不等于应收' })
  createSale(
    @Body() dto: CreateSaleOrderDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.saleService.createSale(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Get('orders')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '销售订单列表', description: '含汇总统计（总销售额/总利润）' })
  @ApiResponse({ status: 200, description: '分页列表+汇总' })
  findAllOrders(@Query() query: SaleOrderQueryDto) {
    return this.saleService.findAllOrders(query);
  }

  @Get('orders/:orderNo')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '订单详情', description: '含销售明细/支付流水/以旧换新/国补/提成信息' })
  @ApiResponse({ status: 200, description: '订单详情' })
  @ApiResponse({ status: 404, description: '订单不存在' })
  findOrderByOrderNo(@Param('orderNo') orderNo: string) {
    return this.saleService.findOrderByOrderNo(orderNo);
  }

  @Delete('orders/:orderNo')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消订单（软删除）', description: '回退库存+冲正积分+作废流水+作废提成' })
  @ApiResponse({ status: 200, description: '已取消' })
  @ApiResponse({ status: 404, description: '订单不存在' })
  @ApiResponse({ status: 422, description: '订单已退货不可取消' })
  cancelOrder(
    @Param('orderNo') orderNo: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.saleService.cancelOrder(
      orderNo,
      reason ?? '管理员取消',
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }
}
