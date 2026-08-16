import { processRouteRequest, generateFitFile } from './lib';
import type { RequestBody, ProcessedRoute } from './lib';
import { exportActivityFile } from './exporters';
import type { ExportContext } from './exporters';

const EXPORT_FORMATS = ['fit', 'tcx', 'gpx', 'csv'];
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;

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
    headers: { 'Content-Type': 'application/json' },
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

function statsFromSamples(
  samples: Array<{ altitude: number; heartRate: number; cadence: number; power: number; speed: number }>,
  hrRestVal: number,
  hrMaxVal: number,
  totalDurationSec: number
) {
  let totalAscent = 0;
  let totalDescent = 0;
  let maxElevation = -Infinity;
  let minElevation = Infinity;
  let hrSum = 0;
  let hrCount = 0;
  let cadSum = 0;
  let cadCount = 0;
  let powerSum = 0;
  let powerCount = 0;
  let strideSum = 0;
  let strideCount = 0;

  for (let i = 1; i < samples.length; i++) {
    const diff = samples[i].altitude - samples[i - 1].altitude;
    if (diff > 0) totalAscent += diff;
    else totalDescent += Math.abs(diff);
  }

  for (const s of samples) {
    if (s.altitude > maxElevation) maxElevation = s.altitude;
    if (s.altitude < minElevation) minElevation = s.altitude;
    if (s.heartRate > 0) { hrSum += s.heartRate; hrCount++; }
    if (s.cadence > 0) { cadSum += s.cadence; cadCount++; }
    if (s.power > 0) { powerSum += s.power; powerCount++; }
    if (s.speed > 0 && s.cadence > 0) {
      strideSum += (s.speed * 60) / s.cadence;
      strideCount++;
    }
  }

  const avgHeartRate = hrCount > 0 ? Math.round(hrSum / hrCount) : 0;
  const avgHrFloat = hrCount > 0 ? hrSum / hrCount : hrRestVal;
  const trainingLoad = Math.round(
    (totalDurationSec / 60) *
    ((avgHrFloat - hrRestVal) / Math.max(1, hrMaxVal - hrRestVal)) *
    100 / 10
  );

  return {
    totalAscent,
    totalDescent,
    maxElevation: Number.isFinite(maxElevation) ? maxElevation : 0,
    minElevation: Number.isFinite(minElevation) ? minElevation : 0,
    avgHeartRate,
    avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : 0,
    avgPower: powerCount > 0 ? Math.round(powerSum / powerCount) : 0,
    avgStrideLength: strideCount > 0 ? strideSum / strideCount : 0,
    trainingLoad,
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
    const samples = result.samples.map((s) => ({
      ...s,
      heartRate: includeHeartRate ? s.heartRate : 0,
      power: includePower ? s.power : 0,
      cadence: includeCadence ? s.cadence : 0,
      groundTime: includeGaitData ? s.groundTime : 0,
      flightTime: includeGaitData ? s.flightTime : 0,
      verticalOscillation: includeGaitData ? s.verticalOscillation : 0,
    }));

    const stats = statsFromSamples(samples, result.hrRestVal, result.hrMaxVal, result.totalDurationSec);

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
    const result = processRouteRequest(body || {});
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