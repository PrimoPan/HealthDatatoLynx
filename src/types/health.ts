export type HealthTrendPoint = {
  timestamp: string;
  value: number;
  unit: string;
};

export type HealthSnapshotSource =
  | 'healthkit'
  | 'xiaomi-health'
  | 'huawei-health'
  | 'mock';

export type HealthSleepStageOrUnknown =
  | 'inBed'
  | 'asleepUnspecified'
  | 'awake'
  | 'asleepCore'
  | 'asleepDeep'
  | 'asleepREM'
  | 'unknown';

export type HealthSleepSample = {
  value: number;
  stage: HealthSleepStageOrUnknown;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceBundleId?: string;
};

export type HealthSleepStageMinutes = {
  inBedMinutes?: number;
  asleepUnspecifiedMinutes?: number;
  awakeMinutes?: number;
  asleepCoreMinutes?: number;
  asleepDeepMinutes?: number;
  asleepREMMinutes?: number;
};

export type HealthSleepApneaRiskLevel = 'none' | 'watch' | 'high' | 'unknown';

export type HealthSleepApneaData = {
  eventCountLast30d?: number;
  durationMinutesLast30d?: number;
  latestEventAt?: string;
  ahiLastSession?: number;
  therapyModeCode?: number;
  therapyMode?: string;
  sessionDate?: string;
  sessionDurationMinutes?: number;
  tidalVolumeMedianMl?: number;
  tidalVolumeP95Ml?: number;
  tidalVolumeMaxMl?: number;
  respiratoryRateMedianBrpm?: number;
  respiratoryRateP95Brpm?: number;
  respiratoryRateMaxBrpm?: number;
  inspirationExpirationRatioMedian?: number;
  inspirationExpirationRatioP95?: number;
  inspirationExpirationRatioMax?: number;
  maskOffCount?: number;
  hypoventilationIndex?: number;
  obstructiveApneaIndex?: number;
  pressureBelow95?: number;
  hypoventilationEventCount?: number;
  snoringEventCount?: number;
  obstructiveApneaEventCount?: number;
  centralApneaEventCount?: number;
  airflowLimitationEventCount?: number;
  massiveLeakEventCount?: number;
  unknownEventCount?: number;
  allEventCount?: number;
  classification?: 'notElevated' | 'elevated' | 'unknown';
  riskLevel?: HealthSleepApneaRiskLevel;
  reminder?: string;
};

export type HealthWorkoutRecord = {
  activityTypeCode?: number;
  activityTypeName?: string;
  startDate?: string;
  endDate?: string;
  durationMinutes?: number;
  totalEnergyKcal?: number;
  totalDistanceKm?: number;
};

export type HealthActivityData = {
  stepsToday?: number;
  distanceWalkingRunningKmToday?: number;
  activeEnergyKcalToday?: number;
  basalEnergyKcalToday?: number;
  flightsClimbedToday?: number;
  exerciseMinutesToday?: number;
  exerciseIntensityScoreToday?: number;
  standHoursToday?: number;
  altitudeMeters?: number;
  stepsHourlySeriesToday?: HealthTrendPoint[];
  activeEnergyHourlySeriesToday?: HealthTrendPoint[];
  exerciseMinutesHourlySeriesToday?: HealthTrendPoint[];
  exerciseIntensitySeriesToday?: HealthTrendPoint[];
  altitudeSeriesLast24h?: HealthTrendPoint[];
};

export type HealthSleepData = {
  inBedMinutesLast36h?: number;
  asleepMinutesLast36h?: number;
  awakeMinutesLast36h?: number;
  sampleCountLast36h?: number;
  sleepScore?: number;
  fellAsleepAt?: string;
  wokeUpAt?: string;
  wentToBedAt?: string;
  offBedAt?: string;
  prepareSleepMinutes?: number;
  allSleepMinutes?: number;
  lightSleepMinutes?: number;
  deepSleepMinutes?: number;
  dreamMinutes?: number;
  wakeUpCount?: number;
  deepSleepSegmentCount?: number;
  sleepType?: string | number;
  stageMinutesLast36h?: HealthSleepStageMinutes;
  samplesLast36h?: HealthSleepSample[];
  apnea?: HealthSleepApneaData;
};

export type HealthBloodPressureLevel =
  | 'normal'
  | 'elevated'
  | 'hypertension-stage-1'
  | 'hypertension-stage-2'
  | 'hypertensive-crisis'
  | 'unknown';

export type HealthHeartData = {
  latestHeartRateBpm?: number;
  restingHeartRateBpm?: number;
  walkingHeartRateAverageBpm?: number;
  heartRateVariabilityMs?: number;
  vo2MaxMlKgMin?: number;
  atrialFibrillationBurdenPercent?: number;
  systolicBloodPressureMmhg?: number;
  diastolicBloodPressureMmhg?: number;
  latestBloodPressureAt?: string;
  bloodPressureLevel?: HealthBloodPressureLevel;
  heartRateSeriesLast24h?: HealthTrendPoint[];
  heartRateVariabilitySeriesLast7d?: HealthTrendPoint[];
};

export type HealthOxygenData = {
  bloodOxygenPercent?: number;
  bloodOxygenSeriesLast24h?: HealthTrendPoint[];
};

export type HealthMetabolicData = {
  bloodGlucoseMgDl?: number;
  bloodGlucoseSeriesLast7d?: HealthTrendPoint[];
};

export type HealthEnvironmentData = {
  daylightMinutesToday?: number;
  daylightSeriesLast7d?: HealthTrendPoint[];
};

export type HealthBodyData = {
  heightCm?: number;
  respiratoryRateBrpm?: number;
  stressScore?: number;
  bodyTemperatureCelsius?: number;
  skinTemperatureCelsius?: number;
  bodyMassKg?: number;
  heightSeriesLast30d?: HealthTrendPoint[];
  respiratoryRateSeriesLast7d?: HealthTrendPoint[];
  stressSeriesLast7d?: HealthTrendPoint[];
  bodyTemperatureSeriesLast7d?: HealthTrendPoint[];
  skinTemperatureSeriesLast7d?: HealthTrendPoint[];
  bodyMassSeriesLast30d?: HealthTrendPoint[];
};

export type HealthAlertSeverity = 'info' | 'watch' | 'high';

export type HealthAlert = {
  code: 'blood-pressure-alert' | 'sleep-apnea-alert';
  title: string;
  message: string;
  severity: HealthAlertSeverity;
  detectedAt?: string;
  source?: HealthSnapshotSource;
};

export type HealthSnapshot = {
  source: HealthSnapshotSource;
  authorized: boolean;
  generatedAt: string;
  note?: string;
  activity?: HealthActivityData;
  sleep?: HealthSleepData;
  heart?: HealthHeartData;
  oxygen?: HealthOxygenData;
  metabolic?: HealthMetabolicData;
  environment?: HealthEnvironmentData;
  body?: HealthBodyData;
  workouts?: HealthWorkoutRecord[];
  alerts?: HealthAlert[];
};
