/**
 * Unified Health Bridge
 *
 * Detects platform (iOS / Android / Web) and reads resting heart rate
 * from HealthKit or Health Connect, then converts it into the engine's
 * SmartWatchData format via the existing parsers.
 *
 * Privacy: only aggregated values are kept (avg, std, last 7 days numeric
 * series). No timestamps, no raw HK objects, no user identifiers.
 */

import { Capacitor } from '@capacitor/core';
import type { SmartWatchData } from './types';
import { parseHealthKit, parseHealthConnect } from './smartwatch';
import { log } from './logger';

export type HealthPermissionStatus = 'granted' | 'denied' | 'unavailable';

export interface HealthBridgeResult {
  status: HealthPermissionStatus;
  data: SmartWatchData | null;
  error?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// ─── iOS / HealthKit ───
async function readHealthKit(): Promise<HealthBridgeResult> {
  try {
    const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');

    const READ = ['restingHeartRate', 'heartRate'] as const;

    await CapacitorHealthkit.requestAuthorization({
      all: [],
      read: READ as unknown as string[],
      write: [],
    });

    const end = new Date();
    const start = new Date(end.getTime() - SEVEN_DAYS_MS);

    // Try resting HR first
    let samples: { value: number; date: string }[] = [];
    try {
      const resp = await CapacitorHealthkit.queryHKitSampleType<any>({
        sampleName: 'restingHeartRate',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 50,
      });
      samples = (resp?.resultData ?? []).map((s: any) => ({
        value: s.value ?? s.averageHeartRate ?? 0,
        date: s.startDate ?? s.endDate ?? '',
      }));
    } catch (e) {
      log('HEALTHKIT_RESTING_HR_FAIL', { error: String(e) });
    }

    // Fallback: average heart rate samples
    if (samples.length === 0) {
      const resp = await CapacitorHealthkit.queryHKitSampleType<any>({
        sampleName: 'heartRate',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: 200,
      });
      samples = (resp?.resultData ?? []).map((s: any) => ({
        value: s.value ?? 0,
        date: s.startDate ?? '',
      }));
      log('HEALTHKIT_FALLBACK_HEART_RATE', { count: samples.length });
    }

    if (samples.length === 0) {
      return { status: 'denied', data: null, error: 'No heart rate samples available' };
    }

    const valid = samples.filter(s => s.value > 30 && s.value < 200);
    const restingHr = valid.reduce((s, x) => s + x.value, 0) / valid.length;

    const data = parseHealthKit({
      restingHeartRate: restingHr,
      restingHeartRateSamples: valid,
    });

    return { status: 'granted', data };
  } catch (err) {
    return { status: 'denied', data: null, error: String(err) };
  }
}

// ─── Android / Health Connect ───
async function readHealthConnect(): Promise<HealthBridgeResult> {
  try {
    const HC: any = await import('capacitor-health-connect');
    const Plugin = HC.HealthConnect ?? HC.default;

    const availability = await Plugin.checkAvailability();
    if (availability?.availability !== 'Available') {
      return { status: 'unavailable', data: null, error: 'Health Connect not installed' };
    }

    const granted = await Plugin.requestHealthPermissions({
      read: ['RestingHeartRate', 'HeartRate'],
      write: [],
    });
    if (!granted?.grantedPermissions?.length) {
      return { status: 'denied', data: null, error: 'Permissions denied' };
    }

    const end = new Date();
    const start = new Date(end.getTime() - SEVEN_DAYS_MS);
    const timeRange = { type: 'between', startTime: start.toISOString(), endTime: end.toISOString() };

    let records: { beatsPerMinute: number; time: string }[] = [];
    try {
      const resp = await Plugin.readRecords({ type: 'RestingHeartRate', timeRangeFilter: timeRange });
      records = (resp?.records ?? []).map((r: any) => ({
        beatsPerMinute: r.beatsPerMinute ?? r.bpm ?? 0,
        time: r.time ?? '',
      }));
    } catch (e) {
      log('HC_RESTING_FAIL', { error: String(e) });
    }

    // Fallback: derive from HeartRate samples
    if (records.length === 0) {
      const resp = await Plugin.readRecords({ type: 'HeartRate', timeRangeFilter: timeRange });
      const all: number[] = [];
      for (const r of resp?.records ?? []) {
        for (const s of r.samples ?? []) {
          if (typeof s.beatsPerMinute === 'number') all.push(s.beatsPerMinute);
        }
      }
      records = all.map(bpm => ({ beatsPerMinute: bpm, time: '' }));
      log('HC_FALLBACK_HEART_RATE', { count: records.length });
    }

    if (records.length === 0) {
      return { status: 'denied', data: null, error: 'No heart rate records' };
    }

    const data = parseHealthConnect({ restingHeartRateRecord: records });
    return { status: 'granted', data };
  } catch (err) {
    return { status: 'denied', data: null, error: String(err) };
  }
}

// ─── Public API ───
export async function readSmartWatch(): Promise<HealthBridgeResult> {
  const platform = Capacitor.getPlatform();
  log('HEALTH_BRIDGE_REQUEST', { platform });

  if (platform === 'ios') return readHealthKit();
  if (platform === 'android') return readHealthConnect();

  return {
    status: 'unavailable',
    data: null,
    error: 'Smartwatch data only available on iOS or Android native builds',
  };
}

export function isHealthAvailable(): boolean {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android';
}

/**
 * Read RestingHeartRate from Health Connect over the last 3 days, to use
 * as the engine's initial baseline. Falls back to HeartRate samples if the
 * RestingHeartRate stream is empty. Web → unavailable.
 */
export async function readRestingHrLast3Days(): Promise<HealthBridgeResult> {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android') {
    if (platform === 'ios') return readHealthKit();
    return { status: 'unavailable', data: null, error: 'Native build required' };
  }

  try {
    const HC: any = await import('capacitor-health-connect');
    const Plugin = HC.HealthConnect ?? HC.default;

    const availability = await Plugin.checkAvailability();
    if (availability?.availability !== 'Available') {
      return { status: 'unavailable', data: null, error: 'Health Connect not installed' };
    }

    const granted = await Plugin.requestHealthPermissions({
      read: ['RestingHeartRate', 'HeartRate'],
      write: [],
    });
    if (!granted?.grantedPermissions?.length) {
      return { status: 'denied', data: null, error: 'Permissions denied' };
    }

    const end = new Date();
    const start = new Date(end.getTime() - THREE_DAYS_MS);
    const timeRange = { type: 'between', startTime: start.toISOString(), endTime: end.toISOString() };

    let records: { beatsPerMinute: number; time: string }[] = [];
    try {
      const resp = await Plugin.readRecords({ type: 'RestingHeartRate', timeRangeFilter: timeRange });
      records = (resp?.records ?? []).map((r: any) => ({
        beatsPerMinute: r.beatsPerMinute ?? r.bpm ?? 0,
        time: r.time ?? '',
      }));
    } catch (e) {
      log('HC_RESTING_3D_FAIL', { error: String(e) });
    }

    if (records.length === 0) {
      const resp = await Plugin.readRecords({ type: 'HeartRate', timeRangeFilter: timeRange });
      const all: number[] = [];
      for (const r of resp?.records ?? []) {
        for (const s of r.samples ?? []) {
          if (typeof s.beatsPerMinute === 'number') all.push(s.beatsPerMinute);
        }
      }
      records = all.map(bpm => ({ beatsPerMinute: bpm, time: '' }));
    }

    if (records.length === 0) {
      return { status: 'denied', data: null, error: 'No heart rate samples in last 3 days' };
    }

    const data = parseHealthConnect({ restingHeartRateRecord: records });
    log('HC_BASELINE_3D', { samples: records.length, mean: data.avg_resting_hr, std: data.std_resting_hr });
    return { status: 'granted', data };
  } catch (err) {
    return { status: 'denied', data: null, error: String(err) };
  }
}
