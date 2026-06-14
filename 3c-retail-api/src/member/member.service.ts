import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MemberEntity } from './member.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateMemberDto): Promise<MemberEntity> {
    const existing = await this.memberRepo.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('该手机号已注册');
    }

    // 处理推荐关系
    if (dto.referrerPhone) {
      if (dto.referrerPhone === dto.phone) {
        throw new BadRequestException('不能推荐自己');
      }
      const referrer = await this.memberRepo.findOne({
        where: { phone: dto.referrerPhone, status: 1 },
      });
      if (!referrer) {
        throw new BadRequestException('推荐人手机号不存在或已禁用');
      }
      dto.referrerId = referrer.id;
    }

    const member = this.memberRepo.create({
      phone: dto.phone,
      name: dto.name,
      address: dto.address,
      licensePlate: dto.licensePlate,
      backupPhone: dto.backupPhone,
      referrerId: dto.referrerId ?? null,
    });

    return this.memberRepo.save(member);
  }

  async findAll(query: MemberQueryDto): Promise<PaginatedResult<MemberEntity>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      keyword,
      status,
    } = query;

    const qb = this.memberRepo.createQueryBuilder('m');

    if (keyword) {
      qb.andWhere('(m.phone LIKE :kw OR m.name LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }

    if (status !== undefined && status !== null) {
      qb.andWhere('m.status = :status', { status });
    }

    const allowedSortColumns = ['createdAt', 'totalPoints', 'name', 'phone'];
    const column = allowedSortColumns.includes(sortBy) ? sortBy : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`m.${column}`, order)
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: number): Promise<MemberEntity> {
    const member = await this.memberRepo.findOne({
      where: { id },
      relations: ['referrer'],
    });
    if (!member) {
      throw new NotFoundException('会员不存在');
    }
    return member;
  }

  async findByPhone(phone: string): Promise<MemberEntity | null> {
    return this.memberRepo.findOne({ where: { phone } });
  }

  async update(id: number, dto: UpdateMemberDto): Promise<MemberEntity> {
    const member = await this.findById(id);

    // referrerId 一旦写入不可更改
    delete (dto as any).referrerId;

    Object.assign(member, dto);
    return this.memberRepo.save(member);
  }
}
