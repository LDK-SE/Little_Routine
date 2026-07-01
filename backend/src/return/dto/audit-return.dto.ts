import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReturnAuditStatus } from '@prisma/client';

export class AuditReturnDto {
  @ApiProperty({ description: '审核动作', enum: ['approved', 'rejected'] })
  @IsEnum(['approved', 'rejected'])
  action: 'approved' | 'rejected';

  @ApiProperty({ description: '审核备注', required: false })
  @IsOptional()
  @IsString()
  remark?: string;
}
