import { cors } from 'hono/cors';
import type { Context, Next } from 'hono';

/**
 * 三端共用 CORS 中间件（Node / Workers / Pages）：
 * - origins 为 null/空串时不注入 CORS 头（仅同源可用）；
 * - 包含 "*" 时全部放行；
 * - 逗号分隔的域名白名单（允许跨域的多个来源）。
 * 由于 Workers/Pages 的环境变量在请求时才可用，这里接收一个读取函数。
 */
export function createCorsMiddleware(getAllowedOrigins: (c: Context) => string | undefined) {
  return async (c: Context, next: Next) => {
    const origins = getAllowedOrigins(c);
    if (origins) {
      const originList = origins.split(',').map((s) => s.trim());
      if (originList.includes('*')) {
        return cors()(c, next);
      }
      return cors({ origin: originList, allowMethods: ['POST', 'OPTIONS', 'GET'], allowHeaders: ['Content-Type'], maxAge: 86400 })(c, next);
    }
    await next();
  };
}