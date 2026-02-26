# iOS HealthKit Bridge for Lynx

This folder contains `HealthKitManager.swift`, a Swift native module for Lynx.

It exposes 3 JS-callable methods:

- `isHealthDataAvailable`
- `requestAuthorization`
- `getHealthSnapshot`

## 1. Add Swift file to your iOS Lynx host app

Add `/ios/HealthKitBridge/HealthKitManager.swift` into your host app target.

## 2. Register module in Lynx host

The module name is:

```swift
HealthKitManager.name // "HealthKitManager"
```

After registration, JS can call:

```ts
NativeModules.HealthKitManager.isHealthDataAvailable(...)
NativeModules.HealthKitManager.requestAuthorization(...)
NativeModules.HealthKitManager.getHealthSnapshot(...)
```

## 3. Enable HealthKit capability

In Xcode target settings:

- `Signing & Capabilities` -> `+ Capability` -> `HealthKit`

## 4. Add Info.plist usage descriptions

At minimum:

- `NSHealthShareUsageDescription`

Optional (if writing data in the future):

- `NSHealthUpdateUsageDescription`

## 5. Data returned by native bridge

Current bridge returns:

- Activity totals (steps, active energy, exercise minutes)
- Sleep summary (last 36h)
- Sleep apnea summary (last 30d, if available)
- Heart metrics (latest + 24h hourly average series)
- Blood oxygen (latest + 24h hourly average series)
- Blood glucose
  - `bloodGlucoseMgDl` (latest)
  - `bloodGlucoseSeriesLast7d` (daily average, mmol/L)
- Recent workouts

## 6. Notes on simulator

- HealthKit data on iOS simulator is usually empty.
- Use Lynx mock mode from JS for UI development.
- Validate real HealthKit data on physical devices.
