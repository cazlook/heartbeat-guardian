/**
 * useBiometricSource — unified live BPM source.
 *
 * Native (Android / iOS): polls Health Connect / HealthKit every `intervalMs`.
 * Web/preview: returns null sample → caller falls back to mock simulator.
 *
 * The hook does NOT touch SignalProcessor: it only emits LiveHrSample objects
 * that the caller routes into the existing pipeline (same flow used by mocks).
 */

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { HeartRatePoller, type LiveHrSample } from '@/engine/heartRatePoller';
import { log } from '@/engine/logger';

export type BiometricSourceKind = 'health_connect' | 'healthkit' | 'mock' | 'none';

export interface UseBiometricSourceOptions {
  /** Poll interval. Health Connect / HealthKit batch HR every ~5–10s; 2s is safe. */
  intervalMs?: number;
  /** When false the hook does not start polling at all (defaults to true). */
  enabled?: boolean;
  /** Called for every fresh sample. */
  onSample?: (s: LiveHrSample) => void;
}

export interface UseBiometricSourceResult {
  source: BiometricSourceKind;
  lastSample: LiveHrSample | null;
  isNative: boolean;
}

export function useBiometricSource(opts: UseBiometricSourceOptions = {}): UseBiometricSourceResult {
  const { intervalMs = 2000, enabled = true, onSample } = opts;
  const platform = Capacitor.getPlatform();
  const isNative = platform === 'android' || platform === 'ios';

  const [lastSample, setLastSample] = useState<LiveHrSample | null>(null);
  const [source, setSource] = useState<BiometricSourceKind>(
    isNative ? (platform === 'android' ? 'health_connect' : 'healthkit') : 'mock',
  );

  const onSampleRef = useRef(onSample);
  useEffect(() => { onSampleRef.current = onSample; }, [onSample]);

  useEffect(() => {
    if (!enabled || !isNative) {
      setSource(isNative ? source : 'mock');
      return;
    }

    const poller = new HeartRatePoller({ intervalMs });
    const off = poller.on((s) => {
      setLastSample(s);
      setSource(s.source === 'healthkit' ? 'healthkit' : 'health_connect');
      onSampleRef.current?.(s);
    });

    log('USE_BIOMETRIC_SOURCE_START', { platform, intervalMs });
    poller.start();

    return () => {
      off();
      poller.stop();
      log('USE_BIOMETRIC_SOURCE_STOP', { platform });
    };
  }, [enabled, isNative, intervalMs, platform]);

  return { source, lastSample, isNative };
}
