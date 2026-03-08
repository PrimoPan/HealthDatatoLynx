import type { HealthSnapshot } from '../types/health.js';

export type HealthProviderId =
  | 'apple-healthkit'
  | 'health-connect'
  | 'huawei-health'
  | 'xiaomi-health';

export type HealthProviderReadOptions = {
  useMock?: boolean;
};

export type HealthProviderAdapter = {
  id: HealthProviderId;
  displayName: string;
  isAvailable: () => Promise<boolean>;
  requestAuthorization: () => Promise<boolean>;
  readSnapshot: (options?: HealthProviderReadOptions) => Promise<HealthSnapshot>;
};

export type HealthProviderAdapterMap = Partial<Record<HealthProviderId, HealthProviderAdapter>>;

export function createHealthProviderAdapterMap(adapters: HealthProviderAdapter[]): HealthProviderAdapterMap {
  return adapters.reduce<HealthProviderAdapterMap>((map, adapter) => {
    map[adapter.id] = adapter;
    return map;
  }, {});
}
