import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';

describe('ProductService', () => {
  let service: ProductService;
  let prisma: any;
  let auditLog: any;

  const mockProduct = {
    id: 10n,
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    category: '智能手机',
    status: 'on_sale',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
  };

  const mockSku = {
    id: 1n,
    productId: 10n,
    color: '原色钛金属',
    spec: '512GB',
    barcode: 'BAR001',
    retailPrice: { toNumber: () => 9999 },
    minSalePrice: { toNumber: () => 9500 },
    status: 'on_sale',
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
    product: mockProduct,
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(mockProduct),
        findMany: jest.fn().mockResolvedValue([{ ...mockProduct, _count: { skus: 0 } }]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockProduct),
        update: jest.fn().mockResolvedValue(mockProduct),
      },
      productSku: {
        findUnique: jest.fn().mockResolvedValue(mockSku),
        findMany: jest.fn().mockResolvedValue([mockSku]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockSku),
        update: jest.fn().mockResolvedValue(mockSku),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
    };

    auditLog = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSku', () => {
    const dto = {
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      category: '智能手机',
      color: '原色钛金属',
      spec: '512GB',
      barcode: 'BAR001',
      retailPrice: 9999,
      minSalePrice: 9500,
    };

    it('应成功创建 SKU（Product 已存在）', async () => {
      prisma.productSku.findUnique.mockResolvedValue(null);

      const result = await service.createSku(dto, 1n, 1n, '127.0.0.1');

      expect(result.brand).toBe('Apple');
      expect(result.model).toBe('iPhone 16 Pro');
      expect(result.color).toBe('原色钛金属');
      expect(result.spec).toBe('512GB');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('Product 不存在时应自动创建 Product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.productSku.findUnique.mockResolvedValue(null);

      await service.createSku(dto, 1n, 1n);

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: { brand: 'Apple', model: 'iPhone 16 Pro', category: '智能手机' },
      });
    });

    it('SKU 已存在时应抛出 ConflictException', async () => {
      prisma.productSku.findUnique.mockResolvedValue({ ...mockSku, deletedAt: null });

      await expect(
        service.createSku(dto, 1n, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('已软删除的 SKU 应恢复', async () => {
      prisma.productSku.findUnique.mockResolvedValue({ ...mockSku, deletedAt: new Date() });
      prisma.productSku.update.mockResolvedValue(mockSku);

      const result = await service.createSku(dto, 1n, 1n);

      expect(result.status).toBe('on_sale');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('已软删除的 Product 应恢复', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, deletedAt: new Date() });
      prisma.productSku.findUnique.mockResolvedValue(null);

      await service.createSku(dto, 1n, 1n);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: mockProduct.id },
        data: { deletedAt: null, status: 'on_sale' },
      });
    });
  });

  describe('findAll', () => {
    it('应返回分页的 SKU 列表', async () => {
      const result = await service.findAll({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('应按品牌和型号筛选', async () => {
      await service.findAll({ brand: 'Apple', model: 'iPhone' });

      const callArgs = prisma.productSku.findMany.mock.calls[0][0];
      expect(callArgs.where.product.brand).toEqual({ contains: 'Apple' });
      expect(callArgs.where.product.model).toEqual({ contains: 'iPhone' });
    });

    it('应按颜色筛选', async () => {
      await service.findAll({ color: '原色' });

      const callArgs = prisma.productSku.findMany.mock.calls[0][0];
      expect(callArgs.where.color).toEqual({ contains: '原色' });
    });

    it('应按状态筛选', async () => {
      await service.findAll({ status: 'on_sale' });

      const callArgs = prisma.productSku.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('on_sale');
    });

    it('应只查询未删除的 SKU', async () => {
      await service.findAll({});

      const callArgs = prisma.productSku.findMany.mock.calls[0][0];
      expect(callArgs.where.deletedAt).toBeNull();
    });
  });

  describe('findOne', () => {
    it('应返回 SKU 详情含 Product 信息', async () => {
      const result = await service.findOne(1n);

      expect(result.id).toBe(1);
      expect(result.brand).toBe('Apple');
      expect(result.model).toBe('iPhone 16 Pro');
      expect(result.color).toBe('原色钛金属');
    });

    it('SKU 不存在应抛出 NotFoundException', async () => {
      prisma.productSku.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999n)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSku', () => {
    it('应成功编辑 SKU 并记录审计日志', async () => {
      prisma.productSku.update.mockResolvedValue({
        ...mockSku,
        color: '黑色钛金属',
        retailPrice: { toNumber: () => 8999 },
      });

      const result = await service.updateSku(
        1n,
        { color: '黑色钛金属', retailPrice: 8999 },
        1n, 1n, '127.0.0.1',
      );

      expect(result.color).toBe('黑色钛金属');
      expect(auditLog.write).toHaveBeenCalled();
    });

    it('SKU 不存在应抛出 NotFoundException', async () => {
      prisma.productSku.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSku(999n, { color: 'test' }, 1n, 1n),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findProducts', () => {
    it('应返回 SPU 分页列表含 SKU 数量', async () => {
      prisma.product.findMany.mockResolvedValue([{ ...mockProduct, _count: { skus: 3 } }]);

      const result = await service.findProducts({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].skuCount).toBe(3);
    });

    it('应按品类筛选', async () => {
      await service.findProducts({ category: '智能手机' });

      const callArgs = prisma.product.findMany.mock.calls[0][0];
      expect(callArgs.where.category).toEqual({ contains: '智能手机' });
    });
  });

  describe('findProduct', () => {
    it('应返回 SPU 详情含所有 SKU', async () => {
      prisma.product.findUnique.mockResolvedValue({
        ...mockProduct,
        skus: [mockSku],
      });

      const result = await service.findProduct(10n);

      expect(result.brand).toBe('Apple');
      expect(result.skus).toHaveLength(1);
      expect(result.skus[0].color).toBe('原色钛金属');
    });

    it('商品不存在应抛出 NotFoundException', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findProduct(999n)).rejects.toThrow(NotFoundException);
    });
  });
});
