import { buildMockHealthSnapshot } from './health.js';

type NativeHealthKitMethod = (...args: unknown[]) => unknown;

type NativeHealthKitManager = {
  executeHealthMethod?: NativeHealthKitMethod;
  [key: string]: unknown;
};

export type HealthCallback<T = unknown> = (error: string | null, results: T | null) => void;

export type HealthKitPermissions = {
  permissions: {
    read: string[];
    write: string[];
  };
};

type MethodOptions = Record<string, unknown>;

type CallbackPayload = {
  success?: boolean;
  error?: string;
  data?: unknown;
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

function parseNativePayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const wrapped = payload as CallbackPayload;
    if (wrapped.success === false) {
      throw new Error(wrapped.error ?? 'Native callback returned failure');
    }
    if (wrapped.data !== undefined) {
      return wrapped.data as T;
    }
  }
  return payload as T;
}

function buildMockMethodResult(method: string): unknown {
  const snapshot = buildMockHealthSnapshot();
  const nowIso = new Date().toISOString();

  switch (method) {
    case 'isAvailable':
      return false;
    case 'initHealthKit':
      return true;
    case 'getAuthStatus':
      return { permissions: { read: [], write: [] } };
    case 'getStepCount':
      return {
        value: snapshot.activity?.stepsToday ?? 0,
        startDate: nowIso,
        endDate: nowIso,
      };
    case 'getSleepSamples':
      return (snapshot.sleep?.samplesLast36h ?? []).map(sample => ({
        value: sample.stage,
        startDate: sample.startDate,
        endDate: sample.endDate,
      }));
    case 'getSamples':
      return (snapshot.workouts ?? []).map(workout => ({
        activityId: workout.activityTypeCode,
        activityName: workout.activityTypeName,
        calories: workout.totalEnergyKcal,
        distance: workout.totalDistanceKm,
        start: workout.startDate,
        end: workout.endDate,
      }));
    default:
      return null;
  }
}

function callNativeMethod<T>(method: string, options: MethodOptions = {}): Promise<T> {
  const manager = getNativeHealthKitManager();

  if (!manager) {
    const mock = buildMockMethodResult(method);
    if (mock !== null) {
      return Promise.resolve(mock as T);
    }
    return Promise.reject(new Error('HealthKitManager native module not found'));
  }

  const executeHealthMethod = manager.executeHealthMethod;
  if (typeof executeHealthMethod !== 'function') {
    return Promise.reject(new Error('HealthKitManager.executeHealthMethod is not a function'));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finishResolve = (value: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        resolve(parseNativePayload<T>(value));
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
      const maybeResult = executeHealthMethod.call(manager, { method, options }, finishResolve, finishReject) as unknown;
      if (maybeResult && typeof (maybeResult as Promise<unknown>).then === 'function') {
        (maybeResult as Promise<unknown>).then(finishResolve).catch(finishReject);
      }
    } catch (error) {
      finishReject(error);
    }
  });
}

function invoke<T>(method: string, options: MethodOptions, callback: HealthCallback<T>): void {
  callNativeMethod<T>(method, options)
    .then(result => callback(null, result))
    .catch(error => callback(toErrorMessage(error), null));
}

function invokeNoOptions<T>(method: string, callback: HealthCallback<T>): void {
  invoke(method, {}, callback);
}

function invokeWithOptions<T>(method: string, options: MethodOptions | null | undefined, callback: HealthCallback<T>): void {
  invoke(method, options ?? {}, callback);
}

function invokeWithId<T>(method: string, id: string, callback: HealthCallback<T>): void {
  invoke(method, { id }, callback);
}

export const Activities = {
  AmericanFootball: "AmericanFootball",
  Archery: "Archery",
  AustralianFootball: "AustralianFootball",
  Badminton: "Badminton",
  Baseball: "Baseball",
  Basketball: "Basketball",
  Bowling: "Bowling",
  Boxing: "Boxing",
  CardioDance: "CardioDance",
  Climbing: "Climbing",
  Cooldown: "Cooldown",
  Cricket: "Cricket",
  CrossTraining: "CrossTraining",
  Curling: "Curling",
  Cycling: "Cycling",
  Dance: "Dance",
  DiscSports: "DiscSports",
  Elliptical: "Elliptical",
  EquestrianSports: "EquestrianSports",
  Fencing: "Fencing",
  FitnessGaming: "FitnessGaming",
  Fishing: "Fishing",
  FunctionalStrengthTraining: "FunctionalStrengthTraining",
  Golf: "Golf",
  Gymnastics: "Gymnastics",
  Handball: "Handball",
  Hiking: "Hiking",
  Hockey: "Hockey",
  Hunting: "Hunting",
  Lacrosse: "Lacrosse",
  MartialArts: "MartialArts",
  MindAndBody: "MindAndBody",
  PaddleSports: "PaddleSports",
  Play: "Play",
  Pickleball: "Pickleball",
  PreparationAndRecovery: "PreparationAndRecovery",
  Racquetball: "Racquetball",
  Rowing: "Rowing",
  Rugby: "Rugby",
  Running: "Running",
  Sailing: "Sailing",
  SkatingSports: "SkatingSports",
  SnowSports: "SnowSports",
  Soccer: "Soccer",
  SocialDance: "SocialDance",
  Softball: "Softball",
  Squash: "Squash",
  StairClimbing: "StairClimbing",
  SurfingSports: "SurfingSports",
  Swimming: "Swimming",
  TableTennis: "TableTennis",
  Tennis: "Tennis",
  TrackAndField: "TrackAndField",
  TraditionalStrengthTraining: "TraditionalStrengthTraining",
  Volleyball: "Volleyball",
  Walking: "Walking",
  WaterFitness: "WaterFitness",
  WaterPolo: "WaterPolo",
  WaterSports: "WaterSports",
  Wrestling: "Wrestling",
  Yoga: "Yoga",
  Barre: "Barre",
  CoreTraining: "CoreTraining",
  CrossCountrySkiing: "CrossCountrySkiing",
  DownhillSkiing: "DownhillSkiing",
  Flexibility: "Flexibility",
  HighIntensityIntervalTraining: "HighIntensityIntervalTraining",
  JumpRope: "JumpRope",
  Kickboxing: "Kickboxing",
  Pilates: "Pilates",
  Snowboarding: "Snowboarding",
  Stairs: "Stairs",
  StepTraining: "StepTraining",
  WheelchairWalkPace: "WheelchairWalkPace",
  WheelchairRunPace: "WheelchairRunPace",
  TaiChi: "TaiChi",
  MixedCardio: "MixedCardio",
  HandCycling: "HandCycling",
} as const;

export const Observers = {
  Cycling: "Cycling",
  HeartRate: "HeartRate",
  RestingHeartRate: "RestingHeartRate",
  Running: "Running",
  StairClimbing: "StairClimbing",
  Walking: "Walking",
  Workout: "Workout",
} as const;

export const Permissions = {
  ActiveEnergyBurned: "ActiveEnergyBurned",
  ActivitySummary: "ActivitySummary",
  AllergyRecord: "AllergyRecord",
  AppleExerciseTime: "AppleExerciseTime",
  AppleStandTime: "AppleStandTime",
  BasalEnergyBurned: "BasalEnergyBurned",
  BiologicalSex: "BiologicalSex",
  BloodType: "BloodType",
  BloodAlcoholContent: "BloodAlcoholContent",
  BloodGlucose: "BloodGlucose",
  BloodPressureDiastolic: "BloodPressureDiastolic",
  BloodPressureSystolic: "BloodPressureSystolic",
  BodyFatPercentage: "BodyFatPercentage",
  BodyMass: "BodyMass",
  BodyMassIndex: "BodyMassIndex",
  BodyTemperature: "BodyTemperature",
  DateOfBirth: "DateOfBirth",
  Biotin: "Biotin",
  Caffeine: "Caffeine",
  Calcium: "Calcium",
  Carbohydrates: "Carbohydrates",
  Chloride: "Chloride",
  Cholesterol: "Cholesterol",
  ConditionRecord: "ConditionRecord",
  Copper: "Copper",
  CoverageRecord: "CoverageRecord",
  EnergyConsumed: "EnergyConsumed",
  EnvironmentalAudioExposure: "EnvironmentalAudioExposure",
  FatMonounsaturated: "FatMonounsaturated",
  FatPolyunsaturated: "FatPolyunsaturated",
  FatSaturated: "FatSaturated",
  FatTotal: "FatTotal",
  Fiber: "Fiber",
  Folate: "Folate",
  HeadphoneAudioExposure: "HeadphoneAudioExposure",
  ImmunizationRecord: "ImmunizationRecord",
  InsulinDelivery: "InsulinDelivery",
  Iodine: "Iodine",
  Iron: "Iron",
  LabResultRecord: "LabResultRecord",
  Magnesium: "Magnesium",
  Manganese: "Manganese",
  MedicationRecord: "MedicationRecord",
  Molybdenum: "Molybdenum",
  Niacin: "Niacin",
  OxygenSaturation: "OxygenSaturation",
  PantothenicAcid: "PantothenicAcid",
  Phosphorus: "Phosphorus",
  Potassium: "Potassium",
  ProcedureRecord: "ProcedureRecord",
  Protein: "Protein",
  Riboflavin: "Riboflavin",
  Selenium: "Selenium",
  Sodium: "Sodium",
  Sugar: "Sugar",
  Thiamin: "Thiamin",
  VitalSignRecord: "VitalSignRecord",
  VitaminA: "VitaminA",
  VitaminB12: "VitaminB12",
  VitaminB6: "VitaminB6",
  VitaminC: "VitaminC",
  VitaminD: "VitaminD",
  VitaminE: "VitaminE",
  VitaminK: "VitaminK",
  Zinc: "Zinc",
  Water: "Water",
  DistanceCycling: "DistanceCycling",
  DistanceSwimming: "DistanceSwimming",
  DistanceWalkingRunning: "DistanceWalkingRunning",
  Electrocardiogram: "Electrocardiogram",
  FlightsClimbed: "FlightsClimbed",
  HeartbeatSeries: "HeartbeatSeries",
  HeartRate: "HeartRate",
  RestingHeartRate: "RestingHeartRate",
  HeartRateVariability: "HeartRateVariability",
  Height: "Height",
  LeanBodyMass: "LeanBodyMass",
  MindfulSession: "MindfulSession",
  NikeFuel: "NikeFuel",
  PeakFlow: "PeakFlow",
  RespiratoryRate: "RespiratoryRate",
  SleepAnalysis: "SleepAnalysis",
  StepCount: "StepCount",
  Steps: "Steps",
  Vo2Max: "Vo2Max",
  WaistCircumference: "WaistCircumference",
  WalkingHeartRateAverage: "WalkingHeartRateAverage",
  Weight: "Weight",
  Workout: "Workout",
  WorkoutRoute: "WorkoutRoute",
  RunningSpeed: "RunningSpeed",
  RunningPower: "RunningPower",
  RunningStrideLength: "RunningStrideLength",
  RunningVerticalOscillation: "RunningVerticalOscillation",
  RunningGroundContactTime: "RunningGroundContactTime",
} as const;

export const Units = {
  bpm: "bpm",
  calorie: "calorie",
  celsius: "celsius",
  count: "count",
  day: "day",
  fahrenheit: "fahrenheit",
  foot: "foot",
  gram: "gram",
  hour: "hour",
  inch: "inch",
  joule: "joule",
  kilocalorie: "kilocalorie",
  meter: "meter",
  mgPerdL: "mgPerdL",
  mile: "mile",
  minute: "minute",
  mmhg: "mmhg",
  mmolPerL: "mmolPerL",
  percent: "percent",
  pound: "pound",
  second: "second",
  mlPerKgMin: "mlPerKgMin",
} as const;

const METHOD_WITH_OPTIONS = [
  "getBiologicalSex",
  "getBloodType",
  "getDateOfBirth",
  "getLatestWeight",
  "getWeightSamples",
  "saveWeight",
  "getLatestHeight",
  "getHeightSamples",
  "saveHeight",
  "getLatestWaistCircumference",
  "getWaistCircumferenceSamples",
  "saveWaistCircumference",
  "getLatestPeakFlow",
  "getPeakFlowSamples",
  "savePeakFlow",
  "saveLeanBodyMass",
  "getLatestBmi",
  "getBmiSamples",
  "saveBmi",
  "getLatestBodyFatPercentage",
  "getBodyFatPercentageSamples",
  "getLatestLeanBodyMass",
  "getLeanBodyMassSamples",
  "getStepCount",
  "getSamples",
  "getAnchoredWorkouts",
  "getDailyStepCountSamples",
  "saveSteps",
  "saveWalkingRunningDistance",
  "getDistanceWalkingRunning",
  "getDailyDistanceWalkingRunningSamples",
  "getDistanceCycling",
  "getDailyDistanceCyclingSamples",
  "getFlightsClimbed",
  "getDailyFlightsClimbedSamples",
  "getEnergyConsumedSamples",
  "getProteinSamples",
  "getFiberSamples",
  "getTotalFatSamples",
  "saveFood",
  "saveWater",
  "getWater",
  "saveHeartRateSample",
  "getWaterSamples",
  "getHeartRateSamples",
  "getRestingHeartRate",
  "getWalkingHeartRateAverage",
  "getActiveEnergyBurned",
  "getBasalEnergyBurned",
  "getAppleExerciseTime",
  "getAppleStandTime",
  "getVo2MaxSamples",
  "getBodyTemperatureSamples",
  "getBloodPressureSamples",
  "getRespiratoryRateSamples",
  "getHeartRateVariabilitySamples",
  "getHeartbeatSeriesSamples",
  "getRestingHeartRateSamples",
  "getBloodGlucoseSamples",
  "getCarbohydratesSamples",
  "saveBloodGlucoseSample",
  "saveCarbohydratesSample",
  "getSleepSamples",
  "getInfo",
  "getMindfulSession",
  "saveMindfulSession",
  "getWorkoutRouteSamples",
  "saveWorkout",
  "getLatestBloodAlcoholContent",
  "getBloodAlcoholContentSamples",
  "saveBloodAlcoholContent",
  "getDistanceSwimming",
  "getDailyDistanceSwimmingSamples",
  "getOxygenSaturationSamples",
  "getElectrocardiogramSamples",
  "saveBodyFatPercentage",
  "saveBodyTemperature",
  "getEnvironmentalAudioExposure",
  "getHeadphoneAudioExposure",
  "getClinicalRecords",
  "getActivitySummary",
  "getInsulinDeliverySamples",
  "saveInsulinDeliverySample"
] as const;

const METHOD_WITH_ID = [
  "deleteBloodGlucoseSample",
  "deleteCarbohydratesSample",
  "deleteInsulinDeliverySample"
] as const;

const METHOD_NO_CALLBACK = [
  "setObserver",
] as const;

type HealthKitApi = {
  Constants: {
    Activities: typeof Activities;
    Observers: typeof Observers;
    Permissions: typeof Permissions;
    Units: typeof Units;
  };
  initHealthKit: (permissions: HealthKitPermissions, callback: HealthCallback<boolean>) => void;
  isAvailable: (callback: HealthCallback<boolean>) => void;
  getAuthStatus: (permissions: HealthKitPermissions, callback: HealthCallback<unknown>) => void;
  setObserver: (options: MethodOptions) => void;
  [key: string]: unknown;
};

const HealthKitObject: Record<string, unknown> = {
  Constants: {
    Activities,
    Observers,
    Permissions,
    Units,
  },
  initHealthKit: (permissions: HealthKitPermissions, callback: HealthCallback<boolean>): void => {
    invokeWithOptions('initHealthKit', permissions as unknown as MethodOptions, callback);
  },
  isAvailable: (callback: HealthCallback<boolean>): void => {
    invokeNoOptions('isAvailable', callback);
  },
  getAuthStatus: (permissions: HealthKitPermissions, callback: HealthCallback<unknown>): void => {
    invokeWithOptions('getAuthStatus', permissions as unknown as MethodOptions, callback);
  },
};

for (const method of METHOD_WITH_OPTIONS) {
  HealthKitObject[method] = (options: MethodOptions | null | undefined, callback: HealthCallback<unknown>): void => {
    invokeWithOptions(method, options, callback);
  };
}

for (const method of METHOD_WITH_ID) {
  HealthKitObject[method] = (id: string, callback: HealthCallback<unknown>): void => {
    invokeWithId(method, id, callback);
  };
}

for (const method of METHOD_NO_CALLBACK) {
  HealthKitObject[method] = (options: MethodOptions): void => {
    callNativeMethod(method, options).catch(() => {
      // observer methods are best-effort in Lynx bridge
    });
  };
}

export const HealthKit = HealthKitObject as HealthKitApi;
export default HealthKit;
