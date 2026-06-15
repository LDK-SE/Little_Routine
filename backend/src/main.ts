import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ---- Pino 日志 ----
  app.useLogger(app.get(PinoLogger));

  // ---- 全局前缀 ----
  app.setGlobalPrefix('api/v1');

  // ---- 全局管道 ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ---- 统一异常处理 ----
  app.useGlobalFilters(new HttpExceptionFilter());

  // ---- 统一响应格式 ----
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ---- CORS ----
  app.enableCors();

  // ---- Swagger 文档 ----
  if (configService.get<boolean>('swagger.enabled')) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('3C数码零售系统 API')
      .setDescription('3C数码零售 · 小程序智能体 · 生产级 API 文档')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('认证', '登录/注册/令牌刷新')
      .addTag('用户', '用户信息管理')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Swagger 文档已启用: /api/docs');
  }

  const port = configService.get<number>('app.port') || 3000;
  await app.listen(port);
  logger.log(`服务已启动: http://localhost:${port}`);
  logger.log(`环境: ${configService.get<string>('app.env')}`);
}

bootstrap();
