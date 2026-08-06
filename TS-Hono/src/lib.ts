import { FitEncoder, toSemicircles } from './fit';
import type { RecordData } from './fit';
import { resolveDevice } from './device';

export const MAX_POINTS = 10000;
export const ROUTE_CLOSURE_THRESHOLD_METERS = 5;
export const DEFAULT_WEIGHT_KG = 65;
export const DEFAULT_POWER_FACTOR = 1.3;
export const DEFAULT_AVG_CADENCE = 170;
export const DEFAULT_WALK_CADENCE = 100;
export const DEFAULT_PACE_SEC_PER_KM = 360;
export const DEFAULT_WALK_PACE_SEC_PER_KM = 720;
export const DEFAULT_HR_REST = 60;
export const DEFAULT_HR_MAX = 180;
export const WARMUP_DURATION_SEC = 60;
export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 150;

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface SampleData {
  timeSec: number;
  distance: number;
  speed: number;
  heartRate: number;
  cadence: number;
  power: number;
  groundTime: number;
  flightTime: number;
  verticalOscillation: number;
  lat: number;
  lng: number;
  altitude: number;
}

export interface ProcessedRoute {
  startDate: Date;
  totalDist: number;
  pace: number;
  hrRestVal: number;
  hrMaxVal: number;
  targetAvgCadence: number;
  weight: number;
  power: number;
  calories: number;
  laps: number;
  variant: number;
  samples: SampleData[];
  totalDurationSec: number;
  totalAscent: number;
  totalDescent: number;
  avgStrideLength: number;
  sportType: 'running' | 'walking';
  sportName: string;
  subSport: string | number;
  deviceManufacturer?: number;
  deviceProduct?: number;
  elapsedExtraSeconds: number;
  trainingLoad: number;
  maxElevation: number;
  minElevation: number;
}

export interface RequestBody {
  startTime?: string;
  points?: RoutePoint[];
  paceSecondsPerKm?: number;
  hrRest?: number;
  hrMax?: number;
  lapCount?: number;
  variantIndex?: number;
  weightKg?: number;
  powerFactor?: number;
  gpsDrift?: number;
  avgCadence?: number;
  elevationSource?: string;
  includeHeartRate?: boolean;
  includePower?: boolean;
  includeCadence?: boolean;
  includeGaitData?: boolean;
  sportType?: 'running' | 'walking';
  heightCm?: number;
  sportName?: string;
  fitSubSport?: string | number;
  customSubSport?: string | number;
  deviceType?: string | number;
  workoutMode?: string;
  intervalReps?: number;
  intervalFastKm?: number;
  elapsedExtraSeconds?: number;
  format?: string;
}

export { FitEncoder, toSemicircles };
export type { RecordData };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function offsetPointMeters(point: RoutePoint, offsetLatMeters: number, offsetLonMeters: number): RoutePoint {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((point.lat * Math.PI) / 180);
  return {
    lat: point.lat + offsetLatMeters / metersPerDegLat,
    lng: point.lng + offsetLonMeters / metersPerDegLon,
  };
}

function buildClosedBasePoints(points: RoutePoint[]): RoutePoint[] {
  if (!points || points.length < 2) return points || [];
  const first = points[0];
  const last = points[points.length - 1];
  const d = haversineDistance(first.lat, first.lng, last.lat, last.lng);
  if (d < ROUTE_CLOSURE_THRESHOLD_METERS) return points;
  return [...points, { lat: first.lat, lng: first.lng }];
}

function computeCalories(weightKg: number, distanceM: number, paceSecPerKm: number): number {
  const distanceKm = distanceM / 1000;
  const metFactor = 0.9 + (1000 / paceSecPerKm) * 0.25;
  return Math.round(weightKg * distanceKm * metFactor);
}

function generateCadence(speed: number, targetAvgCadence: number, index: number, totalPoints: number, isWalking = false): number {
  const base = targetAvgCadence;
  const speedEffect = (speed - 2.5) * 6;
  const wave = Math.sin((index / totalPoints) * Math.PI * 4) * 4;
  const noise = (Math.random() - 0.5) * 6;
  const cadence = base + speedEffect + wave + noise;
  const minCadence = isWalking ? 95 : 120;
  const maxCadence = isWalking ? 170 : 210;
  return Math.round(clamp(cadence, minCadence, maxCadence));
}

function generatePower(speed: number, weightKg: number, powerFactor: number, cadence: number): number {
  const basePower = weightKg * speed * powerFactor;
  const cadenceEffect = (cadence - 170) * 0.3;
  const noise = (Math.random() - 0.5) * 10;
  return Math.round(basePower + cadenceEffect + noise);
}

function generateGroundTime(speed: number, cadence: number): number {
  const baseTime = 280 - speed * 25;
  const cadenceEffect = (170 - cadence) * 0.4;
  const noise = (Math.random() - 0.5) * 15;
  return Math.round(clamp(baseTime + cadenceEffect + noise, 180, 320));
}

function generateFlightTime(speed: number, cadence: number, groundTime: number): number {
  const strideTime = 60000 / cadence;
  const flightTime = strideTime - groundTime;
  const noise = (Math.random() - 0.5) * 10;
  return Math.round(clamp(flightTime + noise, 80, 200));
}

function generateVerticalOscillation(speed: number, cadence: number): number {
  const base = 8.5 + speed * 0.5;
  const cadenceEffect = (cadence - 170) * -0.02;
  const noise = (Math.random() - 0.5) * 1.5;
  const cmValue = clamp(base + cadenceEffect + noise, 6, 12);
  return cmValue * 10;
}

interface ComputeSamplesResult {
  samples: SampleData[];
  totalDurationSec: number;
}

function computeSamples(
  allPoints: RoutePoint[],
  distances: number[],
  totalDist: number,
  paceSecondsPerKm: number,
  hrRestVal: number,
  hrMaxVal: number,
  targetAvgCadence: number,
  weightKg: number,
  powerFactor: number,
  altitudes: number[] | null = null,
  workoutMode?: string,
  intervalReps?: number,
  intervalFastKm?: number,
  isWalking = false
): ComputeSamplesResult {
  const totalDistanceKm = totalDist / 1000;
  const totalDurationEstimate = totalDistanceKm * paceSecondsPerKm;
  const avgSpeedTarget = totalDist / totalDurationEstimate;
  const n = allPoints.length;

  const baseSpeedFactor = 0.98 + Math.random() * 0.06;
  const phase1 = Math.random() * Math.PI * 2;
  const phase2 = Math.random() * Math.PI * 2;
  const baseAlt = 50 + Math.random() * 30;

  const reps = intervalReps && intervalReps > 0 ? Math.round(intervalReps) : 6;
  const fastKm = intervalFastKm && intervalFastKm > 0 ? intervalFastKm : 0.8;
  const workWindow = 0.8;
  const repKm = totalDistanceKm > 0 ? (totalDistanceKm * workWindow) / reps : 1;
  const fastFrac = Math.min(1, fastKm / repKm);

  function modeFactorAndHrBoost(frac: number): { factor: number; hrBoost: number } {
    switch (workoutMode) {
      case 'negative_split':
        return { factor: 1 + 0.18 * (frac - 0.5), hrBoost: 0 };
      case 'lsd':
        return { factor: 0.9, hrBoost: -0.06 };
      case 'interval': {
        if (frac < 0.1 || frac > 0.9) return { factor: 1, hrBoost: -0.05 };
        const repFrac = ((frac - 0.1) % (workWindow / reps)) / (workWindow / reps);
        const fast = repFrac < fastFrac;
        return fast ? { factor: 1.12, hrBoost: 0.16 } : { factor: 0.88, hrBoost: -0.14 };
      }
      default:
        return { factor: 1, hrBoost: 0 };
    }
  }

  const instSpeedRaw = new Array<number>(n);
  const hrValues = new Array<number>(n);
  const cadenceValues = new Array<number>(n);
  const powerValues = new Array<number>(n);
  const groundTimeValues = new Array<number>(n);
  const flightTimeValues = new Array<number>(n);
  const verticalOscillationValues = new Array<number>(n);

  const hasRealAltitude = altitudes != null && altitudes.length === n;
  const walkingMode = isWalking;

  let currentHr = hrRestVal;
  let accumulatedTime = 0;
  let breathingWavePhase = 0;

  for (let i = 0; i < n; i++) {
    const frac = distances[i] / totalDist;

    const longWave = 0.04 * Math.sin(frac * Math.PI * 2 + phase1);
    const shortWave = 0.02 * Math.sin(frac * Math.PI * 6 + phase2);
    const { factor: modeFactor, hrBoost } = modeFactorAndHrBoost(frac);
    const speedRaw = avgSpeedTarget * baseSpeedFactor * (1 + longWave + shortWave) * modeFactor;
    instSpeedRaw[i] = speedRaw;

    let intensityTarget: number;
    if (frac < 0.1) {
      const f = frac / 0.1;
      intensityTarget = 0.45 + 0.35 * f;
    } else if (frac < 0.85) {
      const f = (frac - 0.1) / 0.75;
      intensityTarget = 0.78 + 0.06 * Math.sin(f * Math.PI * 4);
    } else {
      const f = (frac - 0.85) / 0.15;
      intensityTarget = 0.82 + 0.15 * f;
    }

    const intensity = Math.min(1, Math.max(0, 0.7 * intensityTarget + 0.3 * Math.min(1, Math.max(0.3, speedRaw / (avgSpeedTarget || 1e-6))) + hrBoost));
    const hrTarget = hrRestVal + (hrMaxVal - hrRestVal) * intensity;

    if (accumulatedTime < WARMUP_DURATION_SEC) {
      const warmupProgress = accumulatedTime / WARMUP_DURATION_SEC;
      const warmupRate = 0.06 + 0.04 * warmupProgress;
      currentHr += (hrTarget - currentHr) * warmupRate;
    } else {
      const responseRate = 0.025 + 0.015 * intensity;
      currentHr += (hrTarget - currentHr) * responseRate;
    }

    breathingWavePhase += 0.12 + 0.08 * intensity;
    const breathingWave = Math.sin(breathingWavePhase) * (2.5 + 1.5 * intensity);
    const strideNoise = (Math.random() - 0.5) * (1.5 + 2 * intensity);
    const hrFluctuation = breathingWave + strideNoise;

    hrValues[i] = Math.round(clamp(currentHr + hrFluctuation, hrRestVal - 5, hrMaxVal + 2));
    cadenceValues[i] = generateCadence(speedRaw, targetAvgCadence, i, n, walkingMode);
    powerValues[i] = generatePower(speedRaw, weightKg, powerFactor, cadenceValues[i]);
    groundTimeValues[i] = generateGroundTime(speedRaw, cadenceValues[i]);
    flightTimeValues[i] = generateFlightTime(speedRaw, cadenceValues[i], groundTimeValues[i]);
    verticalOscillationValues[i] = generateVerticalOscillation(speedRaw, cadenceValues[i]);

    accumulatedTime += 1;
  }

  const segDurationsRaw = new Array<number>(Math.max(0, n - 1));
  let rawDuration = 0;
  for (let i = 1; i < n; i++) {
    const ds = distances[i] - distances[i - 1];
    const v = instSpeedRaw[i] > 0 ? instSpeedRaw[i] : avgSpeedTarget;
    const dt = ds / v;
    segDurationsRaw[i - 1] = dt;
    rawDuration += dt;
  }

  const scale = rawDuration > 0 ? totalDurationEstimate / rawDuration : 1;

  const samples: SampleData[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      t += segDurationsRaw[i - 1] * scale;
    }
    const frac = distances[i] / totalDist;
    const altitude = hasRealAltitude
      ? altitudes![i]
      : baseAlt + 2 * Math.sin(frac * Math.PI * 4) + (Math.random() - 0.5) * 0.8;
    samples.push({
      timeSec: t,
      distance: distances[i],
      speed: instSpeedRaw[i] / scale,
      heartRate: hrValues[i],
      cadence: cadenceValues[i],
      power: powerValues[i],
      groundTime: groundTimeValues[i],
      flightTime: flightTimeValues[i],
      verticalOscillation: verticalOscillationValues[i],
      lat: allPoints[i].lat,
      lng: allPoints[i].lng,
      altitude,
    });
  }

  const computedTotalDurationSec = samples.length ? samples[samples.length - 1].timeSec : totalDurationEstimate;
  return { samples, totalDurationSec: computedTotalDurationSec };
}

function computeElevationSummary(samples: SampleData[]): {
  totalAscent: number;
  totalDescent: number;
  avgStrideLength: number;
} {
  let totalAscent = 0;
  let totalDescent = 0;
  let strideSum = 0;
  let strideCount = 0;

  for (let i = 1; i < samples.length; i++) {
    const diff = samples[i].altitude - samples[i - 1].altitude;
    if (diff > 0) totalAscent += diff;
    else totalDescent += Math.abs(diff);
  }

  for (const s of samples) {
    if (s.speed > 0 && s.cadence > 0) {
      strideSum += (s.speed * 60) / s.cadence;
      strideCount++;
    }
  }

  return {
    totalAscent,
    totalDescent,
    avgStrideLength: strideCount > 0 ? strideSum / strideCount : 0,
  };
}

export function processRouteRequest(body: RequestBody): { error: string } | ProcessedRoute {
  const {
    startTime, points, paceSecondsPerKm, hrRest, hrMax, lapCount, variantIndex,
    weightKg, powerFactor, gpsDrift, avgCadence,
    sportType, sportName, fitSubSport, customSubSport, deviceType,
    workoutMode, intervalReps, intervalFastKm, elapsedExtraSeconds,
  } = body || {};

  if (!startTime || !points || !Array.isArray(points) || points.length < 2) {
    return { error: '缺少参数：需要 startTime、至少两个轨迹点 points' };
  }

  if (points.length > MAX_POINTS) {
    return { error: `轨迹点数量超过上限 (${MAX_POINTS})` };
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number' ||
        !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
        p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      return { error: `第 ${i + 1} 个轨迹点坐标无效（纬度 -90~90，经度 -180~180）` };
    }
  }

  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) {
    return { error: 'startTime 格式不正确' };
  }

  const weight = (Number.isFinite(Number(weightKg)) && (weightKg ?? 0) > MIN_WEIGHT_KG && (weightKg ?? 0) < MAX_WEIGHT_KG)
    ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const power = (Number.isFinite(Number(powerFactor)) && (powerFactor ?? 0) > 0)
    ? Number(powerFactor) : DEFAULT_POWER_FACTOR;
  const drift = Number.isFinite(Number(gpsDrift)) ? Number(gpsDrift) : 0;
  const resolvedSportType: 'running' | 'walking' = sportType === 'walking' ? 'walking' : 'running';
  const defaultPace = resolvedSportType === 'walking' ? DEFAULT_WALK_PACE_SEC_PER_KM : DEFAULT_PACE_SEC_PER_KM;
  const defaultCadence = resolvedSportType === 'walking' ? DEFAULT_WALK_CADENCE : DEFAULT_AVG_CADENCE;
  const targetAvgCadence = Number.isFinite(Number(avgCadence)) ? Number(avgCadence) : defaultCadence;
  const pace = (Number(paceSecondsPerKm) > 0 && Number(paceSecondsPerKm) < 2000)
    ? Number(paceSecondsPerKm) : defaultPace;
  const hrRestVal = Number.isFinite(Number(hrRest)) ? Number(hrRest) : DEFAULT_HR_REST;
  const hrMaxVal = Number.isFinite(Number(hrMax)) ? Math.max(100, Math.min(220, Number(hrMax))) : DEFAULT_HR_MAX;
  const lapsRaw = Number(lapCount);
  const laps = (Number.isFinite(lapsRaw) && lapsRaw > 0) ? lapsRaw : 1;
  const variantRaw = Number(variantIndex);
  const variant = (Number.isFinite(variantRaw) && variantRaw > 0) ? Math.floor(variantRaw) : 1;

  const resolvedSportName = typeof sportName === 'string' && sportName.trim()
    ? sportName.trim()
    : (resolvedSportType === 'walking' ? '健走' : '跑步');

  const customSub = customSubSport !== undefined && customSubSport !== null && String(customSubSport).trim() !== ''
    ? Number(customSubSport) : undefined;
  let subSport: string | number = 'generic';
  if (resolvedSportType === 'walking') {
    subSport = fitSubSport === 'indoorWalking' ? 'indoorWalking'
      : fitSubSport === 'casualWalking' ? 'casualWalking' : 'generic';
  } else if (customSub !== undefined && Number.isFinite(customSub)) {
    subSport = Math.max(0, Math.min(255, Math.floor(customSub)));
  } else if (typeof fitSubSport === 'number' && Number.isFinite(fitSubSport)) {
    subSport = Math.max(0, Math.min(255, Math.floor(fitSubSport)));
  } else if (typeof fitSubSport === 'string' && fitSubSport.trim()) {
    subSport = fitSubSport.trim();
  }

  const device = resolveDevice(deviceType);
  const elapsedExtra = Number.isFinite(Number(elapsedExtraSeconds)) && Number(elapsedExtraSeconds) >= 0
    ? Math.floor(Number(elapsedExtraSeconds)) : 0;

  const basePoints = buildClosedBasePoints(points);
  const allPoints: RoutePoint[] = [];
  const usedLaps = laps > 0 ? laps : 1;
  const shouldApplyDrift = drift > 0;
  const fullLaps = Math.floor(usedLaps);
  const partialLap = usedLaps - fullLaps;

  for (let i = 0; i < fullLaps; i++) {
    let offsetLatMeters = 0;
    let offsetLonMeters = 0;
    if (shouldApplyDrift) {
      const radiusMeters = drift * 10;
      const angle = Math.random() * Math.PI * 2;
      offsetLatMeters = radiusMeters * Math.cos(angle);
      offsetLonMeters = radiusMeters * Math.sin(angle);
    }
    for (const p of basePoints) {
      allPoints.push(shouldApplyDrift ? offsetPointMeters(p, offsetLatMeters, offsetLonMeters) : p);
    }
  }

  if (partialLap > 0) {
    let offsetLatMeters = 0;
    let offsetLonMeters = 0;
    if (shouldApplyDrift) {
      const radiusMeters = drift * 10;
      const angle = Math.random() * Math.PI * 2;
      offsetLatMeters = radiusMeters * Math.cos(angle);
      offsetLonMeters = radiusMeters * Math.sin(angle);
    }
    const partialPointsCount = Math.floor(basePoints.length * partialLap);
    for (let i = 0; i < partialPointsCount; i++) {
      const p = basePoints[i];
      allPoints.push(shouldApplyDrift ? offsetPointMeters(p, offsetLatMeters, offsetLonMeters) : p);
    }
  }

  const distances = [0];
  let totalDist = 0;
  for (let i = 1; i < allPoints.length; i++) {
    const d = haversineDistance(allPoints[i - 1].lat, allPoints[i - 1].lng, allPoints[i].lat, allPoints[i].lng);
    totalDist += d;
    distances.push(totalDist);
  }

  if (totalDist === 0) {
    return { error: '轨迹距离为 0，请绘制更长的路线' };
  }

  const calories = computeCalories(weight, totalDist, pace);

  const { samples, totalDurationSec } = computeSamples(
    allPoints, distances, totalDist, pace, hrRestVal, hrMaxVal, targetAvgCadence, weight, power,
    null, workoutMode === 'steady' ? undefined : workoutMode, intervalReps, intervalFastKm,
    resolvedSportType === 'walking',
  );

  const { totalAscent, totalDescent, avgStrideLength } = computeElevationSummary(samples);

  let maxElevation = -Infinity;
  let minElevation = Infinity;
  for (const s of samples) {
    if (s.altitude > maxElevation) maxElevation = s.altitude;
    if (s.altitude < minElevation) minElevation = s.altitude;
  }
  if (!Number.isFinite(maxElevation)) maxElevation = 0;
  if (!Number.isFinite(minElevation)) minElevation = 0;

  let hrSum = 0;
  for (const s of samples) hrSum += s.heartRate;
  const avgHr = samples.length > 0 ? hrSum / samples.length : hrRestVal;
  const trainingLoad = Math.round(
    (totalDurationSec / 60) *
    ((avgHr - hrRestVal) / Math.max(1, (hrMaxVal - hrRestVal))) *
    100 / 10
  );

  return {
    startDate, totalDist, pace, hrRestVal, hrMaxVal,
    targetAvgCadence, weight, power, calories, laps, variant, samples, totalDurationSec,
    totalAscent, totalDescent, avgStrideLength,
    sportType: resolvedSportType,
    sportName: resolvedSportName,
    subSport,
    deviceManufacturer: device?.manufacturer,
    deviceProduct: device?.product,
    elapsedExtraSeconds: elapsedExtra,
    trainingLoad,
    maxElevation,
    minElevation,
  };
}

export function applySensorOptions(samples: SampleData[], options?: {
  includeHeartRate?: boolean;
  includePower?: boolean;
  includeCadence?: boolean;
  includeGaitData?: boolean;
}): SampleData[] {
  const hr = options?.includeHeartRate !== false;
  const power = options?.includePower !== false;
  const cadence = options?.includeCadence !== false;
  const gait = options?.includeGaitData !== false;
  if (hr && power && cadence && gait) return samples;
  return samples.map(s => ({
    ...s,
    heartRate: hr ? s.heartRate : 0,
    power: power ? s.power : 0,
    cadence: cadence ? s.cadence : 0,
    groundTime: gait ? s.groundTime : 0,
    flightTime: gait ? s.flightTime : 0,
    verticalOscillation: gait ? s.verticalOscillation : 0,
  }));
}

export function generateFitFile(
  result: ProcessedRoute,
  sensorOptions?: {
    includeHeartRate?: boolean;
    includePower?: boolean;
    includeCadence?: boolean;
    includeGaitData?: boolean;
    includeAltitude?: boolean;
  },
  altitudes?: number[] | null,
  elevationInfo?: { source: string; status: string } | null
): Response {
  const {
    startDate, totalDist, totalDurationSec, hrMaxVal, variant, samples, calories,
    sportType, sportName, subSport, deviceManufacturer, deviceProduct, elapsedExtraSeconds,
  } = result;
  const fitSportName = sportType === 'walking' ? 'walking' : 'running';
  const filenamePrefix = sportType === 'walking' ? 'walk_' : 'run_';
  const includeHeartRate = sensorOptions?.includeHeartRate !== false;
  const includePower = sensorOptions?.includePower !== false;
  const includeCadence = sensorOptions?.includeCadence !== false;
  const includeGaitData = sensorOptions?.includeGaitData !== false;
  const includeAltitude = sensorOptions?.includeAltitude !== false && elevationInfo?.status !== 'none';
  const avgSpeed = totalDurationSec > 0 ? totalDist / totalDurationSec : 0;
  const sessionElapsed = totalDurationSec + elapsedExtraSeconds;

  let totalPower = 0;
  let totalCadence = 0;
  let totalHr = 0;
  for (const s of samples) {
    totalPower += s.power;
    totalCadence += s.cadence;
    totalHr += s.heartRate;
  }
  const avgPower = Math.round(totalPower / samples.length);
  const calculatedAvgCadence = Math.round(totalCadence / samples.length);
  const avgHr = Math.round(totalHr / samples.length);

  let sessionSamples = samples;
  if (includeAltitude && altitudes != null && altitudes.length === samples.length) {
    sessionSamples = samples.map((s, i) => ({ ...s, altitude: altitudes[i] }));
  }
  const elevationSummary = computeElevationSummary(sessionSamples);

  const sessionEnd = new Date(startDate.getTime() + sessionElapsed * 1000);

  const encoder = new FitEncoder({
    type: 'activity',
    manufacturer: deviceManufacturer ?? 'development',
    product: deviceProduct ?? 1,
    serialNumber: deviceManufacturer !== undefined ? (0x10000000 + Math.floor(Math.random() * 0x7fffffff)) : 1,
    timeCreated: startDate,
    sport: fitSportName,
    subSport,
  });

  encoder.writeFileIdMessage();
  encoder.writeDeviceInfoMessage(startDate);

  for (const s of sessionSamples) {
    const timestamp = new Date(startDate.getTime() + s.timeSec * 1000);
    const record: RecordData = {
      timestamp,
      positionLat: toSemicircles(s.lat),
      positionLong: toSemicircles(s.lng),
      distance: s.distance,
      speed: s.speed,
      enhancedSpeed: s.speed,
    };

    if (includeHeartRate) record.heartRate = s.heartRate;
    if (includeCadence) record.cadence = Math.round(s.cadence / 2);
    if (includePower) record.power = s.power;
    if (includeAltitude) record.altitude = s.altitude;
    if (includeGaitData) {
      record.stanceTime = s.groundTime;
      record.stanceTimePercent = clamp((s.groundTime / (s.groundTime + s.flightTime)) * 100, 40, 70);
      record.verticalOscillation = s.verticalOscillation;
      record.stepLength = (s.speed * 1000) / (s.cadence / 60) / 100;
    }

    encoder.writeRecordMessage(record);
  }

  encoder.writeLapMessage({
    timestamp: sessionEnd,
    startTime: startDate,
    totalElapsedTime: sessionElapsed,
    totalTimerTime: totalDurationSec,
    totalDistance: totalDist,
    totalCalories: calories,
    sport: fitSportName,
    subSport,
    avgSpeed,
    avgHeartRate: includeHeartRate ? avgHr : 0,
    maxHeartRate: includeHeartRate ? hrMaxVal : 0,
    avgCadence: includeCadence ? Math.round(calculatedAvgCadence / 2) : 0,
    avgPower: includePower ? avgPower : 0,
  }, includeHeartRate, includePower, includeCadence);

  encoder.writeSessionMessage({
    timestamp: sessionEnd,
    startTime: startDate,
    totalElapsedTime: sessionElapsed,
    totalTimerTime: totalDurationSec,
    totalDistance: totalDist,
    totalCalories: calories,
    sport: fitSportName,
    subSport,
    avgSpeed,
    avgHeartRate: includeHeartRate ? avgHr : 0,
    maxHeartRate: includeHeartRate ? hrMaxVal : 0,
    avgCadence: includeCadence ? Math.round(calculatedAvgCadence / 2) : 0,
    avgPower: includePower ? avgPower : 0,
    totalAscent: includeAltitude ? Math.round(elevationSummary.totalAscent) : undefined,
    totalDescent: includeAltitude ? Math.round(elevationSummary.totalDescent) : undefined,
    avgStepLength: includeGaitData ? elevationSummary.avgStrideLength : undefined,
  }, includeHeartRate, includePower, includeCadence);

  encoder.writeActivityMessage({
    timestamp: sessionEnd,
    totalTimerTime: totalDurationSec,
    numSessions: 1,
    type: 'manual',
  });

  const uint8Array = encoder.close();

  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.ant.fit',
    'Content-Disposition': `attachment; filename=${filenamePrefix}${variant}.fit`,
  };
  if (elevationInfo) {
    headers['X-Elevation-Source'] = elevationInfo.source;
    headers['X-Elevation-Status'] = elevationInfo.status;
  }

  return new Response(uint8Array.buffer.slice(
    uint8Array.byteOffset,
    uint8Array.byteOffset + uint8Array.byteLength
  ) as ArrayBuffer, {
    headers,
  });
}
