/**
 * Session Recorder — captures a full validation session for later analysis.
 *
 * Persists to localStorage and exports a JSON file containing:
 * - meta: device, source, started_at, ended_at, config
 * - hr_samples: every live HR sample with latency
 * - readings: every engine ReadingLog (decision + reason + baseline snapshot)
 * - phase_events: phase changes
 * - notes: free-text user annotations
 */

import type { ReadingLog, EngineConfig, SessionState } from './types';
import type { LiveHrSample } from './heartRatePoller';

export interface SessionMeta {
  id: string;
  started_at: number;
  ended_at: number | null;
  platform: string;
  source?: string;
  resting_hr?: number;
  config: EngineConfig;
  scenario?: string; // 'rest' | 'walk' | 'discovery' | custom
  notes?: string;
}

export interface PhaseEvent {
  at: number;
  phase: string;
}

export interface RecordedSession {
  meta: SessionMeta;
  hr_samples: LiveHrSample[];
  readings: ReadingLog[];
  phase_events: PhaseEvent[];
}

const STORAGE_KEY = 'heartsync.sessions';
const MAX_SESSIONS = 20;

export class SessionRecorder {
  private session: RecordedSession;
  private lastPhase: string;

  constructor(meta: Omit<SessionMeta, 'id' | 'started_at' | 'ended_at'>, initialPhase: string) {
    this.session = {
      meta: {
        ...meta,
        id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        started_at: Date.now(),
        ended_at: null,
      },
      hr_samples: [],
      readings: [],
      phase_events: [{ at: Date.now(), phase: initialPhase }],
    };
    this.lastPhase = initialPhase;
  }

  setScenario(scenario: string) { this.session.meta.scenario = scenario; this.persist(); }
  setNotes(notes: string) { this.session.meta.notes = notes; this.persist(); }

  recordSample(s: LiveHrSample) {
    this.session.hr_samples.push(s);
    this.persist();
  }

  recordReading(r: ReadingLog, sessionState: SessionState) {
    this.session.readings.push(r);
    if (sessionState.phase !== this.lastPhase) {
      this.session.phase_events.push({ at: Date.now(), phase: sessionState.phase });
      this.lastPhase = sessionState.phase;
    }
    this.persist();
  }

  finalize() {
    this.session.meta.ended_at = Date.now();
    this.persist();
    return this.session;
  }

  get(): RecordedSession { return this.session; }

  // ─── Aggregate stats ───
  stats() {
    const samples = this.session.hr_samples;
    const readings = this.session.readings;
    const accepted = readings.filter(r => r.decision === 'ACCEPTED').length;
    const rejected = readings.length - accepted;
    const reasons: Record<string, number> = {};
    for (const r of readings) reasons[r.reason_code] = (reasons[r.reason_code] ?? 0) + 1;

    let avgLatency = 0, avgIntervalMs = 0;
    if (samples.length > 0) {
      avgLatency = samples.reduce((s, x) => s + x.latencyMs, 0) / samples.length;
    }
    if (samples.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < samples.length; i++) intervals.push(samples[i].receivedAt - samples[i - 1].receivedAt);
      avgIntervalMs = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    }
    return {
      sample_count: samples.length,
      reading_count: readings.length,
      accepted,
      rejected,
      reasons,
      avg_latency_ms: Math.round(avgLatency),
      avg_interval_ms: Math.round(avgIntervalMs),
      effective_hz: avgIntervalMs > 0 ? +(1000 / avgIntervalMs).toFixed(2) : 0,
      duration_sec: Math.round(((this.session.meta.ended_at ?? Date.now()) - this.session.meta.started_at) / 1000),
    };
  }

  private persist() {
    try {
      const all = SessionRecorder.listAll();
      const idx = all.findIndex(s => s.meta.id === this.session.meta.id);
      if (idx >= 0) all[idx] = this.session;
      else all.unshift(this.session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_SESSIONS)));
    } catch {
      // quota exceeded → drop oldest
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([this.session]));
      } catch { /* give up silently */ }
    }
  }

  static listAll(): RecordedSession[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  static clearAll() { localStorage.removeItem(STORAGE_KEY); }

  static exportAsJson(session: RecordedSession): string {
    return JSON.stringify(session, null, 2);
  }

  static download(session: RecordedSession) {
    const blob = new Blob([SessionRecorder.exportAsJson(session)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.meta.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
