import type { HealthProviderAdapter } from './provider.js';
import { buildMockHealthSnapshot } from '../services/health.js';

export function createHuaweiHealthProviderAdapter(): HealthProviderAdapter {
  return {
    id: 'huawei-health',
    displayName: 'Huawei Health',
    isAvailable: async () => false,
    requestAuthorization: async () => false,
    readSnapshot: async ({ useMock = true } = {}) => {
      if (!useMock) {
        throw new Error('Huawei Health adapter is not implemented yet');
      }
      const snapshot = buildMockHealthSnapshot();
      return {
        ...snapshot,
        note: `Huawei Health adapter is in roadmap. ${snapshot.note ?? ''}`.trim(),
      };
    },
  };
}

export const huaweiHealthProviderAdapter = createHuaweiHealthProviderAdapter();
