import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductSkuDto {
  @ApiProperty({ description: '品牌', example: 'Apple' })
  @IsString()
  @IsNotEmpty({ message: '品牌不能为空' })
  brand: string;

  @ApiProperty({ description: '型号', example: 'iPhone 16 Pro' })
  @IsString()
  @IsNotEmpty({ message: '型号不能为空' })
  model: string;

  @ApiPropertyOptional({ description: '品类', example: '智能手机' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ description: '颜色', example: '原色钛金属' })
  @IsString()
  @IsNotEmpty({ message: '颜色不能为空' })
  color: string;

  @ApiProperty({ description: '配置（容量/存储/运存/网络制式）', example: '256GB' })
  @IsString()
  @IsNotEmpty({ message: '配置不能为空' })
  spec: string;

  @ApiPropertyOptional({ description: '条形码 (EAN/UPC)', example: 'BAR001' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: '建议零售价', example: 8999.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice?: number;

  @ApiPropertyOptional({ description: '最低允许售价', example: 8500.00 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSalePrice?: number;
}
