import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class UpdateMemberDto {
  @ApiPropertyOptional({ description: '会员姓名', example: '张先生' })
  @IsOptional()
  @IsString()
  @Length(1, 50, { message: '姓名长度为1-50位' })
  name?: string;

  @ApiPropertyOptional({ description: '地址', example: '广东省广州市天河区' })
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '地址长度不能超过200位' })
  address?: string;

  @ApiPropertyOptional({ description: '车牌号', example: '粤A12345' })
  @IsOptional()
  @IsString()
  @Matches(/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警]$/, {
    message: '车牌号格式不正确',
  })
  licensePlate?: string;

  @ApiPropertyOptional({ description: '备用手机号', example: '13900000002' })
  @IsOptional()
  @IsString()
  @Length(11, 11, { message: '备用手机号格式不正确' })
  backupPhone?: string;

  @ApiPropertyOptional({ description: '最近购买机型', example: 'iPhone 16 Pro' })
  @IsOptional()
  @IsString()
  @Length(0, 100, { message: '机型名称不能超过100位' })
  lastPurchaseModel?: string;
}
