import type {
  HealthSleepSample,
  HealthSnapshot,
  HealthTrendPoint,
  HealthWorkoutRecord,
} from '../types/health.js';

type NativeHealthKitMethod = (...args: unknown[]) => unknown;

type NativeHealthKitManager = {
  isHealthDataAvailable?: NativeHealthKitMethod;
  requestAuthorization?: NativeHealthKitMethod;
  getHealthSnapshot?: NativeHealthKitMethod;
};

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

function getNativeHealthKitManager(): NativeHealthKitManager | null {
  const nativeModules = (globalThis as { NativeModules?: Record<string, unknown> }).NativeModules;
  if (!nativeModules) {
    return null;
  }
  const manager = nativeModules.HealthKitManager;
  if (!manager || typeof manager !== 'object') {
    return null;
  }
  return manager as NativeHealthKitManager;
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

function callNativeMethod<T>(methodName: keyof NativeHealthKitManager): Promise<T> {
  const manager = getNativeHealthKitManager();
  if (!manager) {
    return Promise.reject(new Error('HealthKitManager native module not found'));
  }

  const method = manager[methodName];
  if (typeof method !== 'function') {
    return Promise.reject(new Error(`HealthKitManager.${String(methodName)} is not a function`));
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

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, digits = 2): number {
  return round(min + Math.random() * (max - min), digits);
}

function isoDayOffset(base: Date, dayOffset: number, hour = 8, minute = 0): string {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function buildHourlySeries(
  now: Date,
  unit: string,
  buildValue: (hour: number, passed: boolean) => number,
): HealthTrendPoint[] {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const currentHour = now.getHours();
  const series: HealthTrendPoint[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    const point = new Date(startOfDay.getTime() + hour * 60 * 60 * 1000);
    const passed = hour <= currentHour;
    series.push({
      timestamp: point.toISOString(),
      value: round(buildValue(hour, passed), 2),
      unit,
    });
  }

  return series;
}

function buildMockActivityData(now: Date): HealthSnapshot['activity'] {
  const stepsHourlySeriesToday = buildHourlySeries(now, 'count', (hour, passed) => {
    if (!passed || hour < 6) {
      return 0;
    }
    if (hour >= 7 && hour <= 9) {
      return randomInt(260, 920);
    }
    if (hour >= 18 && hour <= 22) {
      return randomInt(360, 980);
    }
    if (hour >= 10 && hour <= 17) {
      return randomInt(120, 640);
    }
    return randomInt(30, 280);
  });

  const activeEnergyHourlySeriesToday = stepsHourlySeriesToday.map(point => ({
    timestamp: point.timestamp,
    value: round(point.value * randomFloat(0.036, 0.056, 4), 2),
    unit: 'kcal',
  }));

  const exerciseMinutesHourlySeriesToday = stepsHourlySeriesToday.map(point => {
    if (point.value >= 450) {
      return { timestamp: point.timestamp, value: randomInt(6, 14), unit: 'min' };
    }
    if (point.value >= 220) {
      return { timestamp: point.timestamp, value: randomInt(2, 8), unit: 'min' };
    }
    return { timestamp: point.timestamp, value: randomInt(0, 2), unit: 'min' };
  });

  const stepsToday = Math.round(stepsHourlySeriesToday.reduce((total, point) => total + point.value, 0));
  const activeEnergyKcalToday = round(
    activeEnergyHourlySeriesToday.reduce((total, point) => total + point.value, 0),
    1,
  );
  const exerciseMinutesToday = Math.round(
    exerciseMinutesHourlySeriesToday.reduce((total, point) => total + point.value, 0),
  );

  const standHoursToday = stepsHourlySeriesToday.filter(point => point.value >= 80).length;
  const distanceWalkingRunningKmToday = round(clamp(stepsToday * randomFloat(0.00063, 0.00079, 6), 0, 24), 2);

  return {
    stepsToday,
    distanceWalkingRunningKmToday,
    activeEnergyKcalToday,
    basalEnergyKcalToday: randomInt(1180, 1920),
    flightsClimbedToday: randomInt(0, 20),
    exerciseMinutesToday,
    standHoursToday,
    stepsHourlySeriesToday,
    activeEnergyHourlySeriesToday,
    exerciseMinutesHourlySeriesToday,
  };
}

function buildMockSleepData(now: Date): HealthSnapshot['sleep'] {
  const baseSegments: Array<{ stage: HealthSleepSample['stage']; minutes: number }> = [
    { stage: 'inBed', minutes: 14 },
    { stage: 'asleepCore', minutes: 56 },
    { stage: 'asleepDeep', minutes: 44 },
    { stage: 'asleepCore', minutes: 68 },
    { stage: 'asleepREM', minutes: 26 },
    { stage: 'awake', minutes: 6 },
    { stage: 'asleepCore', minutes: 52 },
    { stage: 'asleepDeep', minutes: 32 },
    { stage: 'asleepREM', minutes: 30 },
    { stage: 'awake', minutes: 4 },
    { stage: 'asleepCore', minutes: 44 },
    { stage: 'asleepUnspecified', minutes: 12 },
    { stage: 'asleepREM', minutes: 34 },
    { stage: 'awake', minutes: 8 },
    { stage: 'inBed', minutes: 9 },
  ];

  const totalBaseMinutes = baseSegments.reduce((total, item) => total + item.minutes, 0);
  const targetTotalMinutes = randomInt(420, 560);
  const ratio = targetTotalMinutes / totalBaseMinutes;

  const segments = baseSegments.map(segment => ({
    stage: segment.stage,
    minutes: Math.max(2, Math.round(segment.minutes * ratio + randomInt(-3, 3))),
  }));

  const totalMinutes = segments.reduce((total, item) => total + item.minutes, 0);
  const sleepEnd = new Date(now);
  sleepEnd.setSeconds(0, 0);
  sleepEnd.setHours(randomInt(6, 8), randomInt(0, 45), 0, 0);
  if (sleepEnd.getTime() > now.getTime()) {
    sleepEnd.setDate(sleepEnd.getDate() - 1);
  }
  let cursor = new Date(sleepEnd.getTime() - totalMinutes * 60000);

  let inBedMinutes = 0;
  let asleepUnspecifiedMinutes = 0;
  let awakeMinutes = 0;
  let asleepCoreMinutes = 0;
  let asleepDeepMinutes = 0;
  let asleepREMMinutes = 0;

  const samplesLast36h: HealthSleepSample[] = [];

  segments.forEach((segment, index) => {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + segment.minutes * 60000);
    cursor = end;

    if (segment.stage === 'inBed') inBedMinutes += segment.minutes;
    if (segment.stage === 'asleepUnspecified') asleepUnspecifiedMinutes += segment.minutes;
    if (segment.stage === 'awake') awakeMinutes += segment.minutes;
    if (segment.stage === 'asleepCore') asleepCoreMinutes += segment.minutes;
    if (segment.stage === 'asleepDeep') asleepDeepMinutes += segment.minutes;
    if (segment.stage === 'asleepREM') asleepREMMinutes += segment.minutes;

    samplesLast36h.push({
      value: index,
      stage: segment.stage,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      sourceName: index % 2 === 0 ? 'Apple Watch (Mock)' : 'iPhone (Mock)',
      sourceBundleId: index % 2 === 0 ? 'com.apple.health.watch' : 'com.apple.health',
    });
  });

  const asleepMinutesLast36h = asleepUnspecifiedMinutes + asleepCoreMinutes + asleepDeepMinutes + asleepREMMinutes;
  const qualityBase =
    95 - Math.abs(asleepMinutesLast36h - 450) * 0.08 - awakeMinutes * 0.45 + asleepDeepMinutes * 0.03 + asleepREMMinutes * 0.02;
  const sleepScore = Math.round(clamp(qualityBase, 45, 98));

  const apneaSeed = Math.random();
  const apneaEventCountLast30d = apneaSeed < 0.68 ? 0 : apneaSeed < 0.9 ? randomInt(1, 2) : randomInt(3, 7);
  const apneaDurationMinutesLast30d = apneaEventCountLast30d > 0 ? round(apneaEventCountLast30d * randomFloat(1.5, 6.5, 1), 1) : 0;
  const apneaRiskLevel =
    apneaEventCountLast30d === 0
      ? 'none'
      : apneaEventCountLast30d <= 2 && apneaDurationMinutesLast30d < 20
        ? 'watch'
        : 'high';

  const apneaReminder =
    apneaRiskLevel === 'none'
      ? 'No apnea events in 30 days. Keep monitoring if daytime sleepiness persists.'
      : apneaRiskLevel === 'watch'
        ? `Detected ${apneaEventCountLast30d} apnea events in 30 days. Keep regular sleep and monitor trend.`
        : `Detected ${apneaEventCountLast30d} apnea events in 30 days. Consider sleep clinic follow-up.`;

  const latestEventAt =
    apneaEventCountLast30d > 0 ? new Date(now.getTime() - randomInt(1, 25) * 24 * 60 * 60 * 1000).toISOString() : undefined;

  return {
    inBedMinutesLast36h: round(inBedMinutes, 1),
    asleepMinutesLast36h: round(asleepMinutesLast36h, 1),
    awakeMinutesLast36h: round(awakeMinutes, 1),
    sampleCountLast36h: samplesLast36h.length,
    sleepScore,
    stageMinutesLast36h: {
      inBedMinutes: round(inBedMinutes, 1),
      asleepUnspecifiedMinutes: round(asleepUnspecifiedMinutes, 1),
      awakeMinutes: round(awakeMinutes, 1),
      asleepCoreMinutes: round(asleepCoreMinutes, 1),
      asleepDeepMinutes: round(asleepDeepMinutes, 1),
      asleepREMMinutes: round(asleepREMMinutes, 1),
    },
    samplesLast36h,
    apnea: {
      eventCountLast30d: apneaEventCountLast30d,
      durationMinutesLast30d: apneaDurationMinutesLast30d,
      latestEventAt,
      riskLevel: apneaRiskLevel,
      reminder: apneaReminder,
    },
  };
}

function buildMockHeartData(now: Date): HealthSnapshot['heart'] {
  const heartRateSeriesLast24h = buildHourlySeries(now, 'bpm', (hour, passed) => {
    if (!passed) {
      return 0;
    }
    if (hour <= 5) {
      return randomInt(52, 66);
    }
    if (hour <= 9) {
      return randomInt(66, 96);
    }
    if (hour <= 18) {
      return randomInt(62, 104);
    }
    return randomInt(58, 92);
  });

  const valid = heartRateSeriesLast24h.filter(point => point.value > 0);
  const latestHeartRateBpm = valid[valid.length - 1]?.value;
  const restingHeartRateBpm = valid.length ? Math.min(...valid.map(point => point.value)) : undefined;

  const walkingHeartRateAverageBpm =
    valid.length > 0
      ? round(valid.filter((_, index) => index % 3 !== 0).reduce((sum, point) => sum + point.value, 0) / Math.max(valid.length - 8, 1), 1)
      : undefined;

  const heartRateVariabilitySeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 7, 30),
    value: randomInt(20, 72),
    unit: 'ms',
  }));

  return {
    latestHeartRateBpm: latestHeartRateBpm ? round(latestHeartRateBpm, 1) : undefined,
    restingHeartRateBpm,
    walkingHeartRateAverageBpm,
    heartRateVariabilityMs: heartRateVariabilitySeriesLast7d[heartRateVariabilitySeriesLast7d.length - 1]?.value,
    vo2MaxMlKgMin: randomFloat(28, 48, 1),
    atrialFibrillationBurdenPercent: randomFloat(0, 1.2, 2),
    systolicBloodPressureMmhg: randomInt(102, 134),
    diastolicBloodPressureMmhg: randomInt(62, 86),
    heartRateSeriesLast24h,
    heartRateVariabilitySeriesLast7d,
  };
}

function buildMockOxygenData(now: Date): HealthSnapshot['oxygen'] {
  const bloodOxygenSeriesLast24h = buildHourlySeries(now, '%', (_hour, passed) => (passed ? randomInt(95, 100) : 0));
  const valid = bloodOxygenSeriesLast24h.filter(point => point.value > 0);

  return {
    bloodOxygenPercent: valid[valid.length - 1]?.value,
    bloodOxygenSeriesLast24h,
  };
}

function buildMockMetabolicData(now: Date): HealthSnapshot['metabolic'] {
  const bloodGlucoseSeriesLast7d = Array.from({ length: 7 }, (_, index) => {
    const fastingMmol = randomFloat(4.3, 6.2, 1);
    return {
      timestamp: isoDayOffset(now, -(6 - index), 7, randomInt(0, 40)),
      value: fastingMmol,
      unit: 'mmol/L',
    };
  });

  const latestMmol = bloodGlucoseSeriesLast7d[bloodGlucoseSeriesLast7d.length - 1]?.value;
  return {
    bloodGlucoseMgDl: latestMmol ? round(latestMmol * 18, 1) : undefined,
    bloodGlucoseSeriesLast7d,
  };
}

function buildMockEnvironmentData(now: Date): HealthSnapshot['environment'] {
  const daylightSeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 21, 0),
    value: randomInt(22, 210),
    unit: 'min',
  }));

  return {
    daylightMinutesToday: daylightSeriesLast7d[daylightSeriesLast7d.length - 1]?.value,
    daylightSeriesLast7d,
  };
}

function buildMockBodyData(now: Date): HealthSnapshot['body'] {
  const respiratoryRateSeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 8, 10),
    value: randomFloat(12, 19, 1),
    unit: 'brpm',
  }));

  const bodyTemperatureSeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 8, 12),
    value: randomFloat(36.2, 37.2, 2),
    unit: 'degC',
  }));

  const baseWeight = randomFloat(48, 86, 1);
  const bodyMassSeriesLast30d = Array.from({ length: 30 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(29 - index), 7, 50),
    value: round(baseWeight + Math.sin(index / 5) * 0.4 + randomFloat(-0.25, 0.25, 2), 2),
    unit: 'kg',
  }));

  return {
    respiratoryRateBrpm: respiratoryRateSeriesLast7d[respiratoryRateSeriesLast7d.length - 1]?.value,
    bodyTemperatureCelsius: bodyTemperatureSeriesLast7d[bodyTemperatureSeriesLast7d.length - 1]?.value,
    bodyMassKg: bodyMassSeriesLast30d[bodyMassSeriesLast30d.length - 1]?.value,
    respiratoryRateSeriesLast7d,
    bodyTemperatureSeriesLast7d,
    bodyMassSeriesLast30d,
  };
}

function buildMockWorkouts(now: Date): HealthWorkoutRecord[] {
  const count = randomInt(2, 6);
  const workouts: HealthWorkoutRecord[] = [];
  const activityTypes = [
    { code: 37, name: 'walk' },
    { code: 13, name: 'run' },
    { code: 24, name: 'cycle' },
    { code: 57, name: 'yoga' },
    { code: 63, name: 'strength' },
  ];

  for (let i = 0; i < count; i += 1) {
    const durationMinutes = randomInt(18, 85);
    const end = new Date(now.getTime() - i * randomInt(20, 60) * 60 * 60 * 1000);
    const start = new Date(end.getTime() - durationMinutes * 60 * 1000);
    const distanceKm = round(durationMinutes * (Math.random() * 0.11 + 0.05), 2);
    const activityType = activityTypes[randomInt(0, activityTypes.length - 1)];

    workouts.push({
      activityTypeCode: activityType.code,
      activityTypeName: activityType.name,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      durationMinutes,
      totalEnergyKcal: randomInt(120, 680),
      totalDistanceKm: activityType.name === 'strength' ? undefined : distanceKm,
    });
  }

  return workouts;
}

export function buildMockHealthSnapshot(): HealthSnapshot {
  const now = new Date();

  return {
    source: 'mock',
    authorized: true,
    generatedAt: now.toISOString(),
    note: 'Mock data generated with HealthKit-aligned units and stage-aware sleep samples.',
    activity: buildMockActivityData(now),
    sleep: buildMockSleepData(now),
    heart: buildMockHeartData(now),
    oxygen: buildMockOxygenData(now),
    metabolic: buildMockMetabolicData(now),
    environment: buildMockEnvironmentData(now),
    body: buildMockBodyData(now),
    workouts: buildMockWorkouts(now),
  };
}

function normalizeSnapshot(sourcePayload: unknown, source: 'healthkit' | 'mock'): HealthSnapshot {
  if (!sourcePayload || typeof sourcePayload !== 'object') {
    throw new Error('Invalid health snapshot payload');
  }

  const payload = sourcePayload as Record<string, unknown>;
  return {
    source,
    authorized: payload.authorized === true,
    generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
    note: typeof payload.note === 'string' ? payload.note : undefined,
    activity: (payload.activity as HealthSnapshot['activity']) ?? undefined,
    sleep: (payload.sleep as HealthSnapshot['sleep']) ?? undefined,
    heart: (payload.heart as HealthSnapshot['heart']) ?? undefined,
    oxygen: (payload.oxygen as HealthSnapshot['oxygen']) ?? undefined,
    metabolic: (payload.metabolic as HealthSnapshot['metabolic']) ?? undefined,
    environment: (payload.environment as HealthSnapshot['environment']) ?? undefined,
    body: (payload.body as HealthSnapshot['body']) ?? undefined,
    workouts: (payload.workouts as HealthSnapshot['workouts']) ?? [],
  };
}

export function isHealthKitNativeAvailable(): boolean {
  return Boolean(getNativeHealthKitManager());
}

export async function authorizeHealthKit(): Promise<boolean> {
  const manager = getNativeHealthKitManager();
  if (!manager) {
    return false;
  }

  const available = await callNativeMethod<boolean>('isHealthDataAvailable').catch(() => false);
  if (!available) {
    return false;
  }

  return callNativeMethod<boolean>('requestAuthorization');
}

export async function loadHealthSnapshot(useMock = false): Promise<HealthSnapshot> {
  if (useMock) {
    return buildMockHealthSnapshot();
  }

  const manager = getNativeHealthKitManager();
  if (!manager) {
    return buildMockHealthSnapshot();
  }

  const nativeSnapshot = await callNativeMethod<unknown>('getHealthSnapshot');
  return normalizeSnapshot(nativeSnapshot, 'healthkit');
}
