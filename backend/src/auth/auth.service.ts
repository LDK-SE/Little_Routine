import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditLog: AuditLogService,
    private blacklist: TokenBlacklistService,
  ) {}

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.sysUser.findUnique({
      where: { phone: dto.phone },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status === 'inactive') {
      throw new UnauthorizedException('用户不存在或已离职');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('密码错误');
    }

    const roles = user.userRoles.map((ur) => ur.role.code);

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: Number(user.id),
      phone: user.phone,
      roles,
      shopId: Number(user.shopId),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
    });

    await this.auditLog.logLogin(user.id, user.shopId, ip);

    return {
      accessToken,
      refreshToken,
      user: {
        id: Number(user.id),
        phone: user.phone,
        name: user.name,
        roles,
        shopId: Number(user.shopId),
      },
    };
  }

  async register(dto: RegisterDto, ip?: string) {
    const existing = await this.prisma.sysUser.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('该手机号已注册');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let defaultRole = await this.prisma.sysRole.findUnique({
      where: { code: 'salesperson' },
    });
    if (!defaultRole) {
      defaultRole = await this.prisma.sysRole.create({
        data: { code: 'salesperson', name: '销售员' },
      });
    }

    const user = await this.prisma.sysUser.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        passwordHash,
        shopId: BigInt(dto.shopId),
        status: 'active',
        userRoles: { create: { roleId: defaultRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });

    const roles = user.userRoles.map((ur) => ur.role.code);

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: Number(user.id),
      phone: user.phone,
      roles,
      shopId: Number(user.shopId),
    };

    const accessToken = this.jwtService.sign(payload);

    await this.auditLog.write({
      shopId: user.shopId,
      operatorId: user.id,
      module: 'auth',
      action: 'register',
      targetType: 'sys_user',
      targetId: String(user.id),
      ipAddress: ip,
    });

    return {
      accessToken,
      user: {
        id: Number(user.id),
        phone: user.phone,
        name: user.name,
        roles,
        shopId: Number(user.shopId),
      },
    };
  }

  async logout(token: string, user: JwtPayload) {
    await this.blacklist.blacklist(token);
    await this.auditLog.logLogout(BigInt(user.sub), BigInt(user.shopId));
  }

  async refreshToken(token: string, user: JwtPayload, ip?: string) {
    // 撤销旧刷新令牌，防止令牌泄露后被滥用
    await this.blacklist.blacklist(token);

    const payload = {
      sub: user.sub,
      phone: user.phone,
      roles: user.roles,
      shopId: user.shopId,
    };

    await this.auditLog.logTokenRefresh(BigInt(user.sub), BigInt(user.shopId), ip);

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
      }),
    };
  }

  async getProfile(userId: bigint) {
    const user = await this.prisma.sysUser.findUnique({
      where: { id: userId, deletedAt: null },
      include: { userRoles: { include: { role: true } }, shop: true },
    });

    if (!user || user.status === 'inactive') {
      throw new UnauthorizedException('用户不存在或已离职');
    }

    return {
      id: Number(user.id),
      phone: user.phone,
      name: user.name,
      roles: user.userRoles.map((ur) => ur.role.code),
      shopId: Number(user.shopId),
      shopName: user.shop?.name ?? '',
    };
  }
}
