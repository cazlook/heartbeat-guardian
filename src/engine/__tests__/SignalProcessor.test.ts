/**
 * Priority 8 — Realistic Test Scenarios
 * 
 * Each test simulates a real-world scenario with:
 * - Input description
 * - Expected output (decision + reason_code)
 * - Full log verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, processReading } from '../SignalProcessor';
import { parseHealthKit } from '../smartwatch';
import { clearLogBuffer, getLogBuffer } from '../logger';
import type { SmartWatchData, SessionState, ContextData, EngineConfig } from '../types';
import { DEFAULT_CONFIG } from '../types';

// Helper: create valid context
const validContext: ContextData = {
  app_in_foreground: true,
  in_discovery_screen: true,
  signal_quality: 0.9,
};

// Helper: create watch data with specific resting HR
function makeWatchData(resting_hr: number, std?: number): SmartWatchData {
  return {
    source: 'healthkit',
    resting_hr,
    resting_hr_history: [resting_hr - 2, resting_hr - 1, resting_hr, resting_hr + 1, resting_hr + 2, resting_hr, resting_hr - 1],
    avg_resting_hr: resting_hr,
    std_resting_hr: std ?? 3.5,
    retrieved_at: Date.now(),
  };
}

// Helper: fast config for testing (shorter learning phase)
const testConfig: EngineConfig = {
  ...DEFAULT_CONFIG,
  learning_duration_sec: 2, // 2s for testing
  learning_min_readings: 5,
  weight_transition_sec: 10,
};

// Helper: advance session past learning phase
function advancePastLearning(session: SessionState, bpm: number = 70) {
  // Manually set time back and add readings
  session.learning_start_time = Date.now() - 10000; // 10s ago
  for (let i = 0; i < 10; i++) {
    processReading(bpm, session, validContext, testConfig);
  }
}

describe('SignalProcessor v2', () => {
  beforeEach(() => {
    clearLogBuffer();
  });

  // ─── Scenario 1: REST NORMAL → No reaction ───
  describe('Scenario: REST NORMAL', () => {
    it('should produce no accepted reactions during calm state', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session, 68);

      // Normal resting readings around baseline
      const readings = [67, 69, 68, 70, 67, 69, 68];
      const results = readings.map(bpm => processReading(bpm, session, validContext, testConfig));

      const accepted = results.filter(r => r.decision === 'ACCEPTED');
      expect(accepted.length).toBe(0);

      // All should be REJECTED_LOW_Z_SCORE
      results.forEach(r => {
        expect(r.decision).toBe('REJECTED');
        expect(r.reason_code).toBe('REJECTED_LOW_Z_SCORE');
        expect(r.phase).toBe('active');
        // Verify complete log fields
        expect(r.bpm).toBeDefined();
        expect(r.resting_hr).toBe(68);
        expect(r.baseline_mean).toBeDefined();
        expect(r.baseline_std).toBeDefined();
        expect(r.z_score).toBeDefined();
      });
    });
  });

  // ─── Scenario 2: REAL ATTRACTION → Progressive stable increase → ACCEPTED ───
  describe('Scenario: REAL ATTRACTION', () => {
    it('should accept a gradual stable heart rate increase', () => {
      const watchData = makeWatchData(68, 3);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session, 68);

      // Gradual increase simulating genuine attraction
      // Need to be above baseline + z_threshold * std
      // baseline ~68, std ~3, so need bpm > 68 + 1.5*3 = 72.5
      // Use stable elevated readings
      const attractionReadings = [73, 74, 74, 75, 75, 74, 75, 74];
      const results = attractionReadings.map(bpm => processReading(bpm, session, validContext, testConfig));

      const accepted = results.filter(r => r.decision === 'ACCEPTED');
      expect(accepted.length).toBeGreaterThan(0);

      accepted.forEach(r => {
        expect(['ACCEPTED_VALID_REACTION', 'ACCEPTED_STRONG_REACTION']).toContain(r.reason_code);
        expect(r.z_score).not.toBeNull();
        expect(r.z_score!).toBeGreaterThanOrEqual(testConfig.z_threshold);
      });
    });
  });

  // ─── Scenario 3: CAFFEINE / STRESS → Rapid unstable increase → REJECTED ───
  describe('Scenario: CAFFEINE / STRESS', () => {
    it('should reject rapid unstable heart rate spikes', () => {
      const watchData = makeWatchData(68, 3);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session, 68);

      // Rapid, unstable increase — high variance
      const stressReadings = [75, 82, 70, 88, 72, 90, 68, 85];
      const results = stressReadings.map(bpm => processReading(bpm, session, validContext, testConfig));

      // Most should be REJECTED_NOISE due to high variance
      const noiseRejected = results.filter(r => r.reason_code === 'REJECTED_NOISE');
      expect(noiseRejected.length).toBeGreaterThan(0);
    });
  });

  // ─── Scenario 4: MOVEMENT → BPM high + variable → REJECTED ───
  describe('Scenario: MOVEMENT', () => {
    it('should reject readings during movement (accelerometer)', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session);

      const movementContext: ContextData = {
        app_in_foreground: true,
        in_discovery_screen: true,
        signal_quality: 0.8,
        accelerometer_magnitude: 3.0, // high movement
      };

      const result = processReading(80, session, movementContext, testConfig);
      expect(result.decision).toBe('REJECTED');
      expect(result.reason_code).toBe('REJECTED_CONTEXT_INVALID');
    });

    it('should reject BPM >= 120', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session);

      const result = processReading(125, session, validContext, testConfig);
      expect(result.decision).toBe('REJECTED');
      expect(result.reason_code).toBe('REJECTED_BPM_TOO_HIGH');
    });
  });

  // ─── Scenario 5: BASELINE SHIFT → Context change → Adaptation ───
  describe('Scenario: BASELINE SHIFT', () => {
    it('should adapt baseline when user context changes', () => {
      const watchData = makeWatchData(68, 3);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session, 68);

      // User moves to slightly higher resting state (e.g., stood up)
      // Feed readings at 75 consistently — baseline should adapt
      const shiftedReadings = Array(20).fill(75);
      shiftedReadings.forEach(bpm => processReading(bpm, session, validContext, testConfig));

      // After adaptation, baseline_mean should have moved toward 75
      expect(session.baseline.session_mean).toBeGreaterThan(72);

      // Now a reading at 76 should NOT trigger a strong reaction
      const result = processReading(76, session, validContext, testConfig);
      // The combined baseline will have shifted, so z-score should be lower
      expect(result.z_score).toBeDefined();
    });
  });

  // ─── Learning Phase Tests ───
  describe('Learning Phase', () => {
    it('should reject all readings during learning phase', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      // Don't advance past learning

      // Force fresh session (recent start)
      session.learning_start_time = Date.now();
      session.readings_count = 0;

      const result = processReading(80, session, validContext, testConfig);
      expect(result.decision).toBe('REJECTED');
      expect(result.reason_code).toBe('REJECTED_LEARNING_PHASE');
      expect(result.phase).toBe('learning');
    });

    it('should transition to active after enough time and readings', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session, 68);

      expect(session.phase).toBe('active');

      const logs = getLogBuffer();
      const phaseChange = logs.find(l => l.tag === 'PHASE_CHANGE');
      expect(phaseChange).toBeDefined();
    });
  });

  // ─── Context Filter Tests ───
  describe('Context Filter', () => {
    it('should reject when app not in foreground', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session);

      const ctx: ContextData = { ...validContext, app_in_foreground: false };
      const result = processReading(80, session, ctx, testConfig);
      expect(result.reason_code).toBe('REJECTED_CONTEXT_INVALID');
    });

    it('should reject when not in discovery screen', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session);

      const ctx: ContextData = { ...validContext, in_discovery_screen: false };
      const result = processReading(80, session, ctx, testConfig);
      expect(result.reason_code).toBe('REJECTED_CONTEXT_INVALID');
    });

    it('should reject low signal quality', () => {
      const watchData = makeWatchData(68);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session);

      const ctx: ContextData = { ...validContext, signal_quality: 0.2 };
      const result = processReading(80, session, ctx, testConfig);
      expect(result.reason_code).toBe('REJECTED_CONTEXT_INVALID');
    });
  });

  // ─── Smartwatch Parsing ───
  describe('Smartwatch Data Parsing', () => {
    it('should parse HealthKit data correctly', () => {
      const data = parseHealthKit({
        restingHeartRate: 65,
        restingHeartRateSamples: [
          { value: 64, date: '2026-04-08' },
          { value: 66, date: '2026-04-09' },
          { value: 65, date: '2026-04-10' },
          { value: 63, date: '2026-04-11' },
          { value: 67, date: '2026-04-12' },
          { value: 65, date: '2026-04-13' },
          { value: 64, date: '2026-04-14' },
        ],
      });

      expect(data.resting_hr).toBe(65);
      expect(data.source).toBe('healthkit');
      expect(data.resting_hr_history).toHaveLength(7);
      expect(data.avg_resting_hr).toBeCloseTo(64.86, 1);
      expect(data.std_resting_hr).toBeGreaterThan(0);
    });

    it('should reject empty HealthKit samples', () => {
      expect(() => parseHealthKit({
        restingHeartRate: 65,
        restingHeartRateSamples: [],
      })).toThrow();
    });
  });

  // ─── Baseline Drift Detection ───
  describe('Baseline Drift', () => {
    it('should log BASELINE_DRIFT_DETECTED when baseline diverges from resting_hr', () => {
      const watchData = makeWatchData(65, 3);
      const config = { ...testConfig, baseline_drift_threshold: 10 };
      const session = createSession(watchData, config);
      advancePastLearning(session, 65);

      clearLogBuffer();

      // Force session mean far from resting_hr
      session.baseline.session_mean = 82;
      session.baseline.combined_mean = 80;

      processReading(78, session, validContext, config);

      const logs = getLogBuffer();
      const driftLog = logs.find(l => l.tag === 'BASELINE_DRIFT_DETECTED');
      expect(driftLog).toBeDefined();
    });
  });

  // ─── Complete Log Structure (Priority 7) ───
  describe('Complete Logging', () => {
    it('should include all required fields in every reading log', () => {
      const watchData = makeWatchData(70);
      const session = createSession(watchData, testConfig);
      advancePastLearning(session, 70);

      const result = processReading(72, session, validContext, testConfig);

      expect(result).toMatchObject({
        bpm: 72,
        resting_hr: 70,
        phase: 'active',
        decision: expect.stringMatching(/^(ACCEPTED|REJECTED)$/),
        reason_code: expect.any(String),
        timestamp: expect.any(Number),
      });
      expect(result.baseline_mean).toBeDefined();
      expect(result.baseline_std).toBeDefined();
    });
  });
});
