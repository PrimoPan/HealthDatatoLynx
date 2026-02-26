import type { HealthSnapshot } from '../types/health.js';

export type HealthProviderId = 'apple-healthkit' | 'huawei-health' | 'xiaomi-health';

export type HealthProviderAdapter = {
  id: HealthProviderId;
  displayName: string;
  isAvailable: () => Promise<boolean>;
  requestAuthorization: () => Promise<boolean>;
  readSnapshot: () => Promise<HealthSnapshot>;
};

// This project currently ships with the Apple HealthKit adapter.
// Huawei/Xiaomi adapters can implement the same contract to keep the UI stable.
