/**
 * HeartSync Signal Processing Engine — Public API
 */

export { createSession, processReading, processReadings } from './SignalProcessor';
export { ViewTracker, type ViewWindow, type ViewTrackerOptions } from './viewTracker';
export { parseHealthKit, parseHealthConnect } from './smartwatch';
export { log, logReading, getLogBuffer, clearLogBuffer } from './logger';
export type {
  SmartWatchData, HealthKitPayload, HealthConnectPayload,
  Baseline, SessionState, ContextData,
  ReadingLog, Decision, ReasonCode, Phase, ArousalType,
  EngineConfig,
} from './types';
export { DEFAULT_CONFIG } from './types';
