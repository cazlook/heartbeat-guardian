/**
 * Priority 7 — Structured Logging
 */

import type { ReadingLog } from './types';

export type LogEntry = {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  tag: string;
  data: Record<string, unknown>;
  timestamp: number;
};

const logBuffer: LogEntry[] = [];

export function log(tag: string, data: Record<string, unknown>, level: LogEntry['level'] = 'INFO'): void {
  const entry: LogEntry = { level, tag, data, timestamp: Date.now() };
  logBuffer.push(entry);
  
  if (typeof console !== 'undefined') {
    const prefix = `[HeartSync:${level}] ${tag}`;
    if (level === 'WARN') console.warn(prefix, data);
    else if (level === 'ERROR') console.error(prefix, data);
    else console.log(prefix, data);
  }
}

export function logReading(reading: ReadingLog): void {
  log('READING', reading as unknown as Record<string, unknown>, 
    reading.decision === 'ACCEPTED' ? 'INFO' : 'DEBUG');
}

export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}
