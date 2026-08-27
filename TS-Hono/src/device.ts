export interface DeviceBrand {
  name: string;
  label: string;
  manufacturer: number;
  product: number;
}

/*
 * 硬编码的设备品牌映射表。
 * 官方数值依据本仓库捆绑的 FitSDK 21.158.0（javap/jshell 实测）：
 *   GARMIN=1, SUUNTO=23, WAHOO_FITNESS=32, POLAR_ELECTRO=123, COROS=294, DEVELOPMENT=255
 * 以下品牌未收录于官方 SDK（Garmin 仅在确认官方 ID 后才写进 SDK），使用 Fit 社区广泛采用的保留值，
 * 上传 Garmin Connect 等平台可能显示为未知，仅供生成参考文件：
 *   Huawei=245, Xiaomi=471, Amazfit=169
 * 注意：Apple 官方未提供 manufacturer_id，社区流传的 132 实为官方 CYCPLUS，故不再预设。
 */
export const DEVICE_BRANDS: DeviceBrand[] = [
  { name: 'garmin', label: 'Garmin', manufacturer: 1, product: 1 },
  { name: 'coros', label: 'Coros', manufacturer: 294, product: 1 },
  { name: 'polar', label: 'Polar', manufacturer: 123, product: 1 },
  { name: 'suunto', label: 'Suunto', manufacturer: 23, product: 1 },
  { name: 'wahoo', label: 'Wahoo', manufacturer: 32, product: 1 },
  { name: 'huawei', label: 'Huawei', manufacturer: 245, product: 1 },
  { name: 'xiaomi', label: 'Xiaomi', manufacturer: 471, product: 1 },
  { name: 'amazfit', label: 'Amazfit', manufacturer: 169, product: 1 },
  { name: 'development', label: 'Developer / 开发设备', manufacturer: 255, product: 1 },
];

export interface ResolvedDevice {
  manufacturer: number;
  product: number;
}

const MANUFACTURER_ID_MAX = 0xffff;

function parseManufacturerId(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= MANUFACTURER_ID_MAX ? Math.floor(n) : undefined;
}

export function resolveDevice(deviceType?: string | number | null): ResolvedDevice | undefined {
  if (deviceType === undefined || deviceType === null || deviceType === '') return undefined;
  if (typeof deviceType === 'number') {
    if (!Number.isFinite(deviceType) || deviceType < 0 || deviceType > MANUFACTURER_ID_MAX) return undefined;
    return { manufacturer: Math.floor(deviceType), product: 1 };
  }
  const key = String(deviceType).trim().toLowerCase();
  if (!key) return undefined;
  const byId = parseManufacturerId(key);
  if (byId !== undefined) return { manufacturer: byId, product: 1 };
  const brand = DEVICE_BRANDS.find((b) => b.name === key || b.label.toLowerCase() === key);
  return brand ? { manufacturer: brand.manufacturer, product: brand.product } : undefined;
}
