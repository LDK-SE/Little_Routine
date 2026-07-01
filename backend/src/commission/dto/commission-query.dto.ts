import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CommissionQueryDto {
  @ApiPropertyOptional({ description: '门店ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shopId?: number;

  @ApiPropertyOptional({ description: '销售人员ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  salespersonId?: number;

  @ApiPropertyOptional({ description: '结算周期 (YYYY-MM)', example: '2026-06' })
  @IsOptional()
  @IsString()
  settlementPeriod?: string;

  @ApiPropertyOptional({ description: '状态: pending / confirmed / paid' })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'confirmed', 'paid'], { message: '状态值无效' })
  status?: string;

  @ApiPropertyOptional({ description: '订单号' })
  @IsOptional()
  @IsString()
  orderNo?: string;

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

  @ApiPropertyOptional({ description: '排序字段', example: 'createdAt', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: '排序方向: asc / desc', example: 'desc', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
