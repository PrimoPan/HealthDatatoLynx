import { buildMockHealthSnapshot } from './health.js';
import type {
  HealthAlert,
  HealthBloodPressureLevel,
  HealthSnapshot,
  HealthSnapshotSource,
  HealthTrendPoint,
  HealthWorkoutRecord,
} from '../types/health.js';

type NativeHealthConnectMethod = (...args: unknown[]) => unknown;

type NativeHealthConnectManager = {
  isHealthDataAvailable?: NativeHealthConnectMethod;
  getSdkStatus?: NativeHealthConnectMethod;
  getFeatureStatus?: NativeHealthConnectMethod;
  requestAuthorization?: NativeHealthConnectMethod;
  getHealthSnapshot?: NativeHealthConnectMethod;
};

type UnknownRecord = Record<string, unknown>;

export type HealthConnectHooks = {
  isAvailable?: () => Promise<boolean> | boolean;
  getSdkStatus?: () => Promise<string | number> | string | number;
  getFeatureStatus?: (feature: string) => Promise<string | number> | string | number;
  requestAuthorization?: () => Promise<boolean> | boolean;
  readSnapshot?: () => Promise<HealthSnapshot> | HealthSnapshot;
  readRawData?: () => Promise<unknown> | unknown;
  useMockWhenUnavailable?: boolean;
};

export const HEALTH_CONNECT_LATEST_REQUIREMENTS = {
  releaseNotesUpdatedAt: '2026-01-28T00:00:00Z',
  featuresDocsUpdatedAt: '2026-02-12T00:00:00Z',
  minAndroidApiLevelForSdk: 26,
  minAndroidApiLevelForStandaloneApp: 28,
  frameworkIntegratedFromAndroidApiLevel: 34,
  stableJetpackVersion: '1.1.0',
  alphaJetpackVersion: '1.2.0-alpha02',
} as const;

export const HEALTH_CONNECT_SDK_STATUS = {
  SDK_UNAVAILABLE: 1,
  SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
  SDK_AVAILABLE: 3,
} as const;

export const HEALTH_CONNECT_FEATURES = {
  READ_HEALTH_DATA_IN_BACKGROUND: 'FEATURE_READ_HEALTH_DATA_IN_BACKGROUND',
  PERSONAL_HEALTH_RECORD: 'FEATURE_PERSONAL_HEALTH_RECORD',
  SKIN_TEMPERATURE: 'FEATURE_SKIN_TEMPERATURE',
} as const;

export const HEALTH_CONNECT_RECORD_TYPES = {
  steps: 'StepsRecord',
  distance: 'DistanceRecord',
  calories: 'TotalCaloriesBurnedRecord',
  exercise: 'ExerciseSessionRecord',
  heartRate: 'HeartRateRecord',
  restingHeartRate: 'RestingHeartRateRecord',
  bloodOxygen: 'OxygenSaturationRecord',
  bloodPressure: 'BloodPressureRecord',
  bloodGlucose: 'BloodGlucoseRecord',
  sleep: 'SleepSessionRecord',
  weight: 'WeightRecord',
  height: 'HeightRecord',
  respiratoryRate: 'RespiratoryRateRecord',
  bodyTemperature: 'BodyTemperatureRecord',
  skinTemperature: 'SkinTemperatureRecord',
  vo2Max: 'Vo2MaxRecord',
} as const;

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

function getNativeHealthConnectManager(): NativeHealthConnectManager | null {
  const nativeModules = (globalThis as { NativeModules?: Record<string, unknown> }).NativeModules;
  if (!nativeModules) {
    return null;
  }
  const manager = nativeModules.HealthConnectManager;
  if (!manager || typeof manager !== 'object') {
    return null;
  }
  return manager as NativeHealthConnectManager;
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

function callNativeMethod<T>(
  methodName: keyof NativeHealthConnectManager,
  ...args: unknown[]
): Promise<T> {
  const manager = getNativeHealthConnectManager();
  if (!manager) {
    return Promise.reject(new Error('HealthConnectManager native module not found'));
  }

  const method = manager[methodName];
  if (typeof method !== 'function') {
    return Promise.reject(new Error(`HealthConnectManager.${String(methodName)} is not a function`));
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
      const maybeResult = method.call(manager, ...args, finishResolve, finishReject) as unknown;
      if (maybeResult && typeof (maybeResult as Promise<unknown>).then === 'function') {
        (maybeResult as Promise<unknown>).then(finishResolve).catch(finishReject);
      } else if (maybeResult !== undefined && method.length <= args.length) {
        finishResolve(maybeResult);
      }
    } catch (error) {
      finishReject(error);
    }
  });
}

function isHealthSnapshotSource(value: unknown): value is HealthSnapshotSource {
  return (
    value === 'healthkit' ||
    value === 'health-connect' ||
    value === 'xiaomi-health' ||
    value === 'huawei-health' ||
    value === 'mock'
  );
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
      record.endTime,
      record.time,
      record.timestamp,
      record.endDate,
      record.date,
      record.startTime,
      record.startDate,
      record.lastModifiedTime,
    ]
      .map(toIsoString)
      .find(Boolean);
    if (fromRecord) {
      return fromRecord;
    }
  }
  return new Date(Date.now() - fallbackIndex * 60 * 60 * 1000).toISOString();
}

function sortRecordsByTime(records: unknown[]): unknown[] {
  return [...records].sort((left, right) =>
    normalizeSeriesTimestamp(left, 0).localeCompare(normalizeSeriesTimestamp(right, 0)),
  );
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

function getContainers(payload: UnknownRecord): unknown[] {
  return [
    payload,
    payload.records,
    payload.samples,
    payload.data,
    payload.healthConnect,
    payload.healthConnectData,
  ];
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

function extractRecords(containers: unknown[], keys: string[]): unknown[] {
  return getArray(findValue(containers, keys));
}

function extractLatestRecord(containers: unknown[], keys: string[]): unknown {
  const records = sortRecordsByTime(extractRecords(containers, keys));
  return records.length > 0 ? records[records.length - 1] : undefined;
}

function extractTrendSeries(
  containers: unknown[],
  keys: string[],
  valueKeys: string[],
  unit: string,
  maxPoints: number,
): HealthTrendPoint[] | undefined {
  const records = sortRecordsByTime(extractRecords(containers, keys)).slice(-maxPoints);
  const series = records
    .map((record, index) => {
      const value =
        typeof record === 'number' || typeof record === 'string'
          ? asNumber(record)
          : pickFirstNumber(record, valueKeys);
      if (value === undefined) {
        return null;
      }
      return {
        timestamp: normalizeSeriesTimestamp(record, records.length - index),
        value: round(value, 2),
        unit,
      };
    })
    .filter((item): item is HealthTrendPoint => item !== null);
  return series.length > 0 ? series : undefined;
}

function sumRecordValues(records: unknown[], valueKeys: string[]): number | undefined {
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

function readBloodGlucoseMgDl(record: unknown): number | undefined {
  const mgDl = pickFirstNumber(record, ['levelMgPerdL', 'levelMgPerDl', 'mgDl', 'value']);
  if (mgDl !== undefined) {
    return mgDl;
  }
  const mmol = pickFirstNumber(record, ['levelMillimolesPerLiter', 'mmolL']);
  return mmol !== undefined ? round(mmol * 18, 1) : undefined;
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

function buildAlerts(source: HealthSnapshotSource, heart?: HealthSnapshot['heart']): HealthAlert[] | undefined {
  if (!heart?.bloodPressureLevel || heart.bloodPressureLevel === 'normal' || heart.bloodPressureLevel === 'unknown') {
    return undefined;
  }

  const reading =
    heart.systolicBloodPressureMmhg !== undefined || heart.diastolicBloodPressureMmhg !== undefined
      ? `${heart.systolicBloodPressureMmhg ?? '-'} / ${heart.diastolicBloodPressureMmhg ?? '-'} mmHg`
      : 'unavailable reading';

  const severity = heart.bloodPressureLevel === 'hypertension-stage-1' ? 'watch' : 'high';
  return [
    {
      code: 'blood-pressure-alert',
      title: severity === 'high' ? 'Blood pressure is high' : 'Blood pressure needs attention',
      message: `Latest blood pressure reading is ${reading}. Review the trend in context.`,
      severity,
      detectedAt: heart.latestBloodPressureAt,
      source,
    },
  ];
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

function normalizeExerciseSessionRecord(record: unknown): HealthWorkoutRecord | null {
  if (!isRecord(record)) {
    return null;
  }

  const startDate = pickFirstString(record, ['startTime', 'startDate']);
  const endDate = pickFirstString(record, ['endTime', 'endDate']);

  const totalDistanceKm =
    pickFirstNumber(record, ['totalDistanceKm', 'distanceKm']) ??
    (() => {
      const meters = pickFirstNumber(record, ['totalDistance', 'distanceMeters', 'distance']);
      return meters !== undefined ? round(meters / 1000, 2) : undefined;
    })();

  return {
    activityTypeCode: pickFirstNumber(record, ['exerciseTypeCode', 'exerciseType', 'activityTypeCode']),
    activityTypeName: pickFirstString(record, ['exerciseTypeName', 'title', 'exerciseType', 'activityTypeName']),
    startDate,
    endDate,
    durationMinutes:
      pickFirstNumber(record, ['durationMinutes']) ??
      (startDate && endDate ? round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 60000, 1) : undefined),
    totalEnergyKcal: pickFirstNumber(record, ['totalEnergyBurned', 'totalCaloriesBurned', 'energyKcal', 'kcal']),
    totalDistanceKm,
  };
}

function normalizeSnapshot(payload: unknown, fallbackSource: HealthSnapshotSource): HealthSnapshot {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid Health Connect snapshot payload');
  }

  const normalized = payload as UnknownRecord;
  if (looksLikeNormalizedSnapshot(normalized)) {
    const source = isHealthSnapshotSource(normalized.source) ? normalized.source : fallbackSource;
    const heart = (normalized.heart as HealthSnapshot['heart']) ?? undefined;
    return {
      source,
      authorized: normalized.authorized === true,
      generatedAt: typeof normalized.generatedAt === 'string' ? normalized.generatedAt : new Date().toISOString(),
      note: typeof normalized.note === 'string' ? normalized.note : undefined,
      activity: (normalized.activity as HealthSnapshot['activity']) ?? undefined,
      sleep: (normalized.sleep as HealthSnapshot['sleep']) ?? undefined,
      heart,
      oxygen: (normalized.oxygen as HealthSnapshot['oxygen']) ?? undefined,
      metabolic: (normalized.metabolic as HealthSnapshot['metabolic']) ?? undefined,
      environment: (normalized.environment as HealthSnapshot['environment']) ?? undefined,
      body: (normalized.body as HealthSnapshot['body']) ?? undefined,
      workouts: (normalized.workouts as HealthSnapshot['workouts']) ?? [],
      alerts: (normalized.alerts as HealthSnapshot['alerts']) ?? buildAlerts(source, heart),
    };
  }

  const containers = getContainers(normalized);
  const stepsRecords = extractRecords(containers, [HEALTH_CONNECT_RECORD_TYPES.steps, 'steps']);
  const caloriesRecords = extractRecords(containers, [HEALTH_CONNECT_RECORD_TYPES.calories, 'calories']);
  const exerciseRecords = extractRecords(containers, [HEALTH_CONNECT_RECORD_TYPES.exercise, 'exerciseSessions', 'workouts']);
  const sleepRecords = extractRecords(containers, [HEALTH_CONNECT_RECORD_TYPES.sleep, 'sleep']);
  const bloodGlucoseRecords = extractRecords(containers, [HEALTH_CONNECT_RECORD_TYPES.bloodGlucose, 'bloodGlucose']);

  const stepsHourlySeriesToday = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.steps, 'steps'],
    ['count', 'steps', 'value'],
    'count',
    24,
  );
  const activeEnergyHourlySeriesToday = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.calories, 'calories'],
    ['energyKcal', 'kcal', 'value'],
    'kcal',
    24,
  );
  const heartRateSeriesLast24h = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.heartRate, 'heartRate'],
    ['beatsPerMinute', 'bpm', 'value'],
    'bpm',
    24,
  );
  const bloodOxygenSeriesLast24h = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.bloodOxygen, 'bloodOxygen', 'spo2'],
    ['percentage', 'percent', 'value'],
    '%',
    24,
  );
  const bodyMassSeriesLast30d = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.weight, 'weight'],
    ['massKg', 'kg', 'value'],
    'kg',
    30,
  );
  const heightSeriesLast30d = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.height, 'height'],
    ['heightCm', 'cm', 'value'],
    'cm',
    30,
  );
  const respiratoryRateSeriesLast7d = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.respiratoryRate, 'respiratoryRate'],
    ['rate', 'breathsPerMinute', 'value'],
    'brpm',
    7,
  );
  const bodyTemperatureSeriesLast7d = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.bodyTemperature, 'bodyTemperature'],
    ['temperatureCelsius', 'celsius', 'value'],
    'degC',
    7,
  );
  const skinTemperatureSeriesLast7d = extractTrendSeries(
    containers,
    [HEALTH_CONNECT_RECORD_TYPES.skinTemperature, 'skinTemperature'],
    ['temperatureDeltaCelsius', 'temperatureCelsius', 'celsius', 'value'],
    'degC',
    7,
  );

  const latestRestingHeartRate = extractLatestRecord(containers, [
    HEALTH_CONNECT_RECORD_TYPES.restingHeartRate,
    'restingHeartRate',
  ]);
  const latestBloodPressure = extractLatestRecord(containers, [
    HEALTH_CONNECT_RECORD_TYPES.bloodPressure,
    'bloodPressure',
  ]);
  const latestSleep = extractLatestRecord(containers, [HEALTH_CONNECT_RECORD_TYPES.sleep, 'sleep']);
  const latestBloodGlucose = sortRecordsByTime(bloodGlucoseRecords).slice(-1)[0];

  const sleepStart = pickFirstString(latestSleep, ['startTime', 'startDate']);
  const sleepEnd = pickFirstString(latestSleep, ['endTime', 'endDate']);
  const sleepDurationMinutes =
    pickFirstNumber(latestSleep, ['durationMinutes', 'duration']) ??
    (sleepStart && sleepEnd ? round((new Date(sleepEnd).getTime() - new Date(sleepStart).getTime()) / 60000, 1) : undefined);

  const heart = {
    latestHeartRateBpm: heartRateSeriesLast24h?.[heartRateSeriesLast24h.length - 1]?.value,
    restingHeartRateBpm: pickFirstNumber(latestRestingHeartRate, ['beatsPerMinute', 'bpm', 'value']),
    vo2MaxMlKgMin: pickFirstNumber(
      extractLatestRecord(containers, [HEALTH_CONNECT_RECORD_TYPES.vo2Max, 'vo2Max']),
      ['millilitersPerMinuteKilogram', 'value'],
    ),
    systolicBloodPressureMmhg: pickFirstNumber(latestBloodPressure, ['systolic', 'systolicMmhg', 'systolicMillimetersOfMercury']),
    diastolicBloodPressureMmhg: pickFirstNumber(latestBloodPressure, [
      'diastolic',
      'diastolicMmhg',
      'diastolicMillimetersOfMercury',
    ]),
    latestBloodPressureAt: pickFirstString(latestBloodPressure, ['time', 'timestamp', 'endTime']),
    bloodPressureLevel: classifyBloodPressureLevel(
      pickFirstNumber(latestBloodPressure, ['systolic', 'systolicMmhg', 'systolicMillimetersOfMercury']),
      pickFirstNumber(latestBloodPressure, ['diastolic', 'diastolicMmhg', 'diastolicMillimetersOfMercury']),
    ),
    heartRateSeriesLast24h,
  } satisfies NonNullable<HealthSnapshot['heart']>;

  return {
    source: fallbackSource,
    authorized: asBoolean(normalized.authorized) ?? true,
    generatedAt: asString(normalized.generatedAt) ?? new Date().toISOString(),
    note:
      asString(normalized.note) ??
      'Health Connect snapshot normalized from Android record payloads.',
    activity: {
      stepsToday: sumRecordValues(stepsRecords, ['count', 'steps', 'value']) ?? stepsHourlySeriesToday?.reduce((sum, point) => sum + point.value, 0),
      distanceWalkingRunningKmToday:
        (() => {
          const distanceRecords = extractRecords(containers, [HEALTH_CONNECT_RECORD_TYPES.distance, 'distance']);
          const meters = sumRecordValues(distanceRecords, ['meters', 'distanceMeters', 'value']);
          return meters !== undefined ? round(meters / 1000, 2) : undefined;
        })(),
      activeEnergyKcalToday:
        sumRecordValues(caloriesRecords, ['energyKcal', 'kcal', 'value']) ??
        activeEnergyHourlySeriesToday?.reduce((sum, point) => sum + point.value, 0),
      exerciseMinutesToday: exerciseRecords.length
        ? round(
            exerciseRecords.reduce<number>((sum, record) => {
              const start = pickFirstString(record, ['startTime', 'startDate']);
              const end = pickFirstString(record, ['endTime', 'endDate']);
              const minutes =
                pickFirstNumber(record, ['durationMinutes', 'duration']) ??
                (start && end ? (new Date(end).getTime() - new Date(start).getTime()) / 60000 : 0);
              return sum + minutes;
            }, 0),
            1,
          )
        : undefined,
      stepsHourlySeriesToday,
      activeEnergyHourlySeriesToday,
    },
    sleep: {
      asleepMinutesLast36h: sleepDurationMinutes,
      sampleCountLast36h: sleepRecords.length || undefined,
      fellAsleepAt: sleepStart,
      wokeUpAt: sleepEnd,
      allSleepMinutes: sleepDurationMinutes,
    },
    heart,
    oxygen: {
      bloodOxygenPercent: bloodOxygenSeriesLast24h?.[bloodOxygenSeriesLast24h.length - 1]?.value,
      bloodOxygenSeriesLast24h,
    },
    metabolic: {
      bloodGlucoseMgDl: readBloodGlucoseMgDl(latestBloodGlucose),
      bloodGlucoseSeriesLast7d:
        sortRecordsByTime(bloodGlucoseRecords)
          .slice(-7)
          .map((record, index) => {
            const value = readBloodGlucoseMgDl(record);
            if (value === undefined) {
              return null;
            }
            return {
              timestamp: normalizeSeriesTimestamp(record, 7 - index),
              value,
              unit: 'mg/dL',
            };
          })
          .filter((item): item is HealthTrendPoint => item !== null) || undefined,
    },
    body: {
      bodyMassKg: bodyMassSeriesLast30d?.[bodyMassSeriesLast30d.length - 1]?.value,
      heightCm: heightSeriesLast30d?.[heightSeriesLast30d.length - 1]?.value,
      respiratoryRateBrpm: respiratoryRateSeriesLast7d?.[respiratoryRateSeriesLast7d.length - 1]?.value,
      bodyTemperatureCelsius: bodyTemperatureSeriesLast7d?.[bodyTemperatureSeriesLast7d.length - 1]?.value,
      skinTemperatureCelsius: skinTemperatureSeriesLast7d?.[skinTemperatureSeriesLast7d.length - 1]?.value,
      bodyMassSeriesLast30d,
      heightSeriesLast30d,
      respiratoryRateSeriesLast7d,
      bodyTemperatureSeriesLast7d,
      skinTemperatureSeriesLast7d,
    },
    workouts: exerciseRecords
      .map(normalizeExerciseSessionRecord)
      .filter((item): item is HealthWorkoutRecord => item !== null),
    alerts: buildAlerts(fallbackSource, heart),
  };
}

function toHealthConnectSnapshot(snapshot: HealthSnapshot): HealthSnapshot {
  if (snapshot.source === 'mock') {
    return snapshot;
  }
  return {
    ...snapshot,
    source: 'health-connect',
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
  };
}

function buildHealthConnectFallbackSnapshot(reason: string): HealthSnapshot {
  const snapshot = buildMockHealthSnapshot();
  const note = snapshot.note ? `${reason} ${snapshot.note}` : reason;

  return {
    ...snapshot,
    note,
  };
}

export function isHealthConnectNativeAvailable(): boolean {
  return Boolean(getNativeHealthConnectManager());
}

export async function getHealthConnectSdkStatus(
  hooks: HealthConnectHooks = {},
): Promise<string | number | undefined> {
  if (hooks.getSdkStatus) {
    return hooks.getSdkStatus();
  }

  const manager = getNativeHealthConnectManager();
  if (!manager || typeof manager.getSdkStatus !== 'function') {
    return undefined;
  }

  return callNativeMethod<string | number>('getSdkStatus').catch(() => undefined);
}

export async function getHealthConnectFeatureStatus(
  feature: string,
  hooks: HealthConnectHooks = {},
): Promise<string | number | undefined> {
  if (hooks.getFeatureStatus) {
    return hooks.getFeatureStatus(feature);
  }

  const manager = getNativeHealthConnectManager();
  if (!manager || typeof manager.getFeatureStatus !== 'function') {
    return undefined;
  }

  return callNativeMethod<string | number>('getFeatureStatus', feature).catch(() => undefined);
}

export async function isHealthConnectAvailable(hooks: HealthConnectHooks = {}): Promise<boolean> {
  if (hooks.isAvailable) {
    return Boolean(await hooks.isAvailable());
  }

  const manager = getNativeHealthConnectManager();
  if (!manager) {
    return false;
  }

  const available = await callNativeMethod<boolean>('isHealthDataAvailable').catch(() => undefined);
  if (available !== undefined) {
    return available;
  }

  const sdkStatus = await getHealthConnectSdkStatus(hooks);
  if (typeof sdkStatus === 'string') {
    return sdkStatus.toUpperCase().includes('AVAILABLE');
  }
  if (typeof sdkStatus === 'number') {
    return sdkStatus === HEALTH_CONNECT_SDK_STATUS.SDK_AVAILABLE;
  }
  return true;
}

export async function authorizeHealthConnect(hooks: HealthConnectHooks = {}): Promise<boolean> {
  if (hooks.requestAuthorization) {
    return Boolean(await hooks.requestAuthorization());
  }

  const manager = getNativeHealthConnectManager();
  if (!manager) {
    return false;
  }

  const available = await isHealthConnectAvailable(hooks);
  if (!available) {
    return false;
  }

  return callNativeMethod<boolean>('requestAuthorization').catch(() => false);
}

export async function loadHealthConnectSnapshot(
  hooks: HealthConnectHooks = {},
): Promise<HealthSnapshot> {
  const useMockWhenUnavailable = hooks.useMockWhenUnavailable ?? true;

  if (hooks.readSnapshot) {
    return toHealthConnectSnapshot(await hooks.readSnapshot());
  }

  if (hooks.readRawData) {
    return normalizeSnapshot(await hooks.readRawData(), 'health-connect');
  }

  const manager = getNativeHealthConnectManager();
  if (!manager) {
    if (useMockWhenUnavailable) {
      return buildHealthConnectFallbackSnapshot(
        'HealthConnectManager native module is unavailable. Returned mock snapshot.',
      );
    }
    throw new Error('HealthConnectManager native module not found');
  }

  const nativeSnapshot = await callNativeMethod<unknown>('getHealthSnapshot');
  return normalizeSnapshot(nativeSnapshot, 'health-connect');
}
