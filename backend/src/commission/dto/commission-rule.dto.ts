import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsBoolean, IsIn, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCommissionRuleDto {
  @ApiPropertyOptional({ description: '品牌 (null=通用)', example: 'Apple' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  brand?: string;

  @ApiPropertyOptional({ description: '型号 (null=通用)', example: 'iPhone 16 Pro' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  model?: string;

  @ApiPropertyOptional({ description: '最低售价区间', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({ description: '最高售价区间', example: 10000 })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ApiProperty({ description: '提成类型: fixed=按台数 / percentage=按金额 / tiered=按毛利', example: 'percentage' })
  @IsString()
  @IsNotEmpty({ message: '提成类型不能为空' })
  @IsIn(['fixed', 'percentage', 'tiered'], { message: '类型必须是 fixed / percentage / tiered' })
  commissionType: string;

  @ApiProperty({ description: '提成值: fixed=金额 / percentage=百分比 / tiered=毛利率百分比', example: 5 })
  @Type(() => Number)
  @IsNotEmpty({ message: '提成值不能为空' })
  commissionValue: number;

  @ApiPropertyOptional({ description: '优先级 (越大越优先)', example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number = 0;
}

export class UpdateCommissionRuleDto {
  @ApiPropertyOptional({ description: '品牌' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: '型号' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: '最低售价区间' })
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({ description: '最高售价区间' })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({ description: '提成类型' })
  @IsOptional()
  @IsString()
  @IsIn(['fixed', 'percentage', 'tiered'], { message: '类型必须是 fixed / percentage / tiered' })
  commissionType?: string;

  @ApiPropertyOptional({ description: '提成值' })
  @IsOptional()
  @Type(() => Number)
  commissionValue?: number;

  @ApiPropertyOptional({ description: '优先级' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ description: '启用状态' })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
