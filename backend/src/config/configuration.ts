export default () => ({
  app: {
    name: process.env.APP_NAME || '3c-retail-api',
    port: parseInt(process.env.APP_PORT || '3000', 10),
    env: process.env.APP_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('REDIS_PASSWORD is required in production'); })() : ''),
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET is required'); })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  log: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED || '').toLowerCase() === 'true',
  },
  dify: {
    baseUrl: process.env.DIFY_BASE_URL || '',
    apiKey: process.env.DIFY_API_KEY || '',
  },
});
