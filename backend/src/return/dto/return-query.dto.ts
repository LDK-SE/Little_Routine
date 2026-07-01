import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnQueryDto {
  @ApiPropertyOptional({ description: '门店ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shopId?: number;

  @ApiPropertyOptional({ description: '原订单号' })
  @IsOptional()
  @IsString()
  originalOrderNo?: string;

  @ApiPropertyOptional({ description: 'IMEI' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ description: '审核状态: pending/approved/rejected' })
  @IsOptional()
  @IsString()
  auditStatus?: string;

  @ApiPropertyOptional({ description: '退货类型: full_return/exchange/refund_only' })
  @IsOptional()
  @IsString()
  returnType?: string;

  @ApiPropertyOptional({ description: '开始日期 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期 (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: '排序字段', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: '排序方向', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
