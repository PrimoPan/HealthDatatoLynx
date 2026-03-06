import type { HealthProviderAdapter, HealthProviderReadOptions } from './provider.js';
import { buildMockHealthSnapshot } from '../services/health.js';
import type { XiaomiHealthHooks } from '../services/xiaomi-health.js';
import {
  authorizeXiaomiHealth,
  isXiaomiHealthAvailable,
  loadXiaomiHealthSnapshot,
} from '../services/xiaomi-health.js';

export type XiaomiHealthProviderAdapterOptions = XiaomiHealthHooks;

export function createXiaomiHealthProviderAdapter(
  options: XiaomiHealthProviderAdapterOptions = {},
): HealthProviderAdapter {
  return {
    id: 'xiaomi-health',
    displayName: 'Xiaomi Health',
    isAvailable: () => isXiaomiHealthAvailable(options),
    requestAuthorization: () => authorizeXiaomiHealth(options),
    readSnapshot: async (readOptions: HealthProviderReadOptions = {}) => {
      if (readOptions.useMock) {
        const snapshot = buildMockHealthSnapshot();
        return {
          ...snapshot,
          note: `Forced mock snapshot for Xiaomi provider. ${snapshot.note ?? ''}`.trim(),
        };
      }
      return loadXiaomiHealthSnapshot(options);
    },
  };
}
