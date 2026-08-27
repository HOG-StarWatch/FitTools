import type { ProcessedRoute, SampleData, SensorOptions } from './lib';
import { filenamePrefix } from './lib';

export type ExportFormat = 'fit' | 'tcx' | 'gpx' | 'csv';

export interface ExportContext {
  sensorOptions?: Partial<SensorOptions>;
  altitudes?: number[] | null;
  elevationInfo?: { source: string; status: string } | null;
}

interface EffectiveOptions {
  includeHr: boolean;
  includeCadence: boolean;
  includePower: boolean;
  includeAltitude: boolean;
  realAltitudes: number[] | null;
}

function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

/** 提取三种格式共用的传感器开关 + 与样本长度对齐的真实海拔数组 */
function extractEffectiveOptions(ctx: ExportContext, samples: SampleData[]): EffectiveOptions {
  const o = ctx.sensorOptions || {};
  const altitudes = ctx.altitudes && ctx.altitudes.length === samples.length ? ctx.altitudes : null;
  return {
    includeHr: o.includeHeartRate !== false,
    includeCadence: o.includeCadence !== false,
    includePower: o.includePower !== false,
    includeAltitude: o.includeAltitude !== false && ctx.elevationInfo?.status !== 'none',
    realAltitudes: altitudes,
  };
}

function altitudeAt(opts: EffectiveOptions, samples: SampleData[], i: number): number {
  return opts.realAltitudes ? opts.realAltitudes[i] : samples[i].altitude;
}

// ==================== TCX ====================

export function buildTcx(result: ProcessedRoute, ctx: ExportContext): string {
  const { startDate, totalDist, totalDurationSec, elapsedExtraSeconds, sportType, samples, calories } = result;
  const opts = extractEffectiveOptions(ctx, samples);
  const activityType = sportType === 'walking' ? 'Walking' : 'Running';
  const sessionElapsed = totalDurationSec + elapsedExtraSeconds;

  const trackpoints = samples.map((s, i) => {
    const altitude = altitudeAt(opts, samples, i);
    const t = new Date(startDate.getTime() + s.timeSec * 1000).toISOString();
    let tp = '      <Trackpoint>\n';
    tp += `        <Time>${t}</Time>\n`;
    tp += `        <Position>\n          <LatitudeDegrees>${fmtNum(s.lat, 6)}</LatitudeDegrees>\n          <LongitudeDegrees>${fmtNum(s.lng, 6)}</LongitudeDegrees>\n        </Position>\n`;
    if (opts.includeAltitude) tp += `        <AltitudeMeters>${fmtNum(altitude)}</AltitudeMeters>\n`;
    tp += `        <DistanceMeters>${fmtNum(s.distance)}</DistanceMeters>\n`;
    if (opts.includeHr) tp += `        <HeartRateBpm><Value>${Math.round(s.heartRate)}</Value></HeartRateBpm>\n`;
    tp += '        <Extensions>\n          <ns3:TPX xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">\n';
    if (opts.includeCadence) tp += `            <ns3:RunCadence>${Math.round(s.cadence / 2)}</ns3:RunCadence>\n`;
    tp += `            <ns3:Speed>${fmtNum(s.speed)}</ns3:Speed>\n`;
    if (opts.includePower) tp += `            <ns3:Watts>${Math.round(s.power)}</ns3:Watts>\n`;
    tp += '          </ns3:TPX>\n        </Extensions>\n';
    tp += '      </Trackpoint>\n';
    return tp;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="${activityType}">
      <Id>${startDate.toISOString()}</Id>
      <Lap StartTime="${startDate.toISOString()}">
        <TotalTimeSeconds>${fmtNum(sessionElapsed, 0)}</TotalTimeSeconds>
        <DistanceMeters>${fmtNum(totalDist, 0)}</DistanceMeters>
        <Calories>${Math.round(calories)}</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
 ${trackpoints}        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`;
}

// ==================== GPX ====================

export function buildGpx(result: ProcessedRoute, ctx: ExportContext): string {
  const { startDate, sportType, variant, samples } = result;
  const opts = extractEffectiveOptions(ctx, samples);
  const name = `${filenamePrefix(sportType)}${variant}`;

  const points = samples.map((s, i) => {
    const altitude = altitudeAt(opts, samples, i);
    const t = new Date(startDate.getTime() + s.timeSec * 1000).toISOString();
    let trkpt = `      <trkpt lat="${fmtNum(s.lat, 6)}" lon="${fmtNum(s.lng, 6)}">\n`;
    if (opts.includeAltitude) trkpt += `        <ele>${fmtNum(altitude)}</ele>\n`;
    trkpt += `        <time>${t}</time>\n`;
    if (opts.includeHr || opts.includeCadence) {
      trkpt += '        <extensions>\n          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n';
      if (opts.includeHr) trkpt += `            <gpxtpx:hr>${Math.round(s.heartRate)}</gpxtpx:hr>\n`;
      if (opts.includeCadence) trkpt += `            <gpxtpx:cad>${Math.round(s.cadence / 2)}</gpxtpx:cad>\n`;
      trkpt += '          </gpxtpx:TrackPointExtension>\n        </extensions>\n';
    }
    trkpt += '      </trkpt>\n';
    return trkpt;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FitTool" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
 ${points}    </trkseg>
  </trk>
</gpx>
`;
}

// ==================== CSV ====================

export function buildCsv(result: ProcessedRoute, ctx: ExportContext): string {
  const { startDate, samples } = result;
  const opts = extractEffectiveOptions(ctx, samples);

  const header = [
    'timestamp', 'latitude', 'longitude',
    ...(opts.includeAltitude ? ['altitude_m'] : []),
    'speed_mps', 'distance_m',
    ...(opts.includeHr ? ['heart_rate_bpm'] : []),
    ...(opts.includeCadence ? ['cadence_spm'] : []),
    ...(opts.includePower ? ['power_w'] : []),
  ].join(',');

  const rows = samples.map((s, i) => {
    const t = new Date(startDate.getTime() + s.timeSec * 1000).toISOString();
    return [
      t,
      fmtNum(s.lat, 6),
      fmtNum(s.lng, 6),
      ...(opts.includeAltitude ? [fmtNum(altitudeAt(opts, samples, i))] : []),
      fmtNum(s.speed, 2),
      fmtNum(s.distance, 2),
      ...(opts.includeHr ? [String(Math.round(s.heartRate))] : []),
      ...(opts.includeCadence ? [String(Math.round(s.cadence))] : []),
      ...(opts.includePower ? [String(Math.round(s.power))] : []),
    ].join(',');
  });

  return [header, ...rows].join('\n') + '\n';
}

// ==================== Dispatcher ====================

export interface ExportedFile {
  body: string;
  contentType: string;
  filename: string;
}

const FORMAT_BUILDERS = {
  tcx: { contentType: 'application/vnd.garmin.tcx+xml', build: buildTcx },
  gpx: { contentType: 'application/gpx+xml', build: buildGpx },
  csv: { contentType: 'text/csv; charset=utf-8', build: buildCsv },
} as const;

export function exportActivityFile(
  format: Exclude<ExportFormat, 'fit'>,
  result: ProcessedRoute,
  ctx: ExportContext
): ExportedFile {
  const builder = FORMAT_BUILDERS[format];
  return {
    body: builder.build(result, ctx),
    contentType: builder.contentType,
    filename: `${filenamePrefix(result.sportType)}${result.variant}.${format}`,
  };
}
