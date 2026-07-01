import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryQueryDto {
  @ApiPropertyOptional({ description: '门店ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shopId?: number;

  @ApiPropertyOptional({ description: 'SKU ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  skuId?: number;

  @ApiPropertyOptional({ description: '状态: pending_audit / in_stock / locked / sold / returned / scrapped' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '货位', example: 'A-03' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: '批次号' })
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional({ description: '搜索关键词(品牌/型号/IMEI)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '审核状态: pending / approved / rejected' })
  @IsOptional()
  @IsString()
  auditStatus?: string;

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

  @ApiPropertyOptional({ description: '排序方向', example: 'desc', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
