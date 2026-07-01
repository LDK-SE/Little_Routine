import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import type { Request } from 'express';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: '用户登录', description: '使用手机号+密码登录，返回 accessToken 和 refreshToken' })
  @ApiResponse({ status: 200, description: '登录成功' })
  @ApiResponse({ status: 401, description: '用户不存在或密码错误' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip);
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: '用户注册', description: '注册新用户，默认分配销售员角色' })
  @ApiResponse({ status: 201, description: '注册成功' })
  @ApiResponse({ status: 409, description: '手机号已注册' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: '退出登录', description: '将当前 token 加入黑名单使其失效' })
  @ApiResponse({ status: 200, description: '登出成功' })
  logout(@Req() req: Request, @CurrentUser() user: JwtPayload) {
    const token = req.headers.authorization ?? '';
    return this.authService.logout(token, user);
  }

  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: '刷新令牌', description: '使用当前有效 token 换取新的 accessToken' })
  @ApiResponse({ status: 200, description: '令牌刷新成功' })
  refresh(@Req() req: Request, @CurrentUser() user: JwtPayload) {
    const token = req.headers.authorization ?? '';
    return this.authService.refreshToken(token, user, req.ip);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息', description: '返回登录用户的详细信息含门店' })
  @ApiResponse({ status: 200, description: '获取成功' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(BigInt(user.sub));
  }
}
