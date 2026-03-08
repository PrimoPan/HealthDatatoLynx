import type { HealthProviderAdapter, HealthProviderReadOptions } from './provider.js';
import { buildMockHealthSnapshot } from '../services/health.js';
import type { HealthConnectHooks } from '../services/health-connect.js';
import {
  authorizeHealthConnect,
  isHealthConnectAvailable,
  loadHealthConnectSnapshot,
} from '../services/health-connect.js';

export type HealthConnectProviderAdapterOptions = HealthConnectHooks;

export function createHealthConnectProviderAdapter(
  options: HealthConnectProviderAdapterOptions = {},
): HealthProviderAdapter {
  return {
    id: 'health-connect',
    displayName: 'Health Connect',
    isAvailable: () => isHealthConnectAvailable(options),
    requestAuthorization: () => authorizeHealthConnect(options),
    readSnapshot: async (readOptions: HealthProviderReadOptions = {}) => {
      if (readOptions.useMock) {
        const snapshot = buildMockHealthSnapshot();
        return {
          ...snapshot,
          note: `Forced mock snapshot for Health Connect provider. ${snapshot.note ?? ''}`.trim(),
        };
      }
      return loadHealthConnectSnapshot(options);
    },
  };
}

export const healthConnectProviderAdapter = createHealthConnectProviderAdapter();
