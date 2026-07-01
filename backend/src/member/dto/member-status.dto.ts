import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export class MemberStatusDto {
  @ApiProperty({ description: '状态', enum: ['active', 'inactive'], example: 'inactive' })
  @IsString()
  @IsNotEmpty({ message: '状态不能为空' })
  @IsIn(['active', 'inactive'], { message: '状态值只能是 active 或 inactive' })
  status: string;

  @ApiPropertyOptional({ description: '操作原因', example: '违规操作' })
  @IsOptional()
  @IsString()
  reason?: string;
}
