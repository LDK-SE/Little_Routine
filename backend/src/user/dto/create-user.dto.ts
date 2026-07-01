import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, MinLength, IsOptional, Matches } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsString()
  @Matches(/^\d{11}$/, { message: '手机号须为11位数字' })
  phone: string;

  @ApiProperty({ description: '姓名', example: '张三' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ description: '密码', example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: '门店ID', example: 1 })
  @IsInt()
  @Min(1)
  shopId: number;

  @ApiProperty({ description: '角色ID列表', example: [2], required: false })
  @IsOptional()
  @IsInt({ each: true })
  roleIds?: number[];
}
