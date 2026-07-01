import { Test, TestingModule } from '@nestjs/testing';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

describe('ProductController', () => {
  let controller: ProductController;
  let service: any;

  const mockService = {
    createSku: jest.fn().mockResolvedValue({
      id: 1, brand: 'Apple', model: 'iPhone 16 Pro', color: '原色钛金属', spec: '512GB',
    }),
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    findOne: jest.fn().mockResolvedValue({
      id: 1, productId: 10, brand: 'Apple', model: 'iPhone 16 Pro',
      color: '原色钛金属', spec: '512GB', barcode: 'BAR001',
      retailPrice: 9999, minSalePrice: 9500, status: 'on_sale',
    }),
    updateSku: jest.fn().mockResolvedValue({ id: 1, color: '黑色钛金属', spec: '512GB' }),
    findProducts: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    findProduct: jest.fn().mockResolvedValue({
      id: 10, brand: 'Apple', model: 'iPhone 16 Pro', category: '智能手机',
      status: 'on_sale', skus: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [{ provide: ProductService, useValue: mockService }],
    }).compile();

    controller = module.get<ProductController>(ProductController);
    service = module.get<ProductService>(ProductService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /products/skus', () => {
    it('应调用 service.createSku', async () => {
      const dto = { brand: 'Apple', model: 'iPhone 16 Pro', color: '原色钛金属', spec: '512GB' };
      const user = { id: 1, shopId: 1, roles: ['warehouse'] };
      const req = { ip: '127.0.0.1' } as any;

      const result = await controller.createSku(dto, user, req);

      expect(service.createSku).toHaveBeenCalledWith(dto, 1n, 1n, '127.0.0.1');
      expect(result.brand).toBe('Apple');
    });
  });

  describe('GET /products/skus', () => {
    it('应调用 service.findAll 并传入查询参数', async () => {
      const query = { page: 1, pageSize: 20, brand: 'Apple' };

      await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /products/skus/:id', () => {
    it('应调用 service.findOne', async () => {
      const result = await controller.findOne('1');

      expect(service.findOne).toHaveBeenCalledWith(1n);
      expect(result.color).toBe('原色钛金属');
    });
  });

  describe('PUT /products/skus/:id', () => {
    it('应调用 service.updateSku', async () => {
      const dto = { color: '黑色钛金属' };
      const user = { id: 1, shopId: 1, roles: ['warehouse'] };
      const req = { ip: '127.0.0.1' } as any;

      await controller.updateSku('1', dto, user, req);

      expect(service.updateSku).toHaveBeenCalledWith(1n, dto, 1n, 1n, '127.0.0.1');
    });
  });

  describe('GET /products', () => {
    it('应调用 service.findProducts', async () => {
      const query = { page: 1, pageSize: 20 };

      await controller.findProducts(query);

      expect(service.findProducts).toHaveBeenCalledWith(query);
    });
  });

  describe('GET /products/:id', () => {
    it('应调用 service.findProduct', async () => {
      const result = await controller.findProduct('10');

      expect(service.findProduct).toHaveBeenCalledWith(10n);
      expect(result.brand).toBe('Apple');
    });
  });
});
