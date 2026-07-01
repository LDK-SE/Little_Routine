import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class CommissionRollbackDto {
  @ApiProperty({ description: '回滚原因', example: '订单退货，冲正提成' })
  @IsString()
  @IsNotEmpty({ message: '回滚原因不能为空' })
  @Length(1, 200, { message: '回滚原因不能超过200位' })
  reason: string;
}
