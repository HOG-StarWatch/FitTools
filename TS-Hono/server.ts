/// <reference types="node" />
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './src/api';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = createApp(() => process.env.ALLOWED_ORIGINS);
app.use('/*', serveStatic({ root: join(__dirname, 'public') }));

const port = Number(process.env.PORT) || 3000;
try {
  const server = serve({ fetch: app.fetch, port });
  server.on('error', (error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
  console.log(`Server listening on http://localhost:${port}`);
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
