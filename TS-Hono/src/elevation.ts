import type { RoutePoint } from './lib';

export type ElevationSource = 'open-elevation' | 'opentopodata' | 'off';

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
};

export const ELEVATION_SOURCES: ElevationSource[] = ['open-elevation', 'opentopodata', 'off'];

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

const SOURCE_NAMES: Record<ElevationSource, string> = {
  'open-elevation': 'Open-Elevation',
  'opentopodata': 'OpenTopoData',
  'off': '模拟',
};

export type ElevationStatus = 'live' | 'fallback' | 'off';

export interface ElevationFetchResult {
  altitudes: number[] | null;
  source: ElevationSource;
  status: ElevationStatus;
  message: string;
}

/**
 * 按配置的海拔源批量查询真实海拔；失败或不可用时 altitudes 为 null（调用方回退到模拟海拔）
 * 返回状态信息用于前端视觉提示
 */
export async function fetchAltitudesOrNull(
  points: RoutePoint[],
  config: ElevationConfig
): Promise<ElevationFetchResult> {
  const sourceName = SOURCE_NAMES[config.source];

  if (!config.enabled || config.source === 'off' || !points || points.length === 0) {
    return { altitudes: null, source: config.source, status: 'off', message: '模拟海拔（离线生成）' };
  }

  try {
    const altitudes = config.source === 'opentopodata'
      ? await fetchAltitudesOpenTopoData(points, config)
      : await fetchAltitudesOpenElevation(points, config);
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
  const altitudes: number[] = [];

  for (let start = 0; start < points.length; start += config.batchSize) {
    const end = Math.min(start + config.batchSize, points.length);
    const chunk = points.slice(start, end);

    const locations: ElevationLocation[] = chunk.map(p => ({
      latitude: p.lat,
      longitude: p.lng,
    }));

    const response = await postJson<ElevationLookupResponse>(
      `${config.baseUrl.replace(/\/$/, '')}/api/v1/lookup`,
      { locations },
      config
    );

    const results = response?.results;
    if (!results || results.length !== chunk.length) {
      throw new Error('Open-Elevation 返回数量与请求数量不一致');
    }

    for (const result of results) {
      altitudes.push(result.elevation == null ? 0 : result.elevation);
    }
  }

  return altitudes;
}

async function fetchAltitudesOpenTopoData(points: RoutePoint[], config: ElevationConfig): Promise<number[]> {
  const altitudes: number[] = [];

  for (let start = 0; start < points.length; start += config.openTopoBatchSize) {
    const end = Math.min(start + config.openTopoBatchSize, points.length);
    const chunk = points.slice(start, end);

    const locationsStr = chunk.map(p => `${p.lat},${p.lng}`).join('|');

    const response = await postJson<OpenTopoDataResponse>(
      `${config.openTopoBaseUrl.replace(/\/$/, '')}/v1/${config.openTopoDataset}`,
      { locations: locationsStr },
      config
    );

    const results = response?.results;
    if (!results || results.length !== chunk.length) {
      throw new Error('OpenTopoData 返回数量与请求数量不一致');
    }

    for (const result of results) {
      altitudes.push(result.elevation == null ? 0 : result.elevation);
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
