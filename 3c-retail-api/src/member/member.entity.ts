import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('member')
export class MemberEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Index('uk_phone', { unique: true })
  @Column({ type: 'varchar', length: 11, nullable: false })
  phone: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  licensePlate: string;

  @Column({ type: 'varchar', length: 11, nullable: true })
  backupPhone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastPurchaseModel: string;

  @Column({ type: 'int', default: 0 })
  totalPoints: number;

  @Column({ type: 'bigint', nullable: true })
  referrerId: number;

  @ManyToOne(() => MemberEntity, { nullable: true })
  @JoinColumn({ name: 'referrer_id' })
  referrer: MemberEntity;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
