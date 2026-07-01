import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, Length, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTradeInDto {
  @ApiPropertyOptional({ description: '旧机IMEI' })
  @IsOptional()
  @IsString()
  @Length(14, 20)
  oldImei?: string;

  @ApiPropertyOptional({ description: '旧机品牌' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  oldBrand?: string;

  @ApiPropertyOptional({ description: '旧机型号' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  oldModel?: string;

  @ApiPropertyOptional({ description: '旧机成色: excellent / good / fair / poor' })
  @IsOptional()
  @IsString()
  @IsIn(['excellent', 'good', 'fair', 'poor'])
  oldCondition?: string;

  @ApiPropertyOptional({ description: '评估价值' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  appraisedValue?: number;

  @ApiPropertyOptional({ description: '实际抵扣金额' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualDeduction?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}
