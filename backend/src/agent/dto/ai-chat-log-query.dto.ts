import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AiChatLogQueryDto {
  @ApiPropertyOptional({ description: '用户ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @ApiPropertyOptional({ description: '角色: super_admin / owner / salesperson / member' })
  @IsOptional()
  @IsString()
  userRole?: string;

  @ApiPropertyOptional({ description: '意图类型' })
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiPropertyOptional({ description: '调用的函数' })
  @IsOptional()
  @IsString()
  functionCalled?: string;

  @ApiPropertyOptional({ description: '是否转人工' })
  @IsOptional()
  isTransferred?: boolean;

  @ApiPropertyOptional({ description: '最低置信度筛选', example: 0.8 })
  @IsOptional()
  @Type(() => Number)
  minConfidence?: number;

  @ApiPropertyOptional({ description: '开始日期', example: '2026-06-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期', example: '2026-06-30' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '页码', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
