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
import { InventoryService } from './inventory.service';
import { ScanInboundDto } from './dto/scan-inbound.dto';
import { AuditInboundDto } from './dto/audit-inbound.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { OutboundCheckDto } from './dto/outbound-check.dto';
import { ScrapImeiDto } from './dto/scrap-imei.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('库存管理')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ---- 入库 ----

  @Post('inbound/scan')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '扫码入库申请', description: 'IMEI全局唯一，提交后状态为待审核' })
  @ApiResponse({ status: 201, description: '入库成功' })
  @ApiResponse({ status: 409, description: 'IMEI已入库' })
  @ApiResponse({ status: 404, description: 'SKU不存在' })
  scanInbound(
    @Body() dto: ScanInboundDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.inventoryService.scanInbound(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Get('inbound/audit-list')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '待审核入库列表' })
  @ApiResponse({ status: 200, description: '分页列表' })
  findAllInbound(@Query() query: InventoryQueryDto) {
    return this.inventoryService.findAllInbound(query);
  }

  @Post('inbound/audit/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '入库审核', description: '审核通过→在库，拒绝→报废' })
  @ApiResponse({ status: 200, description: '审核完成' })
  @ApiResponse({ status: 404, description: '入库记录不存在' })
  @ApiResponse({ status: 422, description: '非待审核状态不可操作' })
  auditInbound(
    @Param('id') id: string,
    @Body() dto: AuditInboundDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.inventoryService.auditInbound(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  // ---- 库存查询 ----

  @Get('stock')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '库存列表（多维筛选）', description: '支持按门店/品类/状态/货位/批次/关键词筛选' })
  @ApiResponse({ status: 200, description: '分页列表' })
  findAllStock(@Query() query: InventoryQueryDto) {
    return this.inventoryService.findAllStock(query);
  }

  @Get('stock/summary')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '库存汇总统计' })
  @ApiResponse({ status: 200, description: '汇总数据' })
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Get('stock/:imei')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '串码生命周期追溯', description: '含状态变更时间线' })
  @ApiResponse({ status: 200, description: '详情+时间线' })
  @ApiResponse({ status: 404, description: 'IMEI不存在' })
  findStockByImei(@Param('imei') imei: string) {
    return this.inventoryService.findStockByImei(imei);
  }

  @Get('stock/:imei/ledger')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '库存流水', description: '按IMEI查询所有状态变更记录' })
  @ApiResponse({ status: 200, description: '流水列表' })
  findLedgerByImei(@Param('imei') imei: string, @Query() query: InventoryQueryDto) {
    return this.inventoryService.findLedgerByImei(imei, query);
  }

  // ---- 出库 ----

  @Post('outbound/check')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON, Role.WAREHOUSE)
  @ApiBearerAuth()
  @ApiOperation({ summary: '出库校验+锁定', description: '乐观锁保证并发安全：验证IMEI可售→锁定' })
  @ApiResponse({ status: 200, description: '校验通过，已锁定' })
  @ApiResponse({ status: 409, description: 'IMEI状态异常/并发冲突' })
  @ApiResponse({ status: 404, description: 'IMEI不存在' })
  outboundCheck(
    @Body() dto: OutboundCheckDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.inventoryService.outboundCheck(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post('outbound/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON, Role.WAREHOUSE)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消出库（解锁）', description: '将锁定的IMEI恢复为在库状态' })
  @ApiResponse({ status: 200, description: '已解锁' })
  @ApiResponse({ status: 422, description: '非锁定状态无需解锁' })
  @ApiResponse({ status: 404, description: 'IMEI不存在' })
  cancelOutbound(
    @Body() dto: OutboundCheckDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.inventoryService.cancelOutbound(dto.imei, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  // ---- 报废 ----

  @Post('stock/:imei/scrap')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'IMEI报废', description: '将IMEI标记为报废状态，乐观锁保证并发安全' })
  @ApiResponse({ status: 200, description: '报废成功' })
  @ApiResponse({ status: 422, description: '当前状态不允许报废' })
  @ApiResponse({ status: 404, description: 'IMEI不存在' })
  scrapImei(
    @Param('imei') imei: string,
    @Body() dto: ScrapImeiDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.inventoryService.scrapImei(imei, dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }
}
