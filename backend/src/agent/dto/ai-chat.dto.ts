import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Length } from 'class-validator';

export class AiChatDto {
  @ApiProperty({ description: '用户消息', example: 'iPhone 16 Pro 还有货吗' })
  @IsString()
  @IsNotEmpty({ message: '消息不能为空' })
  @Length(1, 1000, { message: '消息长度不能超过1000位' })
  query: string;

  @ApiPropertyOptional({ description: '会话ID (用于多轮对话)', example: 'conv_abc123' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: '用户手机号 (会员端)', example: '13900000001' })
  @IsOptional()
  @IsString()
  userPhone?: string;
}
