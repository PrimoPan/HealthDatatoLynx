import type { HealthProviderAdapter, HealthProviderReadOptions } from './provider.js';
import { buildMockHealthSnapshot } from '../services/health.js';
import type { HuaweiHealthHooks } from '../services/huawei-health.js';
import {
  authorizeHuaweiHealth,
  isHuaweiHealthAvailable,
  loadHuaweiHealthSnapshot,
} from '../services/huawei-health.js';

export type HuaweiHealthProviderAdapterOptions = HuaweiHealthHooks;

export function createHuaweiHealthProviderAdapter(
  options: HuaweiHealthProviderAdapterOptions = {},
): HealthProviderAdapter {
  return {
    id: 'huawei-health',
    displayName: 'Huawei Health',
    isAvailable: () => isHuaweiHealthAvailable(options),
    requestAuthorization: () => authorizeHuaweiHealth(options),
    readSnapshot: async (readOptions: HealthProviderReadOptions = {}) => {
      if (readOptions.useMock) {
        const snapshot = buildMockHealthSnapshot();
        return {
          ...snapshot,
          note: `Forced mock snapshot for Huawei provider. ${snapshot.note ?? ''}`.trim(),
        };
      }
      return loadHuaweiHealthSnapshot(options);
    },
  };
}

export const huaweiHealthProviderAdapter = createHuaweiHealthProviderAdapter();
