import type { RequestBody } from './lib';

export interface SensorOptions {
  includeHeartRate: boolean;
  includePower: boolean;
  includeCadence: boolean;
  includeGaitData: boolean;
  includeAltitude: boolean;
}

export interface ElevationInfo {
  source: string;
  status: string;
  message: string;
}

const DEFAULTS: SensorOptions = {
  includeHeartRate: true,
  includePower: true,
  includeCadence: true,
  includeGaitData: true,
  includeAltitude: true,
};

export function resolveSensorOptions(
  body: RequestBody | null | undefined,
  elevation?: { status: string } | null
): SensorOptions {
  const b = body || ({} as RequestBody);
  return {
    includeHeartRate: b.includeHeartRate !== false,
    includePower: b.includePower !== false,
    includeCadence: b.includeCadence !== false,
    includeGaitData: b.includeGaitData !== false,
    includeAltitude: b.includeAltitude !== false && elevation?.status !== 'none',
  };
}

export function asSensorOptions(o: Partial<SensorOptions> | undefined): SensorOptions {
  return { ...DEFAULTS, ...(o || {}) };
}
