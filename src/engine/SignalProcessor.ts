/**
 * HeartSync SignalProcessor v2 — Behavioral Robust Engine
 * 
 * Priorities 1-7 implemented here:
 * 1. Smartwatch integration (via smartwatch.ts)
 * 2. Hybrid baseline (resting_hr + session_mean)
 * 3. Learning phase (60-120s)
 * 4. Context filter
 * 5. Contextual z-score with drift detection
 * 6. Reason codes + decision tree
 * 7. Complete logging
 */

import type {
  SmartWatchData, Baseline, SessionState, ContextData,
  ReadingLog, Decision, ReasonCode, EngineConfig, Phase
} from './types';
import { DEFAULT_CONFIG } from './types';
import { log, logReading } from './logger';

// ─── Session Initialization ───

export function createSession(watchData: SmartWatchData, config: EngineConfig = DEFAULT_CONFIG): SessionState {
  const resting_hr = watchData.resting_hr;
  const resting_hr_std = watchData.std_resting_hr ?? 6.5; // default 5-8 range

  log('SESSION_INIT', {
    resting_hr,
    resting_hr_std,
    source: watchData.source,
    baseline_mean_initial: resting_hr,
    baseline_std_initial: resting_hr_std,
  });

  const now = Date.now();

  return {
    phase: 'learning',
    baseline: {
      resting_hr,
      resting_hr_std,
      session_mean: 0,
      session_std: 0,
      session_count: 0,
      session_m2: 0,
      combined_mean: resting_hr,
      combined_std: Math.max(resting_hr_std, config.min_std_clamp),
      session_start_time: now,
    },
    readings_count: 0,
    learning_start_time: now,
    learning_readings: [],
    phase_changed_at: null,
  };
}

// ─── Hybrid Baseline (Priority 2) ───

function computeRestingWeight(session: SessionState, config: EngineConfig): number {
  const elapsed = (Date.now() - session.learning_start_time) / 1000;
  const t = Math.min(elapsed / config.weight_transition_sec, 1);
  // Linear interpolation from initial (high resting weight) to final (low resting weight)
  return config.resting_weight_initial + (config.resting_weight_final - config.resting_weight_initial) * t;
}

function updateSessionStats(baseline: Baseline, bpm: number): void {
  baseline.session_count += 1;
  const n = baseline.session_count;
  const delta = bpm - baseline.session_mean;
  baseline.session_mean += delta / n;
  const delta2 = bpm - baseline.session_mean;
  baseline.session_m2 += delta * delta2;
  if (n >= 2) {
    baseline.session_std = Math.sqrt(baseline.session_m2 / (n - 1));
  }
}

function updateCombinedBaseline(session: SessionState, config: EngineConfig): void {
  const b = session.baseline;
  const w = computeRestingWeight(session, config);

  if (b.session_count < 2) {
    b.combined_mean = b.resting_hr;
    b.combined_std = Math.max(b.resting_hr_std, config.min_std_clamp);
    return;
  }

  b.combined_mean = w * b.resting_hr + (1 - w) * b.session_mean;
  const raw_std = w * b.resting_hr_std + (1 - w) * b.session_std;
  b.combined_std = Math.max(raw_std, config.min_std_clamp);
}

// ─── Context Filter (Priority 4) ───

function validateContext(ctx: ContextData, config: EngineConfig): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!ctx.app_in_foreground) reasons.push('APP_NOT_FOREGROUND');
  if (!ctx.in_discovery_screen) reasons.push('NOT_DISCOVERY_SCREEN');
  if (ctx.signal_quality < config.signal_quality_threshold) reasons.push('LOW_SIGNAL_QUALITY');
  if (ctx.accelerometer_magnitude !== undefined && ctx.accelerometer_magnitude > config.accelerometer_threshold) {
    reasons.push('MOVEMENT_DETECTED');
  }
  return { valid: reasons.length === 0, reasons };
}

// ─── Variance Check ───

function computeVariance(readings: number[]): number {
  if (readings.length < 2) return 0;
  const mean = readings.reduce((s, v) => s + v, 0) / readings.length;
  return readings.reduce((s, v) => s + (v - mean) ** 2, 0) / (readings.length - 1);
}

// ─── Learning Phase Check (Priority 3) ───

function checkLearningPhase(session: SessionState, config: EngineConfig): boolean {
  const elapsed = (Date.now() - session.learning_start_time) / 1000;
  const hasEnoughTime = elapsed >= config.learning_duration_sec;
  const hasEnoughReadings = session.readings_count >= config.learning_min_readings;

  if (hasEnoughTime && hasEnoughReadings && session.phase === 'learning') {
    session.phase = 'active';
    session.phase_changed_at = Date.now();
    log('PHASE_CHANGE', {
      from: 'learning',
      to: 'active',
      elapsed_sec: elapsed,
      readings: session.readings_count,
      baseline_mean: session.baseline.combined_mean,
      baseline_std: session.baseline.combined_std,
    });
    return true;
  }

  return session.phase === 'active';
}

// ─── Z-Score (Priority 5) ───

function computeZScore(bpm: number, baseline_mean: number, baseline_std: number, min_std: number): number {
  const clamped = Math.max(baseline_std, min_std);
  return (bpm - baseline_mean) / clamped;
}

function checkBaselineDrift(session: SessionState, config: EngineConfig): boolean {
  const drift = Math.abs(session.baseline.combined_mean - session.baseline.resting_hr);
  if (drift > config.baseline_drift_threshold) {
    log('BASELINE_DRIFT_DETECTED', {
      combined_mean: session.baseline.combined_mean,
      resting_hr: session.baseline.resting_hr,
      drift,
      threshold: config.baseline_drift_threshold,
    }, 'WARN');
    return true;
  }
  return false;
}

// ─── Main Processing Function (Priority 6 Decision Tree) ───

export function processReading(
  bpm: number,
  session: SessionState,
  context: ContextData,
  config: EngineConfig = DEFAULT_CONFIG
): ReadingLog {
  const b = session.baseline;

  // Step 1: Context filter
  const ctxResult = validateContext(context, config);
  if (!ctxResult.valid) {
    const reading: ReadingLog = {
      bpm, resting_hr: b.resting_hr,
      baseline_mean: b.combined_mean, baseline_std: b.combined_std,
      z_score: null, phase: session.phase,
      decision: 'REJECTED', reason_code: 'REJECTED_CONTEXT_INVALID',
      timestamp: Date.now(), context,
    };
    logReading(reading);
    return reading;
  }

  // Step 2: BPM too high
  if (bpm >= config.max_bpm) {
    const reading: ReadingLog = {
      bpm, resting_hr: b.resting_hr,
      baseline_mean: b.combined_mean, baseline_std: b.combined_std,
      z_score: null, phase: session.phase,
      decision: 'REJECTED', reason_code: 'REJECTED_BPM_TOO_HIGH',
      timestamp: Date.now(), context,
    };
    logReading(reading);
    return reading;
  }

  // Step 3: Update session stats (Welford)
  updateSessionStats(b, bpm);
  updateCombinedBaseline(session, config);
  session.readings_count += 1;
  session.learning_readings.push(bpm);

  // Keep only last N readings for variance check
  if (session.learning_readings.length > config.variance_window_size) {
    session.learning_readings = session.learning_readings.slice(-config.variance_window_size);
  }

  // Step 4: Learning phase
  const isActive = checkLearningPhase(session, config);
  if (!isActive) {
    const reading: ReadingLog = {
      bpm, resting_hr: b.resting_hr,
      baseline_mean: b.combined_mean, baseline_std: b.combined_std,
      z_score: null, phase: 'learning',
      decision: 'REJECTED', reason_code: 'REJECTED_LEARNING_PHASE',
      timestamp: Date.now(), context,
    };
    logReading(reading);
    return reading;
  }

  // Step 5: Check baseline drift
  const drifted = checkBaselineDrift(session, config);
  if (drifted) {
    // Don't reject outright, but flag instability
    const variance = computeVariance(session.learning_readings);
    if (variance > config.variance_threshold * 2) {
      const reading: ReadingLog = {
        bpm, resting_hr: b.resting_hr,
        baseline_mean: b.combined_mean, baseline_std: b.combined_std,
        z_score: null, phase: session.phase,
        decision: 'REJECTED', reason_code: 'REJECTED_BASELINE_UNSTABLE',
        timestamp: Date.now(), context,
      };
      logReading(reading);
      return reading;
    }
  }

  // Step 6: Variance / noise check
  const recentVariance = computeVariance(session.learning_readings);
  if (recentVariance > config.variance_threshold) {
    const reading: ReadingLog = {
      bpm, resting_hr: b.resting_hr,
      baseline_mean: b.combined_mean, baseline_std: b.combined_std,
      z_score: null, phase: session.phase,
      decision: 'REJECTED', reason_code: 'REJECTED_NOISE',
      timestamp: Date.now(), context,
    };
    logReading(reading);
    return reading;
  }

  // Step 7: Compute z-score
  const z = computeZScore(bpm, b.combined_mean, b.combined_std, config.min_std_clamp);

  // Step 8: Decision
  let decision: Decision;
  let reason_code: ReasonCode;

  if (z >= config.strong_z_threshold) {
    decision = 'ACCEPTED';
    reason_code = 'ACCEPTED_STRONG_REACTION';
  } else if (z >= config.z_threshold) {
    decision = 'ACCEPTED';
    reason_code = 'ACCEPTED_VALID_REACTION';
  } else {
    decision = 'REJECTED';
    reason_code = 'REJECTED_LOW_Z_SCORE';
  }

  const reading: ReadingLog = {
    bpm, resting_hr: b.resting_hr,
    baseline_mean: b.combined_mean, baseline_std: b.combined_std,
    z_score: z, phase: session.phase,
    decision, reason_code,
    timestamp: Date.now(), context,
  };
  logReading(reading);
  return reading;
}

// ─── Batch Processing ───

export function processReadings(
  bpmValues: number[],
  session: SessionState,
  context: ContextData,
  config: EngineConfig = DEFAULT_CONFIG
): ReadingLog[] {
  return bpmValues.map(bpm => processReading(bpm, session, context, config));
}
