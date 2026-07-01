import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { MemberStatusDto } from './dto/member-status.dto';

@Injectable()
export class MemberService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  /** 会员注册 */
  async register(dto: CreateMemberDto, operatorId?: bigint, shopId?: bigint, ip?: string) {
    // 处理推荐人
    let referrerId: bigint | null = null;
    if (dto.referrerPhone) {
      if (dto.referrerPhone === dto.phone) {
        throw new UnprocessableEntityException('不能推荐自己');
      }
      const referrer = await this.prisma.member.findUnique({
        where: { phone: dto.referrerPhone, deletedAt: null },
      });
      if (!referrer) {
        throw new NotFoundException('推荐人不存在');
      }
      referrerId = referrer.id;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 手机号唯一检查（事务内防 TOCTOU）
      const existing = await tx.member.findUnique({
        where: { phone: dto.phone },
      });
      if (existing && !existing.deletedAt) {
        throw new ConflictException('该手机号已注册');
      }
      // 如果已软删除，允许重新注册（恢复）
      if (existing && existing.deletedAt) {
        const restored = await tx.member.update({
          where: { id: existing.id },
          data: {
            name: dto.name ?? existing.name,
            address: dto.address ?? existing.address,
            licensePlate: dto.licensePlate ?? existing.licensePlate,
            backupPhone: dto.backupPhone ?? existing.backupPhone,
            lastPurchaseModel: dto.lastPurchaseModel ?? existing.lastPurchaseModel,
            status: 'active',
            deletedAt: null,
          },
        });
        return { member: restored, isRestore: true };
      }

      const created = await tx.member.create({
        data: {
          phone: dto.phone,
          name: dto.name ?? null,
          address: dto.address ?? null,
          licensePlate: dto.licensePlate ?? null,
          backupPhone: dto.backupPhone ?? null,
          lastPurchaseModel: dto.lastPurchaseModel ?? null,
          referrerId,
        },
      });

      if (referrerId) {
        await tx.memberReferral.create({
          data: { referrerId, refereeId: created.id },
        });

        // 推荐奖励：给推荐人赠送 100 积分
        const referralBonus = 100;
        const referrer = await tx.member.findUnique({
          where: { id: referrerId },
        });

        if (referrer) {
          await tx.member.update({
            where: { id: referrerId },
            data: {
              totalPoints: { increment: referralBonus },
              totalPointsVersion: { increment: 1 },
            },
          });

          await tx.pointLedger.create({
            data: {
              memberId: referrerId,
              changeType: 'earn',
              amount: referralBonus,
              balanceAfter: referrer.totalPoints + referralBonus,
              remainingAmount: referralBonus,
              remark: `推荐新会员奖励: ${dto.phone}`,
            },
          });
        }
      }

      return { member: created, isRestore: false };
    });

    await this.auditLog.write({
      shopId: shopId ?? 0n,
      operatorId: operatorId ?? result.member.id,
      module: 'member',
      action: result.isRestore ? 'register_restore' : 'register',
      targetType: 'member',
      targetId: String(result.member.id),
      detailJson: { phone: dto.phone, referrerPhone: dto.referrerPhone },
      ipAddress: ip,
    });

    return this.formatMember(result.member);
  }

  /** 会员列表（分页+搜索） */
  async findAll(query: MemberQueryDto) {
    const { keyword, status, page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * pageSize;

    const allowedSortFields = ['createdAt', 'totalPoints', 'name', 'updatedAt'];
    const orderBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = { deletedAt: null };

    if (status) {
      where.status = status;
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [orderBy]: orderDir },
        select: {
          id: true,
          phone: true,
          name: true,
          totalPoints: true,
          lastPurchaseModel: true,
          licensePlate: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      items: items.map((m) => ({
        ...m,
        id: Number(m.id),
        totalPoints: m.totalPoints,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 会员详情 */
  async findOne(id: bigint) {
    const member = await this.prisma.member.findUnique({
      where: { id, deletedAt: null },
      include: {
        referrer: {
          select: { id: true, phone: true, name: true },
        },
        _count: {
          select: { referrals: true },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('会员不存在');
    }

    return {
      id: Number(member.id),
      phone: member.phone,
      name: member.name,
      address: member.address,
      licensePlate: member.licensePlate,
      backupPhone: member.backupPhone,
      lastPurchaseModel: member.lastPurchaseModel,
      totalPoints: member.totalPoints,
      referrer: member.referrer
        ? { id: Number(member.referrer.id), phone: member.referrer.phone, name: member.referrer.name }
        : null,
      referralCount: member._count.referrals,
      status: member.status,
      createdAt: member.createdAt,
    };
  }

  /** 编辑会员 */
  async update(id: bigint, dto: UpdateMemberDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const member = await this.prisma.member.findUnique({
      where: { id, deletedAt: null },
    });

    if (!member) {
      throw new NotFoundException('会员不存在');
    }

    const updated = await this.prisma.member.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.licensePlate !== undefined && { licensePlate: dto.licensePlate }),
        ...(dto.backupPhone !== undefined && { backupPhone: dto.backupPhone }),
        ...(dto.lastPurchaseModel !== undefined && { lastPurchaseModel: dto.lastPurchaseModel }),
      },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'member',
      action: 'update',
      targetType: 'member',
      targetId: String(id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return this.formatMember(updated);
  }

  /** 软删除 */
  async remove(id: bigint, reason: string, operatorId: bigint, shopId: bigint, ip?: string) {
    const member = await this.prisma.member.findUnique({
      where: { id, deletedAt: null },
    });

    if (!member) {
      throw new NotFoundException('会员不存在');
    }

    const deleted = await this.prisma.member.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'member',
      action: 'delete',
      targetType: 'member',
      targetId: String(id),
      detailJson: { reason, phone: member.phone },
      ipAddress: ip,
    });

    return {
      message: '会员已注销',
      deletedAt: deleted.deletedAt,
    };
  }

  /** 启用/禁用会员 */
  async updateStatus(id: bigint, dto: MemberStatusDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const member = await this.prisma.member.findUnique({
      where: { id, deletedAt: null },
    });

    if (!member) {
      throw new NotFoundException('会员不存在');
    }

    const updated = await this.prisma.member.update({
      where: { id },
      data: { status: dto.status as any },
    });

    await this.auditLog.write({
      shopId,
      operatorId,
      module: 'member',
      action: dto.status === 'active' ? 'enable' : 'disable',
      targetType: 'member',
      targetId: String(id),
      detailJson: { reason: dto.reason, phone: member.phone },
      ipAddress: ip,
    });

    return {
      message: dto.status === 'active' ? '会员已启用' : '会员已禁用',
      status: updated.status,
    };
  }

  /** 格式化会员数据 */
  private formatMember(member: any) {
    return {
      id: Number(member.id),
      phone: member.phone,
      name: member.name,
      address: member.address,
      licensePlate: member.licensePlate,
      backupPhone: member.backupPhone,
      lastPurchaseModel: member.lastPurchaseModel,
      totalPoints: member.totalPoints,
      status: member.status,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }
}
