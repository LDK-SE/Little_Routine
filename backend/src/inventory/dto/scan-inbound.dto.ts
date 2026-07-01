import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class ScanInboundDto {
  @ApiProperty({ description: 'IMEI 串号', example: '356789012345678' })
  @IsString()
  @IsNotEmpty({ message: 'IMEI不能为空' })
  imei: string;

  @ApiProperty({ description: 'SKU ID', example: 1 })
  @Type(() => Number)
  @IsInt()
  skuId: number;

  @ApiPropertyOptional({ description: '批次号', example: 'B2026001' })
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional({ description: '货位', example: 'A-03' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: '成本价', example: 7500.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ description: '采购渠道', example: '官方渠道' })
  @IsOptional()
  @IsString()
  channel?: string;
}
