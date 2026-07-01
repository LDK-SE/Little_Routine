import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, Min, IsOptional, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class PointRedeemDto {
  @ApiProperty({ description: '会员ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '会员ID不能为空' })
  memberId: number;

  @ApiProperty({ description: '抵扣积分数量', example: 5000 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: '抵扣积分必须大于0' })
  amount: number;

  @ApiProperty({ description: '关联订单号', example: 'SO2026061600001' })
  @IsString()
  @IsNotEmpty({ message: '订单号不能为空' })
  @Length(1, 30, { message: '订单号长度不能超过30位' })
  orderNo: string;

  @ApiPropertyOptional({ description: '购买机型', example: 'iPhone 16 Pro' })
  @IsOptional()
  @IsString()
  @Length(0, 100, { message: '机型名称不能超过100位' })
  productModel?: string;

  @ApiPropertyOptional({ description: '单价', example: 6999.00 })
  @IsOptional()
  @Type(() => Number)
  unitPrice?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '备注不能超过200位' })
  remark?: string;
}
