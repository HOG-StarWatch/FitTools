import type { ProcessedRoute } from './lib';

export type ExportFormat = 'fit' | 'tcx' | 'gpx' | 'csv';

export interface ExportSensorOptions {
  includeHeartRate?: boolean;
  includePower?: boolean;
  includeCadence?: boolean;
  includeGaitData?: boolean;
  includeAltitude?: boolean;
}

export interface ExportContext {
  sensorOptions?: ExportSensorOptions;
  altitudes?: number[] | null;
  elevationInfo?: { source: string; status: string } | null;
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

function filenamePrefix(result: ProcessedRoute): string {
  return result.sportType === 'walking' ? 'walk_' : 'run_';
}

// ==================== TCX ====================

export function buildTcx(result: ProcessedRoute, ctx: ExportContext): string {
  const { startDate, totalDist, totalDurationSec, elapsedExtraSeconds, sportType, variant, samples, calories } = result;
  const includeAltitude = ctx.sensorOptions?.includeAltitude !== false && ctx.elevationInfo?.status !== 'none';
  const includeHr = ctx.sensorOptions?.includeHeartRate !== false;
  const includeCadence = ctx.sensorOptions?.includeCadence !== false;
  const includePower = ctx.sensorOptions?.includePower !== false;
  const sessionElapsed = totalDurationSec + elapsedExtraSeconds;
  const activityType = sportType === 'walking' ? 'Walking' : 'Running';
  const realAltitudes = ctx.altitudes && ctx.altitudes.length === samples.length ? ctx.altitudes : null;

  let trackpoints = '';
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const altitude = realAltitudes ? realAltitudes[i] : s.altitude;
    const t = new Date(startDate.getTime() + s.timeSec * 1000);
    let tp = '      <Trackpoint>\n';
    tp += `        <Time>${t.toISOString()}</Time>\n`;
    tp += `        <Position>\n          <LatitudeDegrees>${fmtNum(s.lat, 6)}</LatitudeDegrees>\n          <LongitudeDegrees>${fmtNum(s.lng, 6)}</LongitudeDegrees>\n        </Position>\n`;
    if (includeAltitude) tp += `        <AltitudeMeters>${fmtNum(altitude)}</AltitudeMeters>\n`;
    tp += `        <DistanceMeters>${fmtNum(s.distance)}</DistanceMeters>\n`;
    if (includeHr) tp += `        <HeartRateBpm><Value>${Math.round(s.heartRate)}</Value></HeartRateBpm>\n`;
    tp += '        <Extensions>\n          <ns3:TPX xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">\n';
    if (includeCadence) tp += `            <ns3:RunCadence>${Math.round(s.cadence / 2)}</ns3:RunCadence>\n`;
    tp += `            <ns3:Speed>${fmtNum(s.speed)}</ns3:Speed>\n`;
    if (includePower) tp += `            <ns3:Watts>${Math.round(s.power)}</ns3:Watts>\n`;
    tp += '          </ns3:TPX>\n        </Extensions>\n';
    tp += '      </Trackpoint>\n';
    trackpoints += tp;
  }

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
  const { startDate, totalDurationSec, sportType, variant, samples } = result;
  const includeAltitude = ctx.sensorOptions?.includeAltitude !== false && ctx.elevationInfo?.status !== 'none';
  const includeHr = ctx.sensorOptions?.includeHeartRate !== false;
  const includeCadence = ctx.sensorOptions?.includeCadence !== false;
  const name = `${filenamePrefix(result)}${variant}`;
  const realAltitudes = ctx.altitudes && ctx.altitudes.length === samples.length ? ctx.altitudes : null;

  let points = '';
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const altitude = realAltitudes ? realAltitudes[i] : s.altitude;
    const t = new Date(startDate.getTime() + s.timeSec * 1000);
    let trkpt = `      <trkpt lat="${fmtNum(s.lat, 6)}" lon="${fmtNum(s.lng, 6)}">\n`;
    if (includeAltitude) trkpt += `        <ele>${fmtNum(altitude)}</ele>\n`;
    trkpt += `        <time>${t.toISOString()}</time>\n`;
    if (includeHr || includeCadence) {
      trkpt += '        <extensions>\n          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n';
      if (includeHr) trkpt += `            <gpxtpx:hr>${Math.round(s.heartRate)}</gpxtpx:hr>\n`;
      if (includeCadence) trkpt += `            <gpxtpx:cad>${Math.round(s.cadence / 2)}</gpxtpx:cad>\n`;
      trkpt += '          </gpxtpx:TrackPointExtension>\n        </extensions>\n';
    }
    trkpt += '      </trkpt>\n';
    points += trkpt;
  }

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
  const { startDate, totalDurationSec, sportType, samples } = result;
  const includeAltitude = ctx.sensorOptions?.includeAltitude !== false && ctx.elevationInfo?.status !== 'none';
  const includeHr = ctx.sensorOptions?.includeHeartRate !== false;
  const includeCadence = ctx.sensorOptions?.includeCadence !== false;
  const includePower = ctx.sensorOptions?.includePower !== false;
  const realAltitudes = ctx.altitudes && ctx.altitudes.length === samples.length ? ctx.altitudes : null;

  const header = [
    'timestamp', 'latitude', 'longitude',
    ...(includeAltitude ? ['altitude_m'] : []),
    'speed_mps', 'distance_m',
    ...(includeHr ? ['heart_rate_bpm'] : []),
    ...(includeCadence ? ['cadence_spm'] : []),
    ...(includePower ? ['power_w'] : []),
  ].join(',');

  const rows = samples.map((s, i) => {
    const altitude = realAltitudes ? realAltitudes[i] : s.altitude;
    const t = new Date(startDate.getTime() + s.timeSec * 1000);
    const row = [
      t.toISOString(),
      fmtNum(s.lat, 6),
      fmtNum(s.lng, 6),
      ...(includeAltitude ? [fmtNum(altitude)] : []),
      fmtNum(s.speed, 2),
      fmtNum(s.distance, 2),
      ...(includeHr ? [String(Math.round(s.heartRate))] : []),
      ...(includeCadence ? [String(Math.round(s.cadence))] : []),
      ...(includePower ? [String(Math.round(s.power))] : []),
    ];
    return row.join(',');
  });

  return [header, ...rows].join('\n') + '\n';
}

// ==================== Dispatcher ====================

export interface ExportedFile {
  body: string | ArrayBuffer;
  contentType: string;
  filename: string;
}

export function exportActivityFile(
  format: Exclude<ExportFormat, 'fit'>,
  result: ProcessedRoute,
  ctx: ExportContext
): ExportedFile {
  const filename = `${filenamePrefix(result)}${result.variant}.${format}`;
  switch (format) {
    case 'tcx':
      return { body: buildTcx(result, ctx), contentType: 'application/gpx+xml', filename };
    case 'gpx':
      return { body: buildGpx(result, ctx), contentType: 'application/gpx+xml', filename };
    case 'csv':
      return { body: buildCsv(result, ctx), contentType: 'text/csv; charset=utf-8', filename };
    default:
      return { body: buildTcx(result, ctx), contentType: 'application/octet-stream', filename };
  }
}