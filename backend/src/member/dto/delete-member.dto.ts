import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class DeleteMemberDto {
  @ApiPropertyOptional({ description: '注销原因', example: '用户主动注销' })
  @IsOptional()
  @IsString()
  reason?: string;
}
