# HealthDataToLynx

<p align="center">
  <img src="src/assets/lynx-logo.png" alt="Lynx Logo" width="140" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/healthkit-logo.svg" alt="HealthKit Logo" width="96" />
</p>

<p align="center">
  <strong>Lynx health SDK starter with Apple HealthKit + Huawei Health + Xiaomi provider support.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文文档</a>
</p>

---

## Overview

HealthDataToLynx is an open-source starter project that bridges health data providers (currently **Apple HealthKit**, **Huawei Health**, and **Xiaomi Health**) into a **Lynx** UI with a minimal and practical architecture.

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
    services/huawei-health.ts
    services/xiaomi-health.ts
    services/react-native-health.ts
    types/health.ts
    adapters/provider.ts
    adapters/apple-healthkit.ts
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

One-line read (recommended):

```ts
import { quickReadHealthSnapshot, readHealthSnapshot } from 'health-data-to-lynx';

const snapshot = await quickReadHealthSnapshot({
  provider: 'auto', // auto resolves Apple first, then Huawei, then Xiaomi
});

// Alias with the same behavior:
const snapshot2 = await readHealthSnapshot({ provider: 'apple-healthkit' });
```

Explicit provider client (Apple, Huawei, or Xiaomi):

```ts
import { createHealthClient } from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'huawei-health',
  huawei: {
    // Replace with your own connector if Huawei Health data is read by your backend.
    isAvailable: async () => true,
    requestAuthorization: async () => true,
    readRawData: async () => await getHuaweiHealthKitPayloadFromBackend(),
  },
});

const snapshot = await client.readWithAuthorization();
```

`react-native-health` compatible usage:

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

Publish-ready exports are defined in `package.json`:

- ESM entry: `dist/npm/lib/index.js`
- Types: `dist/npm/lib/index.d.ts`
- iOS bridge source: `ios/HealthKitBridge/HealthKitManager.swift`

Backward-compatible APIs are still available:

- `authorizeHealthKit`
- `loadHealthSnapshot`
- `buildMockHealthSnapshot`

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
- [ ] Android Health Connect adapter
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
