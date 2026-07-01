import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export class AuditInboundDto {
  @ApiProperty({ description: '审核动作', enum: ['approved', 'rejected'], example: 'approved' })
  @IsString()
  @IsNotEmpty({ message: '审核动作不能为空' })
  @IsIn(['approved', 'rejected'], { message: '审核动作只能是 approved 或 rejected' })
  action: 'approved' | 'rejected';

  @ApiPropertyOptional({ description: '审核备注', example: '审核通过' })
  @IsOptional()
  @IsString()
  remark?: string;
}
