import { processRouteRequest, generateFitFile, applySensorOptions } from './lib';
import type { RequestBody } from './lib';
import { fetchAltitudesOrNull, DEFAULT_ELEVATION_CONFIG, parseElevationSource } from './elevation';
import { exportActivityFile } from './exporters';
import type { ExportContext } from './exporters';

const EXPORT_FORMATS = ['fit', 'tcx', 'gpx', 'csv'];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function elevationConfigFor(source: unknown) {
  const config = { ...DEFAULT_ELEVATION_CONFIG };
  const requestSource = parseElevationSource(source);
  if (requestSource) config.source = requestSource;
  return config;
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

    const elevation = await fetchAltitudesOrNull(
      result.samples.map(s => ({ lat: s.lat, lng: s.lng })),
      elevationConfigFor(body.elevationSource)
    );

    let samples = result.samples;
    if (elevation.altitudes) {
      samples = samples.map((s, i) => ({ ...s, altitude: elevation.altitudes![i] }));
    }
    samples = applySensorOptions(samples, {
      includeHeartRate: body.includeHeartRate,
      includePower: body.includePower,
      includeCadence: body.includeCadence,
      includeGaitData: body.includeGaitData,
    });

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

    const elevation = await fetchAltitudesOrNull(
      result.samples.map(s => ({ lat: s.lat, lng: s.lng })),
      elevationConfigFor(body.elevationSource)
    );

    const format = EXPORT_FORMATS.includes(String(body.format || 'fit')) ? String(body.format) : 'fit';

    if (format === 'fit') {
      return generateFitFile(result, sensorOptions, elevation.altitudes, elevation);
    }

    const exported = exportActivityFile(
      format as 'tcx' | 'gpx' | 'csv',
      result,
      { sensorOptions, altitudes: elevation.altitudes, elevationInfo: elevation } satisfies ExportContext
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