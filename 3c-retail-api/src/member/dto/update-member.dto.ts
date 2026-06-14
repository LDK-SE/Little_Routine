import { IsString, IsOptional, MaxLength, Matches, IsMobilePhone } from 'class-validator';

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(
    /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/,
    { message: '车牌号格式不正确' },
  )
  licensePlate?: string;

  @IsOptional()
  @IsMobilePhone('zh-CN')
  backupPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastPurchaseModel?: string;
}
