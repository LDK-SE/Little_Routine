import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard)
export class UserController {
  constructor(private readonly service: UserService) {}

  // ======================== 用户 ========================

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '用户列表' })
  findAll(@Query() query: UserQueryDto) {
    return this.service.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  getMe(@CurrentUser() user: any) {
    return this.service.findOne(BigInt(user.sub));
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '用户详情' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(BigInt(id));
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '创建用户' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.create(dto, BigInt(user.id), req.ip);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '更新用户' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.update(BigInt(id), dto, BigInt(user.id), req.ip);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '删除用户（软删除）' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.remove(BigInt(id), BigInt(user.id), req.ip);
  }

  @Post(':id/roles/:roleId')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '分配角色给用户' })
  assignRole(@Param('id') id: string, @Param('roleId') roleId: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.assignRole(BigInt(id), BigInt(roleId), BigInt(user.id), req.ip);
  }

  @Delete(':id/roles/:roleId')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '移除用户角色' })
  removeRole(@Param('id') id: string, @Param('roleId') roleId: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.removeRole(BigInt(id), BigInt(roleId), BigInt(user.id), req.ip);
  }

  // ======================== 角色 ========================

  @Get('roles/list')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '角色列表' })
  findAllRoles() {
    return this.service.findAllRoles();
  }

  @Post('roles')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '创建角色' })
  createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.createRole(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Put('roles/:id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '更新角色' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.updateRole(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Delete('roles/:id')
  @Roles(Role.SUPER_ADMIN, Role.OWNER)
  @ApiOperation({ summary: '删除角色' })
  deleteRole(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.deleteRole(BigInt(id), BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }
}
