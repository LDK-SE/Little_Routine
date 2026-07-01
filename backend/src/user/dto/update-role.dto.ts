import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({ description: '角色编码' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z_]+$/, { message: '角色编码须为小写字母+下划线' })
  code?: string;

  @ApiPropertyOptional({ description: '角色名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;
}
