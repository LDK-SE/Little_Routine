import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';
import { ReturnType } from '@prisma/client';

export class CreateReturnDto {
  @ApiProperty({ description: '原销售单号', example: 'SO202606160001' })
  @IsString()
  @IsNotEmpty({ message: '原销售单号不能为空' })
  originalOrderNo: string;

  @ApiProperty({ description: '退货IMEI', example: '123456789012345678' })
  @IsString()
  @IsNotEmpty({ message: 'IMEI不能为空' })
  imei: string;

  @ApiProperty({ description: '退货原因', example: '屏幕坏点' })
  @IsString()
  @IsNotEmpty({ message: '退货原因不能为空' })
  returnReason: string;

  @ApiProperty({ description: '退货类型', enum: ReturnType, example: 'full_return' })
  @IsEnum(ReturnType)
  returnType: ReturnType;

  @ApiProperty({ description: '退款金额', example: 5999.00 })
  @IsNumber()
  @Min(0)
  refundAmount: number;

  @ApiProperty({ description: '回收积分', example: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  pointsRecalled?: number;

  @ApiProperty({ description: '回收提成', example: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  commissionRecalled?: number;

  @ApiProperty({ description: '回收国补', example: 0, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  subsidyRecalled?: number;
}
