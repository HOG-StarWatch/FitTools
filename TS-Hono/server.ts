import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { RequestBody } from './src/lib';
import { handlePreview, handleGenerate } from './src/handlers';
import { version } from './package.json';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { rateLimit } from './src/middleware/rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

app.use('/api/*', async (c, next) => {
  const origins = process.env.ALLOWED_ORIGINS;
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
    uptime: process.uptime(),
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

app.use('/*', serveStatic({ root: join(__dirname, 'public') }));

const port = Number(process.env.PORT) || 3000;

try {
  serve({
    fetch: app.fetch,
    port,
  });
  console.log(`Server listening on http://localhost:${port}`);
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
