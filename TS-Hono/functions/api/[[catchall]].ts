/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono';
import { createCorsMiddleware } from '../../src/cors';
import { handlePreview, handleGenerate, validateJsonRequest, parseJsonBody } from '../../src/handlers';
import { version } from '../../package.json';

type Bindings = {
  ALLOWED_ORIGINS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/api/*', createCorsMiddleware((c) => (c.env as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS));

app.get('/api/status', async (c) => {
  return c.json({
    status: 'available',
    service: 'HOG-StarWatch/FitTool',
    version,
    timestamp: Date.now(),
    uptime: 0,
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

export const onRequestOptions = async (context: {
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
