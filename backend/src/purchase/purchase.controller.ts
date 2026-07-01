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
import { PurchaseService } from './purchase.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { AuditPurchaseOrderDto } from './dto/audit-purchase-order.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('采购管理')
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post('orders')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建采购单', description: '生成采购单号，状态为待审核' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: 'IMEI已入库' })
  @ApiResponse({ status: 404, description: 'SKU不存在' })
  createOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.purchaseService.createOrder(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Get('orders')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '采购单列表', description: '支持按状态/日期筛选+分页' })
  @ApiResponse({ status: 200, description: '分页列表' })
  findAllOrders(@Query() query: PurchaseOrderQueryDto) {
    return this.purchaseService.findAllOrders(query);
  }

  @Get('orders/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '采购单详情', description: '含采购明细（SKU信息+IMEI+价格）' })
  @ApiResponse({ status: 200, description: '采购单详情' })
  @ApiResponse({ status: 404, description: '采购单不存在' })
  findOrderById(@Param('id') id: string) {
    return this.purchaseService.findOrderById(BigInt(id));
  }

  @Post('orders/:id/audit')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审核采购单', description: '通过→自动入库(创建ImeiStock+StockLedger)；拒绝→取消' })
  @ApiResponse({ status: 200, description: '审核完成' })
  @ApiResponse({ status: 404, description: '采购单不存在' })
  @ApiResponse({ status: 422, description: '非待审核状态不可操作' })
  auditOrder(
    @Param('id') id: string,
    @Body() dto: AuditPurchaseOrderDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.purchaseService.auditOrder(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post('orders/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消采购单', description: '仅待审核状态可取消' })
  @ApiResponse({ status: 200, description: '已取消' })
  @ApiResponse({ status: 404, description: '采购单不存在' })
  @ApiResponse({ status: 422, description: '非待审核状态不可取消' })
  cancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.purchaseService.cancelOrder(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }
}
