import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { RequestBody } from './lib';
import { handlePreview, handleGenerate } from './handlers';
import { rateLimit, getRateLimitStats } from './middleware/rate-limit';
import { version } from '../package.json';

type Bindings = {
  ALLOWED_ORIGINS?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', async (c, next) => {
  const origins = c.env.ALLOWED_ORIGINS;
  if (origins) {
    const originList = origins.split(',').map(s => s.trim());
    if (originList.includes('*')) {
      return cors()(c, next);
    }
    return cors({ origin: originList, allowMethods: ['POST', 'OPTIONS', 'GET'], allowHeaders: ['Content-Type'], maxAge: 86400 })(c, next);
  }
  await next();
});

app.use('/api/*', rateLimit);

app.get('/api/health', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || 
             c.req.header('X-Forwarded-For') || 
             c.req.header('X-Real-IP') || 
             'unknown';
  
  const stats = getRateLimitStats(ip);
  
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: typeof process !== 'undefined' && process.uptime ? process.uptime() : 0,
    rateLimit: stats
  });
});

app.get('/api/status', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || 
             c.req.header('X-Forwarded-For') || 
             c.req.header('X-Real-IP') || 
             'unknown';
  
  const stats = getRateLimitStats(ip);
  
  return c.json({
    status: 'available',
    service: 'fit-tool',
    version,
    rateLimit: {
      used: stats.used,
      remaining: stats.remaining,
      limit: stats.limit,
      resetTime: stats.resetTime
    }
  });
});

app.post('/api/preview', async (c) => {
  const body = await c.req.json<RequestBody>().catch(() => ({}));
  const res = await handlePreview(body);
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
});

app.post('/api/generate-fit', async (c) => {
  const body = await c.req.json<RequestBody>().catch(() => ({}));
  return handleGenerate(body);
});

export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    
    return new Response('Not Found', { status: 404 });
  },
};
