/// <reference types="@cloudflare/workers-types" />
import { createApp } from './api';

const app = createApp((c) => (c.env as { ALLOWED_ORIGINS?: string } | undefined)?.ALLOWED_ORIGINS);

type WorkersEnv = { ALLOWED_ORIGINS?: string; ASSETS?: { fetch: (request: Request) => Promise<Response> } };

export default {
  fetch: async (request: Request, env: WorkersEnv, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404 });
  },
};
