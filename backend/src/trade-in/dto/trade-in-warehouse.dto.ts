import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class TradeInWarehouseDto {
  @ApiProperty({ description: '旧机IMEI (入库用)', example: '123456789012345' })
  @IsString()
  @IsNotEmpty({ message: '旧机IMEI不能为空' })
  @Length(14, 20, { message: 'IMEI长度为14-20位' })
  oldImei: string;

  @ApiPropertyOptional({ description: '货位', example: 'B-01' })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  location?: string;

  @ApiPropertyOptional({ description: '入库备注' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}
