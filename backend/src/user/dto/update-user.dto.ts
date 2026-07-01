import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, MinLength, Min, Matches } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '姓名' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: '手机号须为11位数字' })
  phone?: string;

  @ApiPropertyOptional({ description: '新密码', minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ description: '门店ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  shopId?: number;

  @ApiPropertyOptional({ description: '状态: active/inactive' })
  @IsOptional()
  @IsString()
  status?: string;
}
