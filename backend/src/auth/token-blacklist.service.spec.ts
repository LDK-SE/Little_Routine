import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from './token-blacklist.service';
import { RedisService } from '../redis/redis.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let redis: any;

  const mockRedis = {
    client: {
      set: jest.fn(),
      exists: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
    redis = module.get(RedisService);
    jest.clearAllMocks();
  });

  it('应成功将 token 加入黑名单', async () => {
    // 构造一个含 exp 的 JWT token
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ sub: 1, exp })).toString('base64url');
    const token = `${header}.${payload}.signature`;

    mockRedis.client.set.mockResolvedValue('OK');
    await service.blacklist(token);
    expect(mockRedis.client.set).toHaveBeenCalled();
  });

  it('应正确检测黑名单 token', async () => {
    mockRedis.client.exists.mockResolvedValue(1);
    const result = await service.isBlacklisted('some-token-here-with-40-chars');
    expect(result).toBe(true);
  });

  it('应正确检测非黑名单 token', async () => {
    mockRedis.client.exists.mockResolvedValue(0);
    const result = await service.isBlacklisted('another-token-here-with-chars');
    expect(result).toBe(false);
  });
});
