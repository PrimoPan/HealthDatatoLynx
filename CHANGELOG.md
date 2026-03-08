# Changelog

All notable changes to this project are documented here.

## 0.3.0

Released: 2026-03-08

Added:

- Android Health Connect provider support for Lynx via `HealthConnectManager` or hook-based connectors
- Health Connect constants for SDK status, feature flags, record types, and platform requirements
- Health Connect snapshot normalization for steps, calories, workouts, heart rate, SpO2, blood pressure, blood glucose, sleep, weight, height, respiratory rate, and temperature records
- Demo app provider switch for Health Connect

Changed:

- `provider: 'auto'` now resolves Apple HealthKit first, then Health Connect, then Huawei Health, then Xiaomi Health
- npm metadata and docs now include Health Connect package usage

Notes:

- This release adds read/authorization support for Health Connect
- write/delete/changes/background APIs land in `0.4.0`
- Samsung Health Data SDK lands in `0.5.0`
