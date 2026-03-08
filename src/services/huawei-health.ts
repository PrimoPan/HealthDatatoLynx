import { buildMockHealthSnapshot } from './health.js';
import type {
  HealthAlert,
  HealthBloodPressureLevel,
  HealthSleepApneaData,
  HealthSnapshot,
  HealthSnapshotSource,
  HealthTrendPoint,
  HealthWorkoutRecord,
} from '../types/health.js';

type NativeHuaweiMethod = (...args: unknown[]) => unknown;

type NativeHuaweiHealthManager = {
  isHealthDataAvailable?: NativeHuaweiMethod;
  requestAuthorization?: NativeHuaweiMethod;
  getHealthSnapshot?: NativeHuaweiMethod;
};

type UnknownRecord = Record<string, unknown>;

export type HuaweiHealthHooks = {
  isAvailable?: () => Promise<boolean> | boolean;
  requestAuthorization?: () => Promise<boolean> | boolean;
  readSnapshot?: () => Promise<HealthSnapshot> | HealthSnapshot;
  readRawData?: () => Promise<unknown> | unknown;
  useMockWhenUnavailable?: boolean;
};

export const HUAWEI_HEALTH_LATEST_REQUIREMENTS = {
  docsUpdatedAt: '2026-03-04T17:17:00+08:00',
  minAndroidVersion: '7.0',
  supportedAndroidApiLevel: '24-36',
  minHmsCoreVersion: '5.0.4.300',
  minHuaweiHealthAppVersion: '11.0.0.512',
} as const;

export const HUAWEI_HEALTH_ATOMIC_DATA_TYPES = [
  'DT_CONTINUOUS_STEPS_DELTA',
  'DT_CONTINUOUS_DISTANCE_DELTA',
  'DT_CONTINUOUS_CALORIES_BURNT',
  'DT_CONTINUOUS_EXERCISE_INTENSITY_V2',
  'DT_INSTANTANEOUS_ALTITUDE',
  'DT_INSTANTANEOUS_HEIGHT',
  'DT_INSTANTANEOUS_BODY_WEIGHT',
  'DT_INSTANTANEOUS_HEART_RATE',
  'DT_INSTANTANEOUS_RESTING_HEART_RATE',
  'DT_CONTINUOUS_SLEEP',
  'DT_INSTANTANEOUS_SPO2',
  'DT_INSTANTANEOUS_BLOOD_GLUCOSE',
  'DT_INSTANTANEOUS_BLOOD_PRESSURE',
  'DT_INSTANTANEOUS_STRESS',
  'DT_INSTANTANEOUS_BODY_TEMPERATURE',
  'DT_INSTANTANEOUS_SKIN_TEMPERATURE',
  'DT_VO2MAX',
] as const;

export const HUAWEI_HEALTH_RECORD_TYPES = {
  sleep: 'DT_HEALTH_RECORD_SLEEP',
  sleepBreathing: 'DT_HEALTH_RECORD_VENTILATOR',
} as const;

export const HUAWEI_HEALTH_SLEEP_RECORD_FIELDS = [
  'fall_asleep_time',
  'wakeup_time',
  'all_sleep_time',
  'light_sleep_time',
  'deep_sleep_time',
  'dream_time',
  'awake_time',
  'wakeup_count',
  'deep_sleep_part',
  'sleep_score',
  'go_bed_time',
  'sleep_type',
  'prepare_sleep_time',
  'off_bed_time',
] as const;

export const HUAWEI_HEALTH_SLEEP_BREATHING_FIELDS = [
  'sysMode',
  'sysSessionDate',
  'eventAhi',
  'sysDuration',
  'lumisTidvolMedian',
  'lumisTidvol95',
  'lumisTidvolMax',
  'clinicalRespRateMedian',
  'clinicalRespRate95',
  'clinicalRespRateMax',
  'lumisIeratioMedian',
  'lumisIeratioQuantile95',
  'lumisIeratioMax',
  'maskOff',
  'hypoventilationIndex',
  'obstructiveApneaIndex',
  'pressureBelow95',
  'hypoventilationEventTimes',
  'snoringEventTimes',
  'obstructiveApneaEventTimes',
  'centerApneaEventTimes',
  'airflowLimitEventTimes',
  'massiveLeakEventTimes',
  'unknowEventTimes',
  'allEventTimes',
] as const;

const HUAWEI_THERAPY_MODE_LABELS: Record<number, string> = {
  1: 'CPAP',
  2: 'Auto CPAP',
  3: 'BPAP',
  4: 'Auto BPAP',
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return 'Unknown native error';
}

function getNativeHuaweiHealthManager(): NativeHuaweiHealthManager | null {
  const nativeModules = (globalThis as { NativeModules?: Record<string, unknown> }).NativeModules;
  if (!nativeModules) {
    return null;
  }
  const manager = nativeModules.HuaweiHealthManager;
  if (!manager || typeof manager !== 'object') {
    return null;
  }
  return manager as NativeHuaweiHealthManager;
}

function parseCallbackPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const wrapped = payload as {
      success?: boolean;
      error?: string;
      data?: unknown;
    };
    if (wrapped.success === false) {
      throw new Error(wrapped.error ?? 'Native callback returned failure');
    }
    if (wrapped.data !== undefined) {
      return wrapped.data as T;
    }
  }
  return payload as T;
}

function callNativeMethod<T>(methodName: keyof NativeHuaweiHealthManager): Promise<T> {
  const manager = getNativeHuaweiHealthManager();
  if (!manager) {
    return Promise.reject(new Error('HuaweiHealthManager native module not found'));
  }

  const method = manager[methodName];
  if (typeof method !== 'function') {
    return Promise.reject(new Error(`HuaweiHealthManager.${String(methodName)} is not a function`));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finishResolve = (value: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        resolve(parseCallbackPayload<T>(value));
      } catch (error) {
        reject(error);
      }
    };

    const finishReject = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(toErrorMessage(error)));
    };

    try {
      const maybeResult = method.call(manager, {}, finishResolve, finishReject) as unknown;
      if (maybeResult && typeof (maybeResult as Promise<unknown>).then === 'function') {
        (maybeResult as Promise<unknown>).then(finishResolve).catch(finishReject);
      } else if (maybeResult !== undefined && method.length === 0) {
        finishResolve(maybeResult);
      }
    } catch (error) {
      finishReject(error);
    }
  });
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  }
  return undefined;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toIsoString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  return undefined;
}

function getArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.records)) {
    return value.records;
  }
  if (isRecord(value) && Array.isArray(value.samples)) {
    return value.samples;
  }
  if (isRecord(value) && Array.isArray(value.data)) {
    return value.data;
  }
  if (isRecord(value) && Array.isArray(value.items)) {
    return value.items;
  }
  return [];
}

function normalizeSeriesTimestamp(record: unknown, fallbackIndex: number): string {
  if (isRecord(record)) {
    const fromRecord = [
      record.timestamp,
      record.time,
      record.endTime,
      record.endDate,
      record.date,
      record.startTime,
      record.startDate,
      record.sampleTime,
      record.collectTime,
      record.sysSessionDate,
    ]
      .map(toIsoString)
      .find(Boolean);
    if (fromRecord) {
      return fromRecord;
    }
  }
  return new Date(Date.now() - fallbackIndex * 60 * 60 * 1000).toISOString();
}

function pickFirstNumber(source: unknown, keys: string[]): number | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  for (const key of keys) {
    const value = asNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function pickFirstString(source: unknown, keys: string[]): string | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  for (const key of keys) {
    const value = asString(source[key]) ?? toIsoString(source[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function sortRecordsByTime(records: unknown[]): unknown[] {
  return [...records].sort((left, right) => {
    const leftTime = normalizeSeriesTimestamp(left, 0);
    const rightTime = normalizeSeriesTimestamp(right, 0);
    return leftTime.localeCompare(rightTime);
  });
}

function findValue(containers: unknown[], keys: string[]): unknown {
  for (const container of containers) {
    if (!isRecord(container)) {
      continue;
    }
    for (const key of keys) {
      if (key in container) {
        return container[key];
      }
    }
  }
  return undefined;
}

function getMetricContainers(payload: UnknownRecord): unknown[] {
  return [
    payload,
    payload.metrics,
    payload.metric,
    payload.atomic,
    payload.atomicData,
    payload.atomicSampling,
    payload.latest,
    payload.dataTypes,
    payload.samples,
    payload.healthData,
  ];
}

function getRecordContainers(payload: UnknownRecord): unknown[] {
  return [
    payload,
    payload.records,
    payload.healthRecords,
    payload.recordData,
  ];
}

function extractLatestNumber(
  containers: unknown[],
  keys: string[],
  valueKeys: string[],
): number | undefined {
  const raw = findValue(containers, keys);
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'number' || typeof raw === 'string') {
    return asNumber(raw);
  }
  if (Array.isArray(raw)) {
    const sorted = sortRecordsByTime(raw);
    const latest = sorted[sorted.length - 1];
    if (typeof latest === 'number' || typeof latest === 'string') {
      return asNumber(latest);
    }
    return pickFirstNumber(latest, valueKeys);
  }
  if (isRecord(raw)) {
    const direct = pickFirstNumber(raw, ['latest', 'value', 'avg', 'average', 'total', ...valueKeys]);
    if (direct !== undefined) {
      return direct;
    }
    const records = getArray(raw);
    if (records.length > 0) {
      const latest = sortRecordsByTime(records)[records.length - 1];
      return pickFirstNumber(latest, valueKeys);
    }
  }
  return undefined;
}

function extractSummedNumber(
  containers: unknown[],
  keys: string[],
  valueKeys: string[],
): number | undefined {
  const raw = findValue(containers, keys);
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'number' || typeof raw === 'string') {
    return asNumber(raw);
  }
  if (isRecord(raw)) {
    const direct = pickFirstNumber(raw, ['today', 'total', 'sum', 'value', ...valueKeys]);
    if (direct !== undefined) {
      return direct;
    }
  }
  const records = getArray(raw);
  if (records.length === 0) {
    return undefined;
  }
  const values = records
    .map(record =>
      typeof record === 'number' || typeof record === 'string' ? asNumber(record) : pickFirstNumber(record, valueKeys),
    )
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) {
    return undefined;
  }
  return round(values.reduce((total, value) => total + value, 0), 2);
}

function extractLatestTimestamp(
  containers: unknown[],
  keys: string[],
): string | undefined {
  const raw = findValue(containers, keys);
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    return toIsoString(raw);
  }
  const records = getArray(raw);
  if (records.length > 0) {
    const sorted = sortRecordsByTime(records);
    return normalizeSeriesTimestamp(sorted[sorted.length - 1], 0);
  }
  if (isRecord(raw)) {
    return pickFirstString(raw, [
      'latestTime',
      'timestamp',
      'time',
      'endTime',
      'endDate',
      'date',
      'sampleTime',
      'collectTime',
      'sysSessionDate',
    ]);
  }
  return undefined;
}

function extractTrendSeries(
  containers: unknown[],
  keys: string[],
  valueKeys: string[],
  unit: string,
  maxPoints: number,
): HealthTrendPoint[] | undefined {
  const raw = findValue(containers, keys);
  const records = getArray(raw);
  if (records.length === 0) {
    return undefined;
  }
  const sorted = sortRecordsByTime(records).slice(-maxPoints);
  const series = sorted
    .map((record, index) => {
      const value =
        typeof record === 'number' || typeof record === 'string'
          ? asNumber(record)
          : pickFirstNumber(record, valueKeys);
      if (value === undefined) {
        return null;
      }
      return {
        timestamp: normalizeSeriesTimestamp(record, sorted.length - index),
        value: round(value, 2),
        unit,
      };
    })
    .filter((point): point is HealthTrendPoint => point !== null);

  return series.length > 0 ? series : undefined;
}

function classifyBloodPressureLevel(
  systolic?: number,
  diastolic?: number,
): HealthBloodPressureLevel | undefined {
  if (systolic === undefined && diastolic === undefined) {
    return undefined;
  }
  if ((systolic ?? 0) > 180 || (diastolic ?? 0) > 120) {
    return 'hypertensive-crisis';
  }
  if ((systolic ?? 0) >= 140 || (diastolic ?? 0) >= 90) {
    return 'hypertension-stage-2';
  }
  if ((systolic ?? 0) >= 130 || (diastolic ?? 0) >= 80) {
    return 'hypertension-stage-1';
  }
  if (systolic !== undefined && systolic >= 120 && (diastolic === undefined || diastolic < 80)) {
    return 'elevated';
  }
  return 'normal';
}

function buildBloodPressureAlert(
  heart: HealthSnapshot['heart'],
  source: HealthSnapshotSource,
): HealthAlert | null {
  if (!heart?.bloodPressureLevel || heart.bloodPressureLevel === 'normal' || heart.bloodPressureLevel === 'unknown') {
    return null;
  }

  const reading =
    heart.systolicBloodPressureMmhg !== undefined || heart.diastolicBloodPressureMmhg !== undefined
      ? `${heart.systolicBloodPressureMmhg ?? '-'} / ${heart.diastolicBloodPressureMmhg ?? '-'} mmHg`
      : 'unavailable reading';

  if (heart.bloodPressureLevel === 'hypertensive-crisis') {
    return {
      code: 'blood-pressure-alert',
      title: 'Blood pressure is very high',
      message: `Latest blood pressure reading is ${reading}. Re-check promptly and follow your care plan.`,
      severity: 'high',
      detectedAt: heart.latestBloodPressureAt,
      source,
    };
  }

  if (heart.bloodPressureLevel === 'hypertension-stage-2') {
    return {
      code: 'blood-pressure-alert',
      title: 'Blood pressure is high',
      message: `Latest blood pressure reading is ${reading}. Keep monitoring and consider medical follow-up.`,
      severity: 'high',
      detectedAt: heart.latestBloodPressureAt,
      source,
    };
  }

  return {
    code: 'blood-pressure-alert',
    title: 'Blood pressure needs attention',
    message: `Latest blood pressure reading is ${reading}. Watch the trend and re-measure regularly.`,
    severity: 'watch',
    detectedAt: heart.latestBloodPressureAt,
    source,
  };
}

function buildSleepApneaAlert(
  apnea: HealthSleepApneaData | undefined,
  source: HealthSnapshotSource,
): HealthAlert | null {
  if (!apnea) {
    return null;
  }

  const elevatedClassification = apnea.classification === 'elevated';
  const elevatedRisk = apnea.riskLevel === 'watch' || apnea.riskLevel === 'high';
  if (!elevatedClassification && !elevatedRisk) {
    return null;
  }

  const eventSummary =
    apnea.eventCountLast30d !== undefined
      ? `${apnea.eventCountLast30d} events in 30 days`
      : apnea.allEventCount !== undefined
        ? `${apnea.allEventCount} events in latest session`
        : 'recent breathing disturbance signals';

  return {
    code: 'sleep-apnea-alert',
    title:
      apnea.riskLevel === 'high' || elevatedClassification
        ? 'Sleep apnea signal detected'
        : 'Sleep apnea trend needs attention',
    message: apnea.reminder ?? `Huawei Health reported ${eventSummary}. Review the trend in context with symptoms.`,
    severity: apnea.riskLevel === 'high' || elevatedClassification ? 'high' : 'watch',
    detectedAt: apnea.latestEventAt ?? apnea.sessionDate,
    source,
  };
}

function buildSnapshotAlerts(
  source: HealthSnapshotSource,
  heart?: HealthSnapshot['heart'],
  sleep?: HealthSnapshot['sleep'],
): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const bloodPressureAlert = buildBloodPressureAlert(heart, source);
  const sleepApneaAlert = buildSleepApneaAlert(sleep?.apnea, source);

  if (bloodPressureAlert) {
    alerts.push(bloodPressureAlert);
  }
  if (sleepApneaAlert) {
    alerts.push(sleepApneaAlert);
  }
  return alerts;
}

function mapTherapyMode(modeCode?: number, modeLabel?: string): string | undefined {
  if (modeLabel) {
    return modeLabel;
  }
  if (modeCode === undefined) {
    return undefined;
  }
  return HUAWEI_THERAPY_MODE_LABELS[modeCode] ?? `Mode ${modeCode}`;
}

function looksLikeNormalizedSnapshot(payload: UnknownRecord): boolean {
  return (
    'activity' in payload ||
    'sleep' in payload ||
    'heart' in payload ||
    'oxygen' in payload ||
    'metabolic' in payload ||
    'environment' in payload ||
    'body' in payload ||
    'workouts' in payload
  );
}

function normalizeHuaweiWorkoutRecord(record: unknown): HealthWorkoutRecord | null {
  if (!isRecord(record)) {
    return null;
  }

  const startDate = pickFirstString(record, ['startTime', 'startDate', 'beginTime']);
  const endDate = pickFirstString(record, ['endTime', 'endDate', 'finishTime']);
  const durationMinutes =
    pickFirstNumber(record, ['durationMinutes', 'duration', 'totalTime', 'timeLen']) ??
    (startDate && endDate
      ? round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 60000, 1)
      : undefined);

  return {
    activityTypeCode: pickFirstNumber(record, ['activityTypeCode', 'activityType', 'sportType', 'type']),
    activityTypeName: pickFirstString(record, ['activityTypeName', 'sportName', 'name', 'activityName']),
    startDate,
    endDate,
    durationMinutes,
    totalEnergyKcal: pickFirstNumber(record, ['totalEnergyKcal', 'calories', 'energy', 'totalCalories']),
    totalDistanceKm: pickFirstNumber(record, ['totalDistanceKm', 'distanceKm', 'distance']) ?? undefined,
  };
}

function normalizeSnapshot(payload: unknown, fallbackSource: HealthSnapshotSource): HealthSnapshot {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid Huawei Health snapshot payload');
  }

  const normalized = payload as UnknownRecord;
  if (looksLikeNormalizedSnapshot(normalized)) {
    const source = normalized.source === 'mock' ? 'mock' : fallbackSource;
    const heart = (normalized.heart as HealthSnapshot['heart']) ?? undefined;
    const sleep = (normalized.sleep as HealthSnapshot['sleep']) ?? undefined;
    return {
      source,
      authorized: normalized.authorized === true,
      generatedAt: typeof normalized.generatedAt === 'string' ? normalized.generatedAt : new Date().toISOString(),
      note: typeof normalized.note === 'string' ? normalized.note : undefined,
      activity: (normalized.activity as HealthSnapshot['activity']) ?? undefined,
      sleep,
      heart,
      oxygen: (normalized.oxygen as HealthSnapshot['oxygen']) ?? undefined,
      metabolic: (normalized.metabolic as HealthSnapshot['metabolic']) ?? undefined,
      environment: (normalized.environment as HealthSnapshot['environment']) ?? undefined,
      body: (normalized.body as HealthSnapshot['body']) ?? undefined,
      workouts: (normalized.workouts as HealthSnapshot['workouts']) ?? [],
      alerts: (normalized.alerts as HealthSnapshot['alerts']) ?? buildSnapshotAlerts(source, heart, sleep),
    };
  }

  const metricContainers = getMetricContainers(normalized);
  const recordContainers = getRecordContainers(normalized);

  const stepsHourlySeriesToday = extractTrendSeries(
    metricContainers,
    ['DT_CONTINUOUS_STEPS_DELTA', 'steps', 'stepCount', 'stepsDelta'],
    ['delta', 'value', 'steps', 'stepCount', 'count'],
    'count',
    24,
  );
  const activeEnergyHourlySeriesToday = extractTrendSeries(
    metricContainers,
    ['DT_CONTINUOUS_CALORIES_BURNT', 'caloriesBurnt', 'activeCalories', 'calories'],
    ['delta', 'value', 'calories', 'calorie', 'energy'],
    'kcal',
    24,
  );
  const exerciseIntensitySeriesToday = extractTrendSeries(
    metricContainers,
    ['DT_CONTINUOUS_EXERCISE_INTENSITY_V2', 'exerciseIntensity', 'exerciseIntensityV2'],
    ['value', 'intensity', 'score'],
    'score',
    24,
  );
  const heartRateSeriesLast24h = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_HEART_RATE', 'heartRate', 'heartRateBpm'],
    ['value', 'bpm', 'heartRate', 'heart_rate'],
    'bpm',
    24,
  );
  const bloodOxygenSeriesLast24h = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_SPO2', 'spo2', 'bloodOxygen'],
    ['value', 'spo2', 'bloodOxygen', 'percent'],
    '%',
    24,
  );
  const bloodGlucoseSeriesLast7d = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_BLOOD_GLUCOSE', 'bloodGlucose', 'glucose'],
    ['value', 'mgDl', 'mgdl', 'glucose'],
    'mg/dL',
    7,
  );
  const bodyTemperatureSeriesLast7d = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_BODY_TEMPERATURE', 'bodyTemperature'],
    ['value', 'temperature', 'celsius'],
    'degC',
    7,
  );
  const skinTemperatureSeriesLast7d = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_SKIN_TEMPERATURE', 'skinTemperature'],
    ['value', 'temperature', 'celsius'],
    'degC',
    7,
  );
  const stressSeriesLast7d = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_STRESS', 'stress'],
    ['value', 'stress', 'score'],
    'score',
    7,
  );
  const respiratoryRateSeriesLast7d = extractTrendSeries(
    recordContainers,
    ['DT_HEALTH_RECORD_VENTILATOR', 'sleepBreathingRecord', 'ventilator'],
    ['clinicalRespRateMedian', 'respiratoryRateMedianBrpm', 'value'],
    'brpm',
    7,
  );
  const bodyMassSeriesLast30d = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_BODY_WEIGHT', 'bodyWeight', 'weight'],
    ['value', 'weight', 'kg'],
    'kg',
    30,
  );
  const heightSeriesLast30d = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_HEIGHT', 'height'],
    ['value', 'height', 'cm'],
    'cm',
    30,
  );
  const altitudeSeriesLast24h = extractTrendSeries(
    metricContainers,
    ['DT_INSTANTANEOUS_ALTITUDE', 'altitude'],
    ['value', 'altitude', 'meters', 'meter'],
    'm',
    24,
  );

  const sleepRecordRaw = findValue(recordContainers, [
    HUAWEI_HEALTH_RECORD_TYPES.sleep,
    'sleepRecord',
    'sleep',
  ]);
  const sleepRecords = sortRecordsByTime(getArray(sleepRecordRaw));
  const latestSleepRecord =
    sleepRecords.length > 0 ? sleepRecords[sleepRecords.length - 1] : isRecord(sleepRecordRaw) ? sleepRecordRaw : undefined;

  const sleepBreathingRaw = findValue(recordContainers, [
    HUAWEI_HEALTH_RECORD_TYPES.sleepBreathing,
    'sleepBreathingRecord',
    'ventilator',
    'sleepBreathing',
  ]);
  const sleepBreathingRecords = sortRecordsByTime(getArray(sleepBreathingRaw));
  const latestSleepBreathingRecord =
    sleepBreathingRecords.length > 0
      ? sleepBreathingRecords[sleepBreathingRecords.length - 1]
      : isRecord(sleepBreathingRaw)
        ? sleepBreathingRaw
        : undefined;

  const systolicBloodPressureMmhg = extractLatestNumber(
    metricContainers,
    ['DT_INSTANTANEOUS_BLOOD_PRESSURE', 'bloodPressure'],
    ['systolic', 'systolicBloodPressure', 'systolicMmhg', 'sbp'],
  );
  const diastolicBloodPressureMmhg = extractLatestNumber(
    metricContainers,
    ['DT_INSTANTANEOUS_BLOOD_PRESSURE', 'bloodPressure'],
    ['diastolic', 'diastolicBloodPressure', 'diastolicMmhg', 'dbp'],
  );
  const latestBloodPressureAt = extractLatestTimestamp(
    metricContainers,
    ['DT_INSTANTANEOUS_BLOOD_PRESSURE', 'bloodPressure'],
  );

  const source: HealthSnapshotSource = fallbackSource;

  const sleepApneaEventCount =
    pickFirstNumber(latestSleepBreathingRecord, ['allEventTimes', 'allEventCount']) ??
    extractSummedNumber(
      recordContainers,
      [HUAWEI_HEALTH_RECORD_TYPES.sleepBreathing, 'sleepBreathingRecord', 'ventilator'],
      ['allEventTimes', 'allEventCount'],
    );
  const sleepApneaAhi = pickFirstNumber(latestSleepBreathingRecord, ['eventAhi', 'ahi', 'ahiLastSession']);
  const sleepApneaRiskLevel =
    sleepApneaAhi === undefined
      ? sleepApneaEventCount === undefined
        ? 'unknown'
        : sleepApneaEventCount === 0
          ? 'none'
          : sleepApneaEventCount <= 5
            ? 'watch'
            : 'high'
      : sleepApneaAhi < 5
        ? 'none'
        : sleepApneaAhi < 15
          ? 'watch'
          : 'high';

  const sleep = {
    inBedMinutesLast36h:
      pickFirstNumber(latestSleepRecord, ['all_sleep_time', 'allSleepTime']) ??
      extractSummedNumber(metricContainers, ['DT_CONTINUOUS_SLEEP', 'sleepDuration'], ['value', 'durationMinutes']),
    asleepMinutesLast36h:
      pickFirstNumber(latestSleepRecord, ['all_sleep_time', 'allSleepTime']) ??
      extractSummedNumber(metricContainers, ['DT_CONTINUOUS_SLEEP', 'sleepDuration'], ['value', 'durationMinutes']),
    awakeMinutesLast36h: pickFirstNumber(latestSleepRecord, ['awake_time', 'awakeTime']),
    sampleCountLast36h: sleepRecords.length || undefined,
    sleepScore: pickFirstNumber(latestSleepRecord, ['sleep_score', 'sleepScore']),
    fellAsleepAt: pickFirstString(latestSleepRecord, ['fall_asleep_time', 'fallAsleepTime']),
    wokeUpAt: pickFirstString(latestSleepRecord, ['wakeup_time', 'wakeUpTime']),
    wentToBedAt: pickFirstString(latestSleepRecord, ['go_bed_time', 'goBedTime', 'go_bed_time_new']),
    offBedAt: pickFirstString(latestSleepRecord, ['off_bed_time', 'offBedTime']),
    prepareSleepMinutes: pickFirstNumber(latestSleepRecord, ['prepare_sleep_time', 'prepareSleepTime']),
    allSleepMinutes: pickFirstNumber(latestSleepRecord, ['all_sleep_time', 'allSleepTime']),
    lightSleepMinutes: pickFirstNumber(latestSleepRecord, ['light_sleep_time', 'lightSleepTime']),
    deepSleepMinutes: pickFirstNumber(latestSleepRecord, ['deep_sleep_time', 'deepSleepTime']),
    dreamMinutes: pickFirstNumber(latestSleepRecord, ['dream_time', 'dreamTime']),
    wakeUpCount: pickFirstNumber(latestSleepRecord, ['wakeup_count', 'wakeUpCount', 'wakeUpCnt']),
    deepSleepSegmentCount: pickFirstNumber(latestSleepRecord, ['deep_sleep_part', 'deepSleepPart']),
    sleepType:
      pickFirstNumber(latestSleepRecord, ['sleep_type', 'sleepType']) ??
      pickFirstString(latestSleepRecord, ['sleep_type', 'sleepType']),
    stageMinutesLast36h:
      latestSleepRecord !== undefined
        ? {
            awakeMinutes: pickFirstNumber(latestSleepRecord, ['awake_time', 'awakeTime']),
            asleepDeepMinutes: pickFirstNumber(latestSleepRecord, ['deep_sleep_time', 'deepSleepTime']),
          }
        : undefined,
    apnea:
      latestSleepBreathingRecord !== undefined || sleepApneaEventCount !== undefined
        ? {
            eventCountLast30d: sleepApneaEventCount,
            durationMinutesLast30d: undefined,
            latestEventAt: pickFirstString(latestSleepBreathingRecord, ['sysSessionDate', 'latestEventAt']),
            ahiLastSession: sleepApneaAhi,
            therapyModeCode: pickFirstNumber(latestSleepBreathingRecord, ['sysMode', 'therapyModeCode']),
            therapyMode: mapTherapyMode(
              pickFirstNumber(latestSleepBreathingRecord, ['sysMode', 'therapyModeCode']),
              pickFirstString(latestSleepBreathingRecord, ['therapyMode', 'therapyModeName']),
            ),
            sessionDate: pickFirstString(latestSleepBreathingRecord, ['sysSessionDate', 'sessionDate']),
            sessionDurationMinutes: pickFirstNumber(latestSleepBreathingRecord, ['sysDuration', 'durationMinutes']),
            tidalVolumeMedianMl: pickFirstNumber(latestSleepBreathingRecord, ['lumisTidvolMedian']),
            tidalVolumeP95Ml: pickFirstNumber(latestSleepBreathingRecord, ['lumisTidvol95']),
            tidalVolumeMaxMl: pickFirstNumber(latestSleepBreathingRecord, ['lumisTidvolMax']),
            respiratoryRateMedianBrpm: pickFirstNumber(latestSleepBreathingRecord, ['clinicalRespRateMedian']),
            respiratoryRateP95Brpm: pickFirstNumber(latestSleepBreathingRecord, ['clinicalRespRate95']),
            respiratoryRateMaxBrpm: pickFirstNumber(latestSleepBreathingRecord, ['clinicalRespRateMax']),
            inspirationExpirationRatioMedian: pickFirstNumber(latestSleepBreathingRecord, ['lumisIeratioMedian']),
            inspirationExpirationRatioP95: pickFirstNumber(latestSleepBreathingRecord, ['lumisIeratioQuantile95']),
            inspirationExpirationRatioMax: pickFirstNumber(latestSleepBreathingRecord, ['lumisIeratioMax']),
            maskOffCount: pickFirstNumber(latestSleepBreathingRecord, ['maskOff']),
            hypoventilationIndex: pickFirstNumber(latestSleepBreathingRecord, ['hypoventilationIndex']),
            obstructiveApneaIndex: pickFirstNumber(latestSleepBreathingRecord, ['obstructiveApneaIndex']),
            pressureBelow95: pickFirstNumber(latestSleepBreathingRecord, ['pressureBelow95']),
            hypoventilationEventCount: pickFirstNumber(latestSleepBreathingRecord, ['hypoventilationEventTimes']),
            snoringEventCount: pickFirstNumber(latestSleepBreathingRecord, ['snoringEventTimes']),
            obstructiveApneaEventCount: pickFirstNumber(latestSleepBreathingRecord, ['obstructiveApneaEventTimes']),
            centralApneaEventCount: pickFirstNumber(latestSleepBreathingRecord, ['centerApneaEventTimes']),
            airflowLimitationEventCount: pickFirstNumber(latestSleepBreathingRecord, ['airflowLimitEventTimes']),
            massiveLeakEventCount: pickFirstNumber(latestSleepBreathingRecord, ['massiveLeakEventTimes']),
            unknownEventCount: pickFirstNumber(latestSleepBreathingRecord, ['unknowEventTimes']),
            allEventCount: pickFirstNumber(latestSleepBreathingRecord, ['allEventTimes', 'allEventCount']),
            classification:
              sleepApneaRiskLevel === 'none'
                ? 'notElevated'
                : sleepApneaRiskLevel === 'unknown'
                  ? 'unknown'
                  : 'elevated',
            riskLevel: sleepApneaRiskLevel,
            reminder:
              sleepApneaRiskLevel === 'high'
                ? 'Huawei Health reported a high sleep-breathing burden. Review the trend and symptoms promptly.'
                : sleepApneaRiskLevel === 'watch'
                  ? 'Huawei Health reported a watch-level sleep-breathing burden. Keep monitoring the trend.'
                  : sleepApneaRiskLevel === 'none'
                    ? 'No elevated sleep-breathing signal in the latest Huawei Health session.'
                    : undefined,
          }
        : undefined,
  } satisfies NonNullable<HealthSnapshot['sleep']>;

  const heart = {
    latestHeartRateBpm: extractLatestNumber(
      metricContainers,
      ['DT_INSTANTANEOUS_HEART_RATE', 'heartRate', 'heartRateBpm'],
      ['value', 'bpm', 'heartRate', 'heart_rate'],
    ),
    restingHeartRateBpm: extractLatestNumber(
      metricContainers,
      ['DT_INSTANTANEOUS_RESTING_HEART_RATE', 'restingHeartRate'],
      ['value', 'bpm', 'heartRate', 'heart_rate'],
    ),
    vo2MaxMlKgMin: extractLatestNumber(metricContainers, ['DT_VO2MAX', 'vo2Max'], ['value', 'vo2Max']),
    systolicBloodPressureMmhg,
    diastolicBloodPressureMmhg,
    latestBloodPressureAt,
    bloodPressureLevel: classifyBloodPressureLevel(systolicBloodPressureMmhg, diastolicBloodPressureMmhg),
    heartRateSeriesLast24h,
  } satisfies NonNullable<HealthSnapshot['heart']>;

  const activity = {
    stepsToday:
      extractSummedNumber(
        metricContainers,
        ['DT_CONTINUOUS_STEPS_DELTA', 'steps', 'stepCount', 'stepsDelta'],
        ['delta', 'value', 'steps', 'stepCount', 'count'],
      ) ?? stepsHourlySeriesToday?.reduce((sum, point) => sum + point.value, 0),
    distanceWalkingRunningKmToday: extractSummedNumber(
      metricContainers,
      ['DT_CONTINUOUS_DISTANCE_DELTA', 'distance', 'distanceDelta'],
      ['delta', 'value', 'distance', 'km'],
    ),
    activeEnergyKcalToday:
      extractSummedNumber(
        metricContainers,
        ['DT_CONTINUOUS_CALORIES_BURNT', 'caloriesBurnt', 'activeCalories', 'calories'],
        ['delta', 'value', 'calories', 'energy'],
      ) ?? activeEnergyHourlySeriesToday?.reduce((sum, point) => sum + point.value, 0),
    exerciseIntensityScoreToday:
      extractLatestNumber(
        metricContainers,
        ['DT_CONTINUOUS_EXERCISE_INTENSITY_V2', 'exerciseIntensity', 'exerciseIntensityV2'],
        ['value', 'intensity', 'score'],
      ) ??
      exerciseIntensitySeriesToday?.[exerciseIntensitySeriesToday.length - 1]?.value,
    altitudeMeters:
      extractLatestNumber(
        metricContainers,
        ['DT_INSTANTANEOUS_ALTITUDE', 'altitude'],
        ['value', 'altitude', 'meters', 'meter'],
      ) ?? altitudeSeriesLast24h?.[altitudeSeriesLast24h.length - 1]?.value,
    stepsHourlySeriesToday,
    activeEnergyHourlySeriesToday,
    exerciseIntensitySeriesToday,
    altitudeSeriesLast24h,
  } satisfies NonNullable<HealthSnapshot['activity']>;

  const oxygen = {
    bloodOxygenPercent:
      extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_SPO2', 'spo2', 'bloodOxygen'], [
        'value',
        'spo2',
        'bloodOxygen',
        'percent',
      ]) ?? bloodOxygenSeriesLast24h?.[bloodOxygenSeriesLast24h.length - 1]?.value,
    bloodOxygenSeriesLast24h,
  } satisfies NonNullable<HealthSnapshot['oxygen']>;

  const bloodGlucoseMgDl =
    extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_BLOOD_GLUCOSE', 'bloodGlucose', 'glucose'], [
      'value',
      'mgDl',
      'mgdl',
      'glucose',
    ]) ?? bloodGlucoseSeriesLast7d?.[bloodGlucoseSeriesLast7d.length - 1]?.value;

  const metabolic = {
    bloodGlucoseMgDl,
    bloodGlucoseSeriesLast7d,
  } satisfies NonNullable<HealthSnapshot['metabolic']>;

  const body = {
    heightCm:
      extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_HEIGHT', 'height'], ['value', 'height', 'cm']) ??
      heightSeriesLast30d?.[heightSeriesLast30d.length - 1]?.value,
    respiratoryRateBrpm:
      pickFirstNumber(latestSleepBreathingRecord, ['clinicalRespRateMedian']) ??
      respiratoryRateSeriesLast7d?.[respiratoryRateSeriesLast7d.length - 1]?.value,
    stressScore:
      extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_STRESS', 'stress'], ['value', 'stress', 'score']) ??
      stressSeriesLast7d?.[stressSeriesLast7d.length - 1]?.value,
    bodyTemperatureCelsius:
      extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_BODY_TEMPERATURE', 'bodyTemperature'], [
        'value',
        'temperature',
        'celsius',
      ]) ?? bodyTemperatureSeriesLast7d?.[bodyTemperatureSeriesLast7d.length - 1]?.value,
    skinTemperatureCelsius:
      extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_SKIN_TEMPERATURE', 'skinTemperature'], [
        'value',
        'temperature',
        'celsius',
      ]) ?? skinTemperatureSeriesLast7d?.[skinTemperatureSeriesLast7d.length - 1]?.value,
    bodyMassKg:
      extractLatestNumber(metricContainers, ['DT_INSTANTANEOUS_BODY_WEIGHT', 'bodyWeight', 'weight'], [
        'value',
        'weight',
        'kg',
      ]) ?? bodyMassSeriesLast30d?.[bodyMassSeriesLast30d.length - 1]?.value,
    heightSeriesLast30d,
    respiratoryRateSeriesLast7d,
    stressSeriesLast7d,
    bodyTemperatureSeriesLast7d,
    skinTemperatureSeriesLast7d,
    bodyMassSeriesLast30d,
  } satisfies NonNullable<HealthSnapshot['body']>;

  const workoutCandidates = [
    findValue(recordContainers, ['activityRecords', 'exerciseRecords', 'workouts', 'sportRecords']),
    normalized.workouts,
  ]
    .flatMap(getArray)
    .map(normalizeHuaweiWorkoutRecord)
    .filter((workout): workout is HealthWorkoutRecord => workout !== null);

  const alerts = buildSnapshotAlerts(source, heart, sleep);

  return {
    source,
    authorized: asBoolean(normalized.authorized) ?? true,
    generatedAt: asString(normalized.generatedAt) ?? new Date().toISOString(),
    note:
      asString(normalized.note) ??
      'Huawei Health snapshot normalized from Health Kit atomic sampling data and health record payloads.',
    activity,
    sleep,
    heart,
    oxygen,
    metabolic,
    body,
    workouts: workoutCandidates,
    alerts,
  };
}

function toHuaweiSnapshot(snapshot: HealthSnapshot): HealthSnapshot {
  if (snapshot.source === 'mock') {
    return snapshot;
  }
  return {
    ...snapshot,
    source: 'huawei-health',
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
  };
}

function buildHuaweiFallbackSnapshot(reason: string): HealthSnapshot {
  const snapshot = buildMockHealthSnapshot();
  const stressScore = snapshot.body?.stressScore ?? 41;
  const skinTemperature = snapshot.body?.skinTemperatureCelsius ?? 34.4;
  const apnea = snapshot.sleep?.apnea;
  const note = snapshot.note ? `${reason} ${snapshot.note}` : reason;

  return {
    ...snapshot,
    note,
    body: snapshot.body
      ? {
          ...snapshot.body,
          heightCm: snapshot.body.heightCm ?? 172,
          stressScore,
          skinTemperatureCelsius: skinTemperature,
        }
      : undefined,
    sleep: snapshot.sleep
      ? {
          ...snapshot.sleep,
          apnea: apnea
            ? {
                ...apnea,
                ahiLastSession: apnea.ahiLastSession ?? 3.2,
                therapyModeCode: apnea.therapyModeCode ?? 2,
                therapyMode: apnea.therapyMode ?? 'Auto CPAP',
              }
            : apnea,
        }
      : undefined,
  };
}

export function isHuaweiHealthNativeAvailable(): boolean {
  return Boolean(getNativeHuaweiHealthManager());
}

export async function isHuaweiHealthAvailable(hooks: HuaweiHealthHooks = {}): Promise<boolean> {
  if (hooks.isAvailable) {
    return Boolean(await hooks.isAvailable());
  }

  const manager = getNativeHuaweiHealthManager();
  if (!manager) {
    return false;
  }

  return callNativeMethod<boolean>('isHealthDataAvailable').catch(() => true);
}

export async function authorizeHuaweiHealth(hooks: HuaweiHealthHooks = {}): Promise<boolean> {
  if (hooks.requestAuthorization) {
    return Boolean(await hooks.requestAuthorization());
  }

  const manager = getNativeHuaweiHealthManager();
  if (!manager) {
    return false;
  }

  const available = await callNativeMethod<boolean>('isHealthDataAvailable').catch(() => false);
  if (!available) {
    return false;
  }

  return callNativeMethod<boolean>('requestAuthorization').catch(() => false);
}

export async function loadHuaweiHealthSnapshot(hooks: HuaweiHealthHooks = {}): Promise<HealthSnapshot> {
  const useMockWhenUnavailable = hooks.useMockWhenUnavailable ?? true;

  if (hooks.readSnapshot) {
    const snapshot = await hooks.readSnapshot();
    return toHuaweiSnapshot(snapshot);
  }

  if (hooks.readRawData) {
    const rawPayload = await hooks.readRawData();
    return normalizeSnapshot(rawPayload, 'huawei-health');
  }

  const manager = getNativeHuaweiHealthManager();
  if (!manager) {
    if (useMockWhenUnavailable) {
      return buildHuaweiFallbackSnapshot(
        'HuaweiHealthManager native module is unavailable. Returned mock snapshot.',
      );
    }
    throw new Error('HuaweiHealthManager native module not found');
  }

  const nativeSnapshot = await callNativeMethod<unknown>('getHealthSnapshot');
  return normalizeSnapshot(nativeSnapshot, 'huawei-health');
}

export function scoreHuaweiSleepApneaRisk(
  ahiLastSession?: number,
  eventCount?: number,
): NonNullable<NonNullable<HealthSnapshot['sleep']>['apnea']>['riskLevel'] {
  if (ahiLastSession !== undefined) {
    if (ahiLastSession < 5) {
      return 'none';
    }
    if (ahiLastSession < 15) {
      return 'watch';
    }
    return 'high';
  }
  if (eventCount === undefined) {
    return 'unknown';
  }
  if (eventCount === 0) {
    return 'none';
  }
  return eventCount <= 5 ? 'watch' : 'high';
}

export function summarizeHuaweiSleepScore(score?: number): 'poor' | 'fair' | 'good' | 'excellent' | 'unknown' {
  if (score === undefined) {
    return 'unknown';
  }
  const normalized = clamp(score, 0, 100);
  if (normalized < 60) {
    return 'poor';
  }
  if (normalized < 75) {
    return 'fair';
  }
  if (normalized < 90) {
    return 'good';
  }
  return 'excellent';
}
