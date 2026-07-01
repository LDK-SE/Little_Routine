import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      message =
        typeof exResponse === 'string'
          ? exResponse
          : (exResponse as any).message || exception.message;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // 映射 Prisma 已知错误到 HTTP 状态码
      switch (exception.code) {
        case 'P2002': // 唯一约束冲突
          status = HttpStatus.CONFLICT;
          message = `数据重复: ${(exception.meta?.target as string[])?.join(', ') ?? '未知字段'}`;
          break;
        case 'P2025': // 记录不存在
          status = HttpStatus.NOT_FOUND;
          message = '请求的资源不存在或已被删除';
          break;
        case 'P2003': // 外键约束失败
          status = HttpStatus.BAD_REQUEST;
          message = '关联数据不存在';
          break;
        case 'P2014': // 违反关联约束
          status = HttpStatus.BAD_REQUEST;
          message = '关联数据关系不合法';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = '数据库操作异常';
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = '请求参数格式不合法';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : '',
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json({
      code: status,
      message: Array.isArray(message) ? message.join('; ') : message,
      data: null,
      timestamp: new Date().toISOString(),
    });
  }
}
