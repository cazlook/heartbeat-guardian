/**
 * Debug / Validation Screen
 *
 * Live view: BPM, baseline, z-score, phase, accelerometer, sample rate, latency.
 * Records the session to localStorage and exposes JSON export for offline analysis.
 *
 * Workflow:
 *  1. Connect smartwatch → resting HR loaded → session created.
 *  2. Pick scenario (Rest / Walk / Discovery).
 *  3. Press Start → poller runs, every HR sample is fed through processReading.
 *  4. Stop → review aggregate stats, export JSON.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Activity, Download, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HealthConsent } from '@/components/HealthConsent';
import { processReading, DEFAULT_CONFIG } from '@/engine';
import type { ReadingLog, SessionState } from '@/engine/types';
import type { HealthBridgeResult } from '@/engine/healthBridge';
import { HeartRatePoller, type LiveHrSample } from '@/engine/heartRatePoller';
import { SessionRecorder, type RecordedSession } from '@/engine/sessionRecorder';

type Scenario = 'rest' | 'walk' | 'discovery';

const SCENARIOS: { key: Scenario; label: string; in_discovery: boolean }[] = [
  { key: 'rest', label: 'A · Riposo', in_discovery: false },
  { key: 'walk', label: 'B · Movimento', in_discovery: false },
  { key: 'discovery', label: 'C · Discovery attivo', in_discovery: true },
];

const Debug = () => {
  const [session, setSession] = useState<SessionState | null>(null);
  const [bridge, setBridge] = useState<HealthBridgeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('rest');
  const [lastSample, setLastSample] = useState<LiveHrSample | null>(null);
  const [lastReading, setLastReading] = useState<ReadingLog | null>(null);
  const [tick, setTick] = useState(0); // re-render heartbeat
  const [history, setHistory] = useState<RecordedSession[]>(() => SessionRecorder.listAll());

  const pollerRef = useRef<HeartRatePoller | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  sessionRef.current = session;

  useEffect(() => () => pollerRef.current?.stop(), []);

  // Force periodic re-render so latency / elapsed counters update
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [running]);

  const platform = Capacitor.getPlatform();
  const isNative = platform === 'ios' || platform === 'android';

  if (!session) {
    return <HealthConsent onReady={(s, r) => { setSession(s); setBridge(r); }} />;
  }

  const handleStart = () => {
    if (!session) return;
    const sc = SCENARIOS.find(x => x.key === scenario)!;
    const rec = new SessionRecorder({
      platform,
      source: bridge?.data?.source,
      resting_hr: session.baseline.resting_hr,
      config: DEFAULT_CONFIG,
      scenario: sc.key,
    }, session.phase);
    recorderRef.current = rec;

    const poller = new HeartRatePoller({ intervalMs: 5000 });
    pollerRef.current = poller;

    poller.on((sample) => {
      setLastSample(sample);
      rec.recordSample(sample);
      const cur = sessionRef.current;
      if (!cur) return;
      const reading = processReading(sample.bpm, cur, {
        app_in_foreground: true,
        in_discovery_screen: sc.in_discovery,
        signal_quality: 0.9,
        // accelerometer omitted → engine applies no-accel penalty
      });
      rec.recordReading(reading, cur);
      setLastReading(reading);
      setSession({ ...cur }); // shallow clone for re-render
    });
    poller.start();
    setRunning(true);
  };

  const handleStop = () => {
    pollerRef.current?.stop();
    pollerRef.current = null;
    const finalized = recorderRef.current?.finalize();
    if (finalized) setHistory(SessionRecorder.listAll());
    setRunning(false);
  };

  const handleReset = () => {
    handleStop();
    setSession(null);
    setBridge(null);
    setLastSample(null);
    setLastReading(null);
  };

  const stats = recorderRef.current?.stats();
  const elapsed = recorderRef.current ? Math.round((Date.now() - recorderRef.current.get().meta.started_at) / 1000) : 0;
  void tick;

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">HeartSync · Debug</h1>
            <p className="text-xs text-muted-foreground">
              {platform} · {bridge?.data?.source ?? 'no-source'} · resting {session.baseline.resting_hr.toFixed(0)} bpm
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </header>

        {!isNative && (
          <Card className="p-3 text-xs bg-muted">
            ⚠️ Web preview: nessun sample reale disponibile. Esporta su GitHub e usa <code>npx cap run ios|android</code>.
          </Card>
        )}

        {/* Live state */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="BPM live" value={lastSample ? lastSample.bpm.toFixed(0) : '—'} accent />
          <Stat label="z-score" value={lastReading?.z_score != null ? lastReading.z_score.toFixed(2) : '—'} />
          <Stat label="baseline μ" value={session.baseline.combined_mean.toFixed(1)} />
          <Stat label="baseline σ" value={session.baseline.combined_std.toFixed(2)} />
          <Stat label="phase" value={session.phase} />
          <Stat label="accel" value="off" sub="non collegato" />
          <Stat label="latency" value={lastSample ? `${lastSample.latencyMs} ms` : '—'} />
          <Stat label="rate" value={stats ? `${stats.effective_hz} Hz` : '—'} sub={stats ? `${stats.avg_interval_ms} ms` : ''} />
        </div>

        {/* Last decision */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Ultima decisione</span>
            {lastReading && (
              <Badge variant={lastReading.decision === 'ACCEPTED' ? 'default' : 'secondary'}>
                {lastReading.decision}
              </Badge>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            {lastReading?.reason_code ?? '—'}
          </p>
        </Card>

        {/* Scenario + controls */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map(s => (
              <Button
                key={s.key}
                size="sm"
                variant={scenario === s.key ? 'default' : 'outline'}
                disabled={running}
                onClick={() => setScenario(s.key)}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {!running ? (
              <Button onClick={handleStart} className="flex-1">
                <Play className="h-4 w-4 mr-1" /> Avvia test
              </Button>
            ) : (
              <Button onClick={handleStop} variant="destructive" className="flex-1">
                <Pause className="h-4 w-4 mr-1" /> Stop ({elapsed}s)
              </Button>
            )}
          </div>
        </Card>

        {/* Live aggregate */}
        {stats && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">Sessione corrente</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
              <Mini k="samples" v={stats.sample_count} />
              <Mini k="readings" v={stats.reading_count} />
              <Mini k="accepted" v={stats.accepted} highlight={stats.accepted > 0} />
              <Mini k="rejected" v={stats.rejected} />
              <Mini k="avg latency" v={`${stats.avg_latency_ms}ms`} />
              <Mini k="rate" v={`${stats.effective_hz}Hz`} />
              <Mini k="duration" v={`${stats.duration_sec}s`} />
            </div>
            <details className="mt-3">
              <summary className="text-xs cursor-pointer text-muted-foreground">Reason codes</summary>
              <pre className="text-[10px] mt-2 bg-muted p-2 rounded overflow-x-auto">
{JSON.stringify(stats.reasons, null, 2)}
              </pre>
            </details>
          </Card>
        )}

        {/* History */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Sessioni salvate ({history.length})</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { SessionRecorder.clearAll(); setHistory([]); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {history.length === 0 && <p className="text-xs text-muted-foreground">Nessuna sessione registrata.</p>}
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {history.map(h => (
              <div key={h.meta.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                <div className="font-mono truncate">
                  <span className="font-medium">{h.meta.scenario ?? '—'}</span>
                  <span className="text-muted-foreground ml-2">
                    {new Date(h.meta.started_at).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    · {h.hr_samples.length} samples · {h.readings.filter(r => r.decision === 'ACCEPTED').length}/{h.readings.length} acc
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => SessionRecorder.download(h)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const Stat = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) => (
  <Card className="p-3">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`text-xl font-bold font-mono ${accent ? 'text-primary' : ''}`}>{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
  </Card>
);

const Mini = ({ k, v, highlight }: { k: string; v: string | number; highlight?: boolean }) => (
  <div className={`p-2 rounded ${highlight ? 'bg-primary/10' : 'bg-muted'}`}>
    <p className="text-[10px] text-muted-foreground">{k}</p>
    <p className="font-bold">{v}</p>
  </div>
);

export default Debug;
