import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class TransferHumanDto {
  @ApiProperty({ description: '用户手机号', example: '13900000001' })
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Length(11, 11, { message: '手机号格式不正确' })
  userPhone: string;

  @ApiProperty({ description: '最近一次查询内容' })
  @IsString()
  @IsNotEmpty({ message: '查询内容不能为空' })
  lastQuery: string;

  @ApiProperty({ description: 'AI 置信度', example: 0.62 })
  @Type(() => Number)
  @IsNumber({}, { message: '置信度必须为数字' })
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiPropertyOptional({ description: '对话摘要' })
  @IsOptional()
  @IsString()
  conversationSummary?: string;

  @ApiPropertyOptional({ description: '意图类型' })
  @IsOptional()
  @IsString()
  intent?: string;
}
