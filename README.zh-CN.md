# HealthDataToLynx

<p align="center">
  <img src="src/assets/lynx-logo.png" alt="Lynx Logo" width="140" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/healthkit-logo.svg" alt="HealthKit Logo" width="96" />
</p>

<p align="center">
  <strong>面向跨端健康应用的 Lynx + iOS HealthKit 启动项目。</strong>
</p>

<p align="center">
  <a href="README.md">English README</a>
</p>

---

## 项目简介

HealthDataToLynx 是一个开源起步项目，用最小实现把 **Apple HealthKit** 的健康数据桥接到 **Lynx** 界面层。

它适合以下目标：

- 快速搭建 Lynx 客户端界面；
- 一键授权并读取 iOS 健康数据；
- 与 `react-native-health` 保持 API 一致性；
- 统一 TypeScript 数据类型约束；
- 后续平滑扩展到华为/小米等数据源。

## 核心能力

- Lynx 页面一键请求 HealthKit 授权
- Lynx 页面一键读取健康快照（Swift 原生模块）
- 完整类型化数据结构：活动、睡眠、心脏、血氧、运动记录
- **默认包含血糖数据**（最新值 + 近7天序列）
- 在 Lynx Explorer 下可使用 Mock 数据回退
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
    services/health.ts
    services/react-native-health.ts
    types/health.ts
    adapters/provider.ts
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

导入：

```ts
import { authorizeHealthKit, loadHealthSnapshot, buildMockHealthSnapshot } from 'health-data-to-lynx';
```

`react-native-health` 兼容调用示例：

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

发布导出位于 `package.json`：

- ESM 入口：`dist/npm/lib/index.js`
- 类型声明：`dist/npm/lib/index.d.ts`
- iOS 原生桥接源码：`ios/HealthKitBridge/HealthKitManager.swift`

## iOS 原生接入

请查看 `/ios/HealthKitBridge/README.md`。

最小接入步骤：

1. 将 `HealthKitManager.swift` 加入 iOS Lynx Host 工程目标；
2. 在 Lynx module provider 中注册 `HealthKitManager`；
3. Xcode 打开 `HealthKit` capability；
4. 在 Info.plist 中加入权限文案：
   - `NSHealthShareUsageDescription`
   - `NSHealthUpdateUsageDescription`（未来需要写入时再启用）

## 健康数据字段（重点）

- `activity.stepsToday`
- `heart.latestHeartRateBpm`
- `heart.heartRateSeriesLast24h[]`
- `oxygen.bloodOxygenPercent`
- `oxygen.bloodOxygenSeriesLast24h[]`
- `metabolic.bloodGlucoseMgDl`
- `metabolic.bloodGlucoseSeriesLast7d[]`（mmol/L）
- `sleep.asleepMinutesLast36h`
- `sleep.apnea.eventCountLast30d`
- `workouts[]`

## 相关开源参考

- [react-native-health](https://github.com/agencyenterprise/react-native-health)
- [react-native-apple-healthkit](https://github.com/changey/react-native-apple-healthkit)
- [cordova-plugin-health](https://github.com/dariosalvi78/cordova-plugin-health)
- [capacitor-health](https://github.com/mley/capacitor-health)

本项目的差异点是：以 **Lynx 优先** 的桥接方案为主，当前在公开样例中较少见。

## 路线图

- [ ] 华为健康适配器
- [ ] 小米健康适配器
- [ ] Android Health Connect 适配器
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
