import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rateLimit } from '../../src/middleware/rate-limit';
import type { RequestBody } from '../../src/lib';
import { handlePreview, handleGenerate } from '../../src/handlers';
import { version } from '../../package.json';

type Bindings = {
  ALLOWED_ORIGINS?: string;
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
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: 0,
  });
});

app.get('/api/status', async (c) => {
  return c.json({
    status: 'available',
    service: 'fit-tool',
    version,
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

const handleRequest = (context: {
  request: Request;
  params: Record<string, string | string[]>;
  env: Bindings;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
  props: unknown;
}) => {
  return app.fetch(context.request, context.env, context);
};

const isApiPath = (request: Request): boolean => {
  const path = new URL(request.url).pathname;
  return path.startsWith('/api/') || path === '/api';
};

export const onRequestPost = async (context: {
  request: Request;
  params: Record<string, string | string[]>;
  env: Bindings;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
  props: unknown;
  next: () => Promise<Response>;
}) => {
  if (!isApiPath(context.request)) return context.next();
  return handleRequest(context);
};

export const onRequestGet = async (context: {
  request: Request;
  params: Record<string, string | string[]>;
  env: Bindings;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
  props: unknown;
  next: () => Promise<Response>;
}) => {
  if (!isApiPath(context.request)) return context.next();
  return handleRequest(context);
};
