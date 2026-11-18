/** Deterministic GPS capacity math. These figures are planning inputs, not load-test results. */

export const GPS_UPDATE_INTERVAL_SECONDS = 10;
export const GPS_TARGET_DEVICES = 1_000;
export const GPS_ROW_BYTES_ESTIMATE = 220;
export const GPS_RETENTION_HOURS = 24;

export interface GpsLoadEstimate {
  devices: number;
  intervalSeconds: number;
  updatesPerSecond: number;
  updatesPerMinute: number;
  updatesPerHour: number;
  updatesPerDay: number;
  storageBytesPerDay: number;
  storageGiBPerDay: number;
  realtimeMessagesPerSecond: number;
  peakRealtimeConnections: number;
}

export function estimateGpsLoad(
  devices = GPS_TARGET_DEVICES,
  intervalSeconds = GPS_UPDATE_INTERVAL_SECONDS,
): GpsLoadEstimate {
  const safeDevices = Math.max(0, Math.floor(devices));
  const interval = Math.max(1, intervalSeconds);
  const updatesPerSecond = safeDevices / interval;
  const updatesPerMinute = updatesPerSecond * 60;
  const updatesPerHour = updatesPerMinute * 60;
  const updatesPerDay = updatesPerHour * 24;
  const storageBytesPerDay = updatesPerDay * GPS_ROW_BYTES_ESTIMATE;
  return {
    devices: safeDevices,
    intervalSeconds: interval,
    updatesPerSecond,
    updatesPerMinute,
    updatesPerHour,
    updatesPerDay,
    storageBytesPerDay,
    storageGiBPerDay: storageBytesPerDay / (1024 ** 3),
    // Booking-scoped fan-out: one customer channel per active booking, not a global broadcast.
    realtimeMessagesPerSecond: updatesPerSecond,
    peakRealtimeConnections: safeDevices * 2,
  };
}

export interface GpsCostEstimate {
  plan: string;
  compute: string;
  monthlyUsdLow: number;
  monthlyUsdHigh: number;
  notes: string[];
  provenAtDevices: number | null;
}

/**
 * Published Supabase list prices as of 2026-11. Large (2 vCPU / 8 GB) is a
 * benchmark candidate only. Do not treat this as a passed 1,000-device test.
 */
export function estimateGpsInfrastructureCost(load = estimateGpsLoad()): GpsCostEstimate {
  const notes = [
    'Pro plan $25/mo includes 500 Realtime peak connections; extra packages are $10 per 1,000.',
    'Pro Realtime with the spend cap is 500 concurrent connections and 500 messages/s; 1,000 devices need the cap lifted (10,000 connections / 2,500 msg/s).',
    'Large compute is $110/mo (2 vCPU / 8 GB, 160 direct / 800 pooler connections) and is unproven until a staging load test passes.',
    'GPS writes should go through the BookOurSpace API + pooled Postgres, not 1,000 direct database clients.',
    `At ${load.devices} devices / ${load.intervalSeconds}s, expect ~${Math.round(load.updatesPerSecond)} writes/s and ~${load.storageGiBPerDay.toFixed(2)} GiB/day before retention.`,
  ];
  const extraRealtimePackages = Math.max(0, Math.ceil(Math.max(0, load.peakRealtimeConnections - 500) / 1000));
  const computeLarge = 110;
  const plan = 25;
  const realtimeOverage = extraRealtimePackages * 10;
  return {
    plan: 'Supabase Pro (spend cap off for Realtime headroom)',
    compute: 'Large (2 vCPU / 8 GB) as an initial benchmark, not a certified size',
    monthlyUsdLow: plan + computeLarge - 10,
    monthlyUsdHigh: plan + computeLarge - 10 + realtimeOverage + 40,
    notes,
    provenAtDevices: null,
  };
}

export function gpsCapacityVerdict(testedDevices: number | null): 'unproven' | 'partial' | 'proven' {
  if (!testedDevices || testedDevices < 100) return 'unproven';
  if (testedDevices < GPS_TARGET_DEVICES) return 'partial';
  return 'proven';
}
