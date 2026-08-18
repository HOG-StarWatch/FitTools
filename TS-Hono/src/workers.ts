/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { createCorsMiddleware } from './cors';
import { handlePreview, handleGenerate, validateJsonRequest, parseJsonBody } from './handlers';
import { version } from '../package.json';

type Bindings = {
  ALLOWED_ORIGINS?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', createCorsMiddleware((c) => (c.env as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS));

app.get('/api/status', async (c) => {
  // Workers 环境没有 process/uptime：通过 globalThis 结构访问，避免依赖 Node 类型
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

export default {
  fetch: async (request: Request, env: Bindings, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    
    return new Response('Not Found', { status: 404 });
  },
};
