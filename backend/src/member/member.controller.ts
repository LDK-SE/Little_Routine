import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { MemberService } from './member.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { MemberStatusDto } from './dto/member-status.dto';
import { DeleteMemberDto } from './dto/delete-member.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('会员管理')
@Controller('members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '会员注册', description: 'C端公开接口，手机号唯一' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 409, description: '手机号已注册' })
  register(@Body() dto: CreateMemberDto, @Req() req: Request) {
    return this.memberService.register(dto, undefined, undefined, req.ip);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '会员列表', description: '分页+搜索，商家端使用' })
  @ApiResponse({ status: 200, description: '分页列表' })
  findAll(@Query() query: MemberQueryDto) {
    return this.memberService.findAll(query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.SALESPERSON)
  @ApiBearerAuth()
  @ApiOperation({ summary: '会员详情', description: '含推荐人信息+推荐数量' })
  @ApiResponse({ status: 200, description: '会员详情' })
  @ApiResponse({ status: 404, description: '会员不存在' })
  findOne(@Param('id') id: string) {
    return this.memberService.findOne(BigInt(id));
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '编辑会员信息', description: '可修改地址、车牌、备用手机号、最近购买机型' })
  @ApiResponse({ status: 200, description: '编辑成功' })
  @ApiResponse({ status: 404, description: '会员不存在' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.memberService.update(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '注销会员', description: '软删除，设置 deletedAt' })
  @ApiResponse({ status: 200, description: '注销成功' })
  @ApiResponse({ status: 404, description: '会员不存在' })
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteMemberDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.memberService.remove(
      BigInt(id),
      dto.reason ?? '管理员注销',
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }

  @Put(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: '启用/禁用会员' })
  @ApiResponse({ status: 200, description: '操作成功' })
  @ApiResponse({ status: 404, description: '会员不存在' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: MemberStatusDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.memberService.updateStatus(
      BigInt(id),
      dto,
      BigInt(user.id),
      BigInt(user.shopId ?? 0),
      req.ip,
    );
  }
}
