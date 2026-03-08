import {
  appleHealthKitProviderAdapter,
  createAppleHealthKitProviderAdapter,
} from '../adapters/apple-healthkit.js';
import {
  createHuaweiHealthProviderAdapter,
  type HuaweiHealthProviderAdapterOptions,
} from '../adapters/huawei-health.js';
import type {
  HealthProviderAdapter,
  HealthProviderId,
  HealthProviderReadOptions,
} from '../adapters/provider.js';
import { createHealthProviderAdapterMap } from '../adapters/provider.js';
import {
  createXiaomiHealthProviderAdapter,
  type XiaomiHealthProviderAdapterOptions,
} from '../adapters/xiaomi-health.js';
import {
  isHealthKitNativeAvailable,
} from '../services/health.js';
import { isHuaweiHealthNativeAvailable } from '../services/huawei-health.js';
import { isXiaomiHealthNativeAvailable } from '../services/xiaomi-health.js';
import type { HealthSnapshot } from '../types/health.js';

export type HealthClientProvider = HealthProviderId | 'auto';

export type HealthClientOptions = {
  provider?: HealthClientProvider;
  fallbackToMock?: boolean;
  huawei?: HuaweiHealthProviderAdapterOptions;
  xiaomi?: XiaomiHealthProviderAdapterOptions;
  adapters?: HealthProviderAdapter[];
};

export type QuickReadHealthSnapshotOptions = HealthClientOptions &
  HealthProviderReadOptions & {
    authorize?: boolean;
  };

export type HealthClient = {
  providerId: HealthProviderId;
  providerName: string;
  isAvailable: () => Promise<boolean>;
  authorize: () => Promise<boolean>;
  readSnapshot: (options?: HealthProviderReadOptions) => Promise<HealthSnapshot>;
  readWithAuthorization: (options?: HealthProviderReadOptions) => Promise<HealthSnapshot>;
};

function resolveProviderFromEnvironment(options: HealthClientOptions): HealthProviderId {
  const explicitProvider = options.provider;
  if (explicitProvider && explicitProvider !== 'auto') {
    return explicitProvider;
  }

  if (isHealthKitNativeAvailable()) {
    return 'apple-healthkit';
  }

  const huaweiConfigured =
    Boolean(options.huawei?.readSnapshot) ||
    Boolean(options.huawei?.readRawData) ||
    Boolean(options.huawei?.requestAuthorization) ||
    Boolean(options.huawei?.isAvailable);

  if (isHuaweiHealthNativeAvailable() || huaweiConfigured) {
    return 'huawei-health';
  }

  const xiaomiConfigured =
    Boolean(options.xiaomi?.readSnapshot) ||
    Boolean(options.xiaomi?.requestAuthorization) ||
    Boolean(options.xiaomi?.isAvailable);

  if (isXiaomiHealthNativeAvailable() || xiaomiConfigured) {
    return 'xiaomi-health';
  }

  return 'apple-healthkit';
}

function buildAdapters(options: HealthClientOptions): HealthProviderAdapter[] {
  const defaults: HealthProviderAdapter[] = [
    options.provider === 'apple-healthkit' ? createAppleHealthKitProviderAdapter() : appleHealthKitProviderAdapter,
    createHuaweiHealthProviderAdapter(options.huawei),
    createXiaomiHealthProviderAdapter(options.xiaomi),
  ];

  return options.adapters ? [...defaults, ...options.adapters] : defaults;
}

function resolveProviderAdapter(
  providerId: HealthProviderId,
  options: HealthClientOptions,
): HealthProviderAdapter {
  const map = createHealthProviderAdapterMap(buildAdapters(options));
  const adapter = map[providerId];
  if (!adapter) {
    throw new Error(`Health provider adapter "${providerId}" not found`);
  }
  return adapter;
}

export function createHealthClient(options: HealthClientOptions = {}): HealthClient {
  const providerId = resolveProviderFromEnvironment(options);
  const adapter = resolveProviderAdapter(providerId, options);
  const fallbackToMock = options.fallbackToMock ?? true;

  async function readSnapshot(readOptions: HealthProviderReadOptions = {}): Promise<HealthSnapshot> {
    const useMock = readOptions.useMock === true;
    if (useMock) {
      return adapter.readSnapshot({ useMock: true });
    }

    try {
      return await adapter.readSnapshot({ useMock: false });
    } catch (error) {
      if (!fallbackToMock) {
        throw error;
      }
      return adapter.readSnapshot({ useMock: true });
    }
  }

  async function authorize(): Promise<boolean> {
    try {
      return await adapter.requestAuthorization();
    } catch {
      return false;
    }
  }

  async function readWithAuthorization(
    readOptions: HealthProviderReadOptions = {},
  ): Promise<HealthSnapshot> {
    if (readOptions.useMock) {
      return readSnapshot({ useMock: true });
    }

    const authorized = await authorize();
    if (!authorized) {
      if (!fallbackToMock) {
        throw new Error(`Authorization failed for provider "${providerId}"`);
      }
      return readSnapshot({ useMock: true });
    }

    return readSnapshot({ useMock: false });
  }

  return {
    providerId: adapter.id,
    providerName: adapter.displayName,
    isAvailable: adapter.isAvailable,
    authorize,
    readSnapshot,
    readWithAuthorization,
  };
}

export async function quickReadHealthSnapshot(
  options: QuickReadHealthSnapshotOptions = {},
): Promise<HealthSnapshot> {
  const { authorize = true, useMock = false, ...clientOptions } = options;
  const client = createHealthClient(clientOptions);

  if (authorize) {
    return client.readWithAuthorization({ useMock });
  }

  return client.readSnapshot({ useMock });
}

export const readHealthSnapshot = quickReadHealthSnapshot;
