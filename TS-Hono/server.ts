/// <reference types="node" />
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createCorsMiddleware } from './src/cors';
import { handlePreview, handleGenerate, validateJsonRequest, parseJsonBody } from './src/handlers';
import { version } from './package.json';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

app.use('/api/*', createCorsMiddleware(() => process.env.ALLOWED_ORIGINS));

app.get('/api/status', async (c) => {
  return c.json({
    status: 'available',
    service: 'HOG-StarWatch/FitTool',
    version,
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

app.post('/api/preview', async (c) => {
  const invalid = validateJsonRequest(c.req.header('Content-Type'), c.req.header('Content-Length'));
  if (invalid) return invalid;
  const raw = await c.req.text();
  const parsed = parseJsonBody(raw);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const res = await handlePreview(body);
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
});

app.post('/api/generate-fit', async (c) => {
  const invalid = validateJsonRequest(c.req.header('Content-Type'), c.req.header('Content-Length'));
  if (invalid) return invalid;
  const raw = await c.req.text();
  const parsed = parseJsonBody(raw);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  return handleGenerate(body);
});

app.use('/*', serveStatic({ root: join(__dirname, 'public') }));

const port = Number(process.env.PORT) || 3000;

try {
  const server = serve({
    fetch: app.fetch,
    port,
  });
  server.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
  console.log(`Server listening on http://localhost:${port}`);
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
