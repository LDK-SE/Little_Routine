import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductSkuDto } from './dto/create-product-sku.dto';
import { UpdateProductSkuDto } from './dto/update-product-sku.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { Request } from 'express';

@ApiTags('商品管理')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ---- SKU 端点 ----

  @Post('skus')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '新建 SKU', description: '自动创建 Product 如果 brand+model 不存在' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '该颜色+配置的SKU已存在' })
  createSku(
    @Body() dto: CreateProductSkuDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.productService.createSku(dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  @Get('skus')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SKU 列表', description: '分页+筛选，含商品品牌/型号' })
  @ApiResponse({ status: 200, description: '分页列表' })
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get('skus/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SKU 详情' })
  @ApiResponse({ status: 200, description: 'SKU 详情' })
  @ApiResponse({ status: 404, description: 'SKU不存在' })
  findOne(@Param('id') id: string) {
    return this.productService.findOne(BigInt(id));
  }

  @Put('skus/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.WAREHOUSE, Role.WAREHOUSE_SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: '编辑 SKU', description: '可修改颜色/配置/条形码/价格/状态' })
  @ApiResponse({ status: 200, description: '编辑成功' })
  @ApiResponse({ status: 404, description: 'SKU不存在' })
  updateSku(
    @Param('id') id: string,
    @Body() dto: UpdateProductSkuDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.productService.updateSku(BigInt(id), dto, BigInt(user.id), BigInt(user.shopId ?? 0), req.ip);
  }

  // ---- SPU 端点 ----

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SPU 商品列表', description: '分页+筛选，含 SKU 数量' })
  @ApiResponse({ status: 200, description: 'SPU 分页列表' })
  findProducts(@Query() query: ProductQueryDto) {
    return this.productService.findProducts(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SPU 商品详情', description: '含该商品下所有 SKU' })
  @ApiResponse({ status: 200, description: '商品详情' })
  @ApiResponse({ status: 404, description: '商品不存在' })
  findProduct(@Param('id') id: string) {
    return this.productService.findProduct(BigInt(id));
  }
}
