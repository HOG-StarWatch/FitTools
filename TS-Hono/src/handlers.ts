import { processRouteRequest, generateFitFile, applySensorOptions, computeSampleStats, buildSyntheticProcessedRoute } from './lib';
import type { RequestBody, ProcessedRoute } from './lib';
import { exportActivityFile } from './exporters';
import type { ExportContext } from './exporters';

const EXPORT_FORMATS = ['fit', 'tcx', 'gpx', 'csv'];
// 16MB：普通请求很小，但生成接口允许回传预览快照（最多 50000 个样本，约数 MB）
const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;

export function validateJsonRequest(
  contentType: string | null | undefined,
  contentLength: string | null | undefined
): Response | null {
  const ct = (contentType || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type 必须为 application/json' }, 400);
  }
  const len = Number(contentLength || 0);
  if (Number.isFinite(len) && len > MAX_REQUEST_BODY_BYTES) {
    return jsonResponse({ error: `请求体超过大小上限（${Math.round(MAX_REQUEST_BODY_BYTES / 1024 / 1024)}MB）` }, 413);
  }
  return null;
}

export type JsonParseResult =
  | { ok: true; body: RequestBody }
  | { ok: false; response: Response };

/**
 * 读取请求体后按实际字节数校验上限，并解析 JSON。
 * 弥补仅依赖 Content-Length 头的漏洞（chunked 或无长度头的请求可绕过旧检查）。
 */
export function parseJsonBody(rawText: string): JsonParseResult {
  const byteLength = new TextEncoder().encode(rawText).byteLength;
  if (byteLength > MAX_REQUEST_BODY_BYTES) {
    return {
      ok: false,
      response: jsonResponse({ error: `请求体超过大小上限（${Math.round(MAX_REQUEST_BODY_BYTES / 1024 / 1024)}MB）` }, 413),
    };
  }
  try {
    return { ok: true, body: JSON.parse(rawText) as RequestBody };
  } catch {
    return { ok: false, response: jsonResponse({ error: '请求体不是合法的 JSON' }, 400) };
  }
}

const ELEVATION_SOURCE_NAMES: Record<string, string> = {
  'open-elevation': 'Open-Elevation',
  'opentopodata': 'OpenTopoData SRTM90',
  'opentopodata-srtm30m': 'OpenTopoData SRTM30',
  'opentopodata-aster30m': 'OpenTopoData ASTER30',
  'opentopodata-eudem25m': 'OpenTopoData EUDEM25',
  'open-meteo': 'Open-Meteo',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function elevationInfoFor(
  body: RequestBody,
  result: ProcessedRoute
): { source: string; status: string; message: string } {
  const source = typeof body?.elevationSource === 'string' && body.elevationSource.trim()
    ? body.elevationSource.trim().toLowerCase()
    : 'open-elevation';
  const sourceName = ELEVATION_SOURCE_NAMES[source] || source;

  if (source === 'none') {
    return { source, status: 'none', message: '不写入海拔（FIT 海拔字段留空）' };
  }
  if (source === 'off') {
    return { source, status: 'off', message: '模拟海拔（离线生成）' };
  }
  // 以 processRouteRequest 实际应用结果为准，避免口径不一致
  if (result.usedClientAltitudes) {
    if (result.usedClientAltitudesPartial) {
      return {
        source,
        status: 'partial',
        message: `已获取部分真实海拔（${sourceName}），其余采样点已回退模拟海拔`,
      };
    }
    const altitudeCount = Array.isArray(body?.altitudes) ? body.altitudes.length : 0;
    return {
      source,
      status: 'live',
      message: `已获取真实海拔（${sourceName}，${altitudeCount} 个采样点）`,
    };
  }
  return {
    source,
    status: 'fallback',
    message: `客户端未提供有效真实海拔（${sourceName}），已回退模拟海拔`,
  };
}

export async function handlePreview(body: RequestBody): Promise<Response> {
  try {
    const result = processRouteRequest(body || {});
    if ('error' in result) return jsonResponse({ error: result.error }, 400);

    // 海拔由浏览器端获取并通过 body.altitudes 传入，服务端不再发起第三方请求
    const elevation = elevationInfoFor(body, result);
    const includeHeartRate = body.includeHeartRate !== false;
    const includePower = body.includePower !== false;
    const includeCadence = body.includeCadence !== false;
    const includeGaitData = body.includeGaitData !== false;

    // 传感器开关清零（海拔已在 processRouteRequest 中写入 samples）
    const samples = applySensorOptions(result.samples, { includeHeartRate, includePower, includeCadence, includeGaitData });
    const stats = computeSampleStats(samples, result.hrRestVal, result.hrMaxVal, result.totalDurationSec);

    return jsonResponse({
      totalDistanceMeters: result.totalDist,
      totalDurationSec: result.totalDurationSec,
      trainingDurationSec: result.totalDurationSec + result.elapsedExtraSeconds,
      samples,
      calories: result.calories,
      sportType: result.sportType,
      sportName: result.sportName,
      stats,
      elevation: {
        source: elevation.source,
        status: elevation.status,
        message: elevation.message,
      },
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: '生成预览失败' }, 500);
  }
}

export async function handleGenerate(body: RequestBody): Promise<Response> {
  try {
    // 优先复用预览快照（跳过全量重算）；快照缺失/校验失败时回退全量计算，行为与旧版一致
    let result: { error: string } | ProcessedRoute;
    if (body?.preview) {
      const snapshot = buildSyntheticProcessedRoute(body);
      result = snapshot;
      if ('error' in snapshot) {
        console.warn('[FitTool] preview snapshot rejected, falling back to full compute:', snapshot.error);
        result = processRouteRequest(body || {});
      }
    } else {
      result = processRouteRequest(body || {});
    }
    if ('error' in result) return jsonResponse({ error: result.error }, 400);

    const sensorOptions = {
      includeHeartRate: body.includeHeartRate !== false,
      includePower: body.includePower !== false,
      includeCadence: body.includeCadence !== false,
      includeGaitData: body.includeGaitData !== false,
    };

    // 海拔由浏览器端获取并通过 body.altitudes 传入，服务端不再发起第三方请求
    const elevation = elevationInfoFor(body, result);

    const format = EXPORT_FORMATS.includes(String(body.format || 'fit')) ? String(body.format) : 'fit';

    if (format === 'fit') {
      return generateFitFile(result, sensorOptions, null, elevation);
    }

    const exported = exportActivityFile(
      format as 'tcx' | 'gpx' | 'csv',
      result,
      { sensorOptions, altitudes: null, elevationInfo: elevation } satisfies ExportContext
    );

    const headers: Record<string, string> = {
      'Content-Type': exported.contentType,
      'Content-Disposition': `attachment; filename=${exported.filename}`,
      'Cache-Control': 'no-store',
    };
    if (elevation) {
      headers['X-Elevation-Source'] = elevation.source;
      headers['X-Elevation-Status'] = elevation.status;
    }
    return new Response(exported.body as string, { headers });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: '生成文件失败' }, 500);
  }
}