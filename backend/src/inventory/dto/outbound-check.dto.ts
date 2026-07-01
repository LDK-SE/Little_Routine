import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class OutboundCheckDto {
  @ApiProperty({ description: 'IMEI 串号', example: '356789012345678' })
  @IsString()
  @IsNotEmpty({ message: 'IMEI不能为空' })
  imei: string;

  @ApiPropertyOptional({ description: '关联订单号', example: 'SO2026061000123' })
  @IsOptional()
  @IsString()
  orderNo?: string;
}
