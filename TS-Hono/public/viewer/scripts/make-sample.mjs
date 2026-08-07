import { Encoder, Profile } from "@garmin/fitsdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "sample");
fs.mkdirSync(outDir, { recursive: true });

const DURATION_S = 30 * 60;
const START = new Date("2026-07-20T07:30:00.000Z");
const BASE_LAT = 48.8566;
const BASE_LNG = 2.3522;
const R = 6371000;

const latAt = (theta) => BASE_LAT + (Math.sin(theta) * 4200) / 111320;
const lngAt = (theta) => BASE_LNG + (Math.cos(theta) * 4200) / (111320 * Math.cos((BASE_LAT * Math.PI) / 180));
const heading = 0;

function radians(theta) { return theta * Math.PI / 180; }

function semiLat(lat) { return Math.round(lat * 11930464.77); }
function semiLng(lng) { return Math.round(lng * 11930464.77); }

const encoder = new Encoder();

encoder.writeMesg({
  mesgNum: Profile.MesgNum.FILE_ID,
  type: "activity",
  manufacturer: "garmin",
  product: 1,
  serialNumber: 123456789,
  timeCreated: START,
});

encoder.writeMesg({
  mesgNum: Profile.MesgNum.FILE_CREATOR,
  softwareVersion: 21.212,
  hardwareVersion: 1,
});

let prevDist = 0;
let prevTheta = 0;
let lapIndex = 0;
let lapStartDist = 0;
let lapStartTime = null;
let lapElapsed = 0;
const lapRows = [];
const totals = { elapsed: 0, timer: 0, distance: 0, hrSum: 0, hrN: 0, hrMax: 0, powerSum: 0, powerN: 0, powerMax: 0, ascent: 0, descent: 0, cal: 0 };

for (let i = 0; i < DURATION_S; i++) {
  const t = new Date(START.getTime() + i * 1000);
  const frac = i / DURATION_S;
  const theta = (i / 600) * Math.PI * 2;
  const speed = 6 + 4 * Math.sin(frac * Math.PI * 2.2) + 1.5 * Math.sin(frac * Math.PI * 7) + 0.5;
  const dist = (prevDist || 0) + speed;
  prevDist = dist;
  const power = Math.round(150 + 90 * Math.sin(frac * Math.PI * 2.2) + 25 * Math.sin(frac * Math.PI * 11) + Math.random() * 8);
  const hr = Math.round(128 + 34 * Math.sin(frac * Math.PI * 2.2) + 6 * Math.sin(frac * Math.PI * 13));
  const alt = 120 + 35 * Math.sin(theta * 0.7) + 8 * Math.sin(theta * 3.1);
  const cadence = Math.round(86 + 6 * Math.sin(frac * Math.PI * 2.2));

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.RECORD,
    timestamp: t,
    positionLat: semiLat(latAt(theta)),
    positionLong: semiLng(lngAt(theta)),
    altitude: alt,
    heartRate: hr,
    cadence,
    distance: dist,
    speed,
    power,
    temperature: 24,
  });

  totals.distance = dist;
  totals.elapsed = i + 1;
  totals.timer = i + 1;
  totals.hrSum += hr;
  totals.hrN++;
  totals.hrMax = Math.max(totals.hrMax, hr);
  totals.powerSum += power;
  totals.powerN++;
  totals.powerMax = Math.max(totals.powerMax, power);

  if (i > 0) {
    const dh = alt - (totals._prevAlt ?? alt);
    if (dh > 0) totals.ascent += dh;
    else totals.descent -= dh;
  }
  totals._prevAlt = alt;

  if (i % 60 === 0) totals.cal += 12;

  const isLap = i > 0 && i % 600 === 0;
  const isEnd = i === DURATION_S - 1;
  if ((isLap || isEnd) && lapStartTime !== null) {
    lapRows.push({
      startTime: lapStartTime,
      timestamp: t,
      totalElapsedTime: i - lapElapsed,
      totalTimerTime: i - lapElapsed,
      totalDistance: dist - lapStartDist,
      avgSpeed: (dist - lapStartDist) / (i - lapElapsed),
      maxSpeed: 12.2,
      avgHeartRate: Math.round(totals.hrSum / totals.hrN),
      maxHeartRate: totals.hrMax,
      avgPower: Math.round(totals.powerSum / totals.powerN),
      maxPower: totals.powerMax,
      totalCalories: Math.round(totals.cal),
      totalAscent: Math.round(totals.ascent),
      totalDescent: Math.round(totals.descent),
    });
  }
  if (isLap && lapStartTime !== null) {
    lapIndex++;
    lapStartDist = dist;
    lapElapsed = i;
    lapStartTime = null;
  }
  if (lapStartTime === null) {
    lapStartTime = t;
    lapElapsed = i;
    lapStartDist = dist;
  }
}

for (const lap of lapRows) {
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.LAP,
    ...lap,
    event: "lap",
    eventType: "stop",
    sport: "cycling",
  });
}

encoder.writeMesg({
  mesgNum: Profile.MesgNum.SESSION,
  startTime: START,
  timestamp: new Date(START.getTime() + DURATION_S * 1000),
  event: "session",
  eventType: "stop",
  sport: "cycling",
  subSport: "generic",
  totalElapsedTime: DURATION_S,
  totalTimerTime: DURATION_S,
  totalDistance: totals.distance,
  avgSpeed: totals.distance / DURATION_S,
  maxSpeed: 12,
  avgHeartRate: Math.round(totals.hrSum / totals.hrN),
  maxHeartRate: totals.hrMax,
  avgPower: Math.round(totals.powerSum / totals.powerN),
  maxPower: totals.powerMax,
  totalCalories: Math.round(totals.cal),
  totalAscent: Math.round(totals.ascent),
  totalDescent: Math.round(totals.descent),
});

for (let i = 0; i < 3; i++) {
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.DEVICE_INFO,
    timestamp: new Date(START.getTime() + Math.floor(DURATION_S / 2) * 1000),
    serialNumber: 123456789,
    manufacturer: "garmin",
    product: 1,
    softwareVersion: 21.212,
    hardwareVersion: 1,
    batteryStatus: "good",
    batteryVoltage: 3.8,
  });
}

const file = encoder.close();
const outFile = path.join(outDir, "activity.fit");
fs.writeFileSync(outFile, Buffer.from(file));
console.log(`Wrote ${outFile} (${file.length} bytes, ${DURATION_S} records)`);

const corrupted = Buffer.from(file);
const cut = Math.min(corrupted.length, 64);
corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
corrupted[corrupted.length - 1] = 0x00;
const corruptLen = corrupted.length - cut;
const corruptedFile = path.join(outDir, "corrupted.fit");
fs.writeFileSync(corruptedFile, corrupted.subarray(0, corruptLen));
console.log(`Wrote ${corruptedFile} (${corruptLen} bytes, tail truncated + byte flipped)`);