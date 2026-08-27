/// <reference types="@cloudflare/workers-types" />
import { createApp } from '../../src/api';

const app = createApp((c) => (c.env as { ALLOWED_ORIGINS?: string } | undefined)?.ALLOWED_ORIGINS);

type PagesContext = {
  request: Request;
  env: { ALLOWED_ORIGINS?: string };
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
  next: () => Promise<Response>;
  [k: string]: unknown;
};

const isApiPath = (request: Request): boolean => {
  const path = new URL(request.url).pathname;
  return path.startsWith('/api/') || path === '/api';
};

// Pages Functions 把 Hono 需要的 ExecutionContext 拆成独立字段，这里拼出最小可用对象
function toExecutionContext(ctx: PagesContext): ExecutionContext {
  return {
    waitUntil: ctx.waitUntil,
    passThroughOnException: ctx.passThroughOnException,
  } as unknown as ExecutionContext;
}

async function handle(context: PagesContext): Promise<Response> {
  if (!isApiPath(context.request)) return context.next();
  return app.fetch(context.request, context.env, toExecutionContext(context));
}

export const onRequestGet = (context: PagesContext) => handle(context);
export const onRequestPost = (context: PagesContext) => handle(context);
export const onRequestOptions = (context: PagesContext) => handle(context);
