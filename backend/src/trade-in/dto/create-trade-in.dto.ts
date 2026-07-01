import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Length, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTradeInDto {
  @ApiProperty({ description: '关联销售订单号', example: 'SO2026061600001' })
  @IsString()
  @IsNotEmpty({ message: '订单号不能为空' })
  @Length(1, 30, { message: '订单号长度不能超过30位' })
  orderNo: string;

  @ApiPropertyOptional({ description: '旧机IMEI', example: '123456789012345' })
  @IsOptional()
  @IsString()
  @Length(14, 20, { message: 'IMEI长度为14-20位' })
  oldImei?: string;

  @ApiPropertyOptional({ description: '旧机品牌', example: 'Apple' })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  oldBrand?: string;

  @ApiPropertyOptional({ description: '旧机型号', example: 'iPhone 13' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  oldModel?: string;

  @ApiPropertyOptional({ description: '旧机成色: excellent / good / fair / poor', example: 'good' })
  @IsOptional()
  @IsString()
  @IsIn(['excellent', 'good', 'fair', 'poor'], { message: '成色值无效' })
  oldCondition?: string;

  @ApiProperty({ description: '评估价值', example: 2500 })
  @Type(() => Number)
  @IsNumber({}, { message: '评估价值必须为数字' })
  @Min(0, { message: '评估价值不能为负数' })
  appraisedValue: number;

  @ApiPropertyOptional({ description: '实际抵扣金额 (默认等于评估价值)', example: 2500 })
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
