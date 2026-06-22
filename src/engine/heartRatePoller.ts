/**
 * Live Heart Rate Poller
 *
 * Polls HealthKit / Health Connect periodically for the most recent heart rate
 * sample, deduplicates by sample timestamp, and emits readings with measured
 * latency (now - sample.date).
 *
 * Notes on plugin limits:
 * - @perfood/capacitor-healthkit: no observer query exposed → polling required.
 * - capacitor-health-connect: no subscription API → polling required.
 * Polling interval defaults to 5s (HealthKit typically batches HR every ~5-10s
 * during active monitoring).
 */

import { Capacitor } from '@capacitor/core';
import { log } from './logger';

export interface LiveHrSample {
  bpm: number;
  sampleTime: number;   // timestamp from the watch
  receivedAt: number;   // when we read it from the OS
  latencyMs: number;    // receivedAt - sampleTime
  source: 'healthkit' | 'health_connect' | 'mock';
  hrvMs?: number;       // heart-rate variability (SDNN/RMSSD, ms) when exposed
}

export type LiveHrListener = (s: LiveHrSample) => void;

export interface PollerOptions {
  intervalMs?: number;  // default 5000
  windowMs?: number;    // how far back to query, default 60000
}

export class HeartRatePoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSampleTime = 0;
  private lastHrvMs: number | undefined = undefined; // latest HRV seen this session
  private listeners = new Set<LiveHrListener>();
  private opts: Required<PollerOptions>;
  private platform = Capacitor.getPlatform();

  constructor(opts: PollerOptions = {}) {
    this.opts = {
      intervalMs: opts.intervalMs ?? 5000,
      windowMs: opts.windowMs ?? 60000,
    };
  }

  on(listener: LiveHrListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) return;
    this.lastSampleTime = Date.now() - this.opts.windowMs;
    log('HR_POLLER_START', { platform: this.platform, intervalMs: this.opts.intervalMs });
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log('HR_POLLER_STOP', {});
    }
  }

  private emit(s: LiveHrSample) {
    this.listeners.forEach(l => {
      try { l(s); } catch (e) { log('HR_LISTENER_ERR', { error: String(e) }, 'ERROR'); }
    });
  }

  private async tick() {
    try {
      // HRV is best-effort: refresh the latest value before reading HR so the
      // emitted sample can carry it. Failures are non-fatal (HR still flows).
      await this.refreshHrv();
      if (this.platform === 'ios') return await this.tickHealthKit();
      if (this.platform === 'android') return await this.tickHealthConnect();
      // web: no real data — emit nothing
    } catch (e) {
      log('HR_POLLER_ERR', { error: String(e) }, 'ERROR');
    }
  }

  /** Best-effort HRV read. Caches the most recent value in `lastHrvMs`. */
  private async refreshHrv() {
    const end = new Date();
    const start = new Date(end.getTime() - this.opts.windowMs);
    try {
      if (this.platform === 'ios') {
        const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');
        const resp = await CapacitorHealthkit.queryHKitSampleType<any>({
          sampleName: 'heartRateVariabilitySDNN',
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          limit: 10,
        });
        const samples = (resp?.resultData ?? []) as any[];
        const latest = samples[samples.length - 1];
        // HealthKit reports SDNN in seconds → convert to ms.
        if (latest?.value != null) this.lastHrvMs = Number(latest.value) * 1000;
      } else if (this.platform === 'android') {
        const HC: any = await import('capacitor-health-connect');
        const Plugin = HC.HealthConnect ?? HC.default;
        const resp = await Plugin.readRecords({
          type: 'HeartRateVariabilityRmssd',
          timeRangeFilter: { type: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
        });
        const records = resp?.records ?? [];
        const latest = records[records.length - 1];
        if (latest?.heartRateVariabilityMillis != null) {
          this.lastHrvMs = Number(latest.heartRateVariabilityMillis);
        }
      }
    } catch {
      // Plugin/device may not expose HRV — leave lastHrvMs as-is.
    }
  }

  private async tickHealthKit() {
    const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');
    const end = new Date();
    const start = new Date(Math.max(this.lastSampleTime, end.getTime() - this.opts.windowMs));
    const resp = await CapacitorHealthkit.queryHKitSampleType<any>({
      sampleName: 'heartRate',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 100,
    });
    const samples = (resp?.resultData ?? []) as any[];
    for (const s of samples) {
      const sampleTime = new Date(s.endDate ?? s.startDate ?? Date.now()).getTime();
      if (sampleTime <= this.lastSampleTime) continue;
      const bpm = Number(s.value ?? 0);
      if (!bpm || bpm < 30 || bpm > 220) continue;
      const now = Date.now();
      const sample: LiveHrSample = {
        bpm, sampleTime, receivedAt: now, latencyMs: now - sampleTime, source: 'healthkit',
        hrvMs: this.lastHrvMs,
      };
      this.lastSampleTime = sampleTime;
      log('HR_SAMPLE', { ...sample });
      this.emit(sample);
    }
  }

  private async tickHealthConnect() {
    const HC: any = await import('capacitor-health-connect');
    const Plugin = HC.HealthConnect ?? HC.default;
    const end = new Date();
    const start = new Date(Math.max(this.lastSampleTime, end.getTime() - this.opts.windowMs));
    const resp = await Plugin.readRecords({
      type: 'HeartRate',
      timeRangeFilter: { type: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
    });
    for (const r of resp?.records ?? []) {
      for (const s of r.samples ?? []) {
        const sampleTime = new Date(s.time ?? Date.now()).getTime();
        if (sampleTime <= this.lastSampleTime) continue;
        const bpm = Number(s.beatsPerMinute ?? 0);
        if (!bpm || bpm < 30 || bpm > 220) continue;
        const now = Date.now();
        const sample: LiveHrSample = {
          bpm, sampleTime, receivedAt: now, latencyMs: now - sampleTime, source: 'health_connect',
          hrvMs: this.lastHrvMs,
        };
        this.lastSampleTime = sampleTime;
        log('HR_SAMPLE', { ...sample });
        this.emit(sample);
      }
    }
  }
}
