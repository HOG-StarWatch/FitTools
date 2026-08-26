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
export const MAX_GPS_DRIFT_METERS = 1000;       // GPS 漂移幅度钳制上限（米）
export const MAX_ELAPSED_EXTRA_SECONDS = 604800; // 训练时长额外秒数上限（7 天）
const MAX_FIT_ELAPSED_MS = 0xffffffff;          // FIT uint32 毫秒上限，约 49.7 天

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
  /** 前端把最近一次 /api/preview 响应原样回传；服务端校验通过后直接复用样本，跳过全量重算 */
  preview?: PreviewSnapshot | null;
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

function buildClosedBasePoints(points: RoutePoint[] | undefined): RoutePoint[] {
  if (!points || points.length < 2) return points || [];
  const first = points[0];
  const last = points[points.length - 1];
  const d = haversineDistance(first.lat, first.lng, last.lat, last.lng);
  if (d < ROUTE_CLOSURE_THRESHOLD_METERS) return points;
  return [...points, { lat: first.lat, lng: first.lng }];
}

function hasAutoClosure(basePoints: RoutePoint[]): boolean {
  if (basePoints.length < 2) return false;
  const first = basePoints[0];
  const last = basePoints[basePoints.length - 1];
  return last.lat === first.lat && last.lng === first.lng;
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
 * 模拟海拔：多频叠加 + 低频漂移 + 高斯噪声，避免单一正弦的规整特征。
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

/**
 * 统计统一入口：海拔升降/极值、心率/步频/功率均值（跳过被传感器开关清零的 0 值）、
 * 平均步幅与 TRIMP 训练负荷。Preview、Generate（全量或快照）、FIT 会话汇总共用，
 * 取代原先多份重复实现，保证口径一致。
 */
export interface SampleStats {
  totalAscent: number;
  totalDescent: number;
  maxElevation: number;
  minElevation: number;
  avgHeartRate: number;
  avgCadence: number;
  avgPower: number;
  avgStrideLength: number;
  trainingLoad: number;
}

export function computeSampleStats(
  samples: SampleData[],
  hrRestVal: number,
  hrMaxVal: number,
  totalDurationSec: number
): SampleStats {
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
    avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : 0,
    avgCadence: cadCount > 0 ? Math.round(cadSum / cadCount) : 0,
    avgPower: powerCount > 0 ? Math.round(powerSum / powerCount) : 0,
    avgStrideLength: strideCount > 0 ? strideSum / strideCount : 0,
    trainingLoad,
  };
}

/** 轨迹点校验（全量与快照路径共用），错误信息与旧实现一致 */
function validateRoutePoints(points: RoutePoint[] | undefined): string | null {
  if (!Array.isArray(points) || points.length < 2) {
    return '缺少参数：需要 startTime、至少两个轨迹点 points';
  }
  if (points.length > MAX_POINTS) {
    return `轨迹点数量超过上限 (${MAX_POINTS})`;
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || typeof p !== 'object' ||
        typeof p.lat !== 'number' || typeof p.lng !== 'number' ||
        !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
        p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      return `第 ${i + 1} 个轨迹点坐标无效（纬度 -90~90，经度 -180~180）`;
    }
  }
  return null;
}

/** 子运动解析（全量与快照路径共用） */
export function resolveSubSport(body: RequestBody, sportType: 'running' | 'walking'): string | number {
  const { fitSubSport, customSubSport } = body || {};
  const customSub = customSubSport !== undefined && customSubSport !== null && String(customSubSport).trim() !== ''
    ? Number(customSubSport) : undefined;
  let subSport: string | number = 'generic';
  if (sportType === 'walking') {
    subSport = fitSubSport === 'indoorWalking' ? 'indoorWalking'
      : fitSubSport === 'casualWalking' ? 'casualWalking' : 'generic';
  } else if (typeof fitSubSport === 'number' && Number.isFinite(fitSubSport)) {
    subSport = Math.max(0, Math.min(255, Math.floor(fitSubSport)));
  } else if (typeof fitSubSport === 'string' && fitSubSport.trim()) {
    subSport = fitSubSport.trim();
  }
  if (customSub !== undefined && Number.isFinite(customSub)) {
    subSport = Math.max(0, Math.min(255, Math.floor(customSub)));
  }
  return subSport;
}

export interface ParsedRequestParams {
  startDate: Date;
  sportType: 'running' | 'walking';
  sportName: string;
  subSport: string | number;
  weight: number;
  power: number;
  drift: number;
  targetAvgCadence: number;
  pace: number;
  hrMaxVal: number;
  hrRestVal: number;
  laps: number;
  variant: number;
  elapsedExtra: number;
  deviceManufacturer?: number;
  deviceProduct?: number;
}

/** 基础参数解析与钳制（全量与快照路径共用），语义与原 processRouteRequest 完全一致 */
export function parseRequestParams(body: RequestBody): { error: string } | ParsedRequestParams {
  const {
    startTime, paceSecondsPerKm, hrRest, hrMax, lapCount, variantIndex,
    weightKg, powerFactor, gpsDrift, avgCadence,
    sportType, sportName, deviceType, elapsedExtraSeconds,
  } = body || {};

  if (!startTime) return { error: '缺少参数：需要 startTime、至少两个轨迹点 points' };
  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) return { error: 'startTime 格式不正确' };

  const weight = (Number.isFinite(Number(weightKg)) && (weightKg ?? 0) >= MIN_WEIGHT_KG && (weightKg ?? 0) <= MAX_WEIGHT_KG)
    ? Number(weightKg) : DEFAULT_WEIGHT_KG;
  const power = (Number.isFinite(Number(powerFactor)) && (powerFactor ?? 0) > 0)
    ? Math.min(MAX_POWER_FACTOR, Number(powerFactor)) : DEFAULT_POWER_FACTOR;
  const drift = Number.isFinite(Number(gpsDrift)) ? clamp(Number(gpsDrift), 0, MAX_GPS_DRIFT_METERS) : 0;
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

  const subSport = resolveSubSport(body, resolvedSportType);
  const device = resolveDevice(deviceType);
  const elapsedExtra = Number.isFinite(Number(elapsedExtraSeconds)) && Number(elapsedExtraSeconds) >= 0
    ? Math.min(MAX_ELAPSED_EXTRA_SECONDS, Math.floor(Number(elapsedExtraSeconds))) : 0;

  return {
    startDate,
    sportType: resolvedSportType,
    sportName: resolvedSportName,
    subSport,
    weight,
    power,
    drift,
    targetAvgCadence,
    pace,
    hrMaxVal,
    hrRestVal,
    laps,
    variant,
    elapsedExtra,
    deviceManufacturer: device?.manufacturer,
    deviceProduct: device?.product,
  };
}

/** 预览响应快照（前端把 /api/preview 的响应原样回传，服务端校验后直接复用，跳过全量重算） */
export interface PreviewSnapshot {
  totalDistanceMeters: number;
  totalDurationSec: number;
  calories: number;
  samples: SampleData[];
}

/**
 * 用预览快照重建 ProcessedRoute：不做轨迹展开 / computeSamples（省去大头计算）。
 * 任何校验失败都返回 { error }，调用方应回退到全量 processRouteRequest。
 */
export function buildSyntheticProcessedRoute(body: RequestBody): { error: string } | ProcessedRoute {
  const snap = body?.preview;
  if (!snap) return { error: '缺少预览快照 preview' };
  if (!Array.isArray(snap.samples) || snap.samples.length < 2 || snap.samples.length > MAX_EXPANDED_POINTS) {
    return { error: '预览快照无效：samples 数量缺失或超限' };
  }
  if (!Number.isFinite(snap.totalDistanceMeters) || snap.totalDistanceMeters <= 0 ||
      !Number.isFinite(snap.totalDurationSec) || snap.totalDurationSec <= 0 ||
      !Number.isFinite(snap.calories) || snap.calories < 0) {
    return { error: '预览快照无效：总计数值非法' };
  }

  const parsed = parseRequestParams(body);
  if ('error' in parsed) return parsed;
  const pointError = validateRoutePoints(body?.points);
  if (pointError) return { error: pointError };

  let prevSec = -1;
  let prevDist = -1;
  for (let i = 0; i < snap.samples.length; i++) {
    const s = snap.samples[i];
    if (!s || typeof s !== 'object') return { error: `预览快照第 ${i + 1} 个样本无效` };
    const nums = [s.timeSec, s.distance, s.speed, s.heartRate, s.cadence, s.power, s.groundTime, s.flightTime, s.verticalOscillation, s.lat, s.lng, s.altitude];
    for (const v of nums) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `预览快照第 ${i + 1} 个样本数值无效` };
    }
    if (s.lat < -90 || s.lat > 90 || s.lng < -180 || s.lng > 180) return { error: `预览快照第 ${i + 1} 个样本坐标越界` };
    if (s.timeSec < 0 || s.distance < 0 || s.speed < 0 || s.timeSec < prevSec || s.distance < prevDist) {
      return { error: `预览快照第 ${i + 1} 个样本时间/距离未单调递增` };
    }
    prevSec = s.timeSec;
    prevDist = s.distance;
  }

  const sampleStats = computeSampleStats(snap.samples, parsed.hrRestVal, parsed.hrMaxVal, snap.totalDurationSec);

  // 总量与样本末点一致性校验（≤1% 容差），防止会话汇总与逐点记录互相矛盾
  const lastSample = snap.samples[snap.samples.length - 1];
  if (Math.abs(lastSample.distance - snap.totalDistanceMeters) > Math.max(1, snap.totalDistanceMeters * 0.01) ||
      Math.abs(lastSample.timeSec - snap.totalDurationSec) > Math.max(1, snap.totalDurationSec * 0.01)) {
    return { error: '预览快照无效：总距离/总时长与样本末点不一致' };
  }

  // 海拔标志仅用于生成提示文案，这里只做轻量解析（不做全量计算）
  const points = body?.points || [];
  const basePoints = buildClosedBasePoints(points);
  const baseAltitudes = resolveBaseAltitudes(body?.altitudes, points.length, basePoints.length);
  const validAltitudeCount = baseAltitudes ? baseAltitudes.filter((v) => v != null && Number.isFinite(v)).length : 0;
  const usedClientAltitudes = baseAltitudes != null && validAltitudeCount > 0;
  const hasPartialAltitudes = usedClientAltitudes && validAltitudeCount < baseAltitudes.length;

  return {
    startDate: parsed.startDate,
    totalDist: snap.totalDistanceMeters,
    pace: parsed.pace,
    hrRestVal: parsed.hrRestVal,
    hrMaxVal: parsed.hrMaxVal,
    targetAvgCadence: parsed.targetAvgCadence,
    weight: parsed.weight,
    power: parsed.power,
    calories: Math.round(snap.calories),
    laps: parsed.laps,
    variant: parsed.variant,
    samples: snap.samples,
    totalDurationSec: snap.totalDurationSec,
    totalAscent: sampleStats.totalAscent,
    totalDescent: sampleStats.totalDescent,
    avgStrideLength: sampleStats.avgStrideLength,
    sportType: parsed.sportType,
    sportName: parsed.sportName,
    subSport: parsed.subSport,
    deviceManufacturer: parsed.deviceManufacturer,
    deviceProduct: parsed.deviceProduct,
    elapsedExtraSeconds: parsed.elapsedExtra,
    trainingLoad: sampleStats.trainingLoad,
    maxElevation: sampleStats.maxElevation,
    minElevation: sampleStats.minElevation,
    usedClientAltitudes,
    usedClientAltitudesPartial: hasPartialAltitudes,
  };
}

export function processRouteRequest(body: RequestBody): { error: string } | ProcessedRoute {
  const {
    points, workoutMode, intervalReps, intervalFastKm,
    altitudes: bodyAltitudes,
  } = body || {};

  const pointError = validateRoutePoints(points);
  if (pointError) return { error: pointError };
  // 通过校验后 points 必为有效数组（上面已确认 Array.isArray 且长度 ≥ 2）
  const validPoints = points as RoutePoint[];

  const parsed = parseRequestParams(body);
  if ('error' in parsed) return parsed;

  const {
    startDate, sportType: resolvedSportType, sportName: resolvedSportName, subSport,
    weight, power, drift, targetAvgCadence, pace, hrMaxVal, hrRestVal, laps, variant,
    elapsedExtra, deviceManufacturer, deviceProduct,
  } = parsed;

  const basePoints = buildClosedBasePoints(validPoints);
  const baseAltitudes = resolveBaseAltitudes(bodyAltitudes, validPoints.length, basePoints.length);
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

  const lastIndex = basePoints.length - 1;
  const autoClosure = hasAutoClosure(basePoints);
  const isClosureIdx = (j: number) => autoClosure && (j === 0 || j === lastIndex);

  for (let i = 0; i < fullLaps; i++) {
    let offsetLatMeters = 0;
    let offsetLonMeters = 0;
    if (shouldApplyDrift) {
      const radiusMeters = drift;
      const angle = Math.random() * Math.PI * 2;
      offsetLatMeters = radiusMeters * Math.cos(angle);
      offsetLonMeters = radiusMeters * Math.sin(angle);
    }
    for (let j = 0; j < basePoints.length; j++) {
      const p = basePoints[j];
      const applyDrift = shouldApplyDrift && !isClosureIdx(j);
      allPoints.push(applyDrift ? offsetPointMeters(p, offsetLatMeters, offsetLonMeters) : p);
      if (expandedAltitudes) expandedAltitudes.push(baseAltitudes![j]);
    }
  }

  if (partialLap > 0) {
    let offsetLatMeters = 0;
    let offsetLonMeters = 0;
    if (shouldApplyDrift) {
      const radiusMeters = drift;
      const angle = Math.random() * Math.PI * 2;
      offsetLatMeters = radiusMeters * Math.cos(angle);
      offsetLonMeters = radiusMeters * Math.sin(angle);
    }
    const partialPointsCount = Math.floor(basePoints.length * partialLap);
    for (let j = 0; j < partialPointsCount; j++) {
      const p = basePoints[j];
      const applyDrift = shouldApplyDrift && !isClosureIdx(j);
      allPoints.push(applyDrift ? offsetPointMeters(p, offsetLatMeters, offsetLonMeters) : p);
      if (expandedAltitudes) expandedAltitudes.push(baseAltitudes![j]);
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

  // FIT 的 total_elapsed_time / total_timer_time 为 uint32 毫秒（上限约 49.7 天）。
  // 训练总时长为 totalDist/1000 × pace + elapsedExtra，超限前直接拒绝，避免 uint32 静默截断。
  if (Math.round((((totalDist / 1000) * pace) + elapsedExtra) * 1000) > MAX_FIT_ELAPSED_MS - 1000) {
    return { error: '训练总时长超出 FIT 上限（约 49.7 天），请缩短路线、减少圈数或提高配速' };
  }

  const calories = computeCalories(weight, totalDist, pace);

  const { samples, totalDurationSec } = computeSamples(
    allPoints, distances, totalDist, pace, hrRestVal, hrMaxVal, targetAvgCadence, weight, power,
    expandedAltitudes, workoutMode === 'steady' ? undefined : workoutMode, intervalReps, intervalFastKm,
    resolvedSportType === 'walking',
  );

  const stats = computeSampleStats(samples, hrRestVal, hrMaxVal, totalDurationSec);

  return {
    startDate, totalDist, pace, hrRestVal, hrMaxVal,
    targetAvgCadence, weight, power, calories, laps, variant, samples, totalDurationSec,
    totalAscent: stats.totalAscent, totalDescent: stats.totalDescent, avgStrideLength: stats.avgStrideLength,
    sportType: resolvedSportType,
    sportName: resolvedSportName,
    subSport,
    deviceManufacturer,
    deviceProduct,
    elapsedExtraSeconds: elapsedExtra,
    trainingLoad: stats.trainingLoad,
    maxElevation: stats.maxElevation,
    minElevation: stats.minElevation,
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
 * Garmin 常见 10 位、3 开头；开发/未知厂商用随机高位，避免清一色 0x1xxxxxxx 特征。
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
    startDate, totalDist, totalDurationSec, hrRestVal, hrMaxVal, variant, samples, calories,
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
  const elevationSummary = computeSampleStats(sessionSamples, hrRestVal, hrMaxVal, totalDurationSec);

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
      // stance_time 传入毫秒值即可（fit.ts 会按 scale 10 编码为 ms × 10）
      record.stanceTime = Math.round(s.groundTime);
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
    'Cache-Control': 'no-store',
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
