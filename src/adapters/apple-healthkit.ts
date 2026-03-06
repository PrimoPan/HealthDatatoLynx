import type { HealthProviderAdapter } from './provider.js';
import {
  authorizeHealthKit,
  isHealthKitNativeAvailable,
  loadHealthSnapshot,
} from '../services/health.js';

export function createAppleHealthKitProviderAdapter(): HealthProviderAdapter {
  return {
    id: 'apple-healthkit',
    displayName: 'Apple HealthKit',
    isAvailable: async () => isHealthKitNativeAvailable(),
    requestAuthorization: authorizeHealthKit,
    readSnapshot: ({ useMock = false } = {}) => loadHealthSnapshot(useMock),
  };
}

export const appleHealthKitProviderAdapter = createAppleHealthKitProviderAdapter();
