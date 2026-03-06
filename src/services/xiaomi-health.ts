import { buildMockHealthSnapshot } from './health.js';
import type { HealthSnapshot, HealthSnapshotSource } from '../types/health.js';

type NativeXiaomiMethod = (...args: unknown[]) => unknown;

type NativeXiaomiHealthManager = {
  isHealthDataAvailable?: NativeXiaomiMethod;
  requestAuthorization?: NativeXiaomiMethod;
  getHealthSnapshot?: NativeXiaomiMethod;
};

export type XiaomiHealthHooks = {
  isAvailable?: () => Promise<boolean> | boolean;
  requestAuthorization?: () => Promise<boolean> | boolean;
  readSnapshot?: () => Promise<HealthSnapshot> | HealthSnapshot;
  useMockWhenUnavailable?: boolean;
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

function getNativeXiaomiHealthManager(): NativeXiaomiHealthManager | null {
  const nativeModules = (globalThis as { NativeModules?: Record<string, unknown> }).NativeModules;
  if (!nativeModules) {
    return null;
  }
  const manager = nativeModules.XiaomiHealthManager;
  if (!manager || typeof manager !== 'object') {
    return null;
  }
  return manager as NativeXiaomiHealthManager;
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

function callNativeMethod<T>(methodName: keyof NativeXiaomiHealthManager): Promise<T> {
  const manager = getNativeXiaomiHealthManager();
  if (!manager) {
    return Promise.reject(new Error('XiaomiHealthManager native module not found'));
  }

  const method = manager[methodName];
  if (typeof method !== 'function') {
    return Promise.reject(new Error(`XiaomiHealthManager.${String(methodName)} is not a function`));
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

function isHealthSnapshotSource(value: unknown): value is HealthSnapshotSource {
  return value === 'healthkit' || value === 'xiaomi-health' || value === 'huawei-health' || value === 'mock';
}

function normalizeSnapshot(payload: unknown, fallbackSource: HealthSnapshotSource): HealthSnapshot {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid Xiaomi health snapshot payload');
  }

  const normalized = payload as Record<string, unknown>;
  const source = isHealthSnapshotSource(normalized.source) ? normalized.source : fallbackSource;

  return {
    source,
    authorized: normalized.authorized === true,
    generatedAt:
      typeof normalized.generatedAt === 'string'
        ? normalized.generatedAt
        : new Date().toISOString(),
    note: typeof normalized.note === 'string' ? normalized.note : undefined,
    activity: (normalized.activity as HealthSnapshot['activity']) ?? undefined,
    sleep: (normalized.sleep as HealthSnapshot['sleep']) ?? undefined,
    heart: (normalized.heart as HealthSnapshot['heart']) ?? undefined,
    oxygen: (normalized.oxygen as HealthSnapshot['oxygen']) ?? undefined,
    metabolic: (normalized.metabolic as HealthSnapshot['metabolic']) ?? undefined,
    environment: (normalized.environment as HealthSnapshot['environment']) ?? undefined,
    body: (normalized.body as HealthSnapshot['body']) ?? undefined,
    workouts: (normalized.workouts as HealthSnapshot['workouts']) ?? [],
    alerts: (normalized.alerts as HealthSnapshot['alerts']) ?? undefined,
  };
}

function toXiaomiSnapshot(snapshot: HealthSnapshot): HealthSnapshot {
  if (snapshot.source === 'mock') {
    return snapshot;
  }
  return {
    ...snapshot,
    source: 'xiaomi-health',
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
  };
}

function buildXiaomiFallbackSnapshot(reason: string): HealthSnapshot {
  const snapshot = buildMockHealthSnapshot();
  const note = snapshot.note ? `${reason} ${snapshot.note}` : reason;

  return {
    ...snapshot,
    note,
  };
}

export function isXiaomiHealthNativeAvailable(): boolean {
  return Boolean(getNativeXiaomiHealthManager());
}

export async function isXiaomiHealthAvailable(hooks: XiaomiHealthHooks = {}): Promise<boolean> {
  if (hooks.isAvailable) {
    return Boolean(await hooks.isAvailable());
  }

  const manager = getNativeXiaomiHealthManager();
  if (!manager) {
    return false;
  }

  return callNativeMethod<boolean>('isHealthDataAvailable').catch(() => true);
}

export async function authorizeXiaomiHealth(hooks: XiaomiHealthHooks = {}): Promise<boolean> {
  if (hooks.requestAuthorization) {
    return Boolean(await hooks.requestAuthorization());
  }

  const manager = getNativeXiaomiHealthManager();
  if (!manager) {
    return false;
  }

  const available = await callNativeMethod<boolean>('isHealthDataAvailable').catch(() => false);
  if (!available) {
    return false;
  }

  return callNativeMethod<boolean>('requestAuthorization').catch(() => false);
}

export async function loadXiaomiHealthSnapshot(hooks: XiaomiHealthHooks = {}): Promise<HealthSnapshot> {
  const useMockWhenUnavailable = hooks.useMockWhenUnavailable ?? true;

  if (hooks.readSnapshot) {
    const snapshot = await hooks.readSnapshot();
    return toXiaomiSnapshot(snapshot);
  }

  const manager = getNativeXiaomiHealthManager();
  if (!manager) {
    if (useMockWhenUnavailable) {
      return buildXiaomiFallbackSnapshot(
        'XiaomiHealthManager native module is unavailable. Returned mock snapshot.',
      );
    }
    throw new Error('XiaomiHealthManager native module not found');
  }

  const nativeSnapshot = await callNativeMethod<unknown>('getHealthSnapshot');
  return normalizeSnapshot(nativeSnapshot, 'xiaomi-health');
}
