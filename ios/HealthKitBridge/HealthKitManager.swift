import Foundation
import HealthKit
import Lynx

@objc(HealthKitManager)
public final class HealthKitManager: NSObject, LynxModule {
  private let healthStore = HKHealthStore()

  public static let name = "HealthKitManager"

  public static var methodLookup: [String : String]? = [
    "isHealthDataAvailable": NSStringFromSelector(#selector(isHealthDataAvailable(_:callback:))),
    "requestAuthorization": NSStringFromSelector(#selector(requestAuthorization(_:callback:))),
    "getHealthSnapshot": NSStringFromSelector(#selector(getHealthSnapshot(_:callback:)))
  ]

  @objc
  public func isHealthDataAvailable(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    callback([
      "success": true,
      "data": HKHealthStore.isHealthDataAvailable()
    ])
  }

  @objc
  public func requestAuthorization(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      callback(["success": true, "data": false])
      return
    }

    let readTypes = buildReadTypes()
    if readTypes.isEmpty {
      callback(["success": true, "data": false])
      return
    }

    healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
      if let error = error {
        callback([
          "success": false,
          "error": error.localizedDescription
        ])
        return
      }

      callback([
        "success": true,
        "data": success
      ])
    }
  }

  @objc
  public func getHealthSnapshot(
    _ params: [AnyHashable: Any]?,
    callback: @escaping LynxCallbackBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      callback([
        "success": true,
        "data": [
          "authorized": false,
          "generatedAt": isoString(Date()),
          "note": "HealthKit unavailable"
        ]
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

    let bpmUnit = HKUnit.count().unitDivided(by: .minute())

    group.enter()
    queryLatest(.heartRate, unit: bpmUnit) { value, error in
      setError(error)
      setValue(&heart, "latestHeartRateBpm", value)
      group.leave()
    }

    group.enter()
    queryLatest(.restingHeartRate, unit: bpmUnit) { value, error in
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
        let normalized = value <= 1 ? value * 100 : value
        oxygen["bloodOxygenPercent"] = round(normalized)
      }
      group.leave()
    }

    let glucoseUnit = HKUnit.gramUnit(with: .milli).unitDivided(by: HKUnit.literUnit(with: .deci))

    group.enter()
    queryLatest(.bloodGlucose, unit: glucoseUnit) { value, error in
      setError(error)
      setValue(&metabolic, "bloodGlucoseMgDl", value)
      group.leave()
    }

    group.enter()
    queryHourlyDiscreteAverage(.heartRate, unit: bpmUnit, outputUnit: "bpm", hours: 24) { rows, error in
      setError(error)
      if !rows.isEmpty {
        heart["heartRateSeriesLast24h"] = rows
      }
      group.leave()
    }

    group.enter()
    queryHourlyDiscreteAverage(
      .oxygenSaturation,
      unit: HKUnit.percent(),
      outputUnit: "%",
      hours: 24,
      transform: { value in value <= 1 ? value * 100 : value }
    ) { rows, error in
      setError(error)
      if !rows.isEmpty {
        oxygen["bloodOxygenSeriesLast24h"] = rows
      }
      group.leave()
    }

    group.enter()
    queryDailyDiscreteAverage(
      .bloodGlucose,
      unit: glucoseUnit,
      outputUnit: "mmol/L",
      days: 7,
      transform: { value in value / 18 }
    ) { rows, error in
      setError(error)
      if !rows.isEmpty {
        metabolic["bloodGlucoseSeriesLast7d"] = rows
      }
      group.leave()
    }

    group.enter()
    querySleepSummaryLast36Hours { result, error in
      setError(error)
      sleep.merge(result, uniquingKeysWith: { _, new in new })
      group.leave()
    }

    group.enter()
    querySleepApneaSummaryLast30Days { result, error in
      setError(error)
      if !result.isEmpty {
        sleep["apnea"] = result
      }
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
        callback([
          "success": false,
          "error": firstError.localizedDescription
        ])
        return
      }

      var payload: [String: Any] = [
        "authorized": true,
        "generatedAt": self.isoString(Date()),
        "workouts": workouts
      ]

      if !activity.isEmpty { payload["activity"] = activity }
      if !sleep.isEmpty { payload["sleep"] = sleep }
      if !heart.isEmpty { payload["heart"] = heart }
      if !oxygen.isEmpty { payload["oxygen"] = oxygen }
      if !metabolic.isEmpty { payload["metabolic"] = metabolic }

      callback([
        "success": true,
        "data": payload
      ])
    }
  }

  private func buildReadTypes() -> Set<HKObjectType> {
    var types: Set<HKObjectType> = [HKObjectType.workoutType()]

    let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
      .stepCount,
      .activeEnergyBurned,
      .appleExerciseTime,
      .heartRate,
      .restingHeartRate,
      .heartRateVariabilitySDNN,
      .oxygenSaturation,
      .bloodGlucose
    ]

    quantityIdentifiers.forEach { identifier in
      if let type = HKObjectType.quantityType(forIdentifier: identifier) {
        types.insert(type)
      }
    }

    if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      types.insert(sleepType)
    }

    let apneaIdentifier = HKCategoryTypeIdentifier(rawValue: "HKCategoryTypeIdentifierSleepApneaEvent")
    if let apneaType = HKObjectType.categoryType(forIdentifier: apneaIdentifier) {
      types.insert(apneaType)
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

  private func queryTodayCumulative(
    _ identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    completion: @escaping (Double?, Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion(nil, nil)
      return
    }

    let calendar = Calendar.current
    let now = Date()
    let startOfDay = calendar.startOfDay(for: now)
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

  private func queryHourlyDiscreteAverage(
    _ identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    outputUnit: String,
    hours: Int,
    transform: ((Double) -> Double)? = nil,
    completion: @escaping ([[String: Any]], Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion([], nil)
      return
    }

    let endDate = Date()
    guard let startDate = Calendar.current.date(byAdding: .hour, value: -hours, to: endDate) else {
      completion([], nil)
      return
    }

    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    var interval = DateComponents()
    interval.hour = 1

    let anchor = Calendar.current.startOfDay(for: startDate)
    let query = HKStatisticsCollectionQuery(
      quantityType: quantityType,
      quantitySamplePredicate: predicate,
      options: [.discreteAverage],
      anchorDate: anchor,
      intervalComponents: interval
    )

    query.initialResultsHandler = { _, collection, error in
      guard error == nil else {
        completion([], error)
        return
      }

      guard let collection else {
        completion([], nil)
        return
      }

      var rows: [[String: Any]] = []
      collection.enumerateStatistics(from: startDate, to: endDate) { stat, _ in
        guard let avg = stat.averageQuantity() else {
          return
        }
        var value = avg.doubleValue(for: unit)
        if let transform {
          value = transform(value)
        }

        rows.append([
          "timestamp": self.isoString(stat.startDate),
          "value": self.round(value),
          "unit": outputUnit,
        ])
      }

      completion(rows, nil)
    }

    healthStore.execute(query)
  }

  private func queryDailyDiscreteAverage(
    _ identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    outputUnit: String,
    days: Int,
    transform: ((Double) -> Double)? = nil,
    completion: @escaping ([[String: Any]], Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion([], nil)
      return
    }

    let endDate = Date()
    guard let startDate = Calendar.current.date(byAdding: .day, value: -(days - 1), to: endDate) else {
      completion([], nil)
      return
    }

    let startOfRange = Calendar.current.startOfDay(for: startDate)
    let predicate = HKQuery.predicateForSamples(withStart: startOfRange, end: endDate, options: .strictStartDate)

    var interval = DateComponents()
    interval.day = 1

    let anchor = Calendar.current.startOfDay(for: startOfRange)
    let query = HKStatisticsCollectionQuery(
      quantityType: quantityType,
      quantitySamplePredicate: predicate,
      options: [.discreteAverage],
      anchorDate: anchor,
      intervalComponents: interval
    )

    query.initialResultsHandler = { _, collection, error in
      guard error == nil else {
        completion([], error)
        return
      }

      guard let collection else {
        completion([], nil)
        return
      }

      var rows: [[String: Any]] = []
      collection.enumerateStatistics(from: startOfRange, to: endDate) { stat, _ in
        guard let avg = stat.averageQuantity() else {
          return
        }
        var value = avg.doubleValue(for: unit)
        if let transform {
          value = transform(value)
        }

        rows.append([
          "timestamp": self.isoString(stat.startDate),
          "value": self.round(value),
          "unit": outputUnit,
        ])
      }

      completion(rows, nil)
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
        switch sample.value {
        case HKCategoryValueSleepAnalysis.inBed.rawValue:
          inBedMinutes += minutes
        case HKCategoryValueSleepAnalysis.awake.rawValue:
          awakeMinutes += minutes
        default:
          asleepMinutes += minutes
        }
      }

      let sleepScore = self.round(max(0, min(100, 95 - awakeMinutes * 0.6 - abs(asleepMinutes - 450) * 0.05)), digits: 0)

      completion([
        "inBedMinutesLast36h": self.round(inBedMinutes),
        "asleepMinutesLast36h": self.round(asleepMinutes),
        "awakeMinutesLast36h": self.round(awakeMinutes),
        "sleepScore": sleepScore,
        "sampleCountLast36h": categorySamples.count,
      ], nil)
    }

    healthStore.execute(query)
  }

  private func querySleepApneaSummaryLast30Days(
    completion: @escaping ([String: Any], Error?) -> Void
  ) {
    let apneaIdentifier = HKCategoryTypeIdentifier(rawValue: "HKCategoryTypeIdentifierSleepApneaEvent")
    guard let apneaType = HKObjectType.categoryType(forIdentifier: apneaIdentifier) else {
      completion([:], nil)
      return
    }

    let endDate = Date()
    guard let startDate = Calendar.current.date(byAdding: .day, value: -30, to: endDate) else {
      completion([:], nil)
      return
    }

    let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

    let query = HKSampleQuery(sampleType: apneaType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
      guard error == nil else {
        completion([:], error)
        return
      }

      let categorySamples = (samples as? [HKCategorySample]) ?? []
      if categorySamples.isEmpty {
        completion([
          "eventCountLast30d": 0,
          "durationMinutesLast30d": 0,
          "riskLevel": "none",
          "reminder": "No apnea events in the last 30 days.",
        ], nil)
        return
      }

      let totalMinutes = categorySamples.reduce(0.0) { partial, sample in
        partial + sample.endDate.timeIntervalSince(sample.startDate) / 60
      }

      let eventCount = categorySamples.count
      let riskLevel: String = eventCount >= 3 || totalMinutes >= 20 ? "high" : "watch"
      let reminder = riskLevel == "high"
        ? "Frequent apnea events detected. Consider clinical follow-up."
        : "Mild apnea events detected. Keep observing sleep quality."

      completion([
        "eventCountLast30d": eventCount,
        "durationMinutesLast30d": self.round(totalMinutes),
        "latestEventAt": self.isoString(categorySamples[0].endDate),
        "riskLevel": riskLevel,
        "reminder": reminder,
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
          "activityTypeName": self.workoutName(for: workout.workoutActivityType),
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

  private func workoutName(for type: HKWorkoutActivityType) -> String {
    switch type {
    case .running:
      return "running"
    case .walking:
      return "walking"
    case .cycling:
      return "cycling"
    case .traditionalStrengthTraining:
      return "strength"
    case .yoga:
      return "yoga"
    default:
      return "other"
    }
  }

  private func round(_ value: Double, digits: Int = 2) -> Double {
    let factor = pow(10.0, Double(digits))
    return Foundation.round(value * factor) / factor
  }

  private func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}
