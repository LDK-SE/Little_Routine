import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { MemberModule } from './member/member.module';
import { ProductModule } from './product/product.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchaseModule } from './purchase/purchase.module';
import { SaleModule } from './sale/sale.module';
import { PointModule } from './point/point.module';
import { CommissionModule } from './commission/commission.module';
import { NationalSubsidyModule } from './national-subsidy/national-subsidy.module';
import { TradeInModule } from './trade-in/trade-in.module';
import { ReturnModule } from './return/return.module';
import { AgentModule } from './agent/agent.module';
import { CommonModule } from './common/common.module';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { SwaggerAuthMiddleware } from './common/middleware/swagger-auth.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import configuration from './config/configuration';

@Module({
  imports: [
    // ---- 配置 ----
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.local'],
    }),

    // ---- 速率限制 ----
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 30,
    }]),

    // ---- Pino 日志 ----
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'debug',
        transport:
          process.env.APP_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'yyyy-mm-dd HH:MM:ss',
                  singleLine: true,
                },
              }
            : undefined,
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),

    // ---- 核心模块 ----
    PrismaModule,
    RedisModule,
    CommonModule,

    // ---- 业务模块 ----
    AuthModule,
    UserModule,
    MemberModule,
    ProductModule,
    InventoryModule,
    PurchaseModule,
    SaleModule,
    PointModule,
    CommissionModule,
    NationalSubsidyModule,
    TradeInModule,
    ReturnModule,
    AgentModule,
  ],
  providers: [
    // 全局 JWT 认证守卫 — 默认保护所有端点
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 全局速率限制守卫
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
    consumer.apply(SwaggerAuthMiddleware).forRoutes('api/docs');
  }
}
