import { FitEncoder, toSemicircles, FIT_INVALID_SERIAL } from './fit';
import type { RecordData } from './fit';
import { resolveDevice } from './device';
import { downloadResponse } from './http';
import {
  buildClosedBasePoints,
  hasAutoClosure,
  offsetPointMeters,
  haversineDistance,
  deriveAltitudeFlags,
  type AltitudeFlags,
} from './elevation';
import type { SensorOptions } from './sensor-options';

export const MAX_POINTS = 10000;
export const MAX_EXPANDED_POINTS = 50000;
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
// 留 1 秒缓冲，避免边界值 round 后恰好等于 uint32 上限导致溢出
const FIT_ELAPSED_SAFETY_MARGIN_MS = 1000;

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
  includeAltitude?: boolean;
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
  /** 浏览器端获取的真实海拔数组；null 表示该点回退模拟 */
  altitudes?: Array<number | null> | null;
  /** 前端把最近一次 /api/preview 响应原样回传；服务端校验通过后直接复用样本，跳过全量重算 */
  preview?: PreviewSnapshot | null;
}

export type { SensorOptions };
export { FitEncoder, toSemicircles, resolveDevice, downloadResponse };
export type { RecordData, AltitudeFlags };

// ==================== 通用工具 ====================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 把不确定输入（string/number/null/undefined）安全转为 number；不满足条件时回退 default */
function safeNumber(
  v: unknown,
  options: { default: number; min?: number; max?: number; positive?: boolean }
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return options.default;
  const { min, max, positive } = options;
  if (positive && n <= 0) return options.default;
  if (min !== undefined && n < min) return options.default;
  if (max !== undefined && n > max) return options.default;
  return n;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.floor(n)));
}

function computeCalories(weightKg: number, distanceM: number, paceSecPerKm: number): number {
  const distanceKm = distanceM / 1000;
  const metFactor = 0.9 + (1000 / paceSecPerKm) * 0.25;
  return Math.round(weightKg * distanceKm * metFactor);
}

// ==================== 仿真数据生成 ====================

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

// Box-Muller：高斯噪声替代均匀白噪声
// 注：spare 缓存为模块全局。并发请求间会共享这个状态，但两半样本仍各自服从 N(0,1)，
// 不会改变分布特性；这只是一个非常轻微的时序耦合。
let gaussSpare: number | null = null;
function randn(): number {
  if (gaussSpare != null) {
    const v = gaussSpare;
    gaussSpare = null;
    return v;
  }
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const mag = Math.sqrt(-2.0 * Math.log(u));
  gaussSpare = mag * Math.sin(2.0 * Math.PI * v);
  return mag * Math.cos(2.0 * Math.PI * v);
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

// 一阶自回归：相邻点相关，比白噪声更接近真实节拍/功率波动
function arStep(prev: number, target: number, rate: number, noiseSigma: number, min: number, max: number): number {
  return Math.round(clamp(prev * (1 - rate) + target * rate + randn() * noiseSigma, min, max));
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
  const target = basePower + (cadence - 170) * 0.3 + athlete.powerBias;
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
  const cmValue = clamp(base + (cadence - 170) * -0.02 + athlete.voBias + randn() * 0.6, 5.5, 13);
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
        result[k] = before + (after - before) * ((k - i + 1) / span);
      }
    }
    i = j;
  }
  return result;
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
        return repFrac < fastFrac ? { factor: 1.12, hrBoost: 0.16 } : { factor: 0.88, hrBoost: -0.14 };
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

  const effectiveAltitudes = altitudes && altitudes.length === n ? interpolateNulls(altitudes) : null;

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
      intensityTarget = 0.45 + 0.35 * (frac / 0.1);
    } else if (frac < 0.85) {
      const f = (frac - 0.1) / 0.75;
      intensityTarget = 0.78 + 0.06 * Math.sin(f * Math.PI * 4);
    } else {
      intensityTarget = 0.82 + 0.15 * ((frac - 0.85) / 0.15);
    }

    const intensity = Math.min(1, Math.max(0,
      0.7 * intensityTarget
      + 0.3 * Math.min(1, Math.max(0.3, speedRaw / (avgSpeedTarget || 1e-6)))
      + hrBoost
    ));
    // cardiac drift：随运动时间缓慢上漂，最大 +5bpm，更接近真实长时间运动
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

    // 呼吸性窦性心律不齐：双频叠加 + 高斯噪声
    breathingWavePhase += 0.12 + 0.08 * intensity;
    const breathingWave =
      (Math.sin(breathingWavePhase) + 0.35 * Math.sin(breathingWavePhase * 0.37 + 1.3))
      * (2.2 + 1.6 * intensity);
    const hrNoise = randn() * (1.2 + 1.5 * intensity);

    hrValues[i] = Math.round(clamp(currentHr + breathingWave + hrNoise, hrRestVal - 5, hrMaxVal));
    cadenceValues[i] = generateCadenceAR(prevCadence, speedRaw, targetAvgCadence, isWalking, athlete);
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
    if (i > 0) t += segDurationsRaw[i - 1] * scale;
    const frac = distances[i] / totalDist;
    const realAlt = effectiveAltitudes ? effectiveAltitudes[i] : null;
    const altitude = realAlt != null && Number.isFinite(realAlt) ? realAlt : simulatedAltitude(frac, athlete);
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

  const totalDurationSec = samples.length ? samples[samples.length - 1].timeSec : totalDurationEstimate;
  return { samples, totalDurationSec };
}

// ==================== 统计 ====================

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
    else totalDescent += -diff;
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
    (totalDurationSec / 60) * ((avgHrFloat - hrRestVal) / Math.max(1, hrMaxVal - hrRestVal)) * 10
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

// ==================== 校验 / 解析（两条入口路径共享） ====================

function isFinitePoint(p: unknown): p is RoutePoint {
  if (!p || typeof p !== 'object') return false;
  const { lat, lng } = p as RoutePoint;
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** 轨迹点校验（全量与快照路径共用），错误信息与旧实现一致 */
export function validateRoutePoints(points: unknown): { points: RoutePoint[] } | { error: string } {
  if (!Array.isArray(points) || points.length < 2) {
    return { error: '缺少参数：需要 startTime、至少两个轨迹点 points' };
  }
  if (points.length > MAX_POINTS) {
    return { error: `轨迹点数量超过上限 (${MAX_POINTS})` };
  }
  for (let i = 0; i < points.length; i++) {
    if (!isFinitePoint(points[i])) {
      return { error: `第 ${i + 1} 个轨迹点坐标无效（纬度 -90~90，经度 -180~180）` };
    }
  }
  return { points: points as RoutePoint[] };
}

/** 子运动解析（全量与快照路径共用） */
export function resolveSubSport(body: RequestBody, sportType: 'running' | 'walking'): string | number {
  const { fitSubSport, customSubSport } = body || {};
  if (customSubSport !== undefined && customSubSport !== null && String(customSubSport).trim() !== '') {
    const n = Number(customSubSport);
    if (Number.isFinite(n)) return clampByte(n);
  }
  if (sportType === 'walking') {
    if (fitSubSport === 'indoorWalking' || fitSubSport === 'indoor_walking') return 'indoorWalking';
    if (fitSubSport === 'casualWalking' || fitSubSport === 'casual_walking') return 'casualWalking';
    return 'generic';
  }
  if (typeof fitSubSport === 'number' && Number.isFinite(fitSubSport)) return clampByte(fitSubSport);
  if (typeof fitSubSport === 'string' && fitSubSport.trim()) return fitSubSport.trim();
  return 'generic';
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

/** 基础参数解析与钳制（全量与快照路径共用） */
export function parseRequestParams(body: RequestBody): { error: string } | ParsedRequestParams {
  const {
    startTime, paceSecondsPerKm, hrRest, hrMax, lapCount, variantIndex,
    weightKg, powerFactor, gpsDrift, avgCadence,
    sportType, sportName, deviceType, elapsedExtraSeconds,
  } = body || {};

  if (!startTime) return { error: '缺少参数：需要 startTime、至少两个轨迹点 points' };
  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) return { error: 'startTime 格式不正确' };

  const resolvedSportType: 'running' | 'walking' = sportType === 'walking' ? 'walking' : 'running';
  const isWalking = resolvedSportType === 'walking';

  const weight = safeNumber(weightKg, { default: DEFAULT_WEIGHT_KG, min: MIN_WEIGHT_KG, max: MAX_WEIGHT_KG });
  const powerRaw = safeNumber(powerFactor, { default: DEFAULT_POWER_FACTOR, positive: true });
  const power = Math.min(MAX_POWER_FACTOR, powerRaw);
  const drift = clamp(safeNumber(gpsDrift, { default: 0 }), 0, MAX_GPS_DRIFT_METERS);
  const targetAvgCadence = safeNumber(avgCadence, {
    default: isWalking ? DEFAULT_WALK_CADENCE : DEFAULT_AVG_CADENCE,
  });
  const pace = safeNumber(paceSecondsPerKm, {
    default: isWalking ? DEFAULT_WALK_PACE_SEC_PER_KM : DEFAULT_PACE_SEC_PER_KM,
    min: 0,
    max: 2000,
    positive: true,
  });
  const hrMaxVal = safeNumber(hrMax, { default: DEFAULT_HR_MAX, min: 100, max: 220 });
  let hrRestVal = safeNumber(hrRest, { default: DEFAULT_HR_REST, min: MIN_HR_REST, max: MAX_HR_REST });
  if (hrRestVal >= hrMaxVal) hrRestVal = Math.max(MIN_HR_REST, hrMaxVal - 20);
  const laps = safeNumber(lapCount, { default: 1, positive: true });
  const variant = safeNumber(variantIndex, { default: 1, positive: true });
  const elapsedExtra = Math.min(
    MAX_ELAPSED_EXTRA_SECONDS,
    Math.floor(safeNumber(elapsedExtraSeconds, { default: 0 }))
  );

  const resolvedSportName = typeof sportName === 'string' && sportName.trim()
    ? sportName.trim()
    : (isWalking ? '健走' : '跑步');

  const subSport = resolveSubSport(body || {}, resolvedSportType);
  const device = resolveDevice(deviceType);

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

// ==================== 预览快照 ====================

/** 预览响应快照（前端把 /api/preview 的响应原样回传，服务端校验后直接复用） */
export interface PreviewSnapshot {
  totalDistanceMeters: number;
  totalDurationSec: number;
  calories: number;
  samples: SampleData[];
}

const SAMPLE_NUMERIC_FIELDS: ReadonlyArray<keyof SampleData> = [
  'timeSec', 'distance', 'speed', 'heartRate', 'cadence', 'power',
  'groundTime', 'flightTime', 'verticalOscillation', 'lat', 'lng', 'altitude',
];

function validateSnapshotSample(s: unknown, index: number, prev: { sec: number; dist: number }): string | null {
  if (!s || typeof s !== 'object') return `预览快照第 ${index + 1} 个样本无效`;
  for (const key of SAMPLE_NUMERIC_FIELDS) {
    const v = (s as SampleData)[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `预览快照第 ${index + 1} 个样本数值无效`;
  }
  const sm = s as SampleData;
  if (sm.lat < -90 || sm.lat > 90 || sm.lng < -180 || sm.lng > 180) {
    return `预览快照第 ${index + 1} 个样本坐标越界`;
  }
  if (sm.timeSec < 0 || sm.distance < 0 || sm.speed < 0
      || sm.timeSec < prev.sec || sm.distance < prev.dist) {
    return `预览快照第 ${index + 1} 个样本时间/距离未单调递增`;
  }
  return null;
}

function isValidSnapshotStats(s: PreviewSnapshot): boolean {
  return Number.isFinite(s.totalDistanceMeters) && s.totalDistanceMeters > 0
    && Number.isFinite(s.totalDurationSec) && s.totalDurationSec > 0
    && Number.isFinite(s.calories) && s.calories >= 0;
}

/**
 * 用预览快照重建 ProcessedRoute：跳过轨迹展开与 computeSamples。
 * 任何校验失败都返回 { error }，调用方应回退到全量 processRouteRequest。
 */
export function buildSyntheticProcessedRoute(body: RequestBody): { error: string } | ProcessedRoute {
  const snap = body?.preview;
  if (!snap) return { error: '缺少预览快照 preview' };
  if (!Array.isArray(snap.samples) || snap.samples.length < 2 || snap.samples.length > MAX_EXPANDED_POINTS) {
    return { error: '预览快照无效：samples 数量缺失或超限' };
  }
  if (!isValidSnapshotStats(snap)) return { error: '预览快照无效：总计数值非法' };

  const parsed = parseRequestParams(body);
  if ('error' in parsed) return parsed;
  const pointCheck = validateRoutePoints(body?.points);
  if ('error' in pointCheck) return { error: pointCheck.error };

  const prev = { sec: -1, dist: -1 };
  for (let i = 0; i < snap.samples.length; i++) {
    const err = validateSnapshotSample(snap.samples[i], i, prev);
    if (err) return { error: err };
    prev.sec = snap.samples[i].timeSec;
    prev.dist = snap.samples[i].distance;
  }

  // 总量与样本末点一致性校验（≤1% 容差），防止会话汇总与逐点记录互相矛盾
  const lastSample = snap.samples[snap.samples.length - 1];
  if (Math.abs(lastSample.distance - snap.totalDistanceMeters) > Math.max(1, snap.totalDistanceMeters * 0.01)
      || Math.abs(lastSample.timeSec - snap.totalDurationSec) > Math.max(1, snap.totalDurationSec * 0.01)) {
    return { error: '预览快照无效：总距离/总时长与样本末点不一致' };
  }

  const stats = computeSampleStats(snap.samples, parsed.hrRestVal, parsed.hrMaxVal, snap.totalDurationSec);
  const altitudeFlags = deriveAltitudeFlags(body?.altitudes, pointCheck.points.length, pointCheck.points.length);
  return buildProcessedRoute(parsed, {
    totalDist: snap.totalDistanceMeters,
    totalDurationSec: snap.totalDurationSec,
    calories: Math.round(snap.calories),
    samples: snap.samples,
    stats,
    altitudeFlags,
  });
}

export function processRouteRequest(body: RequestBody): { error: string } | ProcessedRoute {
  const {
    points, workoutMode, intervalReps, intervalFastKm,
    altitudes: bodyAltitudes,
  } = body || {};

  const pointCheck = validateRoutePoints(points);
  if ('error' in pointCheck) return pointCheck;
  const validPoints = pointCheck.points;

  const parsed = parseRequestParams(body);
  if ('error' in parsed) return parsed;

  const basePoints = buildClosedBasePoints(validPoints);
  const altitudeFlags = deriveAltitudeFlags(bodyAltitudes, validPoints.length, basePoints.length);
  const usedLaps = parsed.laps > 0 ? parsed.laps : 1;
  const shouldApplyDrift = parsed.drift > 0;
  const fullLaps = Math.floor(usedLaps);
  const partialLap = usedLaps - fullLaps;

  const expandedPointCount = Math.ceil(basePoints.length * fullLaps) + Math.floor(basePoints.length * partialLap);
  if (expandedPointCount > MAX_EXPANDED_POINTS) {
    return { error: `展开后的轨迹点数量超过上限 (${MAX_EXPANDED_POINTS})，请减少圈数或轨迹点` };
  }

  const allPoints: RoutePoint[] = [];
  const expandedAltitudes: Array<number | null> | null = altitudeFlags.baseAltitudes ? [] : null;
  const lastIndex = basePoints.length - 1;
  const autoClosure = hasAutoClosure(basePoints);
  const isClosureIdx = (j: number) => autoClosure && (j === 0 || j === lastIndex);

  const pushLap = (count: number) => {
    let offsetLatMeters = 0;
    let offsetLonMeters = 0;
    if (shouldApplyDrift) {
      const angle = Math.random() * Math.PI * 2;
      offsetLatMeters = parsed.drift * Math.cos(angle);
      offsetLonMeters = parsed.drift * Math.sin(angle);
    }
    for (let j = 0; j < count; j++) {
      const p = basePoints[j];
      const applyDrift = shouldApplyDrift && !isClosureIdx(j);
      allPoints.push(applyDrift ? offsetPointMeters(p, offsetLatMeters, offsetLonMeters) : p);
      if (expandedAltitudes) expandedAltitudes.push(altitudeFlags.baseAltitudes![j]);
    }
  };

  for (let i = 0; i < fullLaps; i++) pushLap(basePoints.length);
  if (partialLap > 0) pushLap(Math.floor(basePoints.length * partialLap));

  if (allPoints.length < 2) {
    return { error: '圈数过小导致展开后轨迹点不足，请增加圈数或轨迹点' };
  }

  const distances = [0];
  let totalDist = 0;
  for (let i = 1; i < allPoints.length; i++) {
    totalDist += haversineDistance(allPoints[i - 1].lat, allPoints[i - 1].lng, allPoints[i].lat, allPoints[i].lng);
    distances.push(totalDist);
  }
  if (!Number.isFinite(totalDist) || totalDist === 0) {
    return { error: '轨迹距离为 0，请绘制更长的路线' };
  }

  // FIT 的 total_elapsed_time / total_timer_time 为 uint32 毫秒（上限约 49.7 天）。
  // 训练总时长为 totalDist/1000 × pace + elapsedExtra，超限前直接拒绝，避免 uint32 静默截断。
  const estimatedFitMs = Math.round((((totalDist / 1000) * parsed.pace) + parsed.elapsedExtra) * 1000);
  if (estimatedFitMs > MAX_FIT_ELAPSED_MS - FIT_ELAPSED_SAFETY_MARGIN_MS) {
    return { error: '训练总时长超出 FIT 上限（约 49.7 天），请缩短路线、减少圈数或提高配速' };
  }

  const calories = computeCalories(parsed.weight, totalDist, parsed.pace);
  const { samples, totalDurationSec } = computeSamples(
    allPoints, distances, totalDist, parsed.pace, parsed.hrRestVal, parsed.hrMaxVal,
    parsed.targetAvgCadence, parsed.weight, parsed.power,
    expandedAltitudes, workoutMode === 'steady' ? undefined : workoutMode, intervalReps, intervalFastKm,
    parsed.sportType === 'walking',
  );
  const stats = computeSampleStats(samples, parsed.hrRestVal, parsed.hrMaxVal, totalDurationSec);

  return buildProcessedRoute(parsed, {
    totalDist,
    totalDurationSec,
    calories,
    samples,
    stats,
    altitudeFlags,
  });
}

/** 构造 ProcessedRoute：消除 processRouteRequest / buildSyntheticProcessedRoute 之间的重复字面量 */
function buildProcessedRoute(
  parsed: ParsedRequestParams,
  computed: {
    totalDist: number;
    totalDurationSec: number;
    calories: number;
    samples: SampleData[];
    stats: SampleStats;
    altitudeFlags: AltitudeFlags;
  }
): ProcessedRoute {
  return {
    startDate: parsed.startDate,
    totalDist: computed.totalDist,
    pace: parsed.pace,
    hrRestVal: parsed.hrRestVal,
    hrMaxVal: parsed.hrMaxVal,
    targetAvgCadence: parsed.targetAvgCadence,
    weight: parsed.weight,
    power: parsed.power,
    calories: computed.calories,
    laps: parsed.laps,
    variant: parsed.variant,
    samples: computed.samples,
    totalDurationSec: computed.totalDurationSec,
    totalAscent: computed.stats.totalAscent,
    totalDescent: computed.stats.totalDescent,
    avgStrideLength: computed.stats.avgStrideLength,
    sportType: parsed.sportType,
    sportName: parsed.sportName,
    subSport: parsed.subSport,
    deviceManufacturer: parsed.deviceManufacturer,
    deviceProduct: parsed.deviceProduct,
    elapsedExtraSeconds: parsed.elapsedExtra,
    trainingLoad: computed.stats.trainingLoad,
    maxElevation: computed.stats.maxElevation,
    minElevation: computed.stats.minElevation,
    usedClientAltitudes: computed.altitudeFlags.used,
    usedClientAltitudesPartial: computed.altitudeFlags.partial,
  };
}

export function applySensorOptions(samples: SampleData[], options?: Partial<SensorOptions>): SampleData[] {
  const hr = options?.includeHeartRate !== false;
  const power = options?.includePower !== false;
  const cadence = options?.includeCadence !== false;
  const gait = options?.includeGaitData !== false;
  if (hr && power && cadence && gait) return samples;
  return samples.map((s) => ({
    ...s,
    heartRate: hr ? s.heartRate : 0,
    power: power ? s.power : 0,
    cadence: cadence ? s.cadence : 0,
    groundTime: gait ? s.groundTime : 0,
    flightTime: gait ? s.flightTime : 0,
    verticalOscillation: gait ? s.verticalOscillation : 0,
  }));
}

/** 文件名前缀：步行 walk_ / 跑步 run_ */
export function filenamePrefix(sportType: 'running' | 'walking'): string {
  return sportType === 'walking' ? 'walk_' : 'run_';
}

/**
 * 按厂商生成更自然的 32 位序列号。
 * Garmin 常见 10 位、3 开头；开发/未知厂商用随机高位，避免清一色 0x1xxxxxxx 特征。
 */
const GARMIN_SERIAL_BASE = 3000000000;
const DEV_SERIAL_BASE = 0x10000000;
const DEV_SERIAL_SPAN = 0x2fffffff;
const UNKNOWN_SERIAL_BASE = 100000000;
const UNKNOWN_SERIAL_SPAN = 1899999999;

function generateSerialNumber(manufacturerId: number | undefined): number {
  if (manufacturerId === 1) return GARMIN_SERIAL_BASE + Math.floor(Math.random() * 999999999);
  if (manufacturerId === 255) return DEV_SERIAL_BASE + Math.floor(Math.random() * DEV_SERIAL_SPAN);
  return UNKNOWN_SERIAL_BASE + Math.floor(Math.random() * UNKNOWN_SERIAL_SPAN);
}

export function generateFitFile(
  result: ProcessedRoute,
  sensorOptions?: Partial<SensorOptions>,
  altitudes?: number[] | null,
  elevationInfo?: { source: string; status: string } | null
): Response {
  const {
    startDate, totalDist, totalDurationSec, hrRestVal, hrMaxVal, variant, samples, calories,
    sportType, subSport, deviceManufacturer, deviceProduct, elapsedExtraSeconds,
  } = result;
  const fitSportName = sportType === 'walking' ? 'walking' : 'running';
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
  if (includeAltitude && altitudes && altitudes.length === samples.length) {
    sessionSamples = samples.map((s, i) => ({ ...s, altitude: altitudes[i] }));
  }
  const elevationSummary = computeSampleStats(sessionSamples, hrRestVal, hrMaxVal, totalDurationSec);

  const sessionEnd = new Date(startDate.getTime() + sessionElapsed * 1000);
  const serialNumber = deviceManufacturer !== undefined ? generateSerialNumber(deviceManufacturer) : 1;

  const encoder = new FitEncoder({
    type: 'activity',
    manufacturer: deviceManufacturer ?? 'development',
    product: deviceProduct ?? 1,
    serialNumber: serialNumber === 1 ? FIT_INVALID_SERIAL : serialNumber,
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
      // stanceTime 传入毫秒值（fit.ts 会按 scale 10 编码为 ms × 10）
      record.stanceTime = Math.round(s.groundTime);
      record.stanceTimePercent = clamp(
        (s.groundTime / Math.max(1, s.groundTime + s.flightTime)) * 100,
        50, 85
      );
      record.verticalOscillation = s.verticalOscillation;
      // FIT field 85 step_length: scale 10, units mm
      record.stepLength = s.cadence > 0 ? Math.round((s.speed * 600000) / s.cadence) : 0;
    }
    encoder.writeRecordMessage(record);
  }

  encoder.writeEventMessage(sessionEnd, 'timer', 'stop');

  const lapData = {
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
  };
  encoder.writeLapMessage(lapData, includeHeartRate, includePower, includeCadence);
  encoder.writeSessionMessage({
    ...lapData,
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
  const extraHeaders: Record<string, string> = {};
  if (elevationInfo) {
    extraHeaders['X-Elevation-Source'] = elevationInfo.source;
    extraHeaders['X-Elevation-Status'] = elevationInfo.status;
  }
  return downloadResponse(
    uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength) as ArrayBuffer,
    'application/vnd.ant.fit',
    `${filenamePrefix(sportType)}${variant}.fit`,
    extraHeaders
  );
}
