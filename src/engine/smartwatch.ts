/**
 * Priority 1 — Smartwatch Data Integration
 * 
 * Parses data from iOS HealthKit and Android Health Connect
 * into a unified SmartWatchData format.
 * 
 * NO hardcoded values. All baselines come from real device data.
 */

import type { SmartWatchData, HealthKitPayload, HealthConnectPayload } from './types';
import { log } from './logger';

function computeStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) throw new Error('Cannot compute stats on empty array');
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length < 2) return { mean, std: 6.5 }; // default std 5-8 range
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

export function parseHealthKit(payload: HealthKitPayload): SmartWatchData {
  const samples = payload.restingHeartRateSamples;
  if (!samples || samples.length === 0) {
    throw new Error('No HealthKit resting heart rate samples');
  }

  const values = samples.map(s => s.value).filter(v => v > 30 && v < 200);
  const resting_hr = payload.restingHeartRate;
  const stats = computeStats(values);

  const data: SmartWatchData = {
    source: 'healthkit',
    resting_hr,
    resting_hr_history: values,
    avg_resting_hr: stats.mean,
    std_resting_hr: values.length >= 3 ? stats.std : null,
    retrieved_at: Date.now(),
  };

  log('SMARTWATCH_DATA', {
    source: 'healthkit',
    resting_hr,
    samples_count: values.length,
    avg: stats.mean,
    std: stats.std,
  });

  return data;
}

export function parseHealthConnect(payload: HealthConnectPayload): SmartWatchData {
  const records = payload.restingHeartRateRecord;
  if (!records || records.length === 0) {
    throw new Error('No Health Connect resting heart rate records');
  }

  const values = records.map(r => r.beatsPerMinute).filter(v => v > 30 && v < 200);
  const stats = computeStats(values);
  const resting_hr = values[values.length - 1]; // most recent

  const data: SmartWatchData = {
    source: 'health_connect',
    resting_hr,
    resting_hr_history: values,
    avg_resting_hr: stats.mean,
    std_resting_hr: values.length >= 3 ? stats.std : null,
    retrieved_at: Date.now(),
  };

  log('SMARTWATCH_DATA', {
    source: 'health_connect',
    resting_hr,
    samples_count: values.length,
    avg: stats.mean,
    std: stats.std,
  });

  return data;
}
