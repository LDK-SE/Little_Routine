import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../constants';

/** 标记接口所需的角色 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
