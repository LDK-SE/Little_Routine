import {
  Controller, Get, Post, Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { NationalSubsidyService } from './national-subsidy.service';
import { SubsidyQueryDto } from './dto/subsidy-query.dto';
import { SubsidyReviewDto, SubsidyDisburseDto } from './dto/subsidy-review.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('国补管理')
@Controller('subsidies')
export class NationalSubsidyController {
  constructor(private readonly service: NationalSubsidyService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '补贴列表', description: '分页查询国补记录' })
  findAll(@Query() query: SubsidyQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '补贴详情' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(BigInt(id));
  }

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交补贴申请', description: 'pending_submit → submitted' })
  submit(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.submit(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/start-review')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '进入审核', description: 'submitted → under_review' })
  startReview(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.startReview(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/review')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审核补贴', description: 'under_review → approved / rejected' })
  review(
    @Param('id') id: string, @Body() dto: SubsidyReviewDto,
    @CurrentUser() user: any, @Req() req: Request,
  ) {
    return this.service.review(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/disburse')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '补贴打款', description: 'approved → disbursed' })
  disburse(
    @Param('id') id: string, @Body() dto: SubsidyDisburseDto,
    @CurrentUser() user: any, @Req() req: Request,
  ) {
    return this.service.disburse(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Post(':id/recall')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '补贴召回', description: 'disbursed → recalled' })
  recall(
    @Param('id') id: string, @Body('reason') reason: string,
    @CurrentUser() user: any, @Req() req: Request,
  ) {
    return this.service.recall(BigInt(id), reason ?? '手动召回', BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }
}
