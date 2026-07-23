/**
 * HeartSync SignalProcessor v3.1 — Anti-False-Positive + Resonance Engine
 *
 * v3 additions over v2:
 * - Rate-of-change filter (rejects postural spikes)
 * - Sustained duration check (z must hold for N seconds)
 * - Accelerometer requirement (raises z threshold when absent)
 * - New reason codes: REJECTED_RATE_OF_CHANGE, REJECTED_NOT_SUSTAINED, REJECTED_NO_ACCEL_LOW_CONFIDENCE
 *
 * v3.1 additions:
 * - HRV resonance discriminator: when HRV (ms) is present, corroborates real
 *   arousal (resonant) and guards against acute stress/exertion
 *   (REJECTED_STRESS_PATTERN). No HRV ⇒ identical to v3 (backward compatible).
 */

import type {
  SmartWatchData, Baseline, SessionState, ContextData,
  ReadingLog, Decision, ReasonCode, EngineConfig, Phase, ArousalType
} from './types';
import { DEFAULT_CONFIG } from './types';
import { log, logReading } from './logger';

// ─── Helpers ───

function makeReading(
  bpm: number, session: SessionState, z: number | null,
  decision: Decision, reason_code: ReasonCode, context: ContextData,
  extra?: { hrv_ms?: number | null; arousal?: ArousalType | null; resonance?: number | null }
): ReadingLog {
  const b = session.baseline;
  return {
    bpm, resting_hr: b.resting_hr,
    baseline_mean: b.combined_mean, baseline_std: b.combined_std,
    z_score: z, phase: session.phase,
    decision, reason_code, timestamp: Date.now(), context,
    hrv_ms: extra?.hrv_ms ?? (context.hrv_ms ?? null),
    arousal: extra?.arousal ?? null,
    resonance: extra?.resonance ?? null,
  };
}

function reject(bpm: number, session: SessionState, reason: ReasonCode, ctx: ContextData): ReadingLog {
  const r = makeReading(bpm, session, null, 'REJECTED', reason, ctx);
  logReading(r);
  return r;
}

// ─── Session Initialization ───

export function createSession(watchData: SmartWatchData, config: EngineConfig = DEFAULT_CONFIG): SessionState {
  const resting_hr = watchData.resting_hr;
  const resting_hr_std = watchData.std_resting_hr ?? 6.5;

  log('SESSION_INIT', {
    resting_hr, resting_hr_std, source: watchData.source,
    baseline_mean_initial: resting_hr, baseline_std_initial: resting_hr_std,
  });

  const now = Date.now();
  return {
    phase: 'learning',
    baseline: {
      resting_hr, resting_hr_std,
      session_mean: 0, session_std: 0, session_count: 0, session_m2: 0,
      combined_mean: resting_hr,
      combined_std: Math.max(resting_hr_std, config.min_std_clamp),
      session_start_time: now,
      hrv_mean: 0, hrv_std: 0, hrv_count: 0, hrv_m2: 0,
    },
    readings_count: 0,
    learning_start_time: now,
    learning_readings: [],
    recent_bpm_history: [],
    recent_timestamps: [],
    recent_hrv: [],
    sustained_above_start: null,
    phase_changed_at: null,
  };
}

// ─── HRV (Priority: resonance discriminator) ───

function updateHrvStats(baseline: Baseline, hrv: number): void {
  baseline.hrv_count += 1;
  const n = baseline.hrv_count;
  const delta = hrv - baseline.hrv_mean;
  baseline.hrv_mean += delta / n;
  const delta2 = hrv - baseline.hrv_mean;
  baseline.hrv_m2 += delta * delta2;
  if (n >= 2) baseline.hrv_std = Math.sqrt(baseline.hrv_m2 / (n - 1));
}

/**
 * Classify autonomic arousal from HR elevation + HRV behaviour.
 *
 * Honest scope: there is no clinically-proven HRV signature that separates
 * "attraction" from "stress" in a 60s smartwatch window. We use HRV as a
 * corroborating signal (genuine arousal suppresses HRV vs. the personal
 * baseline) and as a guard against acute stress/exertion (an extreme HRV
 * collapse is treated as stress, not resonance). When HRV is unavailable the
 * caller skips this entirely and behaviour is identical to the HR-only engine.
 */
function classifyArousal(
  session: SessionState, hrv: number, z: number, z_thresh: number, config: EngineConfig
): { arousal: ArousalType; resonance: number } {
  const b = session.baseline;
  const dropPct = b.hrv_mean > 0 ? (b.hrv_mean - hrv) / b.hrv_mean : 0;

  // Normalised HR elevation across the accept band (z_thresh → 4.0).
  const zNorm = Math.max(0, Math.min(1, (z - z_thresh) / (4.0 - z_thresh)));
  // Normalised HRV suppression toward the stress threshold.
  const hrvNorm = Math.max(0, Math.min(1, dropPct / config.hrv_stress_drop_pct));

  if (dropPct >= config.hrv_stress_drop_pct) {
    return { arousal: 'stress', resonance: 0 };
  }
  const resonance = Math.max(0, Math.min(1, 0.6 * zNorm + 0.4 * hrvNorm));
  const arousal: ArousalType = dropPct >= config.hrv_resonance_min_drop_pct ? 'resonant' : 'calm';
  return { arousal, resonance };
}

// ─── Hybrid Baseline (Priority 2) ───

function computeRestingWeight(session: SessionState, config: EngineConfig): number {
  const elapsed = (Date.now() - session.learning_start_time) / 1000;
  const t = Math.min(elapsed / config.weight_transition_sec, 1);
  return config.resting_weight_initial + (config.resting_weight_final - config.resting_weight_initial) * t;
}

function updateSessionStats(baseline: Baseline, bpm: number): void {
  baseline.session_count += 1;
  const n = baseline.session_count;
  const delta = bpm - baseline.session_mean;
  baseline.session_mean += delta / n;
  const delta2 = bpm - baseline.session_mean;
  baseline.session_m2 += delta * delta2;
  if (n >= 2) baseline.session_std = Math.sqrt(baseline.session_m2 / (n - 1));
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

// ─── Context Filter ───

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

// ─── Variance ───

function computeVariance(readings: number[]): number {
  if (readings.length < 2) return 0;
  const mean = readings.reduce((s, v) => s + v, 0) / readings.length;
  return readings.reduce((s, v) => s + (v - mean) ** 2, 0) / (readings.length - 1);
}

// ─── Learning Phase ───

function checkLearningPhase(session: SessionState, config: EngineConfig): boolean {
  const elapsed = (Date.now() - session.learning_start_time) / 1000;
  if (elapsed >= config.learning_duration_sec && session.readings_count >= config.learning_min_readings && session.phase === 'learning') {
    session.phase = 'active';
    session.phase_changed_at = Date.now();
    log('PHASE_CHANGE', { from: 'learning', to: 'active', elapsed_sec: elapsed, readings: session.readings_count });
    return true;
  }
  return session.phase === 'active';
}

// ─── Z-Score ───

function computeZScore(bpm: number, mean: number, std: number, min_std: number): number {
  return (bpm - mean) / Math.max(std, min_std);
}

function checkBaselineDrift(session: SessionState, config: EngineConfig): boolean {
  const drift = Math.abs(session.baseline.combined_mean - session.baseline.resting_hr);
  if (drift > config.baseline_drift_threshold) {
    log('BASELINE_DRIFT_DETECTED', { drift, threshold: config.baseline_drift_threshold }, 'WARN');
    return true;
  }
  return false;
}

// ─── NEW: Rate-of-Change Filter ───

function checkRateOfChange(session: SessionState, config: EngineConfig): boolean {
  const hist = session.recent_bpm_history;
  if (hist.length < 2) return false;
  const window = hist.slice(-config.rate_of_change_window);
  for (let i = 1; i < window.length; i++) {
    if (Math.abs(window[i] - window[i - 1]) > config.rate_of_change_max) return true;
  }
  return false;
}

// ─── NEW: Monotonic Climb Detector (physical activity without accel) ───

function isMonotonicClimb(session: SessionState, config: EngineConfig): boolean {
  const hist = session.recent_bpm_history;
  if (hist.length < 8) return false;
  const recent = hist.slice(-8);
  // Check if trend is consistently upward: each 2-reading avg > previous
  let upCount = 0;
  for (let i = 2; i < recent.length; i += 2) {
    const prev = (recent[i - 2] + recent[i - 1]) / 2;
    const curr = (recent[i] + (recent[i + 1] ?? recent[i])) / 2;
    if (curr > prev + 0.5) upCount++;
  }
  // If 3+ out of ~3-4 pairs are climbing, it's monotonic
  return upCount >= 3;
}

// ─── NEW: Sustained Duration Check ───

function checkSustained(session: SessionState, z: number, config: EngineConfig): boolean {
  const now = Date.now();
  const effectiveThreshold = getEffectiveZThreshold(session, config);

  if (z >= effectiveThreshold) {
    if (session.sustained_above_start === null) {
      session.sustained_above_start = now;
    }
    const duration = (now - session.sustained_above_start) / 1000;
    // Count consecutive readings above threshold
    const hist = session.recent_bpm_history;
    const b = session.baseline;
    let consecutive = 0;
    for (let i = hist.length - 1; i >= 0; i--) {
      const zi = computeZScore(hist[i], b.combined_mean, b.combined_std, config.min_std_clamp);
      if (zi >= effectiveThreshold) consecutive++;
      else break;
    }
    return duration >= config.sustained_duration_sec && consecutive >= config.sustained_min_readings;
  } else {
    session.sustained_above_start = null;
    return false;
  }
}

// ─── NEW: Effective Z threshold (raised when no accelerometer) ───

function getEffectiveZThreshold(session: SessionState, config: EngineConfig): number {
  // We check the most recent context — if no accelerometer data available, penalize
  // This is called during decision, so we pass hasAccel separately
  return config.z_threshold;
}

function getEffectiveThresholds(hasAccel: boolean, config: EngineConfig): { z_thresh: number; strong_z_thresh: number } {
  const penalty = hasAccel ? 0 : config.no_accel_z_penalty;
  return {
    z_thresh: config.z_threshold + penalty,
    strong_z_thresh: config.strong_z_threshold + penalty,
  };
}

// ─── Main Processing Function ───

export function processReading(
  bpm: number,
  session: SessionState,
  context: ContextData,
  config: EngineConfig = DEFAULT_CONFIG
): ReadingLog {
  // Step 1: Context filter (discovery screen REQUIRED)
  const ctxResult = validateContext(context, config);
  if (!ctxResult.valid) return reject(bpm, session, 'REJECTED_CONTEXT_INVALID', context);

  // Step 2: BPM cap
  if (bpm >= config.max_bpm) return reject(bpm, session, 'REJECTED_BPM_TOO_HIGH', context);

  // Step 3: Check if we should freeze baseline (z elevated = potential reaction)
  const prelimZ = session.baseline.session_count >= 2
    ? computeZScore(bpm, session.baseline.combined_mean, session.baseline.combined_std, config.min_std_clamp)
    : 0;
  const hasAccelEarly = context.accelerometer_magnitude !== undefined;
  const { z_thresh: earlyThresh } = getEffectiveThresholds(hasAccelEarly, config);
  const baselineFrozen = prelimZ >= earlyThresh && session.phase === 'active';

  // Only update baseline if not frozen (prevent baseline from absorbing a reaction)
  if (!baselineFrozen) {
    updateSessionStats(session.baseline, bpm);
    updateCombinedBaseline(session, config);
    if (config.hrv_enabled && context.hrv_ms !== undefined && context.hrv_ms > 0) {
      updateHrvStats(session.baseline, context.hrv_ms);
    }
  }
  // Track recent HRV regardless of freeze, so the classifier sees the spike.
  if (context.hrv_ms !== undefined && context.hrv_ms > 0) {
    session.recent_hrv.push(context.hrv_ms);
    if (session.recent_hrv.length > config.recent_history_size) {
      session.recent_hrv = session.recent_hrv.slice(-config.recent_history_size);
    }
  }
  session.readings_count += 1;
  session.learning_readings.push(bpm);
  if (session.learning_readings.length > config.variance_window_size) {
    session.learning_readings = session.learning_readings.slice(-config.variance_window_size);
  }

  // Update recent history
  session.recent_bpm_history.push(bpm);
  session.recent_timestamps.push(Date.now());
  if (session.recent_bpm_history.length > config.recent_history_size) {
    session.recent_bpm_history = session.recent_bpm_history.slice(-config.recent_history_size);
    session.recent_timestamps = session.recent_timestamps.slice(-config.recent_history_size);
  }

  // Step 4: Learning phase
  if (!checkLearningPhase(session, config)) return reject(bpm, session, 'REJECTED_LEARNING_PHASE', context);

  // Step 5: Baseline drift + instability
  if (checkBaselineDrift(session, config)) {
    if (computeVariance(session.learning_readings) > config.variance_threshold * 2) {
      return reject(bpm, session, 'REJECTED_BASELINE_UNSTABLE', context);
    }
  }

  // Step 6: Variance / noise
  if (computeVariance(session.learning_readings) > config.variance_threshold) {
    return reject(bpm, session, 'REJECTED_NOISE', context);
  }

  // Step 7: Rate-of-change filter (postural spikes)
  if (checkRateOfChange(session, config)) {
    session.sustained_above_start = null; // reset sustained tracker
    const r = makeReading(bpm, session, null, 'REJECTED', 'REJECTED_RATE_OF_CHANGE', context);
    logReading(r);
    return r;
  }

  // Step 8: Compute z-score
  const b = session.baseline;
  const z = computeZScore(bpm, b.combined_mean, b.combined_std, config.min_std_clamp);

  // Step 9: Determine effective thresholds (penalize if no accelerometer)
  const hasAccel = context.accelerometer_magnitude !== undefined || config.accelerometer_threshold >= 999;
  const { z_thresh, strong_z_thresh } = getEffectiveThresholds(hasAccel, config);

  // Step 10: Below threshold → reject
  if (z < z_thresh) {
    session.sustained_above_start = null;
    const r = makeReading(bpm, session, z, 'REJECTED', 'REJECTED_LOW_Z_SCORE', context);
    logReading(r);
    return r;
  }

  // Step 11: Sustained duration check — z is above threshold, but is it sustained?
  const sustained = checkSustainedWithThreshold(session, z, z_thresh, hasAccel, config);
  if (!sustained) {
    const reason: ReasonCode = hasAccel ? 'REJECTED_NOT_SUSTAINED' : 'REJECTED_NO_ACCEL_LOW_CONFIDENCE';
    const r = makeReading(bpm, session, z, 'REJECTED', reason, context);
    logReading(r);
    return r;
  }

  // Step 11b: Without accelerometer, reject if monotonic climb (likely walking/exercise)
  if (!hasAccel && isMonotonicClimb(session, config)) {
    const r = makeReading(bpm, session, z, 'REJECTED', 'REJECTED_NO_ACCEL_LOW_CONFIDENCE', context);
    logReading(r);
    return r;
  }

  // Step 12: HRV resonance discriminator (only when HRV is available and a
  // short HRV baseline exists; otherwise behaviour is unchanged).
  let arousal: ArousalType | null = null;
  let resonance: number | null = null;
  const hrvReady =
    config.hrv_enabled &&
    context.hrv_ms !== undefined &&
    context.hrv_ms > 0 &&
    session.baseline.hrv_count >= config.hrv_min_baseline_count;

  if (hrvReady) {
    const cls = classifyArousal(session, context.hrv_ms as number, z, z_thresh, config);
    arousal = cls.arousal;
    resonance = cls.resonance;
    if (cls.arousal === 'stress') {
      const r = makeReading(bpm, session, z, 'REJECTED', 'REJECTED_STRESS_PATTERN', context,
        { arousal, resonance });
      logReading(r);
      return r;
    }
  }

  // Step 13: Decision
  const decision: Decision = 'ACCEPTED';
  const reason_code: ReasonCode = z >= strong_z_thresh
    ? 'ACCEPTED_STRONG_REACTION'
    : 'ACCEPTED_VALID_REACTION';

  const reading = makeReading(bpm, session, z, decision, reason_code, context,
    { arousal, resonance });
  logReading(reading);
  return reading;
}

function checkSustainedWithThreshold(session: SessionState, z: number, z_thresh: number, hasAccel: boolean, config: EngineConfig): boolean {
  const now = Date.now();
  const b = session.baseline;
  const mult = hasAccel ? 1 : config.no_accel_sustained_multiplier;
  const reqDuration = config.sustained_duration_sec * mult;
  const reqReadings = Math.ceil(config.sustained_min_readings * mult);

  if (z >= z_thresh) {
    if (session.sustained_above_start === null) {
      session.sustained_above_start = now;
    }
    const duration = (now - session.sustained_above_start) / 1000;
    const hist = session.recent_bpm_history;
    let consecutive = 0;
    for (let i = hist.length - 1; i >= 0; i--) {
      const zi = computeZScore(hist[i], b.combined_mean, b.combined_std, config.min_std_clamp);
      if (zi >= z_thresh) consecutive++;
      else break;
    }
    return duration >= reqDuration && consecutive >= reqReadings;
  } else {
    session.sustained_above_start = null;
    return false;
  }
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
