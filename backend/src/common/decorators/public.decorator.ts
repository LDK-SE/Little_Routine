import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants';

/** 标记接口为公开访问（跳过 JWT 认证） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
