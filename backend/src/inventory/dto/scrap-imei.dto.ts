import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ScrapImeiDto {
  @ApiProperty({ description: '报废原因', example: '屏幕损坏无法修复' })
  @IsString()
  @IsNotEmpty({ message: '报废原因不能为空' })
  reason: string;
}
