import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductSkuDto {
  @ApiPropertyOptional({ description: '颜色', example: '原色钛金属' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: '配置', example: '512GB' })
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiPropertyOptional({ description: '条形码', example: 'BAR002' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: '建议零售价', example: 9999.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @ApiPropertyOptional({ description: '最低允许售价', example: 9500.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSalePrice?: number;

  @ApiPropertyOptional({ description: '状态', enum: ['on_sale', 'discontinued'], example: 'on_sale' })
  @IsOptional()
  @IsString()
  @IsIn(['on_sale', 'discontinued'], { message: '状态值只能是 on_sale 或 discontinued' })
  status?: string;
}
