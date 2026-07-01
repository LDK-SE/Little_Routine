import {
  Controller, Get, Post, Param, Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReturnService } from './return.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { AuditReturnDto } from './dto/audit-return.dto';
import { ReturnQueryDto } from './dto/return-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('退货管理')
@Controller('returns')
export class ReturnController {
  constructor(private readonly service: ReturnService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建退货申请' })
  create(@Body() dto: CreateReturnDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.create(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退货单列表' })
  findAll(@Query() query: ReturnQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退货单详情' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(BigInt(id));
  }

  @Post(':id/audit')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审核退货', description: 'pending → approved / rejected' })
  audit(@Param('id') id: string, @Body() dto: AuditReturnDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.audit(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '完成退货', description: '执行实际退货操作：IMEI回退+退款+积分冲正+提成回收+国补召回' })
  complete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.complete(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '取消退货' })
  cancel(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.cancel(BigInt(id), reason ?? '手动取消', BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }
}
