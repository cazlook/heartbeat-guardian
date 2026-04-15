/**
 * HeartSync Signal Processing Engine - Type Definitions
 */

// ─── Smartwatch Data (Priority 1) ───

export interface SmartWatchData {
  source: 'healthkit' | 'health_connect';
  resting_hr: number;
  resting_hr_history: number[]; // last 7 days
  avg_resting_hr: number;
  std_resting_hr: number | null; // null if not enough data
  retrieved_at: number; // timestamp ms
}

export interface HealthKitPayload {
  restingHeartRate: number;
  restingHeartRateSamples: { value: number; date: string }[];
}

export interface HealthConnectPayload {
  restingHeartRateRecord: { beatsPerMinute: number; time: string }[];
}

// ─── Baseline (Priority 2) ───

export interface Baseline {
  resting_hr: number;
  resting_hr_std: number;
  session_mean: number;
  session_std: number;
  session_count: number;
  session_m2: number; // Welford accumulator
  combined_mean: number;
  combined_std: number;
  session_start_time: number;
}

// ─── Session State (Priority 3) ───

export type Phase = 'learning' | 'active';

export interface SessionState {
  phase: Phase;
  baseline: Baseline;
  readings_count: number;
  learning_start_time: number;
  learning_readings: number[]; // recent window for variance
  recent_bpm_history: number[]; // last N readings for rate-of-change & sustained check
  recent_timestamps: number[]; // timestamps matching recent_bpm_history
  sustained_above_start: number | null; // timestamp when z first exceeded threshold
  phase_changed_at: number | null;
}

// ─── Context Filter (Priority 4) ───

export interface ContextData {
  app_in_foreground: boolean;
  in_discovery_screen: boolean;
  signal_quality: number; // 0-1
  accelerometer_magnitude?: number; // optional, m/s²
}

// ─── Decision (Priority 6) ───

export type ReasonCode =
  | 'REJECTED_LEARNING_PHASE'
  | 'REJECTED_CONTEXT_INVALID'
  | 'REJECTED_BASELINE_UNSTABLE'
  | 'REJECTED_LOW_Z_SCORE'
  | 'REJECTED_NOISE'
  | 'REJECTED_BPM_TOO_HIGH'
  | 'REJECTED_RATE_OF_CHANGE'
  | 'REJECTED_NOT_SUSTAINED'
  | 'REJECTED_NO_ACCEL_LOW_CONFIDENCE'
  | 'ACCEPTED_VALID_REACTION'
  | 'ACCEPTED_STRONG_REACTION';

export type Decision = 'ACCEPTED' | 'REJECTED';

// ─── Reading Log (Priority 7) ───

export interface ReadingLog {
  bpm: number;
  resting_hr: number;
  baseline_mean: number;
  baseline_std: number;
  z_score: number | null;
  phase: Phase;
  decision: Decision;
  reason_code: ReasonCode;
  timestamp: number;
  context?: ContextData;
}

// ─── Engine Config ───

export interface EngineConfig {
  z_threshold: number;
  strong_z_threshold: number;
  min_std_clamp: number;
  max_bpm: number;
  signal_quality_threshold: number;
  variance_window_size: number;
  variance_threshold: number;
  learning_duration_sec: number;
  learning_min_readings: number;
  baseline_drift_threshold: number;
  accelerometer_threshold: number;
  // Hybrid baseline weights
  resting_weight_initial: number;
  resting_weight_final: number;
  weight_transition_sec: number;
  // Anti-false-positive filters
  rate_of_change_max: number;        // max Δbpm per reading before rejection
  rate_of_change_window: number;     // how many recent readings to check
  sustained_duration_sec: number;    // min seconds z must stay above threshold
  sustained_min_readings: number;    // min consecutive readings above threshold
  no_accel_z_penalty: number;        // raise z_threshold by this when no accelerometer
  no_accel_sustained_multiplier: number; // multiply sustained requirements when no accel
  recent_history_size: number;       // size of recent_bpm_history buffer
}

export const DEFAULT_CONFIG: EngineConfig = {
  z_threshold: 1.5,
  strong_z_threshold: 2.5,
  min_std_clamp: 3,
  max_bpm: 120,
  signal_quality_threshold: 0.5,
  variance_window_size: 10,
  variance_threshold: 4,
  learning_duration_sec: 90,
  learning_min_readings: 40,
  baseline_drift_threshold: 15,
  accelerometer_threshold: 1.5,
  resting_weight_initial: 0.9,
  resting_weight_final: 0.2,
  weight_transition_sec: 150,
  // Anti-false-positive
  rate_of_change_max: 5,          // reject if |Δbpm| > 5 in recent window
  rate_of_change_window: 3,       // check last 3 readings
  sustained_duration_sec: 8,      // must hold for 8 seconds
  sustained_min_readings: 4,      // at least 4 consecutive readings above threshold
  no_accel_z_penalty: 1.0,        // +1.0 to z_threshold when no accelerometer data
  no_accel_sustained_multiplier: 3.0, // multiply sustained requirements when no accel
  recent_history_size: 20,        // keep last 20 readings
};
