import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class SwaggerAuthMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // 仅在非 development 环境启用 Basic Auth
    if (process.env.APP_ENV === 'development' && (process.env.SWAGGER_AUTH || '').toLowerCase() !== 'true') {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('缺少认证信息', 'Basic realm="Swagger API Docs"');
    }

    const [scheme, credentials] = authHeader.split(' ');
    if (scheme !== 'Basic' || !credentials) {
      throw new UnauthorizedException('仅支持 Basic 认证');
    }

    const decoded = Buffer.from(credentials, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');

    const expectedUser = process.env.SWAGGER_USER;
    if (!expectedUser) {
      throw new UnauthorizedException('SWAGGER_USER 未配置');
    }
    const expectedPass = process.env.SWAGGER_PASS;
    if (!expectedPass) {
      throw new UnauthorizedException('SWAGGER_PASS 未配置');
    }

    if (username !== expectedUser || password !== expectedPass) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    next();
  }
}
