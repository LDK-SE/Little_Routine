import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateProductSkuDto } from './dto/create-product-sku.dto';
import { UpdateProductSkuDto } from './dto/update-product-sku.dto';
import { ProductQueryDto } from './dto/product-query.dto';

@Injectable()
export class ProductService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 新建 SKU（自动创建 Product 如果 brand+model 不存在） */
  async createSku(dto: CreateProductSkuDto, operatorId: bigint, shopId: bigint, ip?: string) {
    // findOrCreate Product — 使用事务避免竞态条件
    let product = await this.prisma.$transaction(async (tx) => {
      let p = await tx.product.findUnique({
        where: { brand_model: { brand: dto.brand, model: dto.model } },
      });

      if (!p) {
        p = await tx.product.create({
          data: {
            brand: dto.brand,
            model: dto.model,
            category: dto.category ?? null,
          },
        });
      } else if (p.deletedAt) {
        p = await tx.product.update({
          where: { id: p.id },
          data: { deletedAt: null, status: 'on_sale' },
        });
      }

      return p;
    });

    // 检查同款 SKU 是否已存在
    const existingSku = await this.prisma.productSku.findUnique({
      where: {
        productId_color_spec: {
          productId: product.id,
          color: dto.color,
          spec: dto.spec,
        },
      },
    });

    if (existingSku && !existingSku.deletedAt) {
      throw new ConflictException('该颜色+配置的SKU已存在');
    }

    if (existingSku && existingSku.deletedAt) {
      const restored = await this.prisma.productSku.update({
        where: { id: existingSku.id },
        data: {
          barcode: dto.barcode ?? existingSku.barcode,
          retailPrice: dto.retailPrice ?? existingSku.retailPrice,
          minSalePrice: dto.minSalePrice ?? existingSku.minSalePrice,
          status: 'on_sale',
          deletedAt: null,
        },
        include: { product: true },
      });

      await this.auditLog.write({
        shopId, operatorId, module: 'product', action: 'create_sku_restore',
        targetType: 'product_sku', targetId: String(restored.id),
        detailJson: { brand: dto.brand, model: dto.model, color: dto.color, spec: dto.spec },
        ipAddress: ip,
      });

      return this.formatSku(restored);
    }

    const sku = await this.prisma.productSku.create({
      data: {
        productId: product.id,
        color: dto.color,
        spec: dto.spec,
        barcode: dto.barcode ?? null,
        retailPrice: dto.retailPrice ?? null,
        minSalePrice: dto.minSalePrice ?? null,
      },
      include: { product: true },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'product', action: 'create_sku',
      targetType: 'product_sku', targetId: String(sku.id),
      detailJson: { brand: dto.brand, model: dto.model, color: dto.color, spec: dto.spec },
      ipAddress: ip,
    });

    return this.formatSku(sku);
  }

  /** SKU 列表（分页+筛选） */
  async findAll(query: ProductQueryDto) {
    const { brand, model, color, status, page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    if (status) {
      where.status = status;
    }

    if (color) {
      where.color = { contains: color };
    }

    if (brand || model) {
      where.product = {};
      if (brand) where.product.brand = { contains: brand };
      if (model) where.product.model = { contains: model };
    }

    const [items, total] = await Promise.all([
      this.prisma.productSku.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, brand: true, model: true, category: true, status: true } },
        },
      }),
      this.prisma.productSku.count({ where }),
    ]);

    return {
      items: items.map((s) => this.formatSku(s)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** SKU 详情 */
  async findOne(id: bigint) {
    const sku = await this.prisma.productSku.findUnique({
      where: { id, deletedAt: null },
      include: {
        product: { select: { id: true, brand: true, model: true, category: true, status: true } },
      },
    });

    if (!sku) {
      throw new NotFoundException('SKU不存在');
    }

    return this.formatSku(sku);
  }

  /** 编辑 SKU */
  async updateSku(id: bigint, dto: UpdateProductSkuDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const sku = await this.prisma.productSku.findUnique({
      where: { id, deletedAt: null },
    });

    if (!sku) {
      throw new NotFoundException('SKU不存在');
    }

    const updated = await this.prisma.productSku.update({
      where: { id },
      data: {
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.spec !== undefined && { spec: dto.spec }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.retailPrice !== undefined && { retailPrice: dto.retailPrice }),
        ...(dto.minSalePrice !== undefined && { minSalePrice: dto.minSalePrice }),
        ...(dto.status !== undefined && { status: dto.status as any }),
      },
      include: {
        product: { select: { id: true, brand: true, model: true, category: true, status: true } },
      },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'product', action: 'update_sku',
      targetType: 'product_sku', targetId: String(id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return this.formatSku(updated);
  }

  /** SPU 列表 */
  async findProducts(query: ProductQueryDto) {
    const { brand, model, category, status, page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    if (status) where.status = status;
    if (brand) where.brand = { contains: brand };
    if (model) where.model = { contains: model };
    if (category) where.category = { contains: category };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { skus: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((p) => ({
        id: Number(p.id),
        brand: p.brand,
        model: p.model,
        category: p.category,
        status: p.status,
        skuCount: p._count.skus,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** SPU 详情 */
  async findProduct(id: bigint) {
    const product = await this.prisma.product.findUnique({
      where: { id, deletedAt: null },
      include: {
        skus: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    return {
      id: Number(product.id),
      brand: product.brand,
      model: product.model,
      category: product.category,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      skus: product.skus.map((s) => ({
        id: Number(s.id),
        color: s.color,
        spec: s.spec,
        barcode: s.barcode,
        retailPrice: s.retailPrice !== null ? Number(s.retailPrice) : null,
        minSalePrice: s.minSalePrice !== null ? Number(s.minSalePrice) : null,
        status: s.status,
        createdAt: s.createdAt,
      })),
    };
  }

  private formatSku(sku: any) {
    return {
      id: Number(sku.id),
      productId: Number(sku.productId),
      brand: sku.product?.brand,
      model: sku.product?.model,
      category: sku.product?.category,
      color: sku.color,
      spec: sku.spec,
      barcode: sku.barcode,
      retailPrice: sku.retailPrice !== null ? Number(sku.retailPrice) : null,
      minSalePrice: sku.minSalePrice !== null ? Number(sku.minSalePrice) : null,
      status: sku.status,
      createdAt: sku.createdAt,
      updatedAt: sku.updatedAt,
    };
  }
}
