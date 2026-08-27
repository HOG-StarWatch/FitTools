import { cors } from 'hono/cors';
import type { Context, Next } from 'hono';

export type AllowedOriginsProvider = (c: Context) => string | undefined;

/**
 * 三端共用 CORS 中间件（Node / Workers / Pages）：
 * - 未配置 origins 时不注入 CORS 头（仅同源可用）；
 * - "*" 全部放行；
 * - 逗号分隔的域名白名单（多来源）。
 * Workers/Pages 的环境变量在请求时才有，通过 provider 函数按需读取。
 */
export function createCorsMiddleware(getAllowedOrigins: AllowedOriginsProvider) {
  return async (c: Context, next: Next) => {
    const origins = getAllowedOrigins(c);
    if (!origins) {
      await next();
      return;
    }
    const originList = origins.split(',').map((s) => s.trim());
    const handler = originList.includes('*')
      ? cors()
      : cors({ origin: originList, allowMethods: ['POST', 'OPTIONS', 'GET'], allowHeaders: ['Content-Type'], maxAge: 86400 });
    return handler(c, next);
  };
}
