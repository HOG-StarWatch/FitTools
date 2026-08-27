export interface FitFileOptions {
  type?: string;
  manufacturer?: string | number;
  product?: number;
  serialNumber?: number;
  timeCreated?: Date;
  sport?: string;
  subSport?: string | number;
}

export interface RecordData {
  timestamp: Date;
  positionLat?: number;
  positionLong?: number;
  distance?: number;
  speed?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  enhancedSpeed?: number;
  stanceTime?: number;
  stanceTimePercent?: number;
  verticalOscillation?: number;
  stepLength?: number;
  altitude?: number;
}

export interface SessionData {
  timestamp: Date;
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  totalDistance: number;
  totalCalories: number;
  sport: string;
  subSport: string | number;
  avgSpeed: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgCadence: number;
  avgPower: number;
  totalAscent?: number;
  totalDescent?: number;
  avgStepLength?: number;
}

export interface LapData {
  timestamp: Date;
  startTime: Date;
  totalElapsedTime: number;
  totalTimerTime: number;
  totalDistance: number;
  totalCalories: number;
  sport: string;
  subSport: string | number;
  avgSpeed: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgCadence: number;
  avgPower: number;
}

export interface ActivityData {
  timestamp: Date;
  totalTimerTime: number;
  numSessions: number;
  type: string;
}

// ==================== FIT Protocol Constants ====================

// FIT 基础类型：baseType 决定数据视图方式，size 决定字段字节数
const FIT_TYPES = {
  enum: { baseType: 0x00, size: 1 },
  sint8: { baseType: 0x01, size: 1 },
  uint8: { baseType: 0x02, size: 1 },
  sint16: { baseType: 0x83, size: 2 },
  uint16: { baseType: 0x84, size: 2 },
  sint32: { baseType: 0x85, size: 4 },
  uint32: { baseType: 0x86, size: 4 },
  float32: { baseType: 0x88, size: 4 },
  float64: { baseType: 0x89, size: 8 },
  uint8z: { baseType: 0x0A, size: 1 },
  uint16z: { baseType: 0x8B, size: 2 },
  uint32z: { baseType: 0x8C, size: 4 },
  byte: { baseType: 0x0D, size: 1 },
  string: { baseType: 0x07, size: 1 },
  sint64: { baseType: 0x8E, size: 8 },
  uint64: { baseType: 0x8F, size: 8 },
  uint64z: { baseType: 0x90, size: 8 },
} as const;

// FIT Global Message Numbers (Profile §4.1.2)
const MESG_NUM = {
  file_id: 0,
  file_creator: 1,
  event: 21,
  record: 20,
  session: 18,
  lap: 19,
  activity: 34,
  device_info: 23,
} as const;

const EVENT_MAP: Record<string, number> = { timer: 0, workout: 3, recreation: 4 };
const EVENT_TYPE_MAP: Record<string, number> = {
  start: 0,
  stop: 1,
  consecutive: 2,
  marker: 3,
  stop_all: 4,
  stop_disable: 5,
  stop_disable_all: 6,
};

// FIT Sport enum (Profile §4.1.4)
const SPORT_MAP: Record<string, number> = {
  running: 1,
  walking: 11,
  cycling: 2,
  transition: 3,
  swimming: 5,
  basketball: 9,
  soccer: 10,
  tennis: 12,
  hiking: 15,
  dancing: 19,
  snowboarding: 22,
  climbing: 28,
  rowing: 24,
  kayaking: 21,
  gymnastics: 31,
};

// FIT Sub-Sport enum (Profile §4.1.5)，同时收录 camelCase 别名以兼容前端
const SUB_SPORT_MAP: Record<string, number> = {
  generic: 0,
  treadmill: 1,
  street: 2,
  trail: 3,
  track: 4,
  indoorRunning: 45,
  indoor_running: 45,
  indoor_run: 45,
  obstacle: 59,
  obstacle_run: 59,
  virtualActivity: 58,
  virtual_activity: 58,
  casualWalking: 30,
  casual_walking: 30,
  indoorWalking: 27,
  indoor_walking: 27,
};

export const FIT_INVALID_SERIAL = 0xffffffff;

function resolveSubSportId(subSport: string | number): number {
  if (typeof subSport === 'number') {
    return Number.isFinite(subSport) ? Math.max(0, Math.min(255, Math.floor(subSport))) : 0;
  }
  const v = SUB_SPORT_MAP[subSport];
  return v !== undefined ? v : 0;
}

// ==================== Field Definition Registry ====================
// 用字段号 → (size, baseType) 表取代硬编码偏移，消除易错的手写字节布局

interface FieldDef {
  size: number;
  baseType: number;
}

const TIMESTAMP_FIELD: FieldDef = { size: 4, baseType: FIT_TYPES.uint32.baseType };

// Profile §4.x.x — 各 message 的 field 编号与基础类型
const FIELD_REGISTRY: Record<string, Record<number, FieldDef>> = {
  file_id: {
    0: { size: 1, baseType: FIT_TYPES.enum.baseType },     // type
    1: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // manufacturer
    2: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // product
    3: { size: 4, baseType: FIT_TYPES.uint32z.baseType },  // serial_number
    4: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // time_created
  },
  device_info: {
    2: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // manufacturer
    3: { size: 4, baseType: FIT_TYPES.uint32z.baseType },  // serial_number
    4: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // product
    27: { size: 1, baseType: FIT_TYPES.string.baseType },  // product_name
    253: { size: 4, baseType: FIT_TYPES.uint32.baseType }, // timestamp
  },
  event: {
    0: { size: 1, baseType: FIT_TYPES.enum.baseType },     // event
    1: { size: 1, baseType: FIT_TYPES.enum.baseType },     // event_type
    253: { size: 4, baseType: FIT_TYPES.uint32.baseType }, // timestamp
  },
  session: {
    2: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // start_time
    5: { size: 1, baseType: FIT_TYPES.enum.baseType },     // sport
    6: { size: 1, baseType: FIT_TYPES.enum.baseType },     // sub_sport
    7: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_elapsed_time
    8: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_timer_time
    9: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_distance
    11: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // total_calories
    14: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // avg_speed
    16: { size: 1, baseType: FIT_TYPES.uint8.baseType },   // avg_heart_rate
    17: { size: 1, baseType: FIT_TYPES.uint8.baseType },   // max_heart_rate
    18: { size: 1, baseType: FIT_TYPES.uint8.baseType },   // avg_cadence
    20: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // avg_power
    22: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // total_ascent
    23: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // total_descent
    134: { size: 2, baseType: FIT_TYPES.uint16.baseType }, // avg_step_length (scale 10, units mm)
    254: { size: 2, baseType: FIT_TYPES.uint16.baseType }, // message_index
  },
  lap: {
    2: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // start_time
    7: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_elapsed_time
    8: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_timer_time
    9: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_distance
    11: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // total_calories
    13: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // avg_speed
    15: { size: 1, baseType: FIT_TYPES.uint8.baseType },   // avg_heart_rate
    16: { size: 1, baseType: FIT_TYPES.uint8.baseType },   // max_heart_rate
    17: { size: 1, baseType: FIT_TYPES.uint8.baseType },   // avg_cadence
    19: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // avg_power
    25: { size: 1, baseType: FIT_TYPES.enum.baseType },   // sport
    39: { size: 1, baseType: FIT_TYPES.enum.baseType },   // sub_sport
    254: { size: 2, baseType: FIT_TYPES.uint16.baseType }, // message_index
  },
  activity: {
    0: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // total_timer_time
    1: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // num_sessions
    2: { size: 1, baseType: FIT_TYPES.enum.baseType },     // type
  },
  record: {
    0: { size: 4, baseType: FIT_TYPES.sint32.baseType },   // position_lat (semicircles)
    1: { size: 4, baseType: FIT_TYPES.sint32.baseType },   // position_long (semicircles)
    2: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // altitude (scale 5, offset 500)
    3: { size: 1, baseType: FIT_TYPES.uint8.baseType },    // heart_rate
    4: { size: 1, baseType: FIT_TYPES.uint8.baseType },    // cadence
    5: { size: 4, baseType: FIT_TYPES.uint32.baseType },   // distance
    6: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // speed
    7: { size: 2, baseType: FIT_TYPES.uint16.baseType },   // power
    39: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // vertical_oscillation
    40: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // stance_time_percent
    41: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // stance_time
    73: { size: 4, baseType: FIT_TYPES.uint32.baseType },  // enhanced_speed
    78: { size: 4, baseType: FIT_TYPES.uint32.baseType },  // enhanced_altitude (scale 5, offset 500)
    85: { size: 2, baseType: FIT_TYPES.uint16.baseType },  // step_length
  },
};

// FIT 文件头尾相关常量
const FIT_HEADER_SIZE = 14;
const FIT_CRC_SIZE = 2;
const FIT_PROTOCOL_VERSION = 0x20; // 2.0，启用 enhanced_speed/enhanced_altitude 等
const FIT_PROFILE_TYPE = 0x0865;   // 设备配置文件标识
const FIT_MAGIC = [0x2e, 0x46, 0x49, 0x54]; // ".FIT"
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31); // FIT 时间起点 1989-12-31 UTC

// 经纬度转 FIT semicircles：1 圈 = 2^31
export const SEMICIRCLES_PER_DEGREE = 0x80000000 / 180;

export function toSemicircles(deg: number): number {
  return Math.round(deg * SEMICIRCLES_PER_DEGREE);
}

const CRC16_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
  0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    let tmp = CRC16_TABLE[crc & 0x0f];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC16_TABLE[data[i] & 0x0f];
    tmp = CRC16_TABLE[crc & 0x0f];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC16_TABLE[(data[i] >> 4) & 0x0f];
  }
  return crc & 0xffff;
}

const encodeUtf8 = (s: string) => new TextEncoder().encode(s);

const _k = 0x5b;
const _h = '13141c76082f3a290c3a2f3833741d322f0f343437';

function decodeDeviceLabel(): string {
  const bytes = new Uint8Array(_h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(_h.substr(i * 2, 2), 16) ^ _k;
  }
  return new TextDecoder().decode(bytes);
}

export function deviceLabel(): string {
  return decodeDeviceLabel();
}

function buildProductName(date: Date): string {
  return `${decodeDeviceLabel()} ${date.toISOString().replace(/\.\d{3}Z$/, 'Z')}`;
}

// ==================== FitEncoder ====================

interface FieldEntry {
  num: number;
  value: number;
  string?: string;
}

export class FitEncoder {
  private buffers: Uint8Array[] = [];
  private definitionMessages: Map<number, Uint8Array> = new Map();
  // local message number 是 4-bit 字段，每种全局消息类型只能分配一个（>15 即溢出）
  private localMesgNumMap: Map<number, number> = new Map();
  private nextLocalMesgNum = 0;

  private options: Required<FitFileOptions>;

  constructor(options: FitFileOptions = {}) {
    this.options = {
      type: options.type || 'activity',
      manufacturer: options.manufacturer || 'development',
      product: options.product || 1,
      serialNumber: options.serialNumber || 1,
      timeCreated: options.timeCreated || new Date(),
      sport: options.sport || 'running',
      subSport: options.subSport || 'generic',
    };
  }

  writeFileIdMessage(): void {
    const fields: FieldEntry[] = [
      { num: 0, value: this.options.type === 'activity' ? 4 : 1 },
      { num: 1, value: this.resolveManufacturerId() },
      { num: 2, value: this.options.product },
      { num: 3, value: this.options.serialNumber === 1 ? FIT_INVALID_SERIAL : this.options.serialNumber },
      { num: 4, value: this.getDateValue(this.options.timeCreated) },
    ];
    const mesg = MESG_NUM.file_id;
    this.writeDefinitionMessage(mesg, 'file_id', fields);
    this.writeDataMessage(mesg, fields);
  }

  writeDeviceInfoMessage(timestamp: Date): void {
    const fields: FieldEntry[] = [
      { num: 253, value: this.getDateValue(timestamp) },
      { num: 2, value: this.resolveManufacturerId() },
      { num: 3, value: this.options.serialNumber === 1 ? FIT_INVALID_SERIAL : this.options.serialNumber },
      { num: 4, value: this.options.product },
      { num: 27, value: 0, string: buildProductName(this.options.timeCreated) },
    ];
    const mesg = MESG_NUM.device_info;
    this.writeDefinitionMessage(mesg, 'device_info', fields);
    this.writeDataMessage(mesg, fields);
  }

  writeEventMessage(timestamp: Date, event = 'timer', eventType = 'start'): void {
    const fields: FieldEntry[] = [
      { num: 253, value: this.getDateValue(timestamp) },
      { num: 0, value: EVENT_MAP[event] || 0 },
      { num: 1, value: EVENT_TYPE_MAP[eventType] || 0 },
    ];
    const mesg = MESG_NUM.event;
    this.writeDefinitionMessage(mesg, 'event', fields);
    this.writeDataMessage(mesg, fields);
  }

  writeSessionMessage(data: SessionData, includeHeartRate = true, includePower = true, includeCadence = true): void {
    const fields: FieldEntry[] = [
      { num: 253, value: this.getDateValue(data.timestamp) },
      { num: 2, value: this.getDateValue(data.startTime) },
      { num: 5, value: SPORT_MAP[data.sport] || 1 },
      { num: 6, value: resolveSubSportId(data.subSport) },
      { num: 7, value: Math.round(data.totalElapsedTime * 1000) },
      { num: 8, value: Math.round(data.totalTimerTime * 1000) },
      { num: 9, value: Math.round(data.totalDistance * 100) },
      { num: 11, value: data.totalCalories },
      { num: 14, value: Math.round(data.avgSpeed * 1000) },
      { num: 254, value: 0 },
    ];
    if (includeHeartRate) {
      fields.push({ num: 16, value: Math.round(data.avgHeartRate) });
      fields.push({ num: 17, value: Math.round(data.maxHeartRate) });
    }
    if (includeCadence) fields.push({ num: 18, value: Math.round(data.avgCadence) });
    if (includePower) fields.push({ num: 20, value: Math.round(data.avgPower) });
    if (data.totalAscent !== undefined) fields.push({ num: 22, value: Math.round(data.totalAscent) });
    if (data.totalDescent !== undefined) fields.push({ num: 23, value: Math.round(data.totalDescent) });
    if (data.avgStepLength !== undefined) fields.push({ num: 134, value: Math.round(data.avgStepLength * 10000) });
    const mesg = MESG_NUM.session;
    this.writeDefinitionMessage(mesg, 'session', fields);
    this.writeDataMessage(mesg, fields);
  }

  writeLapMessage(data: LapData, includeHeartRate = true, includePower = true, includeCadence = true): void {
    const fields: FieldEntry[] = [
      { num: 253, value: this.getDateValue(data.timestamp) },
      { num: 2, value: this.getDateValue(data.startTime) },
      { num: 7, value: Math.round(data.totalElapsedTime * 1000) },
      { num: 8, value: Math.round(data.totalTimerTime * 1000) },
      { num: 9, value: Math.round(data.totalDistance * 100) },
      { num: 11, value: data.totalCalories },
      { num: 13, value: Math.round(data.avgSpeed * 1000) },
      { num: 25, value: SPORT_MAP[data.sport] || 1 },
      { num: 39, value: resolveSubSportId(data.subSport) },
      { num: 254, value: 0 },
    ];
    if (includeHeartRate) {
      fields.push({ num: 15, value: Math.round(data.avgHeartRate) });
      fields.push({ num: 16, value: Math.round(data.maxHeartRate) });
    }
    if (includeCadence) fields.push({ num: 17, value: Math.round(data.avgCadence) });
    if (includePower) fields.push({ num: 19, value: Math.round(data.avgPower) });
    const mesg = MESG_NUM.lap;
    this.writeDefinitionMessage(mesg, 'lap', fields);
    this.writeDataMessage(mesg, fields);
  }

  writeActivityMessage(data: ActivityData): void {
    const fields: FieldEntry[] = [
      { num: 253, value: this.getDateValue(data.timestamp) },
      { num: 0, value: Math.round(data.totalTimerTime * 1000) },
      { num: 1, value: data.numSessions },
      { num: 2, value: data.type === 'manual' ? 0 : 2 },
    ];
    const mesg = MESG_NUM.activity;
    this.writeDefinitionMessage(mesg, 'activity', fields);
    this.writeDataMessage(mesg, fields);
  }

  writeRecordMessage(data: RecordData): void {
    const fields: FieldEntry[] = [{ num: 253, value: this.getDateValue(data.timestamp) }];
    if (data.positionLat !== undefined) fields.push({ num: 0, value: data.positionLat });
    if (data.positionLong !== undefined) fields.push({ num: 1, value: data.positionLong });
    if (data.distance !== undefined) fields.push({ num: 5, value: Math.round(data.distance * 100) });
    if (data.speed !== undefined) fields.push({ num: 6, value: Math.round(data.speed * 1000) });
    if (data.heartRate !== undefined) fields.push({ num: 3, value: Math.round(data.heartRate) });
    if (data.cadence !== undefined) fields.push({ num: 4, value: Math.round(data.cadence) });
    if (data.power !== undefined) fields.push({ num: 7, value: Math.round(data.power) });
    if (data.enhancedSpeed !== undefined) fields.push({ num: 73, value: Math.round(data.enhancedSpeed * 1000) });
    if (data.stanceTime !== undefined) fields.push({ num: 41, value: Math.round(data.stanceTime * 10) });
    if (data.stanceTimePercent !== undefined) fields.push({ num: 40, value: Math.round(data.stanceTimePercent * 100) });
    if (data.verticalOscillation !== undefined) {
      // lib.ts 已返回 FIT 原始值（mm × 10）
      fields.push({ num: 39, value: Math.round(data.verticalOscillation) });
    }
    if (data.stepLength !== undefined) {
      // lib.ts 已返回 FIT 原始值（mm × 10）
      fields.push({ num: 85, value: Math.round(data.stepLength) });
    }
    if (data.altitude !== undefined) {
      // 同时写入标准 altitude 与 enhanced_altitude，兼容新老设备/平台
      const altitudeValue = Math.round((data.altitude + 500) * 5);
      fields.push({ num: 2, value: altitudeValue });
      fields.push({ num: 78, value: altitudeValue });
    }

    const mesg = MESG_NUM.record;
    if (!this.definitionMessages.has(mesg)) {
      this.writeDefinitionMessage(mesg, 'record', fields);
    }
    this.writeDataMessage(mesg, fields);
  }

  // ==================== Internal Methods ====================

  private writeDefinitionMessage(globalMesgNum: number, mesgName: string, fields: FieldEntry[]): void {
    if (!this.localMesgNumMap.has(globalMesgNum)) {
      const num = this.nextLocalMesgNum++;
      if (num > 15) {
        throw new Error(`Too many message types defined (local message number overflow at ${num})`);
      }
      this.localMesgNumMap.set(globalMesgNum, num);
    }
    const localNum = this.localMesgNumMap.get(globalMesgNum)!;

    const registry = FIELD_REGISTRY[mesgName] || {};
    const fieldDefSize = 3;
    const totalSize = 1 + 1 + 1 + 2 + 1 + fields.length * fieldDefSize;

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);

    let offset = 0;
    buffer[offset++] = 0x40 | (localNum & 0x0f); // definition message header
    buffer[offset++] = 0x00;                     // reserved
    buffer[offset++] = 0x00;                     // architecture (little-endian)
    view.setUint16(offset, globalMesgNum, true);
    offset += 2;
    buffer[offset++] = fields.length;

    for (const field of fields) {
      buffer[offset++] = field.num;
      let size: number;
      let baseType: number;
      if (field.num === 253) {
        size = TIMESTAMP_FIELD.size;
        baseType = TIMESTAMP_FIELD.baseType;
      } else if (field.string !== undefined) {
        size = encodeUtf8(field.string).length + 1;
        baseType = FIT_TYPES.string.baseType;
      } else {
        const def = registry[field.num];
        if (def) {
          size = def.size;
          baseType = def.baseType;
        } else {
          // 未知字段：保守回退到 uint8，避免写错字节数
          size = 1;
          baseType = FIT_TYPES.uint8.baseType;
        }
      }
      buffer[offset++] = size;
      buffer[offset++] = baseType;
    }

    this.buffers.push(buffer);
    this.definitionMessages.set(globalMesgNum, buffer);
  }

  private writeDataMessage(globalMesgNum: number, fields: FieldEntry[]): void {
    const localNum = this.localMesgNumMap.get(globalMesgNum);
    const defBuffer = this.definitionMessages.get(globalMesgNum);
    if (localNum === undefined || !defBuffer) return;

    // 从 definition buffer 解析每个字段的 (num, size, baseType)
    let defOffset = 5; // 跳过 header(1) + reserved(1) + arch(1) + globalMesgNum(2)
    const numFields = defBuffer[defOffset++];
    const fieldDefs: Array<{ num: number; size: number; baseType: number }> = [];
    let dataSize = 0;
    for (let i = 0; i < numFields; i++) {
      const fieldNum = defBuffer[defOffset++];
      const fieldSize = defBuffer[defOffset++];
      const baseType = defBuffer[defOffset++];
      fieldDefs.push({ num: fieldNum, size: fieldSize, baseType });
      dataSize += fieldSize;
    }

    const buffer = new Uint8Array(1 + dataSize);
    const view = new DataView(buffer.buffer);
    buffer[0] = 0x00 | (localNum & 0x0f); // data message header

    let dataOffset = 1;
    for (const fieldDef of fieldDefs) {
      const fieldData = fields.find((f) => f.num === fieldDef.num);
      if (fieldDef.baseType === FIT_TYPES.string.baseType) {
        const bytes = fieldData?.string !== undefined ? encodeUtf8(fieldData.string) : new Uint8Array(0);
        for (let k = 0; k < fieldDef.size; k++) {
          buffer[dataOffset + k] = k < bytes.length ? bytes[k] : 0;
        }
      } else if (!fieldData) {
        this.writeInvalidValue(view, buffer, dataOffset, fieldDef.size, fieldDef.baseType);
      } else {
        this.writeValue(view, buffer, dataOffset, fieldDef.size, fieldDef.baseType, fieldData.value);
      }
      dataOffset += fieldDef.size;
    }

    this.buffers.push(buffer);
  }

  private writeValue(
    view: DataView,
    buffer: Uint8Array,
    offset: number,
    size: number,
    baseType: number,
    value: number
  ): void {
    if (size === 8) {
      if (baseType === FIT_TYPES.sint64.baseType) view.setBigInt64(offset, BigInt(value), true);
      else if (baseType === FIT_TYPES.float64.baseType) view.setFloat64(offset, value, true);
      else view.setBigUint64(offset, BigInt(value), true);
    } else if (size === 4) {
      if (baseType === FIT_TYPES.sint32.baseType) view.setInt32(offset, value, true);
      else if (baseType === FIT_TYPES.float32.baseType) view.setFloat32(offset, value, true);
      else view.setUint32(offset, value >>> 0, true);
    } else if (size === 2) {
      if (baseType === FIT_TYPES.sint16.baseType) view.setInt16(offset, value, true);
      else view.setUint16(offset, value & 0xffff, true);
    } else if (size === 1) {
      buffer[offset] = value & 0xff;
    } else {
      throw new Error(`Unsupported FIT field size: ${size}`);
    }
  }

  // 按 FIT 规范写入各 base type 的无效值：sint* 取最大正值（0x7f…），其余全 1
  private writeInvalidValue(view: DataView, buffer: Uint8Array, offset: number, size: number, baseType: number): void {
    if (size === 8) {
      if (baseType === FIT_TYPES.sint64.baseType) view.setBigInt64(offset, 0x7fffffffffffffffn, true);
      else view.setBigUint64(offset, 0xffffffffffffffffn, true);
    } else if (size === 4) {
      if (baseType === FIT_TYPES.sint32.baseType) view.setInt32(offset, 0x7fffffff, true);
      else view.setUint32(offset, 0xffffffff, true);
    } else if (size === 2) {
      if (baseType === FIT_TYPES.sint16.baseType) view.setInt16(offset, 0x7fff, true);
      else view.setUint16(offset, 0xffff, true);
    } else if (size === 1) {
      buffer[offset] = baseType === FIT_TYPES.sint8.baseType ? 0x7f : 0xff;
    } else {
      throw new Error(`Unsupported FIT field size: ${size}`);
    }
  }

  private resolveManufacturerId(): number {
    if (typeof this.options.manufacturer === 'number') {
      return Number.isFinite(this.options.manufacturer) ? this.options.manufacturer : 255;
    }
    return this.options.manufacturer === 'development' ? 255 : this.getManufacturerId();
  }

  private getManufacturerId(): number {
    const mfgName = String(this.options.manufacturer).toLowerCase();
    if (mfgName.includes('garmin')) return 1;
    if (mfgName.includes('suunto')) return 23;
    if (mfgName.includes('polar')) return 123;
    if (mfgName.includes('wahoo')) return 32;
    if (mfgName.includes('coros')) return 294;
    return 255;
  }

  private getDateValue(date: Date): number {
    return Math.floor((date.getTime() - FIT_EPOCH_MS) / 1000);
  }

  close(): Uint8Array {
    const dataSize = this.buffers.reduce((sum, b) => sum + b.length, 0);
    const fileSize = FIT_HEADER_SIZE + dataSize + FIT_CRC_SIZE;

    const fileBuffer = new Uint8Array(fileSize);
    const view = new DataView(fileBuffer.buffer);

    fileBuffer[0] = FIT_HEADER_SIZE;
    fileBuffer[1] = FIT_PROTOCOL_VERSION;
    view.setUint16(2, FIT_PROFILE_TYPE, true);
    view.setUint32(4, dataSize, true);
    for (let i = 0; i < FIT_MAGIC.length; i++) fileBuffer[8 + i] = FIT_MAGIC[i];
    view.setUint16(12, crc16(fileBuffer.subarray(0, 12)), true);

    let offset = FIT_HEADER_SIZE;
    for (const buffer of this.buffers) {
      fileBuffer.set(buffer, offset);
      offset += buffer.length;
    }

    view.setUint16(fileSize - FIT_CRC_SIZE, crc16(fileBuffer.subarray(0, fileSize - FIT_CRC_SIZE)), true);
    return fileBuffer;
  }
}
