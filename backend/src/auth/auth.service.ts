import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.sysUser.findUnique({
      where: { phone: dto.phone },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user || user.status === 'inactive') {
      throw new UnauthorizedException('用户不存在或已离职');
    }

    const primaryRole = user.userRoles[0]?.role?.code ?? 'salesperson';

    const payload: JwtPayload = {
      sub: Number(user.id),
      phone: user.phone,
      role: primaryRole,
      shopId: Number(user.shopId),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: Number(user.id),
        phone: user.phone,
        name: user.name,
        role: primaryRole,
        shopId: Number(user.shopId),
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.sysUser.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('该手机号已注册');
    }

    // 查找默认角色
    let defaultRole = await this.prisma.sysRole.findUnique({
      where: { code: 'salesperson' },
    });
    if (!defaultRole) {
      // 如果角色表为空，创建一个默认销售员角色
      defaultRole = await this.prisma.sysRole.create({
        data: { code: 'salesperson', name: '销售员' },
      });
    }

    const user = await this.prisma.sysUser.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        passwordHash: '',
        shopId: BigInt(dto.shopId),
        status: 'active',
        userRoles: {
          create: {
            roleId: defaultRole.id,
          },
        },
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    const primaryRole = user.userRoles[0]?.role?.code ?? 'salesperson';

    const payload: JwtPayload = {
      sub: Number(user.id),
      phone: user.phone,
      role: primaryRole,
      shopId: Number(user.shopId),
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: Number(user.id),
        phone: user.phone,
        name: user.name,
        role: primaryRole,
        shopId: Number(user.shopId),
      },
    };
  }

  async refreshToken(user: JwtPayload) {
    const payload: JwtPayload = {
      sub: user.sub,
      phone: user.phone,
      role: user.role,
      shopId: user.shopId,
    };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
