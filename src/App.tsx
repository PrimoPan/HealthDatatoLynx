import { useMemo, useState } from '@lynx-js/react';

import './App.css';
import {
  buildMockHealthSnapshot,
  createHealthClient,
  isHealthKitNativeAvailable,
  isXiaomiHealthNativeAvailable,
} from './lib/index.js';
import type { HealthProviderId, HealthSnapshot, HealthTrendPoint } from './lib/index.js';

type StatusLevel = 'info' | 'success' | 'error';

type StatusState = {
  level: StatusLevel;
  message: string;
} | null;

type QuickMetric = {
  label: string;
  value: string;
};

function formatTime(value?: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function toFixed(value: number | undefined, digits = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }
  return value.toFixed(digits);
}

function mgdlToMmol(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '-';
  }
  return (value / 18).toFixed(2);
}

function getTopSeries(points?: HealthTrendPoint[], limit = 6): HealthTrendPoint[] {
  if (!points || points.length === 0) {
    return [];
  }
  return points.slice(Math.max(points.length - limit, 0));
}

export function App() {
  const [providerId, setProviderId] = useState<HealthProviderId>('apple-healthkit');
  const client = useMemo(
    () =>
      createHealthClient({
        provider: providerId,
        fallbackToMock: true,
      }),
    [providerId],
  );
  const nativeAvailable =
    providerId === 'apple-healthkit'
      ? isHealthKitNativeAvailable()
      : providerId === 'xiaomi-health'
        ? isXiaomiHealthNativeAvailable()
        : false;
  const providerLabel = providerId === 'apple-healthkit' ? 'Apple HealthKit' : 'Xiaomi Health';

  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  const quickMetrics = useMemo<QuickMetric[]>(() => {
    if (!snapshot) {
      return [];
    }

    return [
      { label: 'Source', value: snapshot.source },
      { label: 'Generated At', value: formatTime(snapshot.generatedAt) },
      { label: 'Steps Today', value: `${toFixed(snapshot.activity?.stepsToday, 0)} count` },
      {
        label: 'Heart Rate',
        value: `${toFixed(snapshot.heart?.latestHeartRateBpm, 0)} bpm`,
      },
      {
        label: 'SpO2',
        value: `${toFixed(snapshot.oxygen?.bloodOxygenPercent, 1)} %`,
      },
      {
        label: 'Blood Pressure',
        value: `${toFixed(snapshot.heart?.systolicBloodPressureMmhg, 0)} / ${toFixed(
          snapshot.heart?.diastolicBloodPressureMmhg,
          0,
        )} mmHg`,
      },
      {
        label: 'Blood Glucose',
        value: `${toFixed(snapshot.metabolic?.bloodGlucoseMgDl, 1)} mg/dL (${mgdlToMmol(
          snapshot.metabolic?.bloodGlucoseMgDl,
        )} mmol/L)`,
      },
      {
        label: 'Sleep Score',
        value: `${toFixed(snapshot.sleep?.sleepScore, 0)}`,
      },
      {
        label: 'Sleep Apnea (30d)',
        value: `${toFixed(snapshot.sleep?.apnea?.eventCountLast30d, 0)} events`,
      },
      {
        label: 'Alerts',
        value: `${snapshot.alerts?.length ?? 0}`,
      },
    ];
  }, [snapshot]);

  const heartTrend = useMemo(
    () => getTopSeries(snapshot?.heart?.heartRateSeriesLast24h),
    [snapshot?.heart?.heartRateSeriesLast24h],
  );
  const oxygenTrend = useMemo(
    () => getTopSeries(snapshot?.oxygen?.bloodOxygenSeriesLast24h),
    [snapshot?.oxygen?.bloodOxygenSeriesLast24h],
  );
  const glucoseTrend = useMemo(
    () => getTopSeries(snapshot?.metabolic?.bloodGlucoseSeriesLast7d),
    [snapshot?.metabolic?.bloodGlucoseSeriesLast7d],
  );

  const snapshotJson = useMemo(() => {
    if (!snapshot) {
      return '';
    }
    return JSON.stringify(snapshot, null, 2);
  }, [snapshot]);

  async function onAuthorizeAndRead() {
    if (loading) {
      return;
    }
    setLoading(true);
    setStatus({ level: 'info', message: `Requesting ${providerLabel} authorization...` });

    try {
      const nextSnapshot = await client.readWithAuthorization();
      setSnapshot(nextSnapshot);
      setStatus({
        level: nextSnapshot.source === 'mock' ? 'info' : 'success',
        message:
          nextSnapshot.source === 'mock'
            ? `${providerLabel} unavailable, fallback to mock snapshot.`
            : `${providerLabel} snapshot loaded successfully.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus({ level: 'error', message: `Failed to load ${providerLabel} snapshot: ${message}` });
    } finally {
      setLoading(false);
    }
  }

  function onLoadMock() {
    if (loading) {
      return;
    }
    const mock = buildMockHealthSnapshot();
    setSnapshot({
      ...mock,
      note: `Manual mock snapshot for ${providerLabel}. ${mock.note ?? ''}`.trim(),
    });
    setStatus({ level: 'success', message: `Mock snapshot loaded for ${providerLabel}.` });
  }

  return (
    <view className='app'>
      <scroll-view className='page' scroll-orientation='vertical'>
        <view className='hero'>
          <text className='badge'>Open Source Starter</text>
          <text className='title'>Health Data to Lynx</text>
          <text className='subtitle'>
            One-click health authorization and snapshot reading for Lynx apps (Apple + Xiaomi).
          </text>
        </view>

        <view className='card'>
          <text className='section-title'>1. Authorize and Read</text>
          <text className='section-text'>Provider</text>
          <view className='provider-row'>
            <view
              className={`provider-btn ${providerId === 'apple-healthkit' ? 'active' : ''}`}
              bindtap={() => setProviderId('apple-healthkit')}
            >
              <text className={`provider-text ${providerId === 'apple-healthkit' ? 'active' : ''}`}>
                Apple HealthKit
              </text>
            </view>
            <view
              className={`provider-btn ${providerId === 'xiaomi-health' ? 'active' : ''}`}
              bindtap={() => setProviderId('xiaomi-health')}
            >
              <text className={`provider-text ${providerId === 'xiaomi-health' ? 'active' : ''}`}>
                Xiaomi Health
              </text>
            </view>
          </view>
          <text className='section-text'>
            {providerLabel} native bridge: {nativeAvailable ? 'Available' : 'Unavailable in current host'}
          </text>

          <view
            className={`btn primary ${loading ? 'disabled' : ''}`}
            bindtap={onAuthorizeAndRead}
          >
            <text className='btn-text'>
              {loading ? 'Loading...' : `Authorize + Read ${providerLabel}`}
            </text>
          </view>

          <view className={`btn ghost ${loading ? 'disabled' : ''}`} bindtap={onLoadMock}>
            <text className='btn-text ghost-text'>Load Mock Snapshot</text>
          </view>

          {status ? (
            <text className={`status ${status.level}`}>{status.message}</text>
          ) : null}
        </view>

        {snapshot ? (
          <view className='card'>
            <text className='section-title'>2. Snapshot Overview</text>
            <view className='metric-grid'>
              {quickMetrics.map(metric => (
                <view className='metric-item' key={metric.label}>
                  <text className='metric-label'>{metric.label}</text>
                  <text className='metric-value'>{metric.value}</text>
                </view>
              ))}
            </view>
          </view>
        ) : null}

        {snapshot ? (
          <view className='card'>
            <text className='section-title'>3. Key Trends</text>

            <text className='trend-title'>Heart Rate (bpm)</text>
            {heartTrend.length > 0 ? (
              <view className='trend-list'>
                {heartTrend.map(point => (
                  <view className='trend-row' key={`heart-${point.timestamp}`}>
                    <text className='trend-time'>{formatTime(point.timestamp)}</text>
                    <text className='trend-value'>{toFixed(point.value, 0)} bpm</text>
                  </view>
                ))}
              </view>
            ) : (
              <text className='empty'>No heart rate series available.</text>
            )}

            <text className='trend-title'>Blood Oxygen (%)</text>
            {oxygenTrend.length > 0 ? (
              <view className='trend-list'>
                {oxygenTrend.map(point => (
                  <view className='trend-row' key={`oxygen-${point.timestamp}`}>
                    <text className='trend-time'>{formatTime(point.timestamp)}</text>
                    <text className='trend-value'>{toFixed(point.value, 1)} %</text>
                  </view>
                ))}
              </view>
            ) : (
              <text className='empty'>No blood oxygen series available.</text>
            )}

            <text className='trend-title'>Blood Glucose (mmol/L)</text>
            {glucoseTrend.length > 0 ? (
              <view className='trend-list'>
                {glucoseTrend.map(point => (
                  <view className='trend-row' key={`glucose-${point.timestamp}`}>
                    <text className='trend-time'>{formatTime(point.timestamp)}</text>
                    <text className='trend-value'>{toFixed(point.value, 2)} mmol/L</text>
                  </view>
                ))}
              </view>
            ) : (
              <text className='empty'>No glucose series available.</text>
            )}
          </view>
        ) : null}

        {snapshot ? (
          <view className='card'>
            <text className='section-title'>4. Raw JSON</text>
            <text className='json-block'>{snapshotJson}</text>
          </view>
        ) : null}
      </scroll-view>
    </view>
  );
}
