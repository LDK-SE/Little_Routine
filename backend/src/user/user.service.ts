import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  // ============================================================
  // 用户管理
  // ============================================================

  async findAll(query: UserQueryDto) {
    const { shopId, keyword, status, roleCode, page = 1, pageSize = 20 } = query;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };
    if (shopId) where.shopId = BigInt(shopId);
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (roleCode) {
      where.userRoles = { some: { role: { code: roleCode } } };
    }

    const [items, total] = await Promise.all([
      this.prisma.sysUser.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          shop: { select: { id: true, name: true } },
          userRoles: { include: { role: { select: { id: true, code: true, name: true } } } },
        },
      }),
      this.prisma.sysUser.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: Number(u.id),
        phone: u.phone,
        name: u.name,
        status: u.status,
        shopId: Number(u.shopId),
        shopName: u.shop?.name ?? null,
        roles: u.userRoles.map((ur) => ({
          id: Number(ur.role.id),
          code: ur.role.code,
          name: ur.role.name,
        })),
        createdAt: u.createdAt,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: bigint) {
    const user = await this.prisma.sysUser.findUnique({
      where: { id, deletedAt: null },
      include: {
        shop: { select: { id: true, name: true } },
        userRoles: { include: { role: true } },
      },
    });

    if (!user) throw new NotFoundException('用户不存在');

    return {
      id: Number(user.id),
      phone: user.phone,
      name: user.name,
      status: user.status,
      shopId: Number(user.shopId),
      shopName: user.shop?.name ?? null,
      roles: user.userRoles.map((ur) => ({
        id: Number(ur.role.id),
        code: ur.role.code,
        name: ur.role.name,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async create(dto: CreateUserDto, operatorId: bigint, ip?: string) {
    const existing = await this.prisma.sysUser.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) throw new ConflictException('手机号已存在');

    // 验证门店存在
    const shop = await this.prisma.shop.findUnique({ where: { id: BigInt(dto.shopId), deletedAt: null } });
    if (!shop) throw new BadRequestException('门店不存在');

    // 验证角色
    if (dto.roleIds && dto.roleIds.length > 0) {
      const roles = await this.prisma.sysRole.findMany({
        where: { id: { in: dto.roleIds.map(BigInt) } },
      });
      if (roles.length !== dto.roleIds.length) {
        throw new BadRequestException('部分角色ID不存在');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.sysUser.create({
      data: {
        phone: dto.phone,
        name: dto.name,
        passwordHash,
        shopId: BigInt(dto.shopId),
        status: 'active',
        userRoles: dto.roleIds?.length
          ? { create: dto.roleIds.map((rid) => ({ roleId: BigInt(rid) })) }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
        shop: { select: { id: true, name: true } },
      },
    });

    await this.auditLog.write({
      shopId: BigInt(dto.shopId), operatorId, module: 'user', action: 'create',
      targetType: 'sys_user', targetId: String(user.id),
      detailJson: { phone: dto.phone, name: dto.name, roleIds: dto.roleIds },
      ipAddress: ip,
    });

    return {
      id: Number(user.id),
      phone: user.phone,
      name: user.name,
      status: user.status,
      shopId: Number(user.shopId),
      shopName: user.shop?.name ?? null,
      roles: user.userRoles.map((ur) => ({ id: Number(ur.role.id), code: ur.role.code, name: ur.role.name })),
      createdAt: user.createdAt,
    };
  }

  async update(id: bigint, dto: UpdateUserDto, operatorId: bigint, ip?: string) {
    const user = await this.prisma.sysUser.findUnique({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('用户不存在');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) {
      const existing = await this.prisma.sysUser.findUnique({ where: { phone: dto.phone } });
      if (existing && existing.id !== id) throw new ConflictException('手机号已被其他用户使用');
      data.phone = dto.phone;
    }
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.shopId !== undefined) data.shopId = BigInt(dto.shopId);
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.sysUser.update({
      where: { id },
      data,
      include: {
        userRoles: { include: { role: true } },
        shop: { select: { id: true, name: true } },
      },
    });

    await this.auditLog.write({
      shopId: user.shopId, operatorId, module: 'user', action: 'update',
      targetType: 'sys_user', targetId: String(id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      phone: updated.phone,
      name: updated.name,
      status: updated.status,
      shopId: Number(updated.shopId),
      shopName: updated.shop?.name ?? null,
      roles: updated.userRoles.map((ur) => ({ id: Number(ur.role.id), code: ur.role.code, name: ur.role.name })),
      updatedAt: updated.updatedAt,
    };
  }

  async remove(id: bigint, operatorId: bigint, ip?: string) {
    const user = await this.prisma.sysUser.findUnique({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('用户不存在');

    await this.prisma.sysUser.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLog.write({
      shopId: user.shopId, operatorId, module: 'user', action: 'delete',
      targetType: 'sys_user', targetId: String(id),
      detailJson: { phone: user.phone, name: user.name },
      ipAddress: ip,
    });

    return { id: Number(id), message: '用户已删除' };
  }

  async assignRole(userId: bigint, roleId: bigint, operatorId: bigint, ip?: string) {
    const user = await this.prisma.sysUser.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('用户不存在');

    const role = await this.prisma.sysRole.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');

    const existing = await this.prisma.sysUserRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (existing) throw new ConflictException('用户已有该角色');

    await this.prisma.sysUserRole.create({
      data: { userId, roleId },
    });

    await this.auditLog.write({
      shopId: user.shopId, operatorId, module: 'user', action: 'assign_role',
      targetType: 'sys_user_role', targetId: `${userId}_${roleId}`,
      detailJson: { userId: Number(userId), roleId: Number(roleId), roleCode: role.code },
      ipAddress: ip,
    });

    return { userId: Number(userId), roleId: Number(roleId), roleCode: role.code, message: '角色已分配' };
  }

  async removeRole(userId: bigint, roleId: bigint, operatorId: bigint, ip?: string) {
    const user = await this.prisma.sysUser.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('用户不存在');

    const existing = await this.prisma.sysUserRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) throw new NotFoundException('用户没有该角色');

    await this.prisma.sysUserRole.delete({
      where: { id: existing.id },
    });

    await this.auditLog.write({
      shopId: user.shopId, operatorId, module: 'user', action: 'remove_role',
      targetType: 'sys_user_role', targetId: String(existing.id),
      detailJson: { userId: Number(userId), roleId: Number(roleId) },
      ipAddress: ip,
    });

    return { userId: Number(userId), roleId: Number(roleId), message: '角色已移除' };
  }

  // ============================================================
  // 角色管理
  // ============================================================

  async findAllRoles() {
    const roles = await this.prisma.sysRole.findMany({
      include: { userRoles: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((r) => ({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      description: r.description,
      userCount: r.userRoles.length,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createRole(dto: CreateRoleDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const existing = await this.prisma.sysRole.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('角色编码已存在');

    const role = await this.prisma.sysRole.create({
      data: { code: dto.code, name: dto.name, description: dto.description ?? null },
    });

    await this.auditLog.write({
      shopId, operatorId, module: 'user', action: 'create_role',
      targetType: 'sys_role', targetId: String(role.id),
      detailJson: { code: dto.code, name: dto.name },
      ipAddress: ip,
    });

    return {
      id: Number(role.id),
      code: role.code,
      name: role.name,
      description: role.description,
      userCount: 0,
      createdAt: role.createdAt,
    };
  }

  async updateRole(id: bigint, dto: UpdateRoleDto, operatorId: bigint, shopId: bigint, ip?: string) {
    const role = await this.prisma.sysRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');

    const data: any = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;

    const updated = await this.prisma.sysRole.update({ where: { id }, data });

    await this.auditLog.write({
      shopId, operatorId, module: 'user', action: 'update_role',
      targetType: 'sys_role', targetId: String(id),
      detailJson: dto as any,
      ipAddress: ip,
    });

    return {
      id: Number(updated.id),
      code: updated.code,
      name: updated.name,
      description: updated.description,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteRole(id: bigint, operatorId: bigint, shopId: bigint, ip?: string) {
    const role = await this.prisma.sysRole.findUnique({
      where: { id },
      include: { userRoles: { select: { userId: true } } },
    });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.userRoles.length > 0) {
      throw new ConflictException(`角色"${role.name}"下还有 ${role.userRoles.length} 个用户，请先移除关联`);
    }

    await this.prisma.sysRole.delete({ where: { id } });

    await this.auditLog.write({
      shopId, operatorId, module: 'user', action: 'delete_role',
      targetType: 'sys_role', targetId: String(id),
      detailJson: { code: role.code, name: role.name },
      ipAddress: ip,
    });

    return { id: Number(id), message: '角色已删除' };
  }
}
