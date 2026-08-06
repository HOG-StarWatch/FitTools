import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { processRouteRequest, generateFitFile, applySensorOptions, RequestBody } from './src/lib';
import { fetchAltitudesOrNull, DEFAULT_ELEVATION_CONFIG, parseElevationSource } from './src/elevation';
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
  try {
    const body = await c.req.json<RequestBody>();
    const result = processRouteRequest(body || {});
    if ('error' in result) return c.json({ error: result.error }, 400);

    const elevationConfig = { ...DEFAULT_ELEVATION_CONFIG };
    const requestSource = parseElevationSource(body.elevationSource);
    if (requestSource) elevationConfig.source = requestSource;
    const elevation = await fetchAltitudesOrNull(result.samples.map(s => ({ lat: s.lat, lng: s.lng })), elevationConfig);

    let samples = result.samples;
    if (elevation.altitudes) {
      samples = result.samples.map((s, i) => ({ ...s, altitude: elevation.altitudes![i] }));
    }
    samples = applySensorOptions(samples, {
      includeHeartRate: body.includeHeartRate,
      includePower: body.includePower,
      includeCadence: body.includeCadence,
      includeGaitData: body.includeGaitData,
    });

    return c.json({
      totalDistanceMeters: result.totalDist,
      totalDurationSec: result.totalDurationSec,
      samples,
      calories: result.calories,
      elevation: {
        source: elevation.source,
        status: elevation.status,
        message: elevation.message,
      },
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: '生成预览失败' }, 500);
  }
});

app.post('/api/generate-fit', async (c) => {
  try {
    const body = await c.req.json<RequestBody>();
    const result = processRouteRequest(body || {});
    if ('error' in result) return c.json({ error: result.error }, 400);
    const sensorOptions = {
      includeHeartRate: body.includeHeartRate !== false,
      includePower: body.includePower !== false,
      includeCadence: body.includeCadence !== false,
      includeGaitData: body.includeGaitData !== false,
    };
    const elevationConfig = { ...DEFAULT_ELEVATION_CONFIG };
    const requestSource = parseElevationSource(body.elevationSource);
    if (requestSource) elevationConfig.source = requestSource;
    const elevation = await fetchAltitudesOrNull(result.samples.map(s => ({ lat: s.lat, lng: s.lng })), elevationConfig);
    return generateFitFile(result, sensorOptions, elevation.altitudes, elevation);
  } catch (e) {
    console.error(e);
    return c.json({ error: '生成 FIT 文件失败' }, 500);
  }
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
