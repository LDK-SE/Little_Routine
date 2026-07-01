import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { maskImei, maskPhone } from '../common/utils/mask';

@Injectable()
export class FunctionHandlerService {
  private readonly logger = new Logger(FunctionHandlerService.name);

  constructor(private prisma: PrismaService) {}

  /** query_inventory: 按机型名称查询当前库存 */
  async queryInventory(keyword: string, location?: string) {
    const where: any = {
      status: 'in_stock',
      sku: {
        product: {
          deletedAt: null,
          OR: [
            { model: { contains: keyword } },
            { brand: { contains: keyword } },
          ],
        },
      },
    };

    if (location) {
      where.location = { contains: location };
    }

    const stocks = await this.prisma.imeiStock.findMany({
      where,
      include: {
        sku: {
          include: { product: true },
        },
      },
      orderBy: { skuId: 'asc' },
    });

    // 按 SKU 聚合
    const grouped = new Map<bigint, {
      model: string; brand: string; color: string; spec: string;
      inStockCount: number; locations: string[];
    }>();

    for (const s of stocks) {
      if (!s.skuId || !s.sku) continue;
      const key = s.skuId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          brand: s.sku.product.brand,
          model: s.sku.product.model,
          color: s.sku.color,
          spec: s.sku.spec,
          inStockCount: 0,
          locations: [],
        });
      }
      const entry = grouped.get(key)!;
      entry.inStockCount++;
      if (s.location && !entry.locations.includes(s.location)) {
        entry.locations.push(s.location);
      }
    }

    return {
      function: 'query_inventory',
      result: [...grouped.values()],
      searchedAt: new Date().toISOString(),
    };
  }

  /** query_gross_profit: 查今日/本周/本月毛利 */
  async queryGrossProfit(period: string = 'today') {
    const { start, end, label } = this.resolvePeriod(period);

    const aggregation = await this.prisma.saleOrder.aggregate({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
      _sum: {
        totalAmount: true,
        totalCostSnapshot: true,
        totalSubsidy: true,
        totalCommission: true,
        grossProfit: true,
      },
      _count: true,
    });

    const s = aggregation._sum;

    return {
      function: 'query_gross_profit',
      result: {
        period,
        dateRange: label,
        totalRevenue: s.totalAmount ? Number(s.totalAmount) : 0,
        totalCost: s.totalCostSnapshot ? Number(s.totalCostSnapshot) : 0,
        totalSubsidy: s.totalSubsidy ? Number(s.totalSubsidy) : 0,
        totalCommission: s.totalCommission ? Number(s.totalCommission) : 0,
        grossProfit: s.grossProfit ? Number(s.grossProfit) : 0,
        orderCount: aggregation._count,
      },
    };
  }

  /** query_member_points: 按手机号查积分余额 */
  async queryMemberPoints(phone: string) {
    const member = await this.prisma.member.findUnique({
      where: { phone, deletedAt: null },
      include: {
        pointLedgers: {
          where: { changeType: { in: ['earn', 'redeem'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!member) {
      return {
        function: 'query_member_points',
        result: null,
        message: '未找到该会员',
      };
    }

    return {
      function: 'query_member_points',
      result: {
        phone: maskPhone(member.phone),
        name: member.name,
        totalPoints: member.totalPoints,
        recentEarn: member.pointLedgers
          .filter((l) => l.changeType === 'earn')
          .map((l) => ({
            type: '消费得积分',
            amount: l.amount,
            time: l.createdAt.toISOString().slice(0, 10),
            model: l.productModel,
          })),
        recentRedeem: member.pointLedgers
          .filter((l) => l.changeType === 'redeem')
          .map((l) => ({
            amount: Math.abs(l.amount),
            time: l.createdAt.toISOString().slice(0, 10),
          })),
      },
    };
  }

  /** query_salesperson_performance: 查员工提成/业绩 */
  async querySalespersonPerformance(name: string, period: string = 'this_month') {
    const { start, end, label } = this.resolvePeriod(period);

    const users = await this.prisma.sysUser.findMany({
      where: {
        name: { contains: name },
        deletedAt: null,
      },
    });

    if (users.length === 0) {
      return {
        function: 'query_salesperson_performance',
        result: null,
        message: '未找到该员工',
      };
    }

    // 并发查询所有用户的业绩，避免 N+1
    const aggregates = await Promise.all(
      users.map(async (user) => {
        const [commissionAgg, ordersAgg] = await Promise.all([
          this.prisma.commissionLedger.aggregate({
            where: { salespersonId: user.id, createdAt: { gte: start, lte: end } },
            _sum: { actualCommission: true },
            _count: true,
          }),
          this.prisma.saleOrder.aggregate({
            where: { salespersonId: user.id, deletedAt: null, createdAt: { gte: start, lte: end } },
            _sum: { totalAmount: true },
            _count: true,
          }),
        ]);

        return {
          name: user.name,
          period,
          orderCount: ordersAgg._count,
          totalSales: ordersAgg._sum.totalAmount ? Number(ordersAgg._sum.totalAmount) : 0,
          totalCommission: commissionAgg._sum.actualCommission ? Number(commissionAgg._sum.actualCommission) : 0,
        };
      }),
    );

    const results = aggregates;

    return {
      function: 'query_salesperson_performance',
      result: results,
    };
  }

  /** query_member_orders: 按手机号查购买记录 */
  async queryMemberOrders(phone: string) {
    const member = await this.prisma.member.findUnique({
      where: { phone, deletedAt: null },
    });

    if (!member) {
      return {
        function: 'query_member_orders',
        result: null,
        message: '未找到该会员',
      };
    }

    const orders = await this.prisma.saleOrder.findMany({
      where: {
        memberId: member.id,
        deletedAt: null,
      },
      include: {
        saleItems: {
          include: { sku: { include: { product: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      function: 'query_member_orders',
      result: {
        phone: maskPhone(member.phone),
        orders: orders.map((o) => {
          const item = o.saleItems[0];
          return {
            orderNo: o.orderNo,
            model: item?.sku?.product?.model ?? null,
            brand: item?.sku?.product?.brand ?? null,
            color: item?.sku?.color ?? null,
            spec: item?.sku?.spec ?? null,
            price: Number(o.totalAmount),
            time: o.createdAt.toISOString().slice(0, 19).replace('T', ' '),
            imeiSnapshot: item?.imei ? maskImei(item.imei) : null,
          };
        }),
      },
    };
  }

  // ---- helpers ----

  private resolvePeriod(period: string): { start: Date; end: Date; label: string } {
    const now = new Date();
    let start: Date;
    let end: Date;
    let label: string;

    switch (period) {
      case 'today': {
        const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
        start = new Date(y, m, d, 0, 0, 0);
        end = new Date(y, m, d, 23, 59, 59);
        label = now.toISOString().slice(0, 10);
        break;
      }
      case 'this_week': {
        const dayOfWeek = now.getDay();
        const mondayDiff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayDiff);
        start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        label = `${start.toISOString().slice(0, 10)} ~ ${end.toISOString().slice(0, 10)}`;
        break;
      }
      case 'this_month': {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        break;
      }
      default: {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      }
    }

    return { start, end, label };
  }
}
