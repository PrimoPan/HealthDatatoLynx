# HealthDataToLynx

<p align="center">
  <img src="src/assets/lynx-logo.png" alt="Lynx Logo" width="140" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/healthkit-logo.svg" alt="HealthKit Logo" width="96" />
</p>

<p align="center">
  <strong>Lynx health SDK starter with Apple HealthKit + Health Connect + Huawei Health + Xiaomi provider support.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文文档</a>
</p>

---

## Overview

HealthDataToLynx is an open-source starter project that bridges health data providers (currently **Apple HealthKit**, **Health Connect**, **Huawei Health**, and **Xiaomi Health**) into a **Lynx** UI with a minimal and practical architecture.

It is designed for teams who want to:

- ship Lynx UI quickly,
- read real iOS health data with one tap,
- keep API consistency with `react-native-health`,
- keep a stable TypeScript data contract,
- and keep extending to Health Connect and other providers.

## Core Features

- One-click **HealthKit authorization** in Lynx UI
- One-click **health snapshot reading** via Swift native module
- Built-in **Xiaomi Health provider adapter**:
  - supports native `XiaomiHealthManager` bridge when available
  - supports custom hook-based connector for your own Xiaomi backend
- Built-in **Health Connect provider adapter**:
  - supports native `HealthConnectManager` bridge when available
  - supports hook-based raw record normalization from Android Health Connect payloads
  - maps official record types such as steps, exercise sessions, heart rate, blood pressure, blood glucose, sleep, weight, height, respiratory rate, and temperatures
- Built-in **Huawei Health provider adapter**:
  - supports native `HuaweiHealthManager` bridge when available
  - supports hook-based raw payload normalization aligned to Huawei Health Kit field names
  - maps latest Huawei sleep record and sleep-breathing record fields into the shared snapshot contract
- Complete typed payload for key metrics:
  - Activity, sleep, heart, SpO2, body metrics, workouts
  - **Blood glucose included by default**
- Mock data fallback for Lynx Explorer and early UI debugging
- Unified client API: `createHealthClient` / `quickReadHealthSnapshot`
- Clean adapter interface for future health providers
- `react-native-health` compatibility layer (`src/services/react-native-health.ts`)

## Tech Stack

- `@lynx-js/react`
- `@lynx-js/rspeedy`
- Swift `LynxModule` bridge (`HealthKitManager`)
- TypeScript strict mode

## Project Structure

```text
HealthDatatoLynx/
  docs/
    healthkit-logo.svg
  ios/HealthKitBridge/
    HealthKitManager.swift
    README.md
  src/
    App.tsx
    App.css
    lib/client.ts
    services/health.ts
    services/health-connect.ts
    services/huawei-health.ts
    services/xiaomi-health.ts
    services/react-native-health.ts
    types/health.ts
    adapters/provider.ts
    adapters/apple-healthkit.ts
    adapters/health-connect.ts
    adapters/huawei-health.ts
    adapters/xiaomi-health.ts
```

## Quick Start

```bash
npm install
npm run dev
```

Then copy the Lynx bundle URL (for example `http://<your-ip>:3000/main.lynx.bundle?fullscreen=true`) into **Lynx Explorer**.

## Use as an npm package

Install:

```bash
npm install health-data-to-lynx
```

This package is designed for Lynx hosts and backend-connected health products. It ships:

- unified client APIs: `createHealthClient`, `quickReadHealthSnapshot`, `readHealthSnapshot`
- provider adapters: Apple HealthKit, Huawei Health, Xiaomi Health
- provider adapters: Apple HealthKit, Health Connect, Huawei Health, Xiaomi Health
- typed data contracts: `HealthSnapshot`, `HealthAlert`, `HealthWorkoutRecord`, and related types
- Huawei field constants for raw payload normalization
- `react-native-health` compatibility helpers

The package is ESM-first and includes TypeScript declarations out of the box.

### Smallest possible usage

One-line read is the fastest way to integrate:

```ts
import { quickReadHealthSnapshot, readHealthSnapshot } from 'health-data-to-lynx';

const snapshot = await quickReadHealthSnapshot({
  provider: 'auto', // auto resolves Apple first, then Health Connect, then Huawei, then Xiaomi
});

// Alias with the same behavior:
const snapshot2 = await readHealthSnapshot({ provider: 'apple-healthkit' });
```

Useful options:

- `provider: 'auto' | 'apple-healthkit' | 'health-connect' | 'huawei-health' | 'xiaomi-health'`
- `authorize: true | false`
- `useMock: true | false`
- `fallbackToMock: true | false`

Default behavior:

1. `provider: 'auto'` resolves Apple first, then Health Connect, then Huawei, then Xiaomi.
2. `fallbackToMock` defaults to `true`.
3. If native bridge or connector is unavailable, the SDK returns mock data instead of throwing.
4. For production flows where silent fallback is not acceptable, set `fallbackToMock: false`.

### Recommended client flow

Use `createHealthClient` when you need explicit control over availability checks, authorization, and read timing:

```ts
import { createHealthClient } from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'auto',
  fallbackToMock: false,
});

const available = await client.isAvailable();
if (!available) {
  throw new Error(`${client.providerName} is not available in the current host`);
}

const authorized = await client.authorize();
if (!authorized) {
  throw new Error(`Authorization failed for ${client.providerName}`);
}

const snapshot = await client.readSnapshot();
```

`HealthClient` exposes:

- `providerId`
- `providerName`
- `isAvailable()`
- `authorize()`
- `readSnapshot({ useMock? })`
- `readWithAuthorization({ useMock? })`

### Apple HealthKit example

Use this when your Lynx iOS host already embeds `HealthKitManager.swift`:

```ts
import { createHealthClient } from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'apple-healthkit',
  fallbackToMock: false,
});

const snapshot = await client.readWithAuthorization();
```

Expected native module name:

- `HealthKitManager`

Expected native methods:

- `isHealthDataAvailable`
- `requestAuthorization`
- `getHealthSnapshot`

### Health Connect example

Use this when your Android Lynx host exposes a native `HealthConnectManager` or your backend already reads Health Connect records:

```ts
import {
  createHealthClient,
  HEALTH_CONNECT_RECORD_TYPES,
} from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'health-connect',
  fallbackToMock: false,
  healthConnect: {
    isAvailable: async () => true,
    requestAuthorization: async () => true,
    readRawData: async () => ({
      authorized: true,
      [HEALTH_CONNECT_RECORD_TYPES.steps]: [
        { startTime: '2026-03-08T00:00:00.000Z', endTime: '2026-03-08T01:00:00.000Z', count: 320 },
        { startTime: '2026-03-08T01:00:00.000Z', endTime: '2026-03-08T02:00:00.000Z', count: 410 },
      ],
      [HEALTH_CONNECT_RECORD_TYPES.bloodPressure]: [
        { time: '2026-03-08T02:00:00.000Z', systolic: 128, diastolic: 82 },
      ],
      [HEALTH_CONNECT_RECORD_TYPES.exercise]: [
        {
          exerciseTypeName: 'running',
          startTime: '2026-03-08T06:00:00.000Z',
          endTime: '2026-03-08T06:36:00.000Z',
          totalDistance: 5200,
          totalEnergyBurned: 382,
        },
      ],
    }),
  },
});

const snapshot = await client.readWithAuthorization();
```

Available exports for Health Connect:

- `HEALTH_CONNECT_LATEST_REQUIREMENTS`
- `HEALTH_CONNECT_SDK_STATUS`
- `HEALTH_CONNECT_FEATURES`
- `HEALTH_CONNECT_RECORD_TYPES`

Expected native module name:

- `HealthConnectManager`

Expected native methods:

- `isHealthDataAvailable`
- `getSdkStatus`
- `getFeatureStatus`
- `requestAuthorization`
- `getHealthSnapshot`

### Huawei Health example: normalized snapshot from your backend

If your backend already converts Huawei data into the shared `HealthSnapshot` shape, inject it directly:

```ts
import { createHealthClient } from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'huawei-health',
  fallbackToMock: false,
  huawei: {
    isAvailable: async () => true,
    requestAuthorization: async () => true,
    readSnapshot: async () => ({
      source: 'huawei-health',
      authorized: true,
      generatedAt: new Date().toISOString(),
      activity: {
        stepsToday: 8421,
      },
      heart: {
        latestHeartRateBpm: 68,
      },
    }),
  },
});

const snapshot = await client.readWithAuthorization();
```

### Huawei Health example: raw Huawei Health Kit payload

If you prefer to send raw Huawei fields and let this SDK normalize them, use `readRawData`:

```ts
import {
  createHealthClient,
  HUAWEI_HEALTH_RECORD_TYPES,
} from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'huawei-health',
  huawei: {
    isAvailable: async () => true,
    requestAuthorization: async () => true,
    readRawData: async () => ({
      authorized: true,
      DT_CONTINUOUS_STEPS_DELTA: [
        { timestamp: '2026-03-08T01:00:00.000Z', delta: 320 },
        { timestamp: '2026-03-08T02:00:00.000Z', delta: 410 },
      ],
      DT_INSTANTANEOUS_BLOOD_PRESSURE: [
        { timestamp: '2026-03-08T02:00:00.000Z', systolic: 128, diastolic: 82 },
      ],
      [HUAWEI_HEALTH_RECORD_TYPES.sleep]: [
        {
          fall_asleep_time: '2026-03-07T15:10:00.000Z',
          wakeup_time: '2026-03-07T22:40:00.000Z',
          all_sleep_time: 450,
          light_sleep_time: 255,
          deep_sleep_time: 108,
          dream_time: 87,
          sleep_score: 86,
        },
      ],
      [HUAWEI_HEALTH_RECORD_TYPES.sleepBreathing]: [
        {
          sysMode: 2,
          sysSessionDate: '2026-03-07T22:30:00.000Z',
          eventAhi: 6.2,
          sysDuration: 420,
          allEventTimes: 8,
        },
      ],
    }),
  },
});

const snapshot = await client.readWithAuthorization();
```

`readRawData` is useful when your Android host or backend already reads Huawei Health Kit, but you want one stable JS contract for Lynx.

### Xiaomi Health example

```ts
import { createHealthClient } from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'xiaomi-health',
  xiaomi: {
    isAvailable: async () => true,
    requestAuthorization: async () => true,
    readSnapshot: async () => await getXiaomiSnapshotFromBackend(),
  },
});

const snapshot = await client.readWithAuthorization();
```

### Force mock data for UI debugging

Use this in Lynx Explorer, story-like previews, or early frontend work:

```ts
import { quickReadHealthSnapshot } from 'health-data-to-lynx';

const snapshot = await quickReadHealthSnapshot({
  provider: 'huawei-health',
  authorize: false,
  useMock: true,
});
```

### TypeScript usage

```ts
import type {
  HealthSnapshot,
  HealthAlert,
  HealthWorkoutRecord,
} from 'health-data-to-lynx';

function renderSnapshot(snapshot: HealthSnapshot): string {
  return `${snapshot.source} @ ${snapshot.generatedAt}`;
}
```

### `react-native-health` compatible usage

```ts
import { HealthKit } from 'health-data-to-lynx';

HealthKit.initHealthKit(
  {
    permissions: {
      read: [HealthKit.Constants.Permissions.StepCount],
      write: [],
    },
  },
  (err, result) => {
    // react-native-health style callback
  },
);
```

### Published package exports

Publish-ready exports are defined in `package.json`:

- ESM entry: `pkg/lib/index.js`
- Types: `pkg/lib/index.d.ts`
- iOS bridge source: `ios/HealthKitBridge/HealthKitManager.swift`

Backward-compatible APIs are still available:

- `authorizeHealthKit`
- `loadHealthSnapshot`
- `buildMockHealthSnapshot`

### Integration notes

- Apple native bridge name: `HealthKitManager`
- Huawei native bridge name: `HuaweiHealthManager`
- Xiaomi native bridge name: `XiaomiHealthManager`
- If you keep `fallbackToMock: true`, unavailable providers do not break the Lynx page
- For production, prefer `fallbackToMock: false` so missing permissions or bridge failures are surfaced immediately
- For Huawei and Xiaomi backend connectors, keep OAuth, token exchange, and vendor SDK secrets on the server side

## iOS Native Integration

See `/ios/HealthKitBridge/README.md`.

Minimum setup:

1. Add `HealthKitManager.swift` to your iOS Lynx host target.
2. Register `HealthKitManager` in Lynx module provider.
3. Enable `HealthKit` capability in Xcode.
4. Add Info.plist usage descriptions:
   - `NSHealthShareUsageDescription`
   - `NSHealthUpdateUsageDescription` (if you write data later)

## Huawei Integration

Huawei is supported in two ways:

1. Native Lynx bridge:
   - register a native module named `HuaweiHealthManager`
   - expose methods aligned with HealthKit bridge style:
     - `isHealthDataAvailable`
     - `requestAuthorization`
     - `getHealthSnapshot`
2. Hook-based connector:
   - pass `huawei.isAvailable / requestAuthorization / readSnapshot / readRawData` into `createHealthClient`
   - `readSnapshot` can return a normalized `HealthSnapshot`
   - `readRawData` can return raw Huawei Health Kit payloads keyed by official types such as:
     - `DT_CONTINUOUS_STEPS_DELTA`
     - `DT_INSTANTANEOUS_BLOOD_PRESSURE`
     - `DT_HEALTH_RECORD_SLEEP`
     - `DT_HEALTH_RECORD_VENTILATOR`

Latest Huawei Health Kit coverage in this repo is aligned to the official docs for:

- atomic sampling data:
  - steps, distance, calories, exercise intensity v2, altitude, height, weight
  - heart rate, resting heart rate, SpO2, blood glucose, blood pressure
  - stress, body temperature, skin temperature, VO2Max
- health records:
  - sleep record fields such as `fall_asleep_time`, `wakeup_time`, `all_sleep_time`, `light_sleep_time`, `deep_sleep_time`, `dream_time`, `sleep_score`, `sleep_type`
  - sleep-breathing record fields such as `sysMode`, `sysSessionDate`, `eventAhi`, `sysDuration`, `lumisTidvolMedian`, `clinicalRespRateMedian`, `maskOff`, `hypoventilationIndex`, `obstructiveApneaIndex`, `allEventTimes`

Huawei Health Kit environment requirements used for alignment:

- Android `7.0` to `16` (API `24` to `36`)
- HMS Core `5.0.4.300+`
- Huawei Health app `11.0.0.512+`

## Xiaomi Integration

You can integrate Xiaomi in two ways:

1. Native Lynx bridge:
   - register a native module named `XiaomiHealthManager`
   - expose methods aligned with HealthKit bridge style:
     - `isHealthDataAvailable`
     - `requestAuthorization`
     - `getHealthSnapshot`
2. Hook-based backend connector (no native module required):
   - pass `xiaomi.isAvailable / requestAuthorization / readSnapshot` into `createHealthClient`
   - keep Xiaomi OAuth/token exchange in backend for better security

## Health Data Contract (Highlights)

- `activity.stepsToday`
- `heart.latestHeartRateBpm`
- `heart.heartRateSeriesLast24h[]`
- `oxygen.bloodOxygenPercent`
- `oxygen.bloodOxygenSeriesLast24h[]`
- `metabolic.bloodGlucoseMgDl`
- `metabolic.bloodGlucoseSeriesLast7d[]` (mg/dL in the shared contract)
- `sleep.asleepMinutesLast36h`
- `sleep.apnea.eventCountLast30d`
- `sleep.apnea.ahiLastSession`
- `sleep.lightSleepMinutes`
- `body.stressScore`
- `body.skinTemperatureCelsius`
- `workouts[]`

## Similar Open-Source References

- [react-native-health](https://github.com/agencyenterprise/react-native-health)
- [react-native-apple-healthkit](https://github.com/changey/react-native-apple-healthkit)
- [cordova-plugin-health](https://github.com/dariosalvi78/cordova-plugin-health)
- [capacitor-health](https://github.com/mley/capacitor-health)

This project focuses on a **Lynx-first bridge** path, which is currently less common in open-source health SDK examples.

## Roadmap

- [x] Huawei Health adapter (native bridge + normalized raw payload support)
- [x] Xiaomi Health adapter (native bridge + custom connector hooks)
- [x] Android Health Connect adapter (native bridge + raw record normalization)
- [ ] Scheduled sync + backend uploader
- [ ] Example backend schema and alert pipeline

## Release and version strategy

- Patch (`0.1.x`): bug fixes, no API contract changes.
- Minor (`0.x+1.0`): additive fields, new adapter capabilities, backward compatible.
- Major (`x+1.0.0`): breaking API/type/schema changes.

Commands:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

Publish:

```bash
npm publish --access public
```

## License

MIT
