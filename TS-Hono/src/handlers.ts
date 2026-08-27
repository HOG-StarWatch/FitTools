import { processRouteRequest, buildSyntheticProcessedRoute, computeSampleStats, applySensorOptions, generateFitFile } from './lib';
import type { RequestBody, ProcessedRoute } from './lib';
import { exportActivityFile } from './exporters';
import type { ExportContext, ExportFormat } from './exporters';
import { jsonResponse, downloadResponse } from './http';
import { buildElevationInfo, deriveAltitudeFlags } from './elevation';
import { resolveSensorOptions } from './sensor-options';

const EXPORT_FORMATS: readonly ExportFormat[] = ['fit', 'tcx', 'gpx', 'csv'];
// 普通请求很小，但生成接口允许回传预览快照（最多 50000 个样本，约数 MB）
const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;
const MAX_REQUEST_BODY_MB = Math.round(MAX_REQUEST_BODY_BYTES / 1024 / 1024);

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
    return jsonResponse({ error: `请求体超过大小上限（${MAX_REQUEST_BODY_MB}MB）` }, 413);
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
    return { ok: false, response: jsonResponse({ error: `请求体超过大小上限（${MAX_REQUEST_BODY_MB}MB）` }, 413) };
  }
  try {
    return { ok: true, body: JSON.parse(rawText) as RequestBody };
  } catch {
    return { ok: false, response: jsonResponse({ error: '请求体不是合法的 JSON' }, 400) };
  }
}

function isExportFormat(format: unknown): format is ExportFormat {
  return typeof format === 'string' && (EXPORT_FORMATS as readonly string[]).includes(format);
}

export async function handlePreview(body: RequestBody): Promise<Response> {
  try {
    const result = processRouteRequest(body || {});
    if ('error' in result) return jsonResponse({ error: result.error }, 400);

    const flags = deriveAltitudeFlags(body?.altitudes, body?.points?.length || 0, body?.points?.length || 0);
    const elevation = buildElevationInfo(body, flags);
    const sensorOptions = resolveSensorOptions(body, elevation);
    const samples = applySensorOptions(result.samples, sensorOptions);
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
      elevation: { source: elevation.source, status: elevation.status, message: elevation.message },
    });
  } catch (e) {
    console.error('[FitTool] preview failed:', e);
    return jsonResponse({ error: '生成预览失败' }, 500);
  }
}

export async function handleGenerate(body: RequestBody): Promise<Response> {
  try {
    // 优先复用预览快照（跳过全量重算）；校验失败时回退全量计算
    let result: { error: string } | ProcessedRoute;
    if (body?.preview) {
      const snapshot = buildSyntheticProcessedRoute(body);
      if ('error' in snapshot) {
        console.warn('[FitTool] preview snapshot rejected, falling back to full compute:', snapshot.error);
        result = processRouteRequest(body || {});
      } else {
        result = snapshot;
      }
    } else {
      result = processRouteRequest(body || {});
    }
    if ('error' in result) return jsonResponse({ error: result.error }, 400);

    const flags = deriveAltitudeFlags(body?.altitudes, body?.points?.length || 0, body?.points?.length || 0);
    const elevation = buildElevationInfo(body, flags);
    const sensorOptions = resolveSensorOptions(body, elevation);
    const format: ExportFormat = isExportFormat(body?.format) ? body.format : 'fit';

    if (format === 'fit') {
      return generateFitFile(result, sensorOptions, null, elevation);
    }

    const exported = exportActivityFile(format, result, {
      sensorOptions,
      altitudes: null,
      elevationInfo: elevation,
    } satisfies ExportContext);

    return downloadResponse(exported.body, exported.contentType, exported.filename, {
      'X-Elevation-Source': elevation.source,
      'X-Elevation-Status': elevation.status,
    });
  } catch (e) {
    console.error('[FitTool] generate failed:', e);
    return jsonResponse({ error: '生成文件失败' }, 500);
  }
}
