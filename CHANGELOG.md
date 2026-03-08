# Changelog

All notable changes to this project are documented here.

## 0.3.0

Released: 2026-03-08

Summary:

- Added Android Health Connect read support for Lynx hosts and backend-connected Android apps
- Added a dedicated Health Connect provider, constants, raw record normalization, and demo support
- Fixed npm packaging so published artifacts are isolated in `pkg/` and no longer get wiped by web builds
- Expanded README package docs and aligned changelog/release metadata

Added:

- `HealthConnectManager` native bridge support
- hook-based `healthConnect.readSnapshot` and `healthConnect.readRawData`
- official Health Connect exports:
  - `HEALTH_CONNECT_LATEST_REQUIREMENTS`
  - `HEALTH_CONNECT_SDK_STATUS`
  - `HEALTH_CONNECT_FEATURES`
  - `HEALTH_CONNECT_RECORD_TYPES`
- Health Connect normalization for:
  - steps
  - distance
  - calories
  - exercise sessions
  - heart rate
  - blood oxygen
  - blood pressure
  - blood glucose
  - sleep
  - height
  - weight
  - respiratory rate
  - body temperature
  - skin temperature
- Health Connect provider switch in the Lynx demo app

Changed:

- `provider: 'auto'` now resolves in this order:
  1. Apple HealthKit
  2. Health Connect
  3. Huawei Health
  4. Xiaomi Health
- published package entry now points to `pkg/` instead of `dist/npm/`
- npm docs now include fuller installation and provider examples in both English and Chinese

Notes:

- This release covers read and authorization flows for Health Connect
- Unified write/delete/change-sync APIs are planned for `0.4.0`
- Samsung Health Data SDK support is planned for `0.5.0`

## 0.2.0

Released: 2026-03-08

Summary:

- Added Huawei Health support
- fixed npm packaging and official npm registry publishing
- expanded package docs for direct Lynx SDK consumption

Added:

- `HuaweiHealthManager` bridge support
- hook-based Huawei raw payload normalization
- Huawei latest sleep and sleep-breathing field alignment
- best-effort Huawei fallback behavior

Changed:

- npm package was prepared and published to the public npm registry
- package export docs were clarified for Lynx developers

## 0.1.0

Released: 2026-03-06

Summary:

- Initial public package baseline
- Apple HealthKit starter flow for Lynx
- Xiaomi provider support and unified client abstraction

Added:

- Apple HealthKit snapshot read flow
- Xiaomi Health provider hooks and adapter
- `createHealthClient`, `quickReadHealthSnapshot`, `readHealthSnapshot`
- mock snapshot generation for Lynx Explorer and UI development
