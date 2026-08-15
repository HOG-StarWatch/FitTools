import type { RoutePoint } from './lib';

export type ElevationSource =
  | 'none'
  | 'off'
  | 'open-elevation'
  | 'opentopodata'
  | 'opentopodata-srtm30m'
  | 'opentopodata-aster30m'
  | 'opentopodata-eudem25m'
  | 'open-meteo';

export interface ElevationConfig {
  enabled: boolean;
  source: ElevationSource;
  baseUrl: string;
  batchSize: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  openTopoBaseUrl: string;
  openTopoDataset: string;
  openTopoBatchSize: number;
  openMeteoBaseUrl: string;
  openMeteoConcurrency: number;
}

export const DEFAULT_ELEVATION_CONFIG: ElevationConfig = {
  enabled: true,
  source: 'open-elevation',
  baseUrl: 'https://api.open-elevation.com',
  batchSize: 200,
  connectTimeoutMs: 3000,
  readTimeoutMs: 5000,
  openTopoBaseUrl: 'https://api.opentopodata.org',
  openTopoDataset: 'srtm90m',
  openTopoBatchSize: 100,
  openMeteoBaseUrl: 'https://api.open-meteo.com',
  openMeteoConcurrency: 8,
};

export const ELEVATION_SOURCES: ElevationSource[] = [
  'none',
  'off',
  'open-elevation',
  'opentopodata',
  'opentopodata-srtm30m',
  'opentopodata-aster30m',
  'opentopodata-eudem25m',
  'open-meteo',
];

export function parseElevationSource(value: unknown): ElevationSource | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  return ELEVATION_SOURCES.includes(v as ElevationSource) ? (v as ElevationSource) : undefined;
}

interface ElevationLocation {
  latitude: number;
  longitude: number;
}

interface ElevationLookupResponse {
  results?: Array<{ latitude: number; longitude: number; elevation: number }>;
}

interface OpenTopoDataResponse {
  results?: Array<{ elevation: number | null; location: { lat: number; lon: number } }>;
}

interface OpenMeteoResponse {
  elevation: number | number[];
}

const SOURCE_NAMES: Record<ElevationSource, string> = {
  'none': '无海拔',
  'off': '模拟',
  'open-elevation': 'Open-Elevation',
  'opentopodata': 'OpenTopoData SRTM90',
  'opentopodata-srtm30m': 'OpenTopoData SRTM30',
  'opentopodata-aster30m': 'OpenTopoData ASTER30',
  'opentopodata-eudem25m': 'OpenTopoData EUDEM25',
  'open-meteo': 'Open-Meteo',
};

export type ElevationStatus = 'live' | 'fallback' | 'off' | 'none';

export interface ElevationFetchResult {
  altitudes: number[] | null;
  source: ElevationSource;
  status: ElevationStatus;
  message: string;
}

function openTopoDatasetFor(source: ElevationSource): string {
  switch (source) {
    case 'opentopodata-srtm30m': return 'srtm30m';
    case 'opentopodata-aster30m': return 'aster30m';
    case 'opentopodata-eudem25m': return 'eudem25m';
    default: return 'srtm90m';
  }
}

function isOpenTopoSource(source: ElevationSource): boolean {
  return source === 'opentopodata' ||
    source === 'opentopodata-srtm30m' ||
    source === 'opentopodata-aster30m' ||
    source === 'opentopodata-eudem25m';
}

const ELEVATION_CONCURRENCY = 8;

interface DedupeJob {
  point: RoutePoint;
  firstIndex: number;
}

/**
 * 按 6 位小数坐标去重，返回唯一坐标任务与每个原始点的首次出现索引。
 */
function dedupePoints(points: RoutePoint[]): { jobs: DedupeJob[]; firstIndexes: number[] } {
  const seen = new Map<string, number>();
  const firstIndexes = new Array<number>(points.length);
  const jobs: DedupeJob[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, i);
      firstIndexes[i] = i;
      jobs.push({ point: p, firstIndex: i });
    } else {
      firstIndexes[i] = first;
    }
  }

  return { jobs, firstIndexes };
}

/**
 * 将唯一坐标任务按 batchSize 分批，并以受限并发执行 fetchBatch。
 */
async function runElevationBatches(
  jobs: DedupeJob[],
  batchSize: number,
  fetchBatch: (batch: DedupeJob[]) => Promise<Array<{ firstIndex: number; elevation: number }>>
): Promise<Map<number, number>> {
  const elevations = new Map<number, number>();
  const concurrency = Math.max(1, ELEVATION_CONCURRENCY);

  for (let start = 0; start < jobs.length; start += batchSize * concurrency) {
    const window = jobs.slice(start, start + batchSize * concurrency);
    const batches: DedupeJob[][] = [];
    for (let b = 0; b < window.length; b += batchSize) {
      batches.push(window.slice(b, b + batchSize));
    }

    const settled = await Promise.all(batches.map(batch => fetchBatch(batch)));
    for (const list of settled) {
      for (const item of list) {
        elevations.set(item.firstIndex, item.elevation);
      }
    }
  }

  return elevations;
}

/**
 * 按配置的海拔源批量查询真实海拔。
 * - none：不写入海拔（altitudes 为 null，状态 none，FIT 中 altitude 字段留空）
 * - off：使用本地模拟海拔
 * - 真实源失败或不可用时 altitudes 为 null（调用方回退到模拟海拔）
 */
export async function fetchAltitudesOrNull(
  points: RoutePoint[],
  config: ElevationConfig
): Promise<ElevationFetchResult> {
  const sourceName = SOURCE_NAMES[config.source];

  if (config.source === 'none') {
    return { altitudes: null, source: config.source, status: 'none', message: '不写入海拔（FIT 海拔字段留空）' };
  }

  if (!config.enabled || config.source === 'off' || !points || points.length === 0) {
    return { altitudes: null, source: config.source, status: 'off', message: '模拟海拔（离线生成）' };
  }

  try {
    let altitudes: number[];
    if (isOpenTopoSource(config.source)) {
      altitudes = await fetchAltitudesOpenTopoData(points, config);
    } else if (config.source === 'open-meteo') {
      altitudes = await fetchAltitudesOpenMeteo(points, config);
    } else {
      altitudes = await fetchAltitudesOpenElevation(points, config);
    }
    return {
      altitudes,
      source: config.source,
      status: 'live',
      message: `已获取真实海拔（${sourceName}，${altitudes.length} 个采样点）`,
    };
  } catch (e) {
    const error = (e as Error).message;
    console.warn(`${sourceName} 请求失败，回退到本地模拟海拔: ${error}`);
    return {
      altitudes: null,
      source: config.source,
      status: 'fallback',
      message: `${sourceName} 获取失败（${error}），已回退模拟海拔`,
    };
  }
}

async function fetchAltitudesOpenElevation(points: RoutePoint[], config: ElevationConfig): Promise<number[]> {
  const { jobs, firstIndexes } = dedupePoints(points);

  const elevations = await runElevationBatches(jobs, config.batchSize, async (batch) => {
    const locations: ElevationLocation[] = batch.map(({ point: p }) => ({
      latitude: p.lat,
      longitude: p.lng,
    }));

    const response = await postJson<ElevationLookupResponse>(
      `${config.baseUrl.replace(/\/$/, '')}/api/v1/lookup`,
      { locations },
      config
    );

    const results = response?.results;
    if (!results || results.length !== batch.length) {
      throw new Error('Open-Elevation 返回数量与请求数量不一致');
    }

    return batch.map((job, i) => ({
      firstIndex: job.firstIndex,
      elevation: results[i].elevation == null ? 0 : results[i].elevation,
    }));
  });

  const altitudes = new Array<number>(points.length).fill(0);
  for (let i = 0; i < points.length; i++) {
    altitudes[i] = elevations.get(firstIndexes[i]) ?? 0;
  }
  return altitudes;
}

async function fetchAltitudesOpenTopoData(points: RoutePoint[], config: ElevationConfig): Promise<number[]> {
  const dataset = config.source === 'opentopodata' ? config.openTopoDataset : openTopoDatasetFor(config.source);
  const { jobs, firstIndexes } = dedupePoints(points);

  const elevations = await runElevationBatches(jobs, config.openTopoBatchSize, async (batch) => {
    const locationsStr = batch.map(({ point: p }) => `${p.lat},${p.lng}`).join('|');

    const response = await postJson<OpenTopoDataResponse>(
      `${config.openTopoBaseUrl.replace(/\/$/, '')}/v1/${dataset}`,
      { locations: locationsStr },
      config
    );

    const results = response?.results;
    if (!results || results.length !== batch.length) {
      throw new Error('OpenTopoData 返回数量与请求数量不一致');
    }

    return batch.map((job, i) => ({
      firstIndex: job.firstIndex,
      elevation: results[i].elevation == null ? 0 : results[i].elevation,
    }));
  });

  const altitudes = new Array<number>(points.length).fill(0);
  for (let i = 0; i < points.length; i++) {
    altitudes[i] = elevations.get(firstIndexes[i]) ?? 0;
  }
  return altitudes;
}

async function fetchAltitudesOpenMeteo(points: RoutePoint[], config: ElevationConfig): Promise<number[]> {
  const altitudes: number[] = new Array(points.length).fill(0);
  const seen = new Map<string, number>();
  const jobs: Array<{ key: string; index: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    if (seen.has(key)) continue;
    seen.set(key, i);
    jobs.push({ key, index: i });
  }

  const concurrency = Math.max(1, config.openMeteoConcurrency);
  for (let start = 0; start < jobs.length; start += concurrency) {
    const chunk = jobs.slice(start, start + concurrency);
    const results = await Promise.all(chunk.map(async (job) => {
      const [lat, lng] = job.key.split(',');
      const response = await getJson<OpenMeteoResponse>(
        `${config.openMeteoBaseUrl.replace(/\/$/, '')}/v1/elevation?latitude=${lat}&longitude=${lng}`,
        config
      );
      const elevation = Array.isArray(response?.elevation) ? response.elevation[0] : response?.elevation;
      return { index: job.index, elevation: elevation == null || !Number.isFinite(elevation) ? 0 : elevation };
    }));
    for (const r of results) {
      altitudes[r.index] = r.elevation;
    }
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const first = seen.get(key);
    if (first !== undefined && first !== i) {
      altitudes[i] = altitudes[first];
    }
  }

  return altitudes;
}

async function postJson<T>(
  url: string,
  body: unknown,
  config: ElevationConfig
): Promise<T> {
  const controller = new AbortController();
  const connectTimeout = setTimeout(() => controller.abort(), config.connectTimeoutMs);
  const readTimeout = setTimeout(() => controller.abort(), config.readTimeoutMs + config.connectTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(connectTimeout);
    clearTimeout(readTimeout);
  }
}

async function getJson<T>(
  url: string,
  config: ElevationConfig
): Promise<T> {
  const controller = new AbortController();
  const connectTimeout = setTimeout(() => controller.abort(), config.connectTimeoutMs);
  const readTimeout = setTimeout(() => controller.abort(), config.readTimeoutMs + config.connectTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(connectTimeout);
    clearTimeout(readTimeout);
  }
}