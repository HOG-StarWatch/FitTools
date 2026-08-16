import { FitEncoder, toSemicircles } from './fit';
import type { RecordData } from './fit';
import { resolveDevice } from './device';

export const MAX_POINTS = 10000;
export const MAX_EXPANDED_POINTS = 50000;
export const ROUTE_CLOSURE_THRESHOLD_METERS = 5;
export const DEFAULT_WEIGHT_KG = 65;
export const DEFAULT_POWER_FACTOR = 1.3;
export const MAX_POWER_FACTOR = 10;
export const DEFAULT_AVG_CADENCE = 170;
export const DEFAULT_WALK_CADENCE = 100;
export const DEFAULT_PACE_SEC_PER_KM = 360;
export const DEFAULT_WALK_PACE_SEC_PER_KM = 720;
export const DEFAULT_HR_REST = 60;
export const DEFAULT_HR_MAX = 180;
export const MIN_HR_REST = 30;
export const MAX_HR_REST = 120;
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
  /** 是否实际应用了客户端传来的真实海拔（长度与数值均有效） */
  usedClientAltitudes: boolean;
  /** 客户端海拔是否只有部分点成功（其余点已回退模拟） */
  usedClientAltitudesPartial: boolean;
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
  /** 浏览器端获取的真实海拔数组，长度对应请求 points（或闭合后的 basePoints）；null 表示该点回退模拟 */
  altitudes?: Array<number | null> | null;
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
  const metersPerDegLon = 111320 * Math.max(0.01, Math.cos((point.lat * Math.PI) / 180));
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

function resolveBaseAltitudes(
  altitudes: Array<number | null> | null | undefined,
  inputPointCount: number,
  basePointCount: number
): Array<number | null> | null {
  if (!Array.isArray(altitudes)) return null;
  let base: Array<number | null>;
  if (altitudes.length === basePointCount) {
    base = altitudes;
  } else if (altitudes.length === inputPointCount && basePointCount === inputPointCount + 1) {
    // 路线未闭合时服务端补了一个闭合点，客户端海拔也补第一个点
    base = [...altitudes, altitudes[0]];
  } else {
    return null;
  }
  for (const v of base) {
    // 允许 null（部分批次失败，由 computeSamples 对这些点回退模拟海拔）
    if (v != null && (typeof v !== 'number' || !Number.isFinite(v))) return null;
  }
  return base;
}

function computeCalories(weightKg: number, distanceM: number, paceSecPerKm: number): number {
  const distanceKm = distanceM / 1000;
  const metFactor = 0.9 + (1000 / paceSecPerKm) * 0.25;
  return Math.round(weightKg * distanceKm * metFactor);
}

// ==================== 仿真数据生成（统计自然化） ====================

interface AthleteProfile {
  cadenceBias: number;
  powerBias: number;
  groundBias: number;
  flightBias: number;
  voBias: number;
  hrPhase: number;
  altPhase: number;
  altBase: number;
}

function createAthleteProfile(): AthleteProfile {
  return {
    cadenceBias: randn() * 2,
    powerBias: randn() * 6,
    groundBias: randn() * 6,
    flightBias: randn() * 5,
    voBias: randn() * 0.7,
    hrPhase: Math.random() * Math.PI * 2,
    altPhase: Math.random() * Math.PI * 2,
    altBase: clamp(55 + randn() * 25, 10, 900),
  };
}

// Box-Muller 高斯噪声，替代均匀白噪声
let _gaussSpare: number | null = null;
function randn(): number {
  if (_gaussSpare != null) {
    const v = _gaussSpare;
    _gaussSpare = null;
    return v;
  }
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const mag = Math.sqrt(-2.0 * Math.log(u));
  _gaussSpare = mag * Math.sin(2.0 * Math.PI * v);
  return mag * Math.cos(2.0 * Math.PI * v);
}

// 一阶自回归，相邻点相关，比白噪声更接近真实节拍/功率波动
function arStep(prev: number, target: number, rate: number, noiseSigma: number, min: number, max: number): number {
  const next = prev * (1 - rate) + target * rate + randn() * noiseSigma;
  return Math.round(clamp(next, min, max));
}

function cadenceRange(isWalking: boolean): { min: number; max: number } {
  return isWalking ? { min: 95, max: 170 } : { min: 120, max: 210 };
}

function generateCadenceAR(prev: number, speed: number, targetAvgCadence: number, isWalking: boolean, athlete: AthleteProfile): number {
  const { min, max } = cadenceRange(isWalking);
  const target = targetAvgCadence + (speed - 2.5) * 6 + athlete.cadenceBias;
  return arStep(prev, target, 0.35, 2.2, min, max);
}

function generatePowerAR(prev: number, speed: number, weightKg: number, powerFactor: number, cadence: number, athlete: AthleteProfile): number {
  const basePower = weightKg * speed * powerFactor;
  const cadenceEffect = (cadence - 170) * 0.3;
  const target = basePower + cadenceEffect + athlete.powerBias;
  return arStep(prev, target, 0.3, 5, 0, 2000);
}

/**
 * 步态三件套：以步态周期为基准耦合生成。
 * 真实关系：groundTime + flightTime ≈ strideTime（60000/cadence），
 * 触地时间随速度加快而缩短，占比约 55%-82%。
 */
function generateGroundFlightTime(speed: number, cadence: number, athlete: AthleteProfile): { groundTime: number; flightTime: number } {
  const strideTime = 60000 / cadence;
  // 速度越快触地占比越低：2.5m/s≈78%，5m/s≈65%
  const ratioTarget = 0.78 - (speed - 2.5) * 0.052;
  let groundTime = strideTime * clamp(ratioTarget + athlete.groundBias / 100, 0.55, 0.82) + randn() * 4;
  groundTime = clamp(groundTime, strideTime * 0.52, strideTime * 0.85);
  const flightTime = strideTime - groundTime + athlete.flightBias * 0.3 + randn() * 2;
  return {
    groundTime: Math.round(clamp(groundTime, 150, 340)),
    flightTime: Math.round(clamp(flightTime, 60, 220)),
  };
}

function generateVerticalOscillation(speed: number, cadence: number, athlete: AthleteProfile): number {
  // 垂直振幅 5.5-13cm，随速度增加，叠加个体差异与节拍间波动
  const base = 7.5 + (speed - 2.5) * 1.2;
  const cadenceEffect = (cadence - 170) * -0.02;
  const cmValue = clamp(base + cadenceEffect + athlete.voBias + randn() * 0.6, 5.5, 13);
  // FIT field 39 vertical_oscillation: scale 10, units mm
  return cmValue * 100;
}

/**
 * 模拟海拔：多频叠加 + 低频漂移 + 高斯噪声，避免单一正弦的规整指纹。
 */
function simulatedAltitude(frac: number, athlete: AthleteProfile): number {
  return athlete.altBase
    + 35 * Math.sin(frac * Math.PI * 3 + athlete.altPhase)
    + 18 * Math.sin(frac * Math.PI * 7.3 + athlete.altPhase * 1.7)
    + 8 * Math.sin(frac * Math.PI * 17.1 + athlete.altPhase * 0.9)
    + randn() * 1.5;
}

interface ComputeSamplesResult {
  samples: SampleData[];
  totalDurationSec: number;
}

/**
 * 对 null 点做邻点线性插值（仅前后都有有效值的区段）；
 * 首尾无界的 null 保持 null，由调用方回退模拟海拔。
 */
function interpolateNulls(values: Array<number | null>): Array<number | null> {
  const result = values.slice();
  let i = 0;
  while (i < result.length) {
    if (result[i] != null) {
      i++;
      continue;
    }
    let j = i;
    while (j < result.length && result[j] == null) j++;
    const before = i > 0 ? result[i - 1] : null;
    const after = j < result.length ? result[j] : null;
    if (before != null && after != null) {
      const span = j - i + 1;
      for (let k = i; k < j; k++) {
        const t = (k - i + 1) / span;
        result[k] = before + (after - before) * t;
      }
    }
    i = j;
  }
  return result;
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
  altitudes: Array<number | null> | null = null,
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
  const athlete = createAthleteProfile();

  const reps = intervalReps && intervalReps > 0 ? Math.max(1, Math.round(intervalReps)) : 4;
  const fastKm = intervalFastKm && intervalFastKm > 0 ? intervalFastKm : 0.4;
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
  const effectiveAltitudes = hasRealAltitude ? interpolateNulls(altitudes!) : null;
  const walkingMode = isWalking;

  let currentHr = hrRestVal;
  let accumulatedTime = 0;
  let breathingWavePhase = athlete.hrPhase;
  let prevCadence = targetAvgCadence + athlete.cadenceBias;
  let prevPower = 0;

  for (let i = 0; i < n; i++) {
    const frac = distances[i] / totalDist;

    const longWave = 0.04 * Math.sin(frac * Math.PI * 2 + athlete.altPhase);
    const shortWave = 0.02 * Math.sin(frac * Math.PI * 6.7 + athlete.altPhase * 1.3);
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
    // 随运动时间缓慢上漂的心率（cardiac drift），最大 +5bpm，更接近真实长时间运动
    const cardiacDrift = Math.min(5, (i / Math.max(1, n - 1)) * 5);
    const hrTarget = clamp(
      hrRestVal + (hrMaxVal - hrRestVal) * intensity + cardiacDrift * (0.4 + 0.6 * intensity),
      hrRestVal,
      hrMaxVal
    );

    if (accumulatedTime < WARMUP_DURATION_SEC) {
      const warmupProgress = accumulatedTime / WARMUP_DURATION_SEC;
      const warmupRate = 0.06 + 0.04 * warmupProgress;
      currentHr += (hrTarget - currentHr) * warmupRate;
    } else {
      const responseRate = 0.025 + 0.015 * intensity;
      currentHr += (hrTarget - currentHr) * responseRate;
    }

    // 呼吸性窦性心律不齐：双频叠加 + 高斯噪声，替代单一正弦 + 均匀白噪声
    breathingWavePhase += 0.12 + 0.08 * intensity;
    const breathingWave =
      (Math.sin(breathingWavePhase) + 0.35 * Math.sin(breathingWavePhase * 0.37 + 1.3))
      * (2.2 + 1.6 * intensity);
    const hrNoise = randn() * (1.2 + 1.5 * intensity);
    const hrFluctuation = breathingWave + hrNoise;

    hrValues[i] = Math.round(clamp(currentHr + hrFluctuation, hrRestVal - 5, hrMaxVal));
    cadenceValues[i] = generateCadenceAR(prevCadence, speedRaw, targetAvgCadence, walkingMode, athlete);
    prevCadence = cadenceValues[i];
    powerValues[i] = generatePowerAR(prevPower, speedRaw, weightKg, powerFactor, cadenceValues[i], athlete);
    prevPower = powerValues[i];
    const stepTimes = generateGroundFlightTime(speedRaw, cadenceValues[i], athlete);
    groundTimeValues[i] = stepTimes.groundTime;
    flightTimeValues[i] = stepTimes.flightTime;
    verticalOscillationValues[i] = generateVerticalOscillation(speedRaw, cadenceValues[i], athlete);

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
    const realAlt = effectiveAltitudes ? effectiveAltitudes[i] : null;
    const altitude = realAlt != null && Number.isFinite(realAlt)
      ? realAlt
      : simulatedAltitude(frac, athlete);
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
    altitudes: bodyAltitudes,
  } = body || {};

  if (!startTime || !points || !Array.isArray(points) || points.length < 2) {
    return { error: '缺少参数：需要 startTime、至少两个轨迹点 points' };
  }

  if (points.length > MAX_POINTS) {
    return { error: `轨迹点数量超过上限 (${MAX_POINTS})` };
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || typeof p !== 'object' ||
        typeof p.lat !== 'number' || typeof p.lng !== 'number' ||
        !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
        p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      return { error: `第 ${i + 1} 个轨迹点坐标无效（纬度 -90~90，经度 -180~180）` };
    }
  }

  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) {
    return { error: 'startTime 格式不正确' };
  }

  const weight = (Number.isFinite(Number(weightKg)) && (weightKg ?? 0) >= MIN_WEIGHT_KG && (weightKg ?? 0) <= MAX_WEIGHT_KG)
    ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const power = (Number.isFinite(Number(powerFactor)) && (powerFactor ?? 0) > 0)
    ? Math.min(MAX_POWER_FACTOR, Number(powerFactor)) : DEFAULT_POWER_FACTOR;
  const drift = Number.isFinite(Number(gpsDrift)) ? Number(gpsDrift) : 0;
  const resolvedSportType: 'running' | 'walking' = sportType === 'walking' ? 'walking' : 'running';
  const defaultPace = resolvedSportType === 'walking' ? DEFAULT_WALK_PACE_SEC_PER_KM : DEFAULT_PACE_SEC_PER_KM;
  const defaultCadence = resolvedSportType === 'walking' ? DEFAULT_WALK_CADENCE : DEFAULT_AVG_CADENCE;
  const targetAvgCadence = Number.isFinite(Number(avgCadence)) ? Number(avgCadence) : defaultCadence;
  const pace = (Number(paceSecondsPerKm) > 0 && Number(paceSecondsPerKm) < 2000)
    ? Number(paceSecondsPerKm) : defaultPace;
  const hrMaxVal = Number.isFinite(Number(hrMax)) ? Math.max(100, Math.min(220, Number(hrMax))) : DEFAULT_HR_MAX;
  let hrRestVal = Number.isFinite(Number(hrRest)) ? Math.max(MIN_HR_REST, Math.min(MAX_HR_REST, Number(hrRest))) : DEFAULT_HR_REST;
  if (hrRestVal >= hrMaxVal) hrRestVal = Math.max(MIN_HR_REST, hrMaxVal - 20);
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
  } else if (typeof fitSubSport === 'number' && Number.isFinite(fitSubSport)) {
    subSport = Math.max(0, Math.min(255, Math.floor(fitSubSport)));
  } else if (typeof fitSubSport === 'string' && fitSubSport.trim()) {
    subSport = fitSubSport.trim();
  }

  // 自定义子运动数值优先级最高，walking 模式下同样覆盖默认子运动
  if (customSub !== undefined && Number.isFinite(customSub)) {
    subSport = Math.max(0, Math.min(255, Math.floor(customSub)));
  }

  const device = resolveDevice(deviceType);
  const elapsedExtra = Number.isFinite(Number(elapsedExtraSeconds)) && Number(elapsedExtraSeconds) >= 0
    ? Math.floor(Number(elapsedExtraSeconds)) : 0;

  const basePoints = buildClosedBasePoints(points);
  const baseAltitudes = resolveBaseAltitudes(bodyAltitudes, points.length, basePoints.length);
  const allPoints: RoutePoint[] = [];
  const expandedAltitudes: Array<number | null> | null = baseAltitudes ? [] : null;
  const validAltitudeCount = baseAltitudes
    ? baseAltitudes.filter((v) => v != null && Number.isFinite(v)).length
    : 0;
  const usedClientAltitudes = baseAltitudes != null && validAltitudeCount > 0;
  const hasPartialAltitudes = usedClientAltitudes && validAltitudeCount < baseAltitudes.length;
  const usedLaps = laps > 0 ? laps : 1;
  const shouldApplyDrift = drift > 0;
  const fullLaps = Math.floor(usedLaps);
  const partialLap = usedLaps - fullLaps;

  const expandedPointCount = Math.ceil(basePoints.length * fullLaps) + Math.floor(basePoints.length * partialLap);
  if (expandedPointCount > MAX_EXPANDED_POINTS) {
    return { error: `展开后的轨迹点数量超过上限 (${MAX_EXPANDED_POINTS})，请减少圈数或轨迹点` };
  }

  for (let i = 0; i < fullLaps; i++) {
    let offsetLatMeters = 0;
    let offsetLonMeters = 0;
    if (shouldApplyDrift) {
      const radiusMeters = drift * 10;
      const angle = Math.random() * Math.PI * 2;
      offsetLatMeters = radiusMeters * Math.cos(angle);
      offsetLonMeters = radiusMeters * Math.sin(angle);
    }
    for (let j = 0; j < basePoints.length; j++) {
      const p = basePoints[j];
      allPoints.push(shouldApplyDrift ? offsetPointMeters(p, offsetLatMeters, offsetLonMeters) : p);
      if (expandedAltitudes) expandedAltitudes.push(baseAltitudes![j]);
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
      if (expandedAltitudes) expandedAltitudes.push(baseAltitudes![i]);
    }
  }

  if (allPoints.length < 2) {
    return { error: '圈数过小导致展开后轨迹点不足，请增加圈数或轨迹点' };
  }

  const distances = [0];
  let totalDist = 0;
  for (let i = 1; i < allPoints.length; i++) {
    const d = haversineDistance(allPoints[i - 1].lat, allPoints[i - 1].lng, allPoints[i].lat, allPoints[i].lng);
    totalDist += d;
    distances.push(totalDist);
  }

  if (!Number.isFinite(totalDist) || totalDist === 0) {
    return { error: '轨迹距离为 0，请绘制更长的路线' };
  }

  const calories = computeCalories(weight, totalDist, pace);

  const { samples, totalDurationSec } = computeSamples(
    allPoints, distances, totalDist, pace, hrRestVal, hrMaxVal, targetAvgCadence, weight, power,
    expandedAltitudes, workoutMode === 'steady' ? undefined : workoutMode, intervalReps, intervalFastKm,
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
    usedClientAltitudes,
    usedClientAltitudesPartial: hasPartialAltitudes,
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

/**
 * 按厂商生成更自然的 32 位序列号。
 * Garmin 常见 10 位、3 开头；开发/未知厂商用随机高位，避免清一色 0x1xxxxxxx 指纹。
 */
function generateSerialNumber(manufacturerId: number | undefined): number {
  if (manufacturerId === 1) {
    return 3000000000 + Math.floor(Math.random() * 999999999);
  }
  if (manufacturerId === 255) {
    return 0x10000000 + Math.floor(Math.random() * 0x2fffffff);
  }
  return 100000000 + Math.floor(Math.random() * 1899999999);
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
    serialNumber: deviceManufacturer !== undefined ? generateSerialNumber(deviceManufacturer) : 1,
    timeCreated: startDate,
    sport: fitSportName,
    subSport,
  });

  encoder.writeFileIdMessage();
  encoder.writeDeviceInfoMessage(startDate);
  encoder.writeEventMessage(startDate, 'timer', 'start');

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
      // 由步态周期耦合生成，仅做宽松保护，不再硬 clamp 40-70
      record.stanceTimePercent = clamp((s.groundTime / Math.max(1, s.groundTime + s.flightTime)) * 100, 50, 85);
      record.verticalOscillation = s.verticalOscillation;
      // FIT field 85 step_length: scale 10, units mm
      record.stepLength = s.cadence > 0 ? Math.round((s.speed * 600000) / s.cadence) : 0;
    }

    encoder.writeRecordMessage(record);
  }

  encoder.writeEventMessage(sessionEnd, 'timer', 'stop');

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
