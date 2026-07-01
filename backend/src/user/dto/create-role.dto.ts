import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: '角色编码', example: 'store_manager' })
  @IsString()
  @Matches(/^[a-z_]+$/, { message: '角色编码须为小写字母+下划线' })
  code: string;

  @ApiProperty({ description: '角色名称', example: '店长' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '角色描述' })
  @IsOptional()
  @IsString()
  description?: string;
}
