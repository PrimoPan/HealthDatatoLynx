import Foundation
import HealthKit
import Lynx

@objc(HealthKitManager)
public final class HealthKitManager: NSObject, LynxModule {
  private let healthStore = HKHealthStore()
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  public static let name = "HealthKitManager"

  public static var methodLookup: [String: String]? = [
    "isHealthDataAvailable": NSStringFromSelector(#selector(isHealthDataAvailable(_:callback:))),
    "requestAuthorization": NSStringFromSelector(#selector(requestAuthorization(_:callback:))),
    "getHealthSnapshot": NSStringFromSelector(#selector(getHealthSnapshot(_:callback:))),
    "executeHealthCommand": NSStringFromSelector(#selector(executeHealthCommand(_:callback:))),
    "executeHealthMethod": NSStringFromSelector(#selector(executeHealthMethod(_:callback:))),
  ]

  @objc
  public func isHealthDataAvailable(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    respondSuccess(callback, data: HKHealthStore.isHealthDataAvailable())
  }

  @objc
  public func requestAuthorization(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      respondSuccess(callback, data: false)
      return
    }

    let readTypes = buildDefaultReadTypes()
    if readTypes.isEmpty {
      respondSuccess(callback, data: false)
      return
    }

    healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      self.respondSuccess(callback, data: success)
    }
  }

  @objc
  public func executeHealthMethod(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    guard let params else {
      respondError(callback, message: "executeHealthMethod requires params")
      return
    }

    guard let method = params["method"] as? String, !method.isEmpty else {
      respondError(callback, message: "executeHealthMethod requires method")
      return
    }

    let options = params["options"] as? [String: Any] ?? [:]
    dispatchHealthMethod(method, options: options, callback: callback)
  }

  @objc
  public func executeHealthCommand(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    guard let params else {
      respondError(callback, message: "executeHealthCommand requires params")
      return
    }

    guard let command = params["command"] as? String, !command.isEmpty else {
      respondError(callback, message: "executeHealthCommand requires command")
      return
    }

    let payload = params["payload"] as? [String: Any] ?? [:]
    let options = payload["options"] as? [String: Any] ?? [:]

    switch command {
    case "availability.check":
      dispatchHealthMethod("isAvailable", options: [:], callback: callback)

    case "authorization.initialize":
      let permissions = (payload["permissions"] as? [String: Any]) ?? (options["permissions"] as? [String: Any]) ?? [:]
      dispatchHealthMethod("initHealthKit", options: ["permissions": permissions], callback: callback)

    case "authorization.status":
      let permissions = (payload["permissions"] as? [String: Any]) ?? (options["permissions"] as? [String: Any]) ?? [:]
      dispatchHealthMethod("getAuthStatus", options: ["permissions": permissions], callback: callback)

    case "profile.biologicalSex":
      dispatchHealthMethod("getBiologicalSex", options: [:], callback: callback)
    case "profile.bloodType":
      dispatchHealthMethod("getBloodType", options: [:], callback: callback)
    case "profile.dateOfBirth":
      dispatchHealthMethod("getDateOfBirth", options: [:], callback: callback)
    case "module.info":
      dispatchHealthMethod("getInfo", options: [:], callback: callback)

    case "metric.latest", "metric.samples", "metric.dailySum", "metric.cumulative", "metric.save", "metric.delete":
      guard let metric = payload["metric"] as? String, !metric.isEmpty else {
        respondError(callback, message: "\(command) requires metric")
        return
      }
      guard let method = metricMethodName(for: command, metric: metric) else {
        respondError(callback, message: "Metric \(metric) is unsupported for command \(command)")
        return
      }
      var normalizedOptions = options
      if command == "metric.delete", let id = payload["id"] as? String {
        normalizedOptions["id"] = id
      }
      dispatchHealthMethod(method, options: normalizedOptions, callback: callback)

    case "sleep.samples":
      dispatchHealthMethod("getSleepSamples", options: options, callback: callback)

    case "mindful.samples":
      dispatchHealthMethod("getMindfulSession", options: options, callback: callback)
    case "mindful.save":
      dispatchHealthMethod("saveMindfulSession", options: options, callback: callback)

    case "pressure.samples":
      dispatchHealthMethod("getBloodPressureSamples", options: options, callback: callback)

    case "summary.activity":
      dispatchHealthMethod("getActivitySummary", options: options, callback: callback)

    case "clinical.records":
      dispatchHealthMethod("getClinicalRecords", options: options, callback: callback)

    case "workout.list":
      var queryOptions = options
      queryOptions["type"] = "Workout"
      dispatchHealthMethod("getSamples", options: queryOptions, callback: callback)
    case "workout.anchored":
      dispatchHealthMethod("getAnchoredWorkouts", options: options, callback: callback)
    case "workout.save":
      dispatchHealthMethod("saveWorkout", options: options, callback: callback)

    case "nutrition.food.save":
      dispatchHealthMethod("saveFood", options: options, callback: callback)
    case "nutrition.water.save":
      dispatchHealthMethod("saveWater", options: options, callback: callback)
    case "nutrition.water.total":
      dispatchHealthMethod("getWater", options: options, callback: callback)
    case "nutrition.water.samples":
      dispatchHealthMethod("getWaterSamples", options: options, callback: callback)

    default:
      respondError(callback, message: "Unsupported health command: \(command)")
    }
  }

  private func metricMethodName(for command: String, metric: String) -> String? {
    switch command {
    case "metric.latest":
      switch metric {
      case "Weight": return "getLatestWeight"
      case "Height": return "getLatestHeight"
      case "WaistCircumference": return "getLatestWaistCircumference"
      case "PeakFlow": return "getLatestPeakFlow"
      case "BodyMassIndex": return "getLatestBmi"
      case "BodyFatPercentage": return "getLatestBodyFatPercentage"
      case "LeanBodyMass": return "getLatestLeanBodyMass"
      case "BloodAlcoholContent": return "getLatestBloodAlcoholContent"
      default: return nil
      }
    case "metric.samples":
      switch metric {
      case "Weight": return "getWeightSamples"
      case "Height": return "getHeightSamples"
      case "WaistCircumference": return "getWaistCircumferenceSamples"
      case "PeakFlow": return "getPeakFlowSamples"
      case "BodyMassIndex": return "getBmiSamples"
      case "BodyFatPercentage": return "getBodyFatPercentageSamples"
      case "LeanBodyMass": return "getLeanBodyMassSamples"
      case "BodyTemperature": return "getBodyTemperatureSamples"
      case "StepCount": return "getDailyStepCountSamples"
      case "DistanceWalkingRunning": return "getDailyDistanceWalkingRunningSamples"
      case "DistanceCycling": return "getDailyDistanceCyclingSamples"
      case "DistanceSwimming": return "getDailyDistanceSwimmingSamples"
      case "FlightsClimbed": return "getDailyFlightsClimbedSamples"
      case "ActiveEnergyBurned": return "getActiveEnergyBurned"
      case "BasalEnergyBurned": return "getBasalEnergyBurned"
      case "AppleExerciseTime": return "getAppleExerciseTime"
      case "AppleStandTime": return "getAppleStandTime"
      case "EnergyConsumed": return "getEnergyConsumedSamples"
      case "Protein": return "getProteinSamples"
      case "Fiber": return "getFiberSamples"
      case "FatTotal": return "getTotalFatSamples"
      case "Water": return "getWaterSamples"
      case "HeartRate": return "getHeartRateSamples"
      case "RestingHeartRate": return "getRestingHeartRateSamples"
      case "WalkingHeartRateAverage": return "getWalkingHeartRateAverage"
      case "HeartRateVariability": return "getHeartRateVariabilitySamples"
      case "Vo2Max": return "getVo2MaxSamples"
      case "RespiratoryRate": return "getRespiratoryRateSamples"
      case "OxygenSaturation": return "getOxygenSaturationSamples"
      case "BloodGlucose": return "getBloodGlucoseSamples"
      case "Carbohydrates": return "getCarbohydratesSamples"
      case "InsulinDelivery": return "getInsulinDeliverySamples"
      case "BloodAlcoholContent": return "getBloodAlcoholContentSamples"
      case "EnvironmentalAudioExposure": return "getEnvironmentalAudioExposure"
      case "HeadphoneAudioExposure": return "getHeadphoneAudioExposure"
      default: return nil
      }
    case "metric.dailySum":
      switch metric {
      case "StepCount": return "getStepCount"
      case "DistanceWalkingRunning": return "getDistanceWalkingRunning"
      case "DistanceCycling": return "getDistanceCycling"
      case "DistanceSwimming": return "getDistanceSwimming"
      case "FlightsClimbed": return "getFlightsClimbed"
      case "Water": return "getWater"
      default: return nil
      }
    case "metric.cumulative":
      switch metric {
      case "StepCount": return "getDailyStepCountSamples"
      case "DistanceWalkingRunning": return "getDailyDistanceWalkingRunningSamples"
      case "DistanceCycling": return "getDailyDistanceCyclingSamples"
      case "DistanceSwimming": return "getDailyDistanceSwimmingSamples"
      case "FlightsClimbed": return "getDailyFlightsClimbedSamples"
      case "ActiveEnergyBurned": return "getActiveEnergyBurned"
      case "BasalEnergyBurned": return "getBasalEnergyBurned"
      case "AppleExerciseTime": return "getAppleExerciseTime"
      case "AppleStandTime": return "getAppleStandTime"
      default: return nil
      }
    case "metric.save":
      switch metric {
      case "Weight": return "saveWeight"
      case "Height": return "saveHeight"
      case "WaistCircumference": return "saveWaistCircumference"
      case "PeakFlow": return "savePeakFlow"
      case "BodyMassIndex": return "saveBmi"
      case "BodyFatPercentage": return "saveBodyFatPercentage"
      case "LeanBodyMass": return "saveLeanBodyMass"
      case "BodyTemperature": return "saveBodyTemperature"
      case "StepCount": return "saveSteps"
      case "DistanceWalkingRunning": return "saveWalkingRunningDistance"
      case "HeartRate": return "saveHeartRateSample"
      case "Water": return "saveWater"
      case "BloodGlucose": return "saveBloodGlucoseSample"
      case "Carbohydrates": return "saveCarbohydratesSample"
      case "InsulinDelivery": return "saveInsulinDeliverySample"
      case "BloodAlcoholContent": return "saveBloodAlcoholContent"
      default: return nil
      }
    case "metric.delete":
      switch metric {
      case "BloodGlucose": return "deleteBloodGlucoseSample"
      case "Carbohydrates": return "deleteCarbohydratesSample"
      case "InsulinDelivery": return "deleteInsulinDeliverySample"
      default: return nil
      }
    default:
      return nil
    }
  }

  @objc
  public func getHealthSnapshot(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      respondSuccess(callback, data: [
        "authorized": false,
        "generatedAt": isoString(Date()),
        "note": "HealthKit unavailable",
      ])
      return
    }

    let group = DispatchGroup()
    var firstError: Error?

    var activity: [String: Any] = [:]
    var sleep: [String: Any] = [:]
    var heart: [String: Any] = [:]
    var oxygen: [String: Any] = [:]
    var metabolic: [String: Any] = [:]
    var workouts: [[String: Any]] = []

    func setError(_ error: Error?) {
      guard firstError == nil, let error else {
        return
      }
      firstError = error
    }

    func setValue(_ dict: inout [String: Any], _ key: String, _ value: Double?) {
      guard let value else {
        return
      }
      dict[key] = round(value)
    }

    group.enter()
    queryTodayCumulative(.stepCount, unit: .count()) { value, error in
      setError(error)
      setValue(&activity, "stepsToday", value)
      group.leave()
    }

    group.enter()
    queryTodayCumulative(.activeEnergyBurned, unit: .kilocalorie()) { value, error in
      setError(error)
      setValue(&activity, "activeEnergyKcalToday", value)
      group.leave()
    }

    group.enter()
    queryTodayCumulative(.appleExerciseTime, unit: .minute()) { value, error in
      setError(error)
      setValue(&activity, "exerciseMinutesToday", value)
      group.leave()
    }

    group.enter()
    queryLatest(.heartRate, unit: HKUnit.count().unitDivided(by: .minute())) { value, error in
      setError(error)
      setValue(&heart, "latestHeartRateBpm", value)
      group.leave()
    }

    group.enter()
    queryLatest(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute())) { value, error in
      setError(error)
      setValue(&heart, "restingHeartRateBpm", value)
      group.leave()
    }

    group.enter()
    queryLatest(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli)) { value, error in
      setError(error)
      setValue(&heart, "heartRateVariabilityMs", value)
      group.leave()
    }

    group.enter()
    queryLatest(.oxygenSaturation, unit: HKUnit.percent()) { value, error in
      setError(error)
      if let value {
        oxygen["bloodOxygenPercent"] = self.round(value <= 1 ? value * 100 : value)
      }
      group.leave()
    }

    group.enter()
    let glucoseUnit = HKUnit.gramUnit(with: .milli).unitDivided(by: HKUnit.literUnit(with: .deci))
    queryLatest(.bloodGlucose, unit: glucoseUnit) { value, error in
      setError(error)
      setValue(&metabolic, "bloodGlucoseMgDl", value)
      group.leave()
    }

    group.enter()
    queryLatestBloodPressure { result, _ in
      heart.merge(result, uniquingKeysWith: { _, new in new })
      group.leave()
    }

    group.enter()
    querySleepSummaryLast36Hours { result, error in
      setError(error)
      sleep.merge(result, uniquingKeysWith: { _, new in new })
      group.leave()
    }

    group.enter()
    querySleepApneaSummaryLast30Days { result, _ in
      sleep.merge(result, uniquingKeysWith: { _, new in new })
      group.leave()
    }

    group.enter()
    queryRecentWorkouts(days: 30, limit: 40) { records, error in
      setError(error)
      workouts = records
      group.leave()
    }

    group.notify(queue: .main) {
      if let firstError {
        self.respondError(callback, message: firstError.localizedDescription)
        return
      }

      var payload: [String: Any] = [
        "authorized": true,
        "generatedAt": self.isoString(Date()),
        "workouts": workouts,
      ]

      if !activity.isEmpty { payload["activity"] = activity }
      if !sleep.isEmpty { payload["sleep"] = sleep }
      if !heart.isEmpty { payload["heart"] = heart }
      if !oxygen.isEmpty { payload["oxygen"] = oxygen }
      if !metabolic.isEmpty { payload["metabolic"] = metabolic }

      self.respondSuccess(callback, data: payload)
    }
  }

  private func dispatchHealthMethod(
    _ method: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock
  ) {
    switch method {
    case "isAvailable":
      respondSuccess(callback, data: HKHealthStore.isHealthDataAvailable())

    case "initHealthKit":
      initializeHealthKit(options: options, callback: callback)

    case "getAuthStatus":
      getAuthorizationStatus(options: options, callback: callback)

    case "getBiologicalSex":
      getBiologicalSex(callback: callback)

    case "getBloodType":
      getBloodType(callback: callback)

    case "getDateOfBirth":
      getDateOfBirth(callback: callback)

    case "getInfo":
      respondSuccess(callback, data: [
        "name": "lynx-healthkit-bridge",
        "description": "Lynx HealthKit capability bridge",
        "className": "HealthKitManager",
        "author": "QiAlchemy",
      ])

    case "getLatestWeight":
      getLatestQuantitySample(permission: "Weight", options: options, callback: callback)
    case "getWeightSamples":
      getQuantitySamples(permission: "Weight", options: options, callback: callback)
    case "saveWeight":
      saveQuantitySample(permission: "Weight", options: options, callback: callback, returnUUID: false)

    case "getLatestHeight":
      getLatestQuantitySample(permission: "Height", options: options, callback: callback)
    case "getHeightSamples":
      getQuantitySamples(permission: "Height", options: options, callback: callback)
    case "saveHeight":
      saveQuantitySample(permission: "Height", options: options, callback: callback, returnUUID: false)

    case "getLatestWaistCircumference":
      getLatestQuantitySample(permission: "WaistCircumference", options: options, callback: callback)
    case "getWaistCircumferenceSamples":
      getQuantitySamples(permission: "WaistCircumference", options: options, callback: callback)
    case "saveWaistCircumference":
      saveQuantitySample(permission: "WaistCircumference", options: options, callback: callback, returnUUID: false)

    case "getLatestPeakFlow":
      getLatestQuantitySample(permission: "PeakFlow", options: options, callback: callback)
    case "getPeakFlowSamples":
      getQuantitySamples(permission: "PeakFlow", options: options, callback: callback)
    case "savePeakFlow":
      saveQuantitySample(permission: "PeakFlow", options: options, callback: callback, returnUUID: false)

    case "getLatestBmi":
      getLatestQuantitySample(permission: "BodyMassIndex", options: options, callback: callback)
    case "getBmiSamples":
      getQuantitySamples(permission: "BodyMassIndex", options: options, callback: callback)
    case "saveBmi":
      saveQuantitySample(permission: "BodyMassIndex", options: options, callback: callback, returnUUID: false)

    case "getLatestBodyFatPercentage":
      getLatestQuantitySample(permission: "BodyFatPercentage", options: options, callback: callback)
    case "getBodyFatPercentageSamples":
      getQuantitySamples(permission: "BodyFatPercentage", options: options, callback: callback)
    case "saveBodyFatPercentage":
      saveQuantitySample(permission: "BodyFatPercentage", options: options, callback: callback, returnUUID: false)

    case "getLatestLeanBodyMass":
      getLatestQuantitySample(permission: "LeanBodyMass", options: options, callback: callback)
    case "getLeanBodyMassSamples":
      getQuantitySamples(permission: "LeanBodyMass", options: options, callback: callback)
    case "saveLeanBodyMass":
      saveQuantitySample(permission: "LeanBodyMass", options: options, callback: callback, returnUUID: false)

    case "saveBodyTemperature":
      saveQuantitySample(permission: "BodyTemperature", options: options, callback: callback, returnUUID: false)

    case "getStepCount":
      getDailySum(permission: "StepCount", options: options, callback: callback)
    case "saveSteps":
      saveQuantitySample(permission: "StepCount", options: options, callback: callback, returnUUID: false)
    case "getDailyStepCountSamples":
      getCumulativeSamples(permission: "StepCount", options: options, callback: callback)

    case "saveWalkingRunningDistance":
      saveQuantitySample(permission: "DistanceWalkingRunning", options: options, callback: callback, returnUUID: false)
    case "getDistanceWalkingRunning":
      getDailySum(permission: "DistanceWalkingRunning", options: options, callback: callback)
    case "getDailyDistanceWalkingRunningSamples":
      getCumulativeSamples(permission: "DistanceWalkingRunning", options: options, callback: callback)

    case "getDistanceCycling":
      getDailySum(permission: "DistanceCycling", options: options, callback: callback)
    case "getDailyDistanceCyclingSamples":
      getCumulativeSamples(permission: "DistanceCycling", options: options, callback: callback)

    case "getDistanceSwimming":
      getDailySum(permission: "DistanceSwimming", options: options, callback: callback)
    case "getDailyDistanceSwimmingSamples":
      getCumulativeSamples(permission: "DistanceSwimming", options: options, callback: callback)

    case "getFlightsClimbed":
      getDailySum(permission: "FlightsClimbed", options: options, callback: callback)
    case "getDailyFlightsClimbedSamples":
      getCumulativeSamples(permission: "FlightsClimbed", options: options, callback: callback)

    case "getActiveEnergyBurned":
      getCumulativeSamples(permission: "ActiveEnergyBurned", options: options, callback: callback)
    case "getBasalEnergyBurned":
      getCumulativeSamples(permission: "BasalEnergyBurned", options: options, callback: callback)
    case "getAppleExerciseTime":
      getCumulativeSamples(permission: "AppleExerciseTime", options: options, callback: callback)
    case "getAppleStandTime":
      getCumulativeSamples(permission: "AppleStandTime", options: options, callback: callback)

    case "getEnergyConsumedSamples":
      getQuantitySamples(permission: "EnergyConsumed", options: options, callback: callback)
    case "getProteinSamples":
      getQuantitySamples(permission: "Protein", options: options, callback: callback)
    case "getFiberSamples":
      getQuantitySamples(permission: "Fiber", options: options, callback: callback)
    case "getTotalFatSamples":
      getQuantitySamples(permission: "FatTotal", options: options, callback: callback)

    case "saveWater":
      saveWater(options: options, callback: callback)
    case "getWater":
      getDailySum(permission: "Water", options: options, callback: callback)
    case "getWaterSamples":
      getQuantitySamples(permission: "Water", options: options, callback: callback)

    case "saveHeartRateSample":
      saveHeartRateSample(options: options, callback: callback)
    case "getHeartRateSamples":
      getQuantitySamples(permission: "HeartRate", options: options, callback: callback)
    case "getRestingHeartRate":
      getQuantitySamples(permission: "RestingHeartRate", options: options, callback: callback)
    case "getWalkingHeartRateAverage":
      getQuantitySamples(permission: "WalkingHeartRateAverage", options: options, callback: callback)
    case "getHeartRateVariabilitySamples":
      getQuantitySamples(permission: "HeartRateVariability", options: options, callback: callback)
    case "getRestingHeartRateSamples":
      getQuantitySamples(permission: "RestingHeartRate", options: options, callback: callback)

    case "getVo2MaxSamples":
      getQuantitySamples(permission: "Vo2Max", options: options, callback: callback)
    case "getBodyTemperatureSamples":
      getQuantitySamples(permission: "BodyTemperature", options: options, callback: callback)
    case "getRespiratoryRateSamples":
      getQuantitySamples(permission: "RespiratoryRate", options: options, callback: callback)

    case "getBloodPressureSamples":
      getBloodPressureSamples(options: options, callback: callback)

    case "getOxygenSaturationSamples":
      getQuantitySamples(permission: "OxygenSaturation", options: options, callback: callback)

    case "getBloodGlucoseSamples":
      getQuantitySamples(permission: "BloodGlucose", options: options, callback: callback)
    case "saveBloodGlucoseSample":
      saveQuantitySample(permission: "BloodGlucose", options: options, callback: callback, returnUUID: true)
    case "deleteBloodGlucoseSample":
      deleteQuantitySample(permission: "BloodGlucose", options: options, callback: callback)

    case "getCarbohydratesSamples":
      getQuantitySamples(permission: "Carbohydrates", options: options, callback: callback)
    case "saveCarbohydratesSample":
      saveQuantitySample(permission: "Carbohydrates", options: options, callback: callback, returnUUID: true)
    case "deleteCarbohydratesSample":
      deleteQuantitySample(permission: "Carbohydrates", options: options, callback: callback)

    case "getInsulinDeliverySamples":
      getQuantitySamples(permission: "InsulinDelivery", options: options, callback: callback)
    case "saveInsulinDeliverySample":
      saveQuantitySample(permission: "InsulinDelivery", options: options, callback: callback, returnUUID: true)
    case "deleteInsulinDeliverySample":
      deleteQuantitySample(permission: "InsulinDelivery", options: options, callback: callback)

    case "getLatestBloodAlcoholContent":
      getLatestQuantitySample(permission: "BloodAlcoholContent", options: options, callback: callback)
    case "getBloodAlcoholContentSamples":
      getQuantitySamples(permission: "BloodAlcoholContent", options: options, callback: callback)
    case "saveBloodAlcoholContent":
      saveQuantitySample(permission: "BloodAlcoholContent", options: options, callback: callback, returnUUID: false)

    case "getSleepSamples":
      getSleepSamples(options: options, callback: callback)

    case "getMindfulSession":
      getMindfulSessions(options: options, callback: callback)
    case "saveMindfulSession":
      saveMindfulSession(options: options, callback: callback)

    case "getSamples":
      getGenericSamples(options: options, callback: callback)

    case "saveWorkout":
      saveWorkout(options: options, callback: callback)

    case "getAnchoredWorkouts":
      getAnchoredWorkouts(options: options, callback: callback)

    case "getWorkoutRouteSamples":
      respondError(callback, message: "getWorkoutRouteSamples is not supported in this Lynx bridge yet")

    case "getActivitySummary":
      getActivitySummary(options: options, callback: callback)

    case "getClinicalRecords":
      getClinicalRecords(options: options, callback: callback)

    case "getEnvironmentalAudioExposure":
      getQuantitySamples(permission: "EnvironmentalAudioExposure", options: options, callback: callback)
    case "getHeadphoneAudioExposure":
      getQuantitySamples(permission: "HeadphoneAudioExposure", options: options, callback: callback)

    case "saveFood":
      saveFood(options: options, callback: callback)

    case "setObserver", "initStepCountObserver":
      respondError(callback, message: "Observers are not supported in this Lynx bridge")

    case "getElectrocardiogramSamples":
      respondError(callback, message: "getElectrocardiogramSamples is not supported in this Lynx bridge yet")

    case "getHeartbeatSeriesSamples":
      respondError(callback, message: "getHeartbeatSeriesSamples is not supported in this Lynx bridge yet")

    default:
      respondError(callback, message: "Unsupported health method: \(method)")
    }
  }

  private func initializeHealthKit(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard HKHealthStore.isHealthDataAvailable() else {
      respondError(callback, message: "HealthKit data is not available")
      return
    }

    guard let permissions = options["permissions"] as? [String: Any] else {
      respondError(callback, message: "permissions must be provided in options")
      return
    }

    let read = (permissions["read"] as? [String]) ?? []
    let write = (permissions["write"] as? [String]) ?? []

    let readTypes = Set(read.compactMap { objectTypeForPermission($0, write: false) })
    let writeTypes = Set(write.compactMap { objectTypeForPermission($0, write: true) as? HKSampleType })

    if readTypes.isEmpty && writeTypes.isEmpty {
      respondError(callback, message: "at least one readable or writable permission is required")
      return
    }

    let writeSet: Set<HKSampleType>? = writeTypes.isEmpty ? nil : writeTypes
    let readSet: Set<HKObjectType>? = readTypes.isEmpty ? nil : readTypes

    healthStore.requestAuthorization(toShare: writeSet, read: readSet) { success, error in
      if let error {
        self.respondError(callback, message: "Error with HealthKit authorization: \(error.localizedDescription)")
        return
      }
      self.respondSuccess(callback, data: success)
    }
  }

  private func getAuthorizationStatus(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard HKHealthStore.isHealthDataAvailable() else {
      respondError(callback, message: "HealthKit data is not available")
      return
    }

    guard let permissions = options["permissions"] as? [String: Any] else {
      respondError(callback, message: "permissions must include read and write arrays")
      return
    }

    let readKeys = (permissions["read"] as? [String]) ?? []
    let writeKeys = (permissions["write"] as? [String]) ?? []

    let readStatuses: [Int] = readKeys.compactMap { key in
      guard let type = objectTypeForPermission(key, write: false) else { return nil }
      return healthStore.authorizationStatus(for: type).rawValue
    }

    let writeStatuses: [Int] = writeKeys.compactMap { key in
      guard let type = objectTypeForPermission(key, write: true) else { return nil }
      return healthStore.authorizationStatus(for: type).rawValue
    }

    respondSuccess(callback, data: [
      "permissions": [
        "read": readStatuses,
        "write": writeStatuses,
      ],
    ])
  }

  private func getBiologicalSex(callback: @escaping LynxCallbackBlock) {
    do {
      let biologicalSex = try healthStore.biologicalSex().biologicalSex
      let value: String
      switch biologicalSex {
      case .female:
        value = "female"
      case .male:
        value = "male"
      case .other:
        value = "other"
      default:
        value = "unknown"
      }
      respondSuccess(callback, data: ["value": value])
    } catch {
      respondError(callback, message: error.localizedDescription)
    }
  }

  private func getBloodType(callback: @escaping LynxCallbackBlock) {
    do {
      let bloodType = try healthStore.bloodType().bloodType
      let value: String
      switch bloodType {
      case .aPositive:
        value = "A+"
      case .aNegative:
        value = "A-"
      case .bPositive:
        value = "B+"
      case .bNegative:
        value = "B-"
      case .abPositive:
        value = "AB+"
      case .abNegative:
        value = "AB-"
      case .oPositive:
        value = "O+"
      case .oNegative:
        value = "O-"
      default:
        value = "unknown"
      }
      respondSuccess(callback, data: ["value": value])
    } catch {
      respondError(callback, message: error.localizedDescription)
    }
  }

  private func getDateOfBirth(callback: @escaping LynxCallbackBlock) {
    do {
      let dob = try healthStore.dateOfBirthComponents()
      guard let date = Calendar.current.date(from: dob) else {
        respondSuccess(callback, data: ["value": NSNull(), "age": NSNull()])
        return
      }
      let age = Calendar.current.dateComponents([.year], from: date, to: Date()).year ?? 0
      respondSuccess(callback, data: [
        "value": isoString(date),
        "age": age,
      ])
    } catch {
      respondError(callback, message: error.localizedDescription)
    }
  }

  private func getLatestQuantitySample(
    permission: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock
  ) {
    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported quantity permission \(permission)")
      return
    }

    let unit = unitFromOptions(options, permission: permission)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

    let query = HKSampleQuery(sampleType: quantityType, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      guard let sample = (samples?.first as? HKQuantitySample) else {
        self.respondError(callback, message: "No samples found for \(permission)")
        return
      }

      self.respondSuccess(callback, data: [
        "value": self.round(sample.quantity.doubleValue(for: unit)),
        "startDate": self.isoString(sample.startDate),
        "endDate": self.isoString(sample.endDate),
      ])
    }

    healthStore.execute(query)
  }

  private func getQuantitySamples(
    permission: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock
  ) {
    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported quantity permission \(permission)")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let ascending = boolValue(options["ascending"], defaultValue: false)
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let includeManuallyAdded = boolValue(options["includeManuallyAdded"], defaultValue: true)

    let unit = unitFromOptions(options, permission: permission)
    let predicate = compoundPredicate(startDate: startDate, endDate: endDate, includeManuallyAdded: includeManuallyAdded)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: ascending)

    let query = HKSampleQuery(sampleType: quantityType, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let payload: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map { sample in
        var item: [String: Any] = [
          "value": self.round(sample.quantity.doubleValue(for: unit)),
          "id": sample.uuid.uuidString,
          "sourceName": sample.sourceRevision.source.name,
          "sourceId": sample.sourceRevision.source.bundleIdentifier,
          "startDate": self.isoString(sample.startDate),
          "endDate": self.isoString(sample.endDate),
        ]

        if let metadata = sample.metadata {
          item["metadata"] = metadata
        }

        return item
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func getDailySum(
    permission: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock
  ) {
    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported quantity permission \(permission)")
      return
    }

    let targetDate = parseDate(options["date"]) ?? Date()
    let includeManuallyAdded = boolValue(options["includeManuallyAdded"], defaultValue: true)
    let dayRange = dayRangeForDate(targetDate)
    let unit = unitFromOptions(options, permission: permission)

    let predicate = compoundPredicate(startDate: dayRange.start, endDate: dayRange.end, includeManuallyAdded: includeManuallyAdded)

    let query = HKStatisticsQuery(quantityType: quantityType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let value = result?.sumQuantity()?.doubleValue(for: unit) ?? 0
      self.respondSuccess(callback, data: [
        "value": self.round(value),
        "startDate": self.isoString(dayRange.start),
        "endDate": self.isoString(dayRange.end),
      ])
    }

    healthStore.execute(query)
  }

  private func getCumulativeSamples(
    permission: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock
  ) {
    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported quantity permission \(permission)")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let ascending = boolValue(options["ascending"], defaultValue: false)
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let includeManuallyAdded = boolValue(options["includeManuallyAdded"], defaultValue: true)
    let periodMinutes = max(1, intValue(options["period"], defaultValue: 60))

    let unit = unitFromOptions(options, permission: permission)

    var interval = DateComponents()
    interval.minute = periodMinutes

    let anchorDate = startDate
    let predicate = compoundPredicate(startDate: startDate, endDate: endDate, includeManuallyAdded: includeManuallyAdded)

    let query = HKStatisticsCollectionQuery(
      quantityType: quantityType,
      quantitySamplePredicate: predicate,
      options: .cumulativeSum,
      anchorDate: anchorDate,
      intervalComponents: interval
    )

    query.initialResultsHandler = { _, results, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      guard let results else {
        self.respondSuccess(callback, data: [[String: Any]]())
        return
      }

      var data: [[String: Any]] = []
      results.enumerateStatistics(from: startDate, to: endDate) { statistic, _ in
        guard let quantity = statistic.sumQuantity() else {
          return
        }
        data.append([
          "value": self.round(quantity.doubleValue(for: unit)),
          "startDate": self.isoString(statistic.startDate),
          "endDate": self.isoString(statistic.endDate),
        ])
      }

      if !ascending {
        data.reverse()
      }

      if limit != HKObjectQueryNoLimit, limit > 0, data.count > limit {
        data = Array(data.prefix(limit))
      }

      self.respondSuccess(callback, data: data)
    }

    healthStore.execute(query)
  }

  private func saveQuantitySample(
    permission: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock,
    returnUUID: Bool
  ) {
    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported quantity permission \(permission)")
      return
    }

    guard let value = doubleValue(options["value"]) else {
      respondError(callback, message: "value is required in options")
      return
    }

    let sampleDate = parseDate(options["date"]) ?? Date()
    let startDate = parseDate(options["startDate"]) ?? sampleDate
    let endDate = parseDate(options["endDate"]) ?? startDate
    let metadata = options["metadata"] as? [String: Any]
    let unit = unitFromOptions(options, permission: permission)

    let quantity = HKQuantity(unit: unit, doubleValue: value)
    let sample = HKQuantitySample(type: quantityType, quantity: quantity, start: startDate, end: endDate, metadata: metadata)

    healthStore.save(sample) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      if !success {
        self.respondError(callback, message: "Failed to save sample")
        return
      }

      if returnUUID {
        self.respondSuccess(callback, data: sample.uuid.uuidString)
      } else {
        self.respondSuccess(callback, data: self.round(value))
      }
    }
  }

  private func saveHeartRateSample(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let heartRateValue = doubleValue(options["value"]) else {
      respondError(callback, message: "value is required in options")
      return
    }

    let sampleDate = parseDate(options["date"]) ?? Date()
    let unit = unitFromOptions(options, permission: "HeartRate")

    guard let quantityType = quantityTypeForPermission("HeartRate") else {
      respondError(callback, message: "HeartRate quantity type unavailable")
      return
    }

    let quantity = HKQuantity(unit: unit, doubleValue: heartRateValue)
    let sample = HKQuantitySample(type: quantityType, quantity: quantity, start: sampleDate, end: sampleDate)

    healthStore.save(sample) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      self.respondSuccess(callback, data: success)
    }
  }

  private func deleteQuantitySample(
    permission: String,
    options: [String: Any],
    callback: @escaping LynxCallbackBlock
  ) {
    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported quantity permission \(permission)")
      return
    }

    let id = (options["id"] as? String) ?? (options["uuid"] as? String)
    guard let id, let uuid = UUID(uuidString: id) else {
      respondError(callback, message: "A valid id is required")
      return
    }

    let predicate = HKQuery.predicateForObject(with: uuid)
    healthStore.deleteObjects(of: quantityType, predicate: predicate) { success, deleted, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      if !success {
        self.respondError(callback, message: "Failed to delete sample")
        return
      }
      self.respondSuccess(callback, data: deleted)
    }
  }

  private func getSleepSamples(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      respondError(callback, message: "SleepAnalysis is unavailable")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let ascending = boolValue(options["ascending"], defaultValue: false)
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: ascending)

    let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let payload: [[String: Any]] = (samples as? [HKCategorySample] ?? []).map { sample in
        [
          "id": sample.uuid.uuidString,
          "value": self.sleepValueName(sample.value),
          "startDate": self.isoString(sample.startDate),
          "endDate": self.isoString(sample.endDate),
          "sourceName": sample.sourceRevision.source.name,
          "sourceId": sample.sourceRevision.source.bundleIdentifier,
        ]
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func getMindfulSessions(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
      respondError(callback, message: "MindfulSession is unavailable on this iOS version")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)

    let query = HKSampleQuery(sampleType: mindfulType, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let payload: [[String: Any]] = (samples as? [HKCategorySample] ?? []).map { sample in
        [
          "startDate": self.isoString(sample.startDate),
          "endDate": self.isoString(sample.endDate),
        ]
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func saveMindfulSession(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let mindfulType = HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
      respondError(callback, message: "MindfulSession is unavailable on this iOS version")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let value = intValue(options["value"], defaultValue: 0)
    let sample = HKCategorySample(type: mindfulType, value: value, start: startDate, end: endDate)

    healthStore.save(sample) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      self.respondSuccess(callback, data: success)
    }
  }

  private func getBloodPressureSamples(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let correlationType = HKCorrelationType.correlationType(forIdentifier: .bloodPressure),
          let systolicType = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic),
          let diastolicType = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic)
    else {
      respondError(callback, message: "Blood pressure types are unavailable")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let ascending = boolValue(options["ascending"], defaultValue: false)
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let unit = unitFromOptions(options, permission: "BloodPressureSystolic")
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: ascending)

    let query = HKSampleQuery(sampleType: correlationType, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      var payload: [[String: Any]] = []
      for correlation in (samples as? [HKCorrelation] ?? []) {
        let systolic = correlation.objects(for: systolicType).first as? HKQuantitySample
        let diastolic = correlation.objects(for: diastolicType).first as? HKQuantitySample

        guard let systolic, let diastolic else {
          continue
        }

        payload.append([
          "bloodPressureSystolicValue": self.round(systolic.quantity.doubleValue(for: unit)),
          "bloodPressureDiastolicValue": self.round(diastolic.quantity.doubleValue(for: unit)),
          "startDate": self.isoString(correlation.startDate),
          "endDate": self.isoString(correlation.endDate),
        ])
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func getGenericSamples(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    let typeName = (options["type"] as? String) ?? "Walking"
    let startDate = parseDate(options["startDate"]) ?? Date().addingTimeInterval(-24 * 60 * 60)
    let endDate = parseDate(options["endDate"]) ?? Date()
    let ascending = boolValue(options["ascending"], defaultValue: false)
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: ascending)

    if typeName == "Workout" {
      let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
      let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
        if let error {
          self.respondError(callback, message: error.localizedDescription)
          return
        }

        let payload = (samples as? [HKWorkout] ?? []).map { self.serializeWorkout($0) }
        self.respondSuccess(callback, data: payload)
      }
      healthStore.execute(query)
      return
    }

    let permission: String
    switch typeName {
    case "Running":
      permission = "DistanceWalkingRunning"
    case "Cycling":
      permission = "DistanceCycling"
    case "StairClimbing":
      permission = "FlightsClimbed"
    case "Walking":
      permission = "StepCount"
    default:
      permission = "StepCount"
    }

    guard let quantityType = quantityTypeForPermission(permission) else {
      respondError(callback, message: "Unsupported sample type \(typeName)")
      return
    }

    let unit = unitFromOptions(options, permission: permission)
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)

    let query = HKSampleQuery(sampleType: quantityType, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let payload: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map { sample in
        let value = self.round(sample.quantity.doubleValue(for: unit))
        var item: [String: Any] = [
          "tracked": !self.wasUserEntered(sample.metadata),
          "sourceName": sample.sourceRevision.source.name,
          "sourceId": sample.sourceRevision.source.bundleIdentifier,
          "device": sample.sourceRevision.productType ?? "iPhone",
          "start": self.isoString(sample.startDate),
          "end": self.isoString(sample.endDate),
        ]

        if permission == "DistanceWalkingRunning" || permission == "DistanceCycling" || permission == "DistanceSwimming" {
          item["distance"] = value
        } else {
          item["value"] = value
        }

        return item
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func getAnchoredWorkouts(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let startDate = parseDate(options["startDate"])
    let endDate = parseDate(options["endDate"]) ?? Date()
    let anchor = anchorFromBase64(options["anchor"] as? String)

    let predicate: NSPredicate?
    if let startDate {
      predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    } else {
      predicate = nil
    }

    let query = HKAnchoredObjectQuery(type: .workoutType(), predicate: predicate, anchor: anchor, limit: limit) { _, samples, _, newAnchor, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let workouts = (samples as? [HKWorkout] ?? []).map { self.serializeWorkout($0) }
      self.respondSuccess(callback, data: [
        "anchor": self.anchorToBase64(newAnchor),
        "data": workouts,
      ])
    }

    healthStore.execute(query)
  }

  private func saveWorkout(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let startDate = parseDate(options["startDate"]), let endDate = parseDate(options["endDate"]) else {
      respondError(callback, message: "startDate and endDate are required")
      return
    }

    let activityName = (options["type"] as? String) ?? "Walking"
    let activityType = workoutActivityType(name: activityName)

    let energyBurned: HKQuantity? = {
      guard let value = doubleValue(options["energyBurned"] ?? options["totalEnergyBurned"]) else {
        return nil
      }
      let unitName = (options["energyBurnedUnit"] as? String) ?? "kilocalorie"
      let unit = hkUnit(from: unitName, permission: "ActiveEnergyBurned") ?? HKUnit.kilocalorie()
      return HKQuantity(unit: unit, doubleValue: value)
    }()

    let distance: HKQuantity? = {
      guard let value = doubleValue(options["distance"] ?? options["totalDistance"]) else {
        return nil
      }
      let unitName = (options["distanceUnit"] as? String) ?? "meter"
      let unit = hkUnit(from: unitName, permission: "DistanceWalkingRunning") ?? HKUnit.meter()
      return HKQuantity(unit: unit, doubleValue: value)
    }()

    let workout = HKWorkout(
      activityType: activityType,
      start: startDate,
      end: endDate,
      workoutEvents: nil,
      totalEnergyBurned: energyBurned,
      totalDistance: distance,
      metadata: nil
    )

    healthStore.save(workout) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      if !success {
        self.respondError(callback, message: "Failed to save workout")
        return
      }
      self.respondSuccess(callback, data: workout.uuid.uuidString)
    }
  }

  private func getActivitySummary(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let calendar = Calendar.current
    var startComponents = calendar.dateComponents([.year, .month, .day, .era], from: startDate)
    startComponents.calendar = calendar
    var endComponents = calendar.dateComponents([.year, .month, .day, .era], from: endDate)
    endComponents.calendar = calendar

    let predicateBuilder = HKQuery.predicate(forActivitySummariesBetweenStart:end:)
    let predicate = predicateBuilder(startComponents, endComponents)
    let query = HKActivitySummaryQuery(predicate: predicate) { _, summaries, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      let payload: [[String: Any]] = (summaries ?? []).map { summary in
        [
          "activeEnergyBurned": Int(summary.activeEnergyBurned.doubleValue(for: .kilocalorie())),
          "activeEnergyBurnedGoal": Int(summary.activeEnergyBurnedGoal.doubleValue(for: .kilocalorie())),
          "appleExerciseTime": Int(summary.appleExerciseTime.doubleValue(for: .minute())),
          "appleExerciseTimeGoal": Int(summary.appleExerciseTimeGoal.doubleValue(for: .minute())),
          "appleStandHours": Int(summary.appleStandHours.doubleValue(for: .count())),
          "appleStandHoursGoal": Int(summary.appleStandHoursGoal.doubleValue(for: .count())),
        ]
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func getClinicalRecords(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard #available(iOS 12.0, *) else {
      respondError(callback, message: "Clinical records require iOS 12+")
      return
    }

    guard let typeName = options["type"] as? String,
          let clinicalType = clinicalTypeFromName(typeName)
    else {
      respondError(callback, message: "type is required and must be a valid clinical type")
      return
    }

    guard let startDate = parseDate(options["startDate"]) else {
      respondError(callback, message: "startDate is required in options")
      return
    }

    let endDate = parseDate(options["endDate"]) ?? Date()
    let ascending = boolValue(options["ascending"], defaultValue: false)
    let limit = intValue(options["limit"], defaultValue: HKObjectQueryNoLimit)
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: ascending)

    let query = HKSampleQuery(sampleType: clinicalType, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }

      var payload: [[String: Any]] = []
      for record in (samples as? [HKClinicalRecord] ?? []) {
        var item: [String: Any] = [
          "id": record.uuid.uuidString,
          "sourceName": record.sourceRevision.source.name,
          "sourceId": record.sourceRevision.source.bundleIdentifier,
          "startDate": self.isoString(record.startDate),
          "endDate": self.isoString(record.endDate),
          "displayName": record.displayName,
        ]

        let fhirResource = record.fhirResource
        let fhirData = (try? JSONSerialization.jsonObject(with: fhirResource?.data ?? Data(), options: [])) ?? NSNull()
        item["fhirData"] = fhirData

        if #available(iOS 14.0, *), let fhirVersion = fhirResource?.fhirVersion {
          item["fhirRelease"] = fhirVersion.fhirRelease
          item["fhirVersion"] = fhirVersion.stringRepresentation
        }

        payload.append(item)
      }

      self.respondSuccess(callback, data: payload)
    }

    healthStore.execute(query)
  }

  private func saveWater(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    let date = parseDate(options["date"] ?? options["startDate"]) ?? Date()
    guard let value = doubleValue(options["value"]) else {
      respondError(callback, message: "value is required in options")
      return
    }

    guard let type = quantityTypeForPermission("Water") else {
      respondError(callback, message: "Water type unavailable")
      return
    }

    let sample = HKQuantitySample(
      type: type,
      quantity: HKQuantity(unit: HKUnit.liter(), doubleValue: value),
      start: date,
      end: date,
      metadata: nil
    )

    healthStore.save(sample) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      self.respondSuccess(callback, data: success)
    }
  }

  private func saveFood(options: [String: Any], callback: @escaping LynxCallbackBlock) {
    guard let foodType = HKCorrelationType.correlationType(forIdentifier: .food) else {
      respondError(callback, message: "Food correlation type unavailable")
      return
    }

    let consumedAt = parseDate(options["date"]) ?? Date()
    var samples = Set<HKSample>()

    let nutrientMap: [(String, String)] = [
      ("energy", "EnergyConsumed"),
      ("carbohydrates", "Carbohydrates"),
      ("protein", "Protein"),
      ("fiber", "Fiber"),
      ("fatTotal", "FatTotal"),
      ("sugar", "Sugar"),
      ("water", "Water"),
    ]

    for (optionKey, permission) in nutrientMap {
      guard let value = doubleValue(options[optionKey]), value > 0,
            let type = quantityTypeForPermission(permission)
      else {
        continue
      }

      let quantity = HKQuantity(unit: defaultUnitForPermission(permission), doubleValue: value)
      let sample = HKQuantitySample(type: type, quantity: quantity, start: consumedAt, end: consumedAt)
      samples.insert(sample)
    }

    if samples.isEmpty {
      respondError(callback, message: "saveFood requires at least one nutrient value > 0")
      return
    }

    var metadata: [String: Any] = [:]
    if let foodName = options["foodName"] as? String {
      metadata[HKMetadataKeyFoodType] = foodName
    }
    if let mealType = options["mealType"] as? String {
      metadata["HKFoodMeal"] = mealType
    }

    let correlation = HKCorrelation(type: foodType, start: consumedAt, end: consumedAt, objects: samples, metadata: metadata)

    healthStore.save(correlation) { success, error in
      if let error {
        self.respondError(callback, message: error.localizedDescription)
        return
      }
      self.respondSuccess(callback, data: success)
    }
  }

  private func serializeWorkout(_ workout: HKWorkout) -> [String: Any] {
    [
      "activityId": workout.workoutActivityType.rawValue,
      "id": workout.uuid.uuidString,
      "activityName": workoutActivityName(type: workout.workoutActivityType),
      "calories": round(workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0),
      "tracked": !wasUserEntered(workout.metadata),
      "metadata": workout.metadata ?? NSNull(),
      "sourceName": workout.sourceRevision.source.name,
      "sourceId": workout.sourceRevision.source.bundleIdentifier,
      "device": workout.sourceRevision.productType ?? "iPhone",
      "distance": round(workout.totalDistance?.doubleValue(for: .mile()) ?? 0),
      "start": isoString(workout.startDate),
      "end": isoString(workout.endDate),
      "duration": round(workout.duration),
      "workoutEvents": serializeWorkoutEvents(workout.workoutEvents),
    ]
  }

  private func serializeWorkoutEvents(_ events: [HKWorkoutEvent]?) -> [[String: Any]] {
    guard let events else {
      return []
    }

    return events.map { event in
      [
        "eventTypeInt": event.type.rawValue,
        "eventType": workoutEventName(event.type),
        "startDate": isoString(event.dateInterval.start),
        "endDate": isoString(event.dateInterval.end),
      ]
    }
  }

  private func workoutEventName(_ type: HKWorkoutEventType) -> String {
    switch type {
    case .pause:
      return "pause"
    case .resume:
      return "resume"
    case .motionPaused:
      return "motion paused"
    case .motionResumed:
      return "motion resumed"
    case .pauseOrResumeRequest:
      return "pause or resume request"
    case .lap:
      return "lap"
    case .segment:
      return "segment"
    case .marker:
      return "marker"
    default:
      return ""
    }
  }

  private func workoutActivityType(name: String) -> HKWorkoutActivityType {
    switch name {
    case "Running":
      return .running
    case "Cycling":
      return .cycling
    case "Swimming":
      return .swimming
    case "Walking":
      return .walking
    case "Hiking":
      return .hiking
    case "Yoga", "MindAndBody":
      return .yoga
    case "TraditionalStrengthTraining", "FunctionalStrengthTraining":
      return .traditionalStrengthTraining
    default:
      return .other
    }
  }

  private func workoutActivityName(type: HKWorkoutActivityType) -> String {
    switch type {
    case .running:
      return "Running"
    case .cycling:
      return "Cycling"
    case .swimming:
      return "Swimming"
    case .walking:
      return "Walking"
    case .hiking:
      return "Hiking"
    case .yoga:
      return "Yoga"
    case .traditionalStrengthTraining:
      return "TraditionalStrengthTraining"
    default:
      return "Other"
    }
  }

  private func sleepValueName(_ value: Int) -> String {
    if #available(iOS 16.0, *) {
      switch value {
      case HKCategoryValueSleepAnalysis.inBed.rawValue:
        return "INBED"
      case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
        return "ASLEEP"
      case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
        return "CORE"
      case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
        return "DEEP"
      case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
        return "REM"
      case HKCategoryValueSleepAnalysis.awake.rawValue:
        return "AWAKE"
      default:
        return "UNKNOWN"
      }
    }

    switch value {
    case HKCategoryValueSleepAnalysis.inBed.rawValue:
      return "INBED"
    case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
      return "ASLEEP"
    default:
      return "UNKNOWN"
    }
  }

  private func wasUserEntered(_ metadata: [String: Any]?) -> Bool {
    if let entered = metadata?[HKMetadataKeyWasUserEntered] as? Bool {
      return entered
    }
    if let number = metadata?[HKMetadataKeyWasUserEntered] as? NSNumber {
      return number.boolValue
    }
    return false
  }

  private func objectTypeForPermission(_ permission: String, write: Bool) -> HKObjectType? {
    if let quantityType = quantityTypeForPermission(permission) {
      return quantityType
    }

    if permission == "SleepAnalysis" {
      return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    }

    if permission == "MindfulSession" {
      return HKObjectType.categoryType(forIdentifier: .mindfulSession)
    }

    if permission == "Workout" {
      return HKObjectType.workoutType()
    }

    if permission == "WorkoutRoute" {
      if #available(iOS 11.0, *) {
        return HKSeriesType.workoutRoute()
      }
      return nil
    }

    if permission == "ActivitySummary" {
      return HKObjectType.activitySummaryType()
    }

    if permission == "DateOfBirth" {
      return HKObjectType.characteristicType(forIdentifier: .dateOfBirth)
    }

    if permission == "BiologicalSex" {
      return HKObjectType.characteristicType(forIdentifier: .biologicalSex)
    }

    if permission == "BloodType" {
      return HKObjectType.characteristicType(forIdentifier: .bloodType)
    }

    if let clinicalType = clinicalTypeFromName(permission) {
      return clinicalType
    }

    if write {
      return nil
    }

    return nil
  }

  private func quantityTypeForPermission(_ permission: String) -> HKQuantityType? {
    switch permission {
    case "Height":
      return HKObjectType.quantityType(forIdentifier: .height)
    case "Weight", "BodyMass":
      return HKObjectType.quantityType(forIdentifier: .bodyMass)
    case "PeakFlow":
      return HKObjectType.quantityType(forIdentifier: .peakExpiratoryFlowRate)
    case "WaistCircumference":
      return HKObjectType.quantityType(forIdentifier: .waistCircumference)
    case "BodyFatPercentage":
      return HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)
    case "BodyMassIndex":
      return HKObjectType.quantityType(forIdentifier: .bodyMassIndex)
    case "LeanBodyMass":
      return HKObjectType.quantityType(forIdentifier: .leanBodyMass)
    case "BodyTemperature":
      return HKObjectType.quantityType(forIdentifier: .bodyTemperature)

    case "Steps", "StepCount":
      return HKObjectType.quantityType(forIdentifier: .stepCount)
    case "DistanceWalkingRunning":
      return HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
    case "DistanceCycling":
      return HKObjectType.quantityType(forIdentifier: .distanceCycling)
    case "DistanceSwimming":
      return HKObjectType.quantityType(forIdentifier: .distanceSwimming)
    case "BasalEnergyBurned":
      return HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)
    case "ActiveEnergyBurned":
      return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
    case "FlightsClimbed":
      return HKObjectType.quantityType(forIdentifier: .flightsClimbed)
    case "AppleStandTime":
      return HKObjectType.quantityType(forIdentifier: .appleStandTime)
    case "AppleExerciseTime":
      return HKObjectType.quantityType(forIdentifier: .appleExerciseTime)
    case "RunningSpeed":
      if #available(iOS 16.0, *) {
        return HKObjectType.quantityType(forIdentifier: .runningSpeed)
      }
      return nil
    case "RunningPower":
      if #available(iOS 16.0, *) {
        return HKObjectType.quantityType(forIdentifier: .runningPower)
      }
      return nil
    case "RunningStrideLength":
      if #available(iOS 16.0, *) {
        return HKObjectType.quantityType(forIdentifier: .runningStrideLength)
      }
      return nil
    case "RunningVerticalOscillation":
      if #available(iOS 16.0, *) {
        return HKObjectType.quantityType(forIdentifier: .runningVerticalOscillation)
      }
      return nil
    case "RunningGroundContactTime":
      if #available(iOS 16.0, *) {
        return HKObjectType.quantityType(forIdentifier: .runningGroundContactTime)
      }
      return nil

    case "EnergyConsumed":
      return HKObjectType.quantityType(forIdentifier: .dietaryEnergyConsumed)
    case "Protein":
      return HKObjectType.quantityType(forIdentifier: .dietaryProtein)
    case "Fiber":
      return HKObjectType.quantityType(forIdentifier: .dietaryFiber)
    case "FatTotal":
      return HKObjectType.quantityType(forIdentifier: .dietaryFatTotal)
    case "Carbohydrates":
      return HKObjectType.quantityType(forIdentifier: .dietaryCarbohydrates)
    case "Sugar":
      return HKObjectType.quantityType(forIdentifier: .dietarySugar)
    case "Water":
      return HKObjectType.quantityType(forIdentifier: .dietaryWater)

    case "BloodGlucose":
      return HKObjectType.quantityType(forIdentifier: .bloodGlucose)
    case "InsulinDelivery":
      return HKObjectType.quantityType(forIdentifier: .insulinDelivery)

    case "HeartRate":
      return HKObjectType.quantityType(forIdentifier: .heartRate)
    case "WalkingHeartRateAverage":
      return HKObjectType.quantityType(forIdentifier: .walkingHeartRateAverage)
    case "RestingHeartRate":
      return HKObjectType.quantityType(forIdentifier: .restingHeartRate)
    case "HeartRateVariability":
      return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
    case "Vo2Max":
      return HKObjectType.quantityType(forIdentifier: .vo2Max)
    case "RespiratoryRate":
      return HKObjectType.quantityType(forIdentifier: .respiratoryRate)
    case "OxygenSaturation":
      return HKObjectType.quantityType(forIdentifier: .oxygenSaturation)

    case "BloodPressureSystolic":
      return HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic)
    case "BloodPressureDiastolic":
      return HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic)

    case "BloodAlcoholContent":
      return HKObjectType.quantityType(forIdentifier: .bloodAlcoholContent)

    case "EnvironmentalAudioExposure":
      if #available(iOS 13.0, *) {
        return HKObjectType.quantityType(forIdentifier: .environmentalAudioExposure)
      }
      return nil
    case "HeadphoneAudioExposure":
      if #available(iOS 13.0, *) {
        return HKObjectType.quantityType(forIdentifier: .headphoneAudioExposure)
      }
      return nil

    default:
      return nil
    }
  }

  @available(iOS 12.0, *)
  private func clinicalTypeFromName(_ name: String) -> HKClinicalType? {
    switch name {
    case "AllergyRecord":
      return HKObjectType.clinicalType(forIdentifier: .allergyRecord)
    case "ConditionRecord":
      return HKObjectType.clinicalType(forIdentifier: .conditionRecord)
    case "ImmunizationRecord":
      return HKObjectType.clinicalType(forIdentifier: .immunizationRecord)
    case "LabResultRecord":
      return HKObjectType.clinicalType(forIdentifier: .labResultRecord)
    case "MedicationRecord":
      return HKObjectType.clinicalType(forIdentifier: .medicationRecord)
    case "ProcedureRecord":
      return HKObjectType.clinicalType(forIdentifier: .procedureRecord)
    case "VitalSignRecord":
      return HKObjectType.clinicalType(forIdentifier: .vitalSignRecord)
    case "CoverageRecord":
      if #available(iOS 14.0, *) {
        return HKObjectType.clinicalType(forIdentifier: .coverageRecord)
      }
      return nil
    default:
      return nil
    }
  }

  private func unitFromOptions(_ options: [String: Any], permission: String) -> HKUnit {
    if let unitName = options["unit"] as? String,
       let unit = hkUnit(from: unitName, permission: permission)
    {
      return unit
    }

    return defaultUnitForPermission(permission)
  }

  private func hkUnit(from unitName: String, permission: String) -> HKUnit? {
    switch unitName {
    case "gram":
      return HKUnit.gram()
    case "kg":
      return HKUnit.gramUnit(with: .kilo)
    case "stone":
      return HKUnit.stone()
    case "pound":
      return HKUnit.pound()
    case "meter":
      return HKUnit.meter()
    case "cm":
      return HKUnit.meterUnit(with: .centi)
    case "inch":
      return HKUnit.inch()
    case "mile":
      return HKUnit.mile()
    case "foot":
      return HKUnit.foot()
    case "second":
      return HKUnit.second()
    case "minute":
      return HKUnit.minute()
    case "hour":
      return HKUnit.hour()
    case "day":
      return HKUnit.day()
    case "joule":
      return HKUnit.joule()
    case "calorie":
      return HKUnit.calorie()
    case "kilocalorie":
      return HKUnit.kilocalorie()
    case "celsius":
      return HKUnit.degreeCelsius()
    case "fahrenheit":
      return HKUnit.degreeFahrenheit()
    case "count":
      return HKUnit.count()
    case "percent":
      return HKUnit.percent()
    case "mmhg":
      return HKUnit.millimeterOfMercury()
    case "literPerMinute":
      return HKUnit.liter().unitDivided(by: .minute())
    case "bpm":
      return HKUnit.count().unitDivided(by: .minute())
    case "mgPerdL":
      return HKUnit.gramUnit(with: .milli).unitDivided(by: HKUnit.literUnit(with: .deci))
    case "mmolPerL":
      if permission == "BloodGlucose" {
        return HKUnit.moleUnit(with: .milli, molarMass: HKUnitMolarMassBloodGlucose).unitDivided(by: .liter())
      }
      return HKUnit.moleUnit(with: .milli, molarMass: HKUnitMolarMassBloodGlucose).unitDivided(by: .liter())
    case "mlPerKgMin":
      let ml = HKUnit.literUnit(with: .milli)
      let kg = HKUnit.gramUnit(with: .kilo)
      let minute = HKUnit.minute()
      return ml.unitDivided(by: kg.unitMultiplied(by: minute))
    default:
      return nil
    }
  }

  private func defaultUnitForPermission(_ permission: String) -> HKUnit {
    switch permission {
    case "Weight", "BodyMass", "LeanBodyMass":
      return HKUnit.pound()
    case "Height", "WaistCircumference":
      return HKUnit.inch()
    case "PeakFlow":
      return HKUnit.liter().unitDivided(by: .minute())
    case "BodyMassIndex", "Steps", "StepCount", "FlightsClimbed", "AppleStandTime":
      return HKUnit.count()
    case "BodyFatPercentage", "BloodAlcoholContent", "OxygenSaturation":
      return HKUnit.percent()
    case "DistanceWalkingRunning", "DistanceCycling", "DistanceSwimming":
      return HKUnit.meter()
    case "ActiveEnergyBurned", "BasalEnergyBurned", "EnergyConsumed":
      return HKUnit.kilocalorie()
    case "AppleExerciseTime":
      return HKUnit.second()
    case "Protein", "Fiber", "FatTotal", "Carbohydrates", "Sugar":
      return HKUnit.gram()
    case "Water":
      return HKUnit.liter()
    case "HeartRate", "RestingHeartRate", "WalkingHeartRateAverage", "RespiratoryRate":
      return HKUnit.count().unitDivided(by: .minute())
    case "HeartRateVariability":
      return HKUnit.second()
    case "Vo2Max":
      let ml = HKUnit.literUnit(with: .milli)
      let kg = HKUnit.gramUnit(with: .kilo)
      let minute = HKUnit.minute()
      return ml.unitDivided(by: kg.unitMultiplied(by: minute))
    case "BodyTemperature":
      return HKUnit.degreeCelsius()
    case "BloodPressureSystolic", "BloodPressureDiastolic":
      return HKUnit.millimeterOfMercury()
    case "BloodGlucose":
      return HKUnit.moleUnit(with: .milli, molarMass: HKUnitMolarMassBloodGlucose).unitDivided(by: .liter())
    case "InsulinDelivery":
      return HKUnit.internationalUnit()
    case "EnvironmentalAudioExposure", "HeadphoneAudioExposure":
      return HKUnit.decibelAWeightedSoundPressureLevel()
    default:
      return HKUnit.count()
    }
  }

  private func compoundPredicate(startDate: Date, endDate: Date, includeManuallyAdded: Bool) -> NSPredicate {
    let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    guard !includeManuallyAdded else {
      return datePredicate
    }

    let manualPredicate = NSPredicate(format: "metadata.%K != YES", HKMetadataKeyWasUserEntered)
    return NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, manualPredicate])
  }

  private func parseDate(_ raw: Any?) -> Date? {
    if let date = raw as? Date {
      return date
    }

    guard let text = raw as? String, !text.isEmpty else {
      return nil
    }

    if let value = isoFormatter.date(from: text) {
      return value
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
    if let value = formatter.date(from: text) {
      return value
    }

    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
    return formatter.date(from: text)
  }

  private func boolValue(_ raw: Any?, defaultValue: Bool) -> Bool {
    if let value = raw as? Bool {
      return value
    }
    if let value = raw as? NSNumber {
      return value.boolValue
    }
    if let value = raw as? String {
      return ["1", "true", "yes"].contains(value.lowercased())
    }
    return defaultValue
  }

  private func intValue(_ raw: Any?, defaultValue: Int) -> Int {
    if let value = raw as? Int {
      return value
    }
    if let value = raw as? NSNumber {
      return value.intValue
    }
    if let value = raw as? String, let parsed = Int(value) {
      return parsed
    }
    return defaultValue
  }

  private func doubleValue(_ raw: Any?) -> Double? {
    if let value = raw as? Double {
      return value
    }
    if let value = raw as? NSNumber {
      return value.doubleValue
    }
    if let value = raw as? String {
      return Double(value)
    }
    return nil
  }

  private func dayRangeForDate(_ date: Date) -> (start: Date, end: Date) {
    let calendar = Calendar.current
    let start = calendar.startOfDay(for: date)
    let end = calendar.date(byAdding: .day, value: 1, to: start) ?? date
    return (start, end)
  }

  private func anchorFromBase64(_ raw: String?) -> HKQueryAnchor? {
    guard let raw,
          let data = Data(base64Encoded: raw)
    else {
      return nil
    }

    return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
  }

  private func anchorToBase64(_ anchor: HKQueryAnchor?) -> String {
    guard let anchor else {
      return ""
    }

    let data = (try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: false)) ?? Data()
    return data.base64EncodedString()
  }

  private func buildDefaultReadTypes() -> Set<HKObjectType> {
    var types: Set<HKObjectType> = [HKObjectType.workoutType()]

    let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
      .stepCount,
      .activeEnergyBurned,
      .appleExerciseTime,
      .heartRate,
      .restingHeartRate,
      .heartRateVariabilitySDNN,
      .oxygenSaturation,
      .bloodGlucose,
      .bloodPressureSystolic,
      .bloodPressureDiastolic,
    ]

    quantityIdentifiers.forEach { identifier in
      if let type = HKObjectType.quantityType(forIdentifier: identifier) {
        types.insert(type)
      }
    }

    if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      types.insert(sleepType)
    }

    if let bloodPressureType = HKCorrelationType.correlationType(forIdentifier: .bloodPressure) {
      types.insert(bloodPressureType)
    }

    if #available(iOS 18.0, *) {
      if let sleepApneaType = HKObjectType.categoryType(forIdentifier: .sleepApneaEvent) {
        types.insert(sleepApneaType)
      }
      if let disturbancesType = HKObjectType.quantityType(forIdentifier: .appleSleepingBreathingDisturbances) {
        types.insert(disturbancesType)
      }
    }

    return types
  }

  private func queryLatest(
    _ identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    completion: @escaping (Double?, Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion(nil, nil)
      return
    }

    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
    let query = HKSampleQuery(sampleType: quantityType, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, error in
      guard error == nil else {
        completion(nil, error)
        return
      }
      let sample = samples?.first as? HKQuantitySample
      completion(sample?.quantity.doubleValue(for: unit), nil)
    }

    healthStore.execute(query)
  }

  private func queryLatestBloodPressure(
    completion: @escaping ([String: Any], Error?) -> Void
  ) {
    guard let correlationType = HKCorrelationType.correlationType(forIdentifier: .bloodPressure),
          let systolicType = HKQuantityType.quantityType(forIdentifier: .bloodPressureSystolic),
          let diastolicType = HKQuantityType.quantityType(forIdentifier: .bloodPressureDiastolic)
    else {
      completion([:], nil)
      return
    }

    let unit = HKUnit.millimeterOfMercury()
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
    let query = HKSampleQuery(sampleType: correlationType, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
      guard let correlation = (samples as? [HKCorrelation])?.first,
            let systolic = correlation.objects(for: systolicType).first as? HKQuantitySample,
            let diastolic = correlation.objects(for: diastolicType).first as? HKQuantitySample
      else {
        completion([:], nil)
        return
      }

      let systolicValue = self.round(systolic.quantity.doubleValue(for: unit))
      let diastolicValue = self.round(diastolic.quantity.doubleValue(for: unit))

      completion([
        "systolicBloodPressureMmhg": systolicValue,
        "diastolicBloodPressureMmhg": diastolicValue,
        "latestBloodPressureAt": self.isoString(correlation.endDate),
        "bloodPressureLevel": self.bloodPressureLevel(
          systolic: systolicValue,
          diastolic: diastolicValue
        ),
      ], nil)
    }

    healthStore.execute(query)
  }

  private func querySleepApneaSummaryLast30Days(
    completion: @escaping ([String: Any], Error?) -> Void
  ) {
    guard #available(iOS 18.0, *) else {
      completion([:], nil)
      return
    }

    let endDate = Date()
    let startDate = endDate.addingTimeInterval(-30 * 24 * 60 * 60)
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

    var apneaEventCount = 0
    var apneaDurationMinutes: Double = 0
    var latestEventDate: Date?
    var apneaClassification = "unknown"
    let group = DispatchGroup()
    var didRunQuery = false

    if let sleepApneaType = HKObjectType.categoryType(forIdentifier: .sleepApneaEvent) {
      didRunQuery = true
      group.enter()

      let apneaQuery = HKSampleQuery(sampleType: sleepApneaType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
        let categorySamples = (samples as? [HKCategorySample]) ?? []
        apneaEventCount = categorySamples.count
        apneaDurationMinutes = categorySamples.reduce(0) { total, sample in
          total + sample.endDate.timeIntervalSince(sample.startDate) / 60
        }
        latestEventDate = categorySamples.first?.endDate
        group.leave()
      }

      healthStore.execute(apneaQuery)
    }

    if let disturbancesType = HKObjectType.quantityType(forIdentifier: .appleSleepingBreathingDisturbances) {
      didRunQuery = true
      group.enter()

      let disturbancesQuery = HKSampleQuery(sampleType: disturbancesType, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
        if let sample = (samples as? [HKQuantitySample])?.first {
          if let classification = HKAppleSleepingBreathingDisturbancesClassification(classifying: sample.quantity) {
            apneaClassification = self.apneaClassificationString(classification.rawValue)
          }

          if latestEventDate == nil {
            latestEventDate = sample.endDate
          }
        }

        group.leave()
      }

      healthStore.execute(disturbancesQuery)
    }

    guard didRunQuery else {
      completion([:], nil)
      return
    }

    group.notify(queue: .main) {
      if apneaEventCount == 0 && apneaClassification == "unknown" {
        completion([:], nil)
        return
      }

      let riskLevel = self.apneaRiskLevel(
        eventCount: apneaEventCount,
        durationMinutes: apneaDurationMinutes,
        classification: apneaClassification
      )

      var apnea: [String: Any] = [
        "eventCountLast30d": apneaEventCount,
        "durationMinutesLast30d": self.round(apneaDurationMinutes),
        "classification": apneaClassification,
        "riskLevel": riskLevel,
        "reminder": self.apneaReminder(
          riskLevel: riskLevel,
          eventCount: apneaEventCount,
          classification: apneaClassification
        ),
      ]

      if let latestEventDate {
        apnea["latestEventAt"] = self.isoString(latestEventDate)
      }

      completion([
        "apnea": apnea,
      ], nil)
    }
  }

  private func queryTodayCumulative(
    _ identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    completion: @escaping (Double?, Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion(nil, nil)
      return
    }

    let now = Date()
    let startOfDay = Calendar.current.startOfDay(for: now)
    let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)

    let query = HKStatisticsQuery(quantityType: quantityType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
      guard error == nil else {
        completion(nil, error)
        return
      }
      completion(result?.sumQuantity()?.doubleValue(for: unit), nil)
    }

    healthStore.execute(query)
  }

  private func querySleepSummaryLast36Hours(
    completion: @escaping ([String: Any], Error?) -> Void
  ) {
    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      completion([:], nil)
      return
    }

    let endDate = Date()
    let startDate = endDate.addingTimeInterval(-36 * 60 * 60)
    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

    let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
      guard error == nil else {
        completion([:], error)
        return
      }

      let categorySamples = (samples as? [HKCategorySample]) ?? []
      var asleepMinutes: Double = 0
      var inBedMinutes: Double = 0
      var awakeMinutes: Double = 0

      for sample in categorySamples {
        let minutes = sample.endDate.timeIntervalSince(sample.startDate) / 60
        if #available(iOS 16.0, *) {
          switch sample.value {
          case HKCategoryValueSleepAnalysis.inBed.rawValue:
            inBedMinutes += minutes
          case HKCategoryValueSleepAnalysis.awake.rawValue:
            awakeMinutes += minutes
          default:
            asleepMinutes += minutes
          }
        } else {
          switch sample.value {
          case HKCategoryValueSleepAnalysis.inBed.rawValue:
            inBedMinutes += minutes
          default:
            asleepMinutes += minutes
          }
        }
      }

      completion([
        "inBedMinutesLast36h": self.round(inBedMinutes),
        "asleepMinutesLast36h": self.round(asleepMinutes),
        "awakeMinutesLast36h": self.round(awakeMinutes),
        "sampleCountLast36h": categorySamples.count,
      ], nil)
    }

    healthStore.execute(query)
  }

  private func queryRecentWorkouts(
    days: Int,
    limit: Int,
    completion: @escaping ([[String: Any]], Error?) -> Void
  ) {
    let endDate = Date()
    guard let startDate = Calendar.current.date(byAdding: .day, value: -days, to: endDate) else {
      completion([], nil)
      return
    }

    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

    let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
      guard error == nil else {
        completion([], error)
        return
      }

      let workouts = (samples as? [HKWorkout]) ?? []
      let records: [[String: Any]] = workouts.map { workout in
        [
          "activityTypeCode": workout.workoutActivityType.rawValue,
          "startDate": self.isoString(workout.startDate),
          "endDate": self.isoString(workout.endDate),
          "durationMinutes": self.round(workout.duration / 60),
          "totalEnergyKcal": self.round(workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0),
          "totalDistanceKm": self.round(workout.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0),
        ]
      }

      completion(records, nil)
    }

    healthStore.execute(query)
  }

  private func respondSuccess(_ callback: LynxCallbackBlock, data: Any) {
    callback([
      "success": true,
      "data": data,
    ])
  }

  private func respondError(_ callback: LynxCallbackBlock, message: String) {
    callback([
      "success": false,
      "error": message,
    ])
  }

  private func round(_ value: Double, digits: Int = 2) -> Double {
    let factor = pow(10.0, Double(digits))
    return Foundation.round(value * factor) / factor
  }

  private func bloodPressureLevel(systolic: Double, diastolic: Double) -> String {
    if systolic > 180 || diastolic > 120 {
      return "hypertensive-crisis"
    }
    if systolic >= 140 || diastolic >= 90 {
      return "hypertension-stage-2"
    }
    if systolic >= 130 || diastolic >= 80 {
      return "hypertension-stage-1"
    }
    if systolic >= 120 && diastolic < 80 {
      return "elevated"
    }
    return "normal"
  }

  private func apneaClassificationString(_ rawValue: Int) -> String {
    switch rawValue {
    case 0:
      return "notElevated"
    case 1:
      return "elevated"
    default:
      return "unknown"
    }
  }

  private func apneaRiskLevel(
    eventCount: Int,
    durationMinutes: Double,
    classification: String
  ) -> String {
    if classification == "elevated" {
      return "high"
    }
    if eventCount == 0 && classification == "notElevated" {
      return "none"
    }
    if eventCount >= 3 || durationMinutes >= 20 {
      return "high"
    }
    if eventCount > 0 {
      return "watch"
    }
    return "unknown"
  }

  private func apneaReminder(
    riskLevel: String,
    eventCount: Int,
    classification: String
  ) -> String {
    switch riskLevel {
    case "none":
      return "No elevated sleep apnea signal was found in recent Health data."
    case "watch":
      return "Sleep apnea events were detected recently. Keep monitoring the trend."
    case "high":
      if classification == "elevated" {
        return "Apple sleeping breathing disturbances are elevated. Review the signal and consider follow-up."
      }
      return "Multiple sleep apnea events were detected recently. Review the signal and consider follow-up."
    default:
      return eventCount > 0
        ? "Recent sleep apnea-related data is available."
        : "Sleep apnea data is available but not fully classified."
    }
  }

  private func isoString(_ date: Date) -> String {
    isoFormatter.string(from: date)
  }
}
