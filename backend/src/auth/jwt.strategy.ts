import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: number;
  phone: string;
  role: string;
  shopId: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.sysUser.findUnique({
      where: { id: BigInt(payload.sub), deletedAt: null },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    if (!user || user.status === 'inactive') {
      throw new UnauthorizedException('用户不存在或已离职');
    }

    const primaryRole = user.userRoles[0]?.role?.code ?? 'salesperson';

    return {
      id: Number(user.id),
      phone: user.phone,
      name: user.name,
      role: primaryRole,
      shopId: Number(user.shopId),
    };
  }
}
