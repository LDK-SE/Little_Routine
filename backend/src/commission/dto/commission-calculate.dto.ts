import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CommissionCalculateDto {
  @ApiPropertyOptional({ description: '品牌 (用于规则匹配)', example: 'Apple' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: '型号 (用于规则匹配)', example: 'iPhone 16 Pro' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ description: '销售金额', example: 6999 })
  @Type(() => Number)
  @IsNumber({}, { message: '销售金额必须为数字' })
  @Min(0.01, { message: '销售金额必须大于0' })
  salePrice: number;

  @ApiPropertyOptional({ description: '成本价', example: 5500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number = 0;

  @ApiPropertyOptional({ description: '国补金额', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subsidyAmount?: number = 0;

  @ApiPropertyOptional({ description: '数量', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number = 1;
}
