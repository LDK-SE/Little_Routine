import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductQueryDto {
  @ApiPropertyOptional({ description: '品牌', example: 'Apple' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: '型号', example: 'iPhone 16 Pro' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: '品类', example: '智能手机' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '颜色', example: '原色钛金属' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: '状态: on_sale / discontinued', example: 'on_sale' })
  @IsOptional()
  @IsString()
  status?: string;

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
