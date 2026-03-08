# HealthDataToLynx

<p align="center">
  <img src="src/assets/lynx-logo.png" alt="Lynx Logo" width="140" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/healthkit-logo.svg" alt="HealthKit Logo" width="96" />
</p>

<p align="center">
  <strong>面向跨端健康应用的 Lynx 健康 SDK 启动项目（支持 Apple + Health Connect + Huawei + Xiaomi）。</strong>
</p>

<p align="center">
  <a href="README.md">English README</a>
</p>

---

## 项目简介

HealthDataToLynx 是一个开源起步项目，用最小实现把多健康数据源（当前支持 **Apple HealthKit**、**Health Connect**、**Huawei Health**、**Xiaomi Health**）桥接到 **Lynx** 界面层。

它适合以下目标：

- 快速搭建 Lynx 客户端界面；
- 一键授权并读取 iOS 健康数据；
- 与 `react-native-health` 保持 API 一致性；
- 统一 TypeScript 数据类型约束；
- 后续继续平滑扩展到 Health Connect 等数据源。

## 核心能力

- Lynx 页面一键请求 HealthKit 授权
- Lynx 页面一键读取健康快照（Swift 原生模块）
- 内置 **小米健康适配器**：
  - 可直接对接原生 `XiaomiHealthManager` 模块
  - 也支持通过 Hook 注入你自己的小米后端拉取逻辑
- 内置 **Health Connect 适配器**：
  - 可直接对接原生 `HealthConnectManager` 模块
  - 也支持通过 Hook 注入 Android Health Connect 原始记录，并在 SDK 内做标准化
  - 已对齐 steps、exercise、heart rate、blood pressure、blood glucose、sleep、weight、height、respiratory rate、temperature 等官方记录类型
- 内置 **华为健康适配器**：
  - 可直接对接原生 `HuaweiHealthManager` 模块
  - 也支持通过 Hook 注入原始华为 Health Kit 数据，并在 SDK 内做标准化
  - 对齐华为最新睡眠记录与睡眠呼吸记录字段
- 完整类型化数据结构：活动、睡眠、心脏、血氧、体征、运动记录
- **默认包含血糖数据**（最新值 + 近7天序列）
- 在 Lynx Explorer 下可使用 Mock 数据回退
- 统一客户端调用：`createHealthClient` / `quickReadHealthSnapshot`
- 预留多厂商适配接口（adapter）
- 提供 `react-native-health` 兼容层（`src/services/react-native-health.ts`）

## 技术栈

- `@lynx-js/react`
- `@lynx-js/rspeedy`
- Swift `LynxModule`（`HealthKitManager`）
- TypeScript 严格模式

## 目录结构

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

## 快速开始

```bash
npm install
npm run dev
```

启动后，把 Lynx bundle 地址（示例：`http://<你的IP>:3000/main.lynx.bundle?fullscreen=true`）粘贴到 Lynx Explorer 中运行。

## 作为 npm 包使用

安装：

```bash
npm install health-data-to-lynx
```

这个 npm 包面向 Lynx 宿主和后端连接型健康产品，默认提供：

- 统一客户端 API：`createHealthClient`、`quickReadHealthSnapshot`、`readHealthSnapshot`
- 多 Provider 适配：Apple HealthKit、Health Connect、Huawei Health、Xiaomi Health
- 类型化数据契约：`HealthSnapshot`、`HealthAlert`、`HealthWorkoutRecord` 等
- 华为原始字段常量，方便做 raw payload 标准化
- `react-native-health` 兼容层

包本身是 ESM 优先，并且自带 TypeScript 类型声明。

### 最小可用示例

如果你只想最快接入，一键读取就够了：

```ts
import { quickReadHealthSnapshot, readHealthSnapshot } from 'health-data-to-lynx';

const snapshot = await quickReadHealthSnapshot({
  provider: 'auto', // 自动优先 Apple，再尝试 Health Connect，再尝试 Huawei，再尝试 Xiaomi
});

// 同行为别名：
const snapshot2 = await readHealthSnapshot({ provider: 'apple-healthkit' });
```

常用参数：

- `provider: 'auto' | 'apple-healthkit' | 'health-connect' | 'huawei-health' | 'xiaomi-health'`
- `authorize: true | false`
- `useMock: true | false`
- `fallbackToMock: true | false`

默认行为：

1. `provider: 'auto'` 会按 Apple -> Health Connect -> Huawei -> Xiaomi 的顺序自动选择
2. `fallbackToMock` 默认是 `true`
3. 当 native bridge 或连接器不存在时，SDK 默认返回 mock 数据，而不是直接抛错
4. 如果你在生产环境不希望静默回退，建议显式设置 `fallbackToMock: false`

### 推荐的客户端接入流程

如果你需要精确控制“是否可用、是否授权、何时读取”，建议使用 `createHealthClient`：

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

`HealthClient` 暴露的方法包括：

- `providerId`
- `providerName`
- `isAvailable()`
- `authorize()`
- `readSnapshot({ useMock? })`
- `readWithAuthorization({ useMock? })`

### Apple HealthKit 示例

如果你的 Lynx iOS 宿主已经接入了 `HealthKitManager.swift`，可以直接这样调用：

```ts
import { createHealthClient } from 'health-data-to-lynx';

const client = createHealthClient({
  provider: 'apple-healthkit',
  fallbackToMock: false,
});

const snapshot = await client.readWithAuthorization();
```

预期的原生模块名：

- `HealthKitManager`

预期的原生方法：

- `isHealthDataAvailable`
- `requestAuthorization`
- `getHealthSnapshot`

### Health Connect 示例

如果你的 Android Lynx 宿主已经暴露 `HealthConnectManager`，或者你的后端已经读到了 Health Connect 记录，可以这样接：

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

Health Connect 相关导出：

- `HEALTH_CONNECT_LATEST_REQUIREMENTS`
- `HEALTH_CONNECT_SDK_STATUS`
- `HEALTH_CONNECT_FEATURES`
- `HEALTH_CONNECT_RECORD_TYPES`

预期原生模块名：

- `HealthConnectManager`

预期原生方法：

- `isHealthDataAvailable`
- `getSdkStatus`
- `getFeatureStatus`
- `requestAuthorization`
- `getHealthSnapshot`

### Huawei Health 示例：后端直接返回标准化快照

如果你的后端已经把华为数据整理成统一的 `HealthSnapshot` 结构，可以直接注入：

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

### Huawei Health 示例：传入原始华为 Health Kit 数据

如果你更希望在宿主或后端读取华为原始字段，再交给 SDK 做标准化，可以用 `readRawData`：

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

`readRawData` 很适合这种场景：Android 宿主或后端已经拿到了华为 Health Kit 数据，但你希望 Lynx 层只面对一个稳定的 JS 数据契约。

### Xiaomi Health 示例

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

### 强制使用 mock 数据做 UI 调试

这个模式适合 Lynx Explorer、原型演示、前端先行开发：

```ts
import { quickReadHealthSnapshot } from 'health-data-to-lynx';

const snapshot = await quickReadHealthSnapshot({
  provider: 'huawei-health',
  authorize: false,
  useMock: true,
});
```

### TypeScript 用法

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

### `react-native-health` 兼容调用示例

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
    // 与 react-native-health 一致的回调风格
  },
);
```

### 已发布的包导出

发布导出位于 `package.json`：

- ESM 入口：`pkg/lib/index.js`
- 类型声明：`pkg/lib/index.d.ts`
- iOS 原生桥接源码：`ios/HealthKitBridge/HealthKitManager.swift`

旧 API 仍兼容可用：

- `authorizeHealthKit`
- `loadHealthSnapshot`
- `buildMockHealthSnapshot`

### 接入注意事项

- Apple 原生桥接模块名：`HealthKitManager`
- Huawei 原生桥接模块名：`HuaweiHealthManager`
- Xiaomi 原生桥接模块名：`XiaomiHealthManager`
- 如果保留 `fallbackToMock: true`，Provider 不可用时页面不会直接报错
- 如果是生产环境，建议优先使用 `fallbackToMock: false`，避免权限或桥接失败被静默吞掉
- 对 Huawei / Xiaomi 的后端连接器，建议把 OAuth、token 交换和厂商 SDK 密钥都放在服务端

## iOS 原生接入

请查看 `/ios/HealthKitBridge/README.md`。

最小接入步骤：

1. 将 `HealthKitManager.swift` 加入 iOS Lynx Host 工程目标；
2. 在 Lynx module provider 中注册 `HealthKitManager`；
3. Xcode 打开 `HealthKit` capability；
4. 在 Info.plist 中加入权限文案：
   - `NSHealthShareUsageDescription`
   - `NSHealthUpdateUsageDescription`（未来需要写入时再启用）

## 华为健康接入

支持两种接入方式：

1. 原生 Lynx Bridge：
   - 在宿主中注册名为 `HuaweiHealthManager` 的原生模块；
   - 暴露与 HealthKit 风格一致的方法：
     - `isHealthDataAvailable`
     - `requestAuthorization`
     - `getHealthSnapshot`
2. Hook 注入连接器：
   - 在 `createHealthClient` 里传入 `huawei.isAvailable / requestAuthorization / readSnapshot / readRawData`
   - `readSnapshot` 可直接返回标准化后的 `HealthSnapshot`
   - `readRawData` 可直接返回华为官方类型命名的数据，例如：
     - `DT_CONTINUOUS_STEPS_DELTA`
     - `DT_INSTANTANEOUS_BLOOD_PRESSURE`
     - `DT_HEALTH_RECORD_SLEEP`
     - `DT_HEALTH_RECORD_VENTILATOR`

当前仓库对齐的华为官方最新字段范围包括：

- 原子采样数据：
  - steps、distance、calories、exercise intensity v2、altitude、height、weight
  - heart rate、resting heart rate、SpO2、blood glucose、blood pressure
  - stress、body temperature、skin temperature、VO2Max
- 健康记录：
  - 睡眠记录字段：`fall_asleep_time`、`wakeup_time`、`all_sleep_time`、`light_sleep_time`、`deep_sleep_time`、`dream_time`、`sleep_score`、`sleep_type`
  - 睡眠呼吸记录字段：`sysMode`、`sysSessionDate`、`eventAhi`、`sysDuration`、`lumisTidvolMedian`、`clinicalRespRateMedian`、`maskOff`、`hypoventilationIndex`、`obstructiveApneaIndex`、`allEventTimes`

本次对齐使用的华为环境要求：

- Android `7.0` 到 `16`（API `24` 到 `36`）
- HMS Core `5.0.4.300+`
- 华为运动健康 App `11.0.0.512+`

## 小米健康接入

支持两种接入方式：

1. 原生 Lynx Bridge：
   - 在宿主中注册名为 `XiaomiHealthManager` 的原生模块；
   - 暴露与 HealthKit 风格一致的方法：
     - `isHealthDataAvailable`
     - `requestAuthorization`
     - `getHealthSnapshot`
2. Hook 注入后端连接器（无需原生模块）：
   - 在 `createHealthClient` 里传入 `xiaomi.isAvailable / requestAuthorization / readSnapshot`
   - 建议把小米 OAuth 与 token 管理放在后端，避免客户端泄露

## 健康数据字段（重点）

- `activity.stepsToday`
- `heart.latestHeartRateBpm`
- `heart.heartRateSeriesLast24h[]`
- `oxygen.bloodOxygenPercent`
- `oxygen.bloodOxygenSeriesLast24h[]`
- `metabolic.bloodGlucoseMgDl`
- `metabolic.bloodGlucoseSeriesLast7d[]`（共享契约里按 mg/dL）
- `sleep.asleepMinutesLast36h`
- `sleep.apnea.eventCountLast30d`
- `sleep.apnea.ahiLastSession`
- `sleep.lightSleepMinutes`
- `body.stressScore`
- `body.skinTemperatureCelsius`
- `workouts[]`

## 相关开源参考

- [react-native-health](https://github.com/agencyenterprise/react-native-health)
- [react-native-apple-healthkit](https://github.com/changey/react-native-apple-healthkit)
- [cordova-plugin-health](https://github.com/dariosalvi78/cordova-plugin-health)
- [capacitor-health](https://github.com/mley/capacitor-health)

本项目的差异点是：以 **Lynx 优先** 的桥接方案为主，当前在公开样例中较少见。

## 路线图

- [x] 华为健康适配器（原生桥接 + 原始数据标准化）
- [x] 小米健康适配器（原生桥接 + 自定义连接器 Hook）
- [x] Android Health Connect 适配器（原生桥接 + 原始记录标准化）
- [ ] 定时同步与后端上传示例
- [ ] 后端存储与预警示例

## 版本策略与发布

- Patch（`0.1.x`）：缺陷修复，不改公开 API 契约。
- Minor（`0.x+1.0`）：新增字段/能力，保持向后兼容。
- Major（`x+1.0.0`）：存在破坏性变更。

版本命令：

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

发布命令：

```bash
npm publish --access public
```

## License

MIT
