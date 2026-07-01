import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsArray,
  ValidateNested, ArrayMinSize, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

class PurchaseItemDto {
  @ApiProperty({ description: 'SKU ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  skuId: number;

  @ApiProperty({ description: 'IMEI 串号', example: '356789012345678' })
  @IsString()
  @IsNotEmpty({ message: 'IMEI不能为空' })
  imei: string;

  @ApiProperty({ description: '采购单价', example: 7500.00 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @ApiPropertyOptional({ description: '供应商名称', example: '官方授权经销商' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional({ description: '供应商联系方式', example: '13800000000' })
  @IsOptional()
  @IsString()
  supplierContact?: string;

  @ApiProperty({ description: '采购明细', type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: '至少需要1条采购明细' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @ApiPropertyOptional({ description: '备注', example: '补货iPhone 16 Pro 256GB' })
  @IsOptional()
  @IsString()
  remark?: string;
}
