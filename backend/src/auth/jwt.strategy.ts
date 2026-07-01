import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TokenBlacklistService } from './token-blacklist.service';

export interface JwtPayload {
  sub: number;
  phone: string;
  roles: string[];
  shopId: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
    private blacklist: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const isBlacklisted = await this.blacklist.isBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('令牌已失效，请重新登录');
      }
    }

    const user = await this.prisma.sysUser.findUnique({
      where: { id: BigInt(payload.sub), deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status === 'inactive') {
      throw new UnauthorizedException('用户不存在或已离职');
    }

    const roles = user.userRoles.map((ur) => ur.role.code);

    return {
      id: Number(user.id),
      phone: user.phone,
      name: user.name,
      roles,
      shopId: Number(user.shopId),
    };
  }
}
