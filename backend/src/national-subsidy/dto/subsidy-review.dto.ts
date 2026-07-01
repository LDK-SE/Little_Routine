import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Length, IsIn } from 'class-validator';

export class SubsidyReviewDto {
  @ApiProperty({ description: '审核结果', example: 'approved' })
  @IsString()
  @IsNotEmpty({ message: '审核结果不能为空' })
  @IsIn(['approved', 'rejected'], { message: '审核结果必须是 approved 或 rejected' })
  action: string;

  @ApiPropertyOptional({ description: '审批金额 (不填则等于申请金额)', example: 500 })
  @IsOptional()
  approvedAmount?: number;

  @ApiPropertyOptional({ description: '外部参考号' })
  @IsOptional()
  @IsString()
  externalRefNo?: string;

  @ApiPropertyOptional({ description: '审核备注' })
  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '备注不能超过200位' })
  remark?: string;
}

export class SubsidyDisburseDto {
  @ApiProperty({ description: '打款金额', example: 500 })
  @IsNotEmpty({ message: '打款金额不能为空' })
  disbursedAmount: number;

  @ApiPropertyOptional({ description: '外部参考号 (银行流水号等)' })
  @IsOptional()
  @IsString()
  externalRefNo?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
