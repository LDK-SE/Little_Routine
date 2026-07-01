import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsNumber, Min,
  IsArray, ValidateNested, ArrayMinSize, IsInt, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class PaymentItemDto {
  @ApiProperty({ description: '支付方式', enum: ['cash', 'wechat', 'alipay', 'bank_transfer', 'trade_in', 'subsidy'] })
  @IsString()
  @IsNotEmpty()
  method: string;

  @ApiProperty({ description: '支付金额', example: 4000.00 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}

class TradeInDto {
  @ApiPropertyOptional({ description: '旧设备IMEI', example: '123456789012345' })
  @IsOptional()
  @IsString()
  oldImei?: string;

  @ApiPropertyOptional({ description: '旧设备品牌', example: 'Apple' })
  @IsOptional()
  @IsString()
  oldBrand?: string;

  @ApiPropertyOptional({ description: '旧设备型号', example: 'iPhone 14' })
  @IsOptional()
  @IsString()
  oldModel?: string;

  @ApiPropertyOptional({ description: '旧设备成色', example: '良好' })
  @IsOptional()
  @IsString()
  oldCondition?: string;

  @ApiProperty({ description: '评估价值', example: 2000.00 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  appraisedValue: number;

  @ApiProperty({ description: '实际抵扣金额', example: 2000.00 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualDeduction: number;
}

export class CreateSaleOrderDto {
  @ApiProperty({ description: 'IMEI 串号', example: '356789012345678' })
  @IsString()
  @IsNotEmpty({ message: 'IMEI不能为空' })
  imei: string;

  @ApiProperty({ description: '售价', example: 8999.00 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice: number;

  @ApiPropertyOptional({ description: '会员手机号', example: '13900000001' })
  @IsOptional()
  @IsString()
  @MaxLength(11)
  memberPhone?: string;

  @ApiPropertyOptional({ description: '国补金额', example: 500.00, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subsidyAmount?: number = 0;

  @ApiPropertyOptional({ description: '使用积分抵扣', example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsToUse?: number = 0;

  @ApiProperty({ description: '收款明细', type: [PaymentItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: '至少需要1条收款记录' })
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  payments: PaymentItemDto[];

  @ApiPropertyOptional({ description: '以旧换新信息' })
  @IsOptional()
  @ValidateNested()
  @Type(() => TradeInDto)
  tradeIn?: TradeInDto;
}
