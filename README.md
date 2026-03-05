# HealthDataToLynx

<p align="center">
  <img src="src/assets/lynx-logo.png" alt="Lynx Logo" width="140" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/healthkit-logo.svg" alt="HealthKit Logo" width="96" />
</p>

<p align="center">
  <strong>Lynx + iOS HealthKit starter for cross-platform health apps.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文文档</a>
</p>

---

## Overview

HealthDataToLynx is an open-source starter project that bridges **Apple HealthKit** data into a **Lynx** UI with a minimal and practical architecture.

It is designed for teams who want to:

- ship Lynx UI quickly,
- read real iOS health data with one tap,
- keep API consistency with `react-native-health`,
- keep a stable TypeScript data contract,
- and later extend to Huawei/Xiaomi/other providers.

## Core Features

- One-click **HealthKit authorization** in Lynx UI
- One-click **health snapshot reading** via Swift native module
- Complete typed payload for key metrics:
  - Activity, sleep, heart, SpO2, workouts
  - **Blood glucose included by default**
- Mock data fallback for Lynx Explorer and early UI debugging
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
    services/health.ts
    services/react-native-health.ts
    types/health.ts
    adapters/provider.ts
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

Import:

```ts
import { authorizeHealthKit, loadHealthSnapshot, buildMockHealthSnapshot } from 'health-data-to-lynx';
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

## iOS Native Integration

See `/ios/HealthKitBridge/README.md`.

Minimum setup:

1. Add `HealthKitManager.swift` to your iOS Lynx host target.
2. Register `HealthKitManager` in Lynx module provider.
3. Enable `HealthKit` capability in Xcode.
4. Add Info.plist usage descriptions:
   - `NSHealthShareUsageDescription`
   - `NSHealthUpdateUsageDescription` (if you write data later)

## Health Data Contract (Highlights)

- `activity.stepsToday`
- `heart.latestHeartRateBpm`
- `heart.heartRateSeriesLast24h[]`
- `oxygen.bloodOxygenPercent`
- `oxygen.bloodOxygenSeriesLast24h[]`
- `metabolic.bloodGlucoseMgDl`
- `metabolic.bloodGlucoseSeriesLast7d[]` (mmol/L)
- `sleep.asleepMinutesLast36h`
- `sleep.apnea.eventCountLast30d`
- `workouts[]`

## Similar Open-Source References

- [react-native-health](https://github.com/agencyenterprise/react-native-health)
- [react-native-apple-healthkit](https://github.com/changey/react-native-apple-healthkit)
- [cordova-plugin-health](https://github.com/dariosalvi78/cordova-plugin-health)
- [capacitor-health](https://github.com/mley/capacitor-health)

This project focuses on a **Lynx-first bridge** path, which is currently less common in open-source health SDK examples.

## Roadmap

- [ ] Huawei Health adapter
- [ ] Xiaomi Health adapter
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
