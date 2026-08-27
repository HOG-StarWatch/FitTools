import { Hono } from 'hono';
import type { Context } from 'hono';
import { createCorsMiddleware } from './cors';
import { handlePreview, handleGenerate, validateJsonRequest, parseJsonBody } from './handlers';
import { version } from '../package.json';

export type CorsConfig = (c: Context) => string | undefined;

/**
 * 共享路由工厂：Node、Workers、Pages Functions 三端均通过 createApp 装配。
 * 业务路由变更只需改这里，避免三处重复。
 */
export function createApp(getAllowedOrigins: CorsConfig) {
  const app = new Hono();

  app.use('/api/*', createCorsMiddleware(getAllowedOrigins));

  app.get('/api/status', (c) => {
    const nodeProcess = (globalThis as { process?: { uptime?: () => number } }).process;
    const uptime = typeof nodeProcess?.uptime === 'function' ? nodeProcess.uptime() : 0;
    return c.json({
      status: 'available',
      service: 'HOG-StarWatch/FitTool',
      version,
      timestamp: Date.now(),
      uptime,
    });
  });

  app.post('/api/preview', async (c) => {
    const invalid = validateJsonRequest(c.req.header('Content-Type'), c.req.header('Content-Length'));
    if (invalid) return invalid;
    const parsed = parseJsonBody(await c.req.text());
    if (!parsed.ok) return parsed.response;
    const res = await handlePreview(parsed.body);
    return new Response(res.body, { status: res.status, headers: res.headers });
  });

  app.post('/api/generate-fit', async (c) => {
    const invalid = validateJsonRequest(c.req.header('Content-Type'), c.req.header('Content-Length'));
    if (invalid) return invalid;
    const parsed = parseJsonBody(await c.req.text());
    if (!parsed.ok) return parsed.response;
    return handleGenerate(parsed.body);
  });

  return app;
}
