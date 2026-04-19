/**
 * Discovery — main HeartSync screen.
 *
 * Loads candidate profiles (everyone except the current user, excluding
 * already-matched users), shows them one at a time vertically scrollable.
 *
 * While a profile is on screen the heart-rate poller runs and feeds samples
 * into the SignalProcessor with the discovery context flag set. ACCEPTED
 * readings are persisted to `biometric_reactions` (one per profile per
 * sustained reaction window — debounced).
 *
 * Baseline is bootstrapped from the current user's profile
 * (`baseline_mean` / `baseline_std`) when present, otherwise from
 * `DEFAULT_CONFIG`.
 */

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Loader2, LogOut, Bug, MapPin, UserCog, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  createSession,
  processReading,
  DEFAULT_CONFIG,
  type EngineConfig,
  type ReadingLog,
  type SessionState,
  type SmartWatchData,
} from '@/engine';
import { HeartRatePoller, type LiveHrSample } from '@/engine/heartRatePoller';
import { Link, useNavigate } from 'react-router-dom';
import { useMatchReveal } from '@/components/MatchRevealProvider';
import { MOCK_PROFILES, MockBpmSimulator, isMockProfileId } from '@/data/mockProfiles';
import { ProfileDetailSheet, type ProfileDetail } from '@/components/ProfileDetailSheet';
import { EditOwnProfileSheet } from '@/components/EditOwnProfileSheet';

// Debug mode: active in Vite dev OR when ?debug=1 is in the URL.
// The Lovable preview serves a production build, so import.meta.env.DEV
// alone isn't enough — the URL flag lets us turn on the dev override
// (shorter learning phase, looser noise filter) on demand.
const IS_DEV =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && window.location.search.includes('debug=1'));

// In dev mode, shorten the learning phase and loosen the noise filter so
// the debug panel can produce meaningful decisions without waiting 90s of
// wall-clock time.
const ENGINE_CONFIG: EngineConfig = IS_DEV
  ? {
      ...DEFAULT_CONFIG,
      learning_duration_sec: 0,
      learning_min_readings: 12,
      variance_threshold: 200,
      accelerometer_threshold: 999,
      no_accel_z_penalty: 0,
      no_accel_sustained_multiplier: 1,
      sustained_duration_sec: 0,
      sustained_min_readings: 1,
    }
  : DEFAULT_CONFIG;
console.log('[Discovery] ENGINE_CONFIG active:', JSON.stringify(ENGINE_CONFIG), 'IS_DEV:', IS_DEV);

interface ProfileCard {
  id: string;
  name: string | null;
  age: number | null;
  bio: string | null;
  photos: string[];
  interests?: string[];
  distance_km?: number | null;
  isMock?: boolean;
}

type Intensity = 'low' | 'medium' | 'high';

const REACTION_COOLDOWN_MS = 30_000; // don't write more than 1 row per profile / 30s
const VISIBILITY_THRESHOLD = 0.3;    // when card is "in view"

const intensityFromZ = (z: number): Intensity => {
  if (z >= DEFAULT_CONFIG.strong_z_threshold) return 'high';
  if (z >= DEFAULT_CONFIG.z_threshold + 0.5) return 'medium';
  return 'low';
};

interface RevealState {
  matchId: string;
  cardiacScore: number;
}

interface DebugEvent {
  t: number;
  bpm: number;
  z: number | null;
  decision: string;
  reason: string;
}

const Discovery = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { unseenCount: unseenMatches } = useMatchReveal();
  const userId = user?.id ?? null;

  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [pulseProfileId, setPulseProfileId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Debug-only state (rendered only when IS_DEV)
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugBpm, setDebugBpm] = useState(70);
  const [debugLog, setDebugLog] = useState<DebugEvent[]>([]);

  const sessionRef = useRef<SessionState | null>(null);
  const sessionOwnerRef = useRef<string | null>(null);
  const pollerRef = useRef<HeartRatePoller | null>(null);
  const activeProfileRef = useRef<string | null>(null);
  const reactionWindowRef = useRef<{
    profileId: string;
    startedAt: number;
    peakBpm: number;
    peakZ: number;
  } | null>(null);
  const lastWriteRef = useRef<Map<string, number>>(new Map());
  const revealedPairRef = useRef<Set<string>>(new Set());
  const handleSampleRef = useRef<((s: LiveHrSample) => void) | null>(null);

  // ── Load profiles & bootstrap session ──────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      if (!sessionRef.current || sessionOwnerRef.current !== userId) {
        const { data: me } = await supabase
          .from('profiles')
          .select('baseline_mean, baseline_std')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;

        const restingHr = me?.baseline_mean ?? 70;
        const restingHrStd = me?.baseline_std ?? null;
        const watchData: SmartWatchData = {
          source: 'healthkit',
          resting_hr: Number(restingHr),
          resting_hr_history: [],
          avg_resting_hr: Number(restingHr),
          std_resting_hr: restingHrStd != null ? Number(restingHrStd) : null,
          retrieved_at: Date.now(),
        };

        sessionRef.current = createSession(watchData, ENGINE_CONFIG);
        sessionOwnerRef.current = userId;
      }

      // 1. Existing matches → exclude those users
      const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('user_a, user_b')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`);
      if (mErr) {
        toast({ title: 'Errore caricamento match', description: mErr.message, variant: 'destructive' });
      }
      const excluded = new Set<string>([userId]);
      (matches ?? []).forEach((m) => {
        excluded.add(m.user_a);
        excluded.add(m.user_b);
      });

      // 3. Candidate profiles
      const { data: list, error: pErr } = await supabase
        .from('profiles')
        .select('id, name, age, bio, photos')
        .not('id', 'in', `(${[...excluded].join(',')})`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;
      if (pErr) {
        toast({ title: 'Errore caricamento profili', description: pErr.message, variant: 'destructive' });
        setLoading(false);
        return;
      }

      const realProfiles: ProfileCard[] = (list ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        bio: p.bio,
        photos: p.photos ?? [],
        isMock: false,
      }));

      // Merge: mock first (so they're visible immediately on first load even
      // if the DB has no other candidates), real after.
      const mockAsCards: ProfileCard[] = MOCK_PROFILES.map((m) => ({
        id: m.id,
        name: m.name,
        age: m.age,
        bio: m.bio,
        photos: m.photos,
        interests: m.interests,
        distance_km: m.distance_km,
        isMock: true,
      }));

      setProfiles([...mockAsCards, ...realProfiles]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // ── Persist a reaction (debounced per profile) ─────────────────────
  const persistReaction = useCallback(
    async (profileId: string, reading: ReadingLog, peakBpm: number, durationMs: number) => {
      if (!user || reading.z_score == null) return;
      // Mock profiles non vivono nel DB → niente persist, niente check-match.
      // L'animazione di pulse parte comunque per dare feedback visivo.
      if (isMockProfileId(profileId)) return;
      const now = Date.now();
      const last = lastWriteRef.current.get(profileId) ?? 0;
      if (now - last < REACTION_COOLDOWN_MS) return;
      lastWriteRef.current.set(profileId, now);

      const intensity = intensityFromZ(reading.z_score);
      const confidence = Math.max(
        0,
        Math.min(1, (reading.z_score - DEFAULT_CONFIG.z_threshold) / (DEFAULT_CONFIG.strong_z_threshold - DEFAULT_CONFIG.z_threshold)),
      );

      const { error } = await supabase.from('biometric_reactions').insert({
        viewer_id: user.id,
        profile_id: profileId,
        z_score: reading.z_score,
        peak_bpm: peakBpm,
        baseline_mean: reading.baseline_mean,
        baseline_std: reading.baseline_std,
        intensity,
        confidence,
        duration_ms: Math.max(0, Math.round(durationMs)),
      });
      if (error) {
        // Don't toast: surface only via console. The detection animation already gave feedback.
        console.warn('[Discovery] insert reaction failed', error.message);
        return;
      }

      // Check bilateral match
      if (revealedPairRef.current.has(profileId)) return;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('check-match', {
          body: { viewer_id: user.id, profile_id: profileId },
        });
        if (fnErr) {
          console.warn('[Discovery] check-match failed', fnErr.message);
          return;
        }
        if (data?.matched && data.match_id) {
          revealedPairRef.current.add(profileId);
          setReveal({ matchId: data.match_id, cardiacScore: Number(data.cardiac_score ?? 0) });
        }
      } catch (e) {
        console.warn('[Discovery] check-match exception', e);
      }
    },
    [user],
  );

  // ── Sample handler — shared by poller and debug panel ──────────────
  const handleSample = useCallback((sample: LiveHrSample) => {
    const session = sessionRef.current;
    const targetProfile = activeProfileRef.current;
    if (!session || !targetProfile) return;

    const reading = processReading(sample.bpm, session, {
      app_in_foreground: true,
      in_discovery_screen: true,
      signal_quality: 0.9,
      // accelerometer omitted → engine applies stricter no-accel rules
    }, ENGINE_CONFIG);

    if (IS_DEV) {
      setDebugLog((prev) => {
        const next: DebugEvent = {
          t: sample.sampleTime,
          bpm: sample.bpm,
          z: reading.z_score,
          decision: reading.decision,
          reason: reading.reason_code,
        };
        return [next, ...prev].slice(0, 10);
      });
    }

    const win = reactionWindowRef.current;
    if (reading.decision === 'ACCEPTED') {
      if (!win || win.profileId !== targetProfile) {
        reactionWindowRef.current = {
          profileId: targetProfile,
          startedAt: sample.sampleTime,
          peakBpm: sample.bpm,
          peakZ: reading.z_score ?? 0,
        };
      } else {
        win.peakBpm = Math.max(win.peakBpm, sample.bpm);
        win.peakZ = Math.max(win.peakZ, reading.z_score ?? 0);
      }
      setPulseProfileId(targetProfile);
      window.setTimeout(() => {
        setPulseProfileId((cur) => (cur === targetProfile ? null : cur));
      }, 1200);

      const w = reactionWindowRef.current!;
      void persistReaction(targetProfile, reading, w.peakBpm, sample.sampleTime - w.startedAt);
    } else if (win && win.profileId === targetProfile) {
      reactionWindowRef.current = null;
    }
  }, [persistReaction]);

  // Keep latest handler accessible to debug panel without re-subscribing poller
  useEffect(() => { handleSampleRef.current = handleSample; }, [handleSample]);

  // ── Heart rate poller wired to engine ──────────────────────────────
  // IMPORTANT: only depend on `user?.id` (primitive). Depending on the `user`
  // object or on `persistReaction` would re-run this effect on every render
  // (auth context returns a new user object each render), continuously
  // stopping/starting the poller.
  useEffect(() => {
    if (!userId) return;
    const poller = new HeartRatePoller({ intervalMs: 5000 });
    pollerRef.current = poller;

    const off = poller.on((sample: LiveHrSample) => {
      handleSampleRef.current?.(sample);
    });

    poller.start();
    return () => {
      off();
      poller.stop();
      pollerRef.current = null;
    };
  }, [userId]);

  // ── Mock BPM simulator ─────────────────────────────────────────────
  // Per ogni profilo mock simula un BPM "del viewer" che fluttua attorno a
  // bpm_baseline ± 5..15. Quando la card mock è attiva, iniettiamo questi
  // valori nel pipeline come se fossero il nostro HR live (così l'engine
  // produce decisioni varie e card diverse generano reazioni diverse).
  // I profili reali continuano a usare il poller HealthKit/HC standard.
  const mockSimulator = useMemo(() => new MockBpmSimulator(MOCK_PROFILES, 1000), []);
  useEffect(() => {
    mockSimulator.start();
    const id = window.setInterval(() => {
      const active = activeProfileRef.current;
      if (!active || !isMockProfileId(active)) return;
      const bpm = mockSimulator.getBpm(active);
      if (bpm == null) return;
      const now = Date.now();
      handleSampleRef.current?.({
        bpm: Math.round(bpm),
        sampleTime: now,
        receivedAt: now,
        latencyMs: 0,
        source: 'mock',
      });
    }, 1500);
    return () => {
      window.clearInterval(id);
      mockSimulator.stop();
    };
  }, [mockSimulator]);

  // ── Track which card is in view (intersection observer) ────────────
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Stable ref callback per profile id — avoids React detaching/reattaching
  // the ref on every render (which would happen if we returned a fresh fn).
  const refSettersRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const setCardRef = useCallback((id: string) => {
    let setter = refSettersRef.current.get(id);
    if (!setter) {
      setter = (el: HTMLDivElement | null) => {
        if (el) cardRefs.current.set(id, el);
        else cardRefs.current.delete(id);
      };
      refSettersRef.current.set(id, setter);
    }
    return setter;
  }, []);

  useEffect(() => {
    if (profiles.length === 0) return;

    // Fallback: immediately set the first profile as active so the debug panel
    // and reaction pipeline work even before the observer fires.
    if (!activeProfileRef.current) {
      const firstId = profiles[0].id;
      activeProfileRef.current = firstId;
      setActiveProfileId(firstId);
      console.log('[Discovery] fallback active profile →', firstId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio >= VISIBILITY_THRESHOLD)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (top) {
          const id = (top.target as HTMLElement).dataset.profileId ?? null;
          if (id && id !== activeProfileRef.current) {
            activeProfileRef.current = id;
            setActiveProfileId(id);
            reactionWindowRef.current = null;
            console.log('[Discovery] observer → active profile', id);
          }
        }
      },
      { threshold: [0, 0.15, VISIBILITY_THRESHOLD, 0.6, 0.9, 1] },
    );

    // Observe everything currently in the map, then re-check shortly after
    // to catch refs attached after this effect ran (rare but defensive).
    const observeAll = () => {
      cardRefs.current.forEach((el, id) => {
        observer.observe(el);
        console.log('[Discovery] observing card', id);
      });
    };
    observeAll();
    const t = window.setTimeout(observeAll, 50);

    return () => {
      window.clearTimeout(t);
      observer.disconnect();
    };
  }, [profiles]);


  // ── Debug: prime baseline so SignalProcessor exits learning phase ──
  // Feeds N synthetic resting samples (70 BPM) through the same pipeline so
  // the engine accumulates baseline statistics and stops returning
  // REJECTED_LEARNING_PHASE. Safe to call repeatedly: if already past learning
  // it just adds extra resting samples (engine handles this fine).
  const primeBaseline = useCallback((count = 12) => {
    const session = sessionRef.current;
    if (!session) return;
    // Realistic resting variability (~mean 70, SD ~3 BPM) so the baseline
    // doesn't collapse to SD≈0 (which would make every non-70 reading noise).
    const restingPattern = [69, 71, 70, 71, 69, 70, 71, 70, 69, 71, 70, 70];
    const baseTime = Date.now() - count * 1000;
    for (let i = 0; i < count; i += 1) {
      const t = baseTime + i * 1000;
      handleSampleRef.current?.({
        bpm: restingPattern[i % restingPattern.length],
        sampleTime: t,
        receivedAt: t,
        latencyMs: 0,
        source: 'mock',
      });
    }
    console.log('[Discovery] baseline primed with', count, 'resting samples (varied 66-75 BPM)');
  }, []);

  // ── Debug: inject a synthetic BPM through the same pipeline ────────
  // Calls processReading directly (instead of going through the poller) so
  // we get a synchronous result we can log, and a clear warning when no
  // profile is active at injection time.
  const injectDebugBpm = useCallback((bpm: number) => {
    const session = sessionRef.current;
    const profileId = activeProfileRef.current;
    if (!session) {
      console.warn('[Discovery] WARN: no session at inject time');
      return;
    }
    if (!profileId) {
      console.warn('[Discovery] WARN: no active profile at inject time');
    }

    // Auto-prime baseline if we're still in learning phase, so the debug
    // injection actually produces a meaningful decision.
    const probe = processReading(bpm, session, {
      app_in_foreground: true,
      in_discovery_screen: true,
      signal_quality: 0.9,
    }, ENGINE_CONFIG);
    if (probe.reason_code === 'REJECTED_LEARNING_PHASE') {
      console.log('[Discovery] still in learning phase → priming baseline');
      primeBaseline(12);
    }

    const now = Date.now();
    const sample: LiveHrSample = {
      bpm,
      sampleTime: now,
      receivedAt: now,
      latencyMs: 0,
      source: 'mock',
    };

    // Run the sample through the same handler the poller uses (updates
    // baseline, debug log, reaction window, persistence, …).
    handleSampleRef.current?.(sample);

    // Standalone read-only result for explicit logging.
    const reading = processReading(bpm, session, {
      app_in_foreground: true,
      in_discovery_screen: true,
      signal_quality: 0.9,
    }, ENGINE_CONFIG);
    console.log('[Discovery] inject result:', JSON.stringify({
      decision: reading.decision,
      reason: reading.reason_code,
      zScore: reading.z_score,
      profileId,
      bpm,
    }));
  }, [primeBaseline]);

  const triggerSpike = useCallback(() => {
    // Quick burst: several high samples to satisfy sustained-duration filter,
    // then return to resting.
    const peak = 110;
    const rest = 70;
    let i = 0;
    const id = window.setInterval(() => {
      injectDebugBpm(i < 6 ? peak : rest);
      i += 1;
      if (i >= 8) window.clearInterval(id);
    }, 250);
  }, [injectDebugBpm]);

  // ── Debug: reset session from scratch ──────────────────────────────
  const resetDebugSession = useCallback(async () => {
    if (!userId) return;
    const { data: me } = await supabase
      .from('profiles')
      .select('baseline_mean, baseline_std')
      .eq('id', userId)
      .maybeSingle();
    const restingHr = me?.baseline_mean ?? 70;
    const restingHrStd = me?.baseline_std ?? null;
    const watchData: SmartWatchData = {
      source: 'healthkit',
      resting_hr: Number(restingHr),
      resting_hr_history: [],
      avg_resting_hr: Number(restingHr),
      std_resting_hr: restingHrStd != null ? Number(restingHrStd) : null,
      retrieved_at: Date.now(),
    };
    sessionRef.current = createSession(watchData, ENGINE_CONFIG);
    sessionOwnerRef.current = userId;
    reactionWindowRef.current = null;
    lastWriteRef.current.clear();
    setDebugLog([]);
    console.log('[Discovery] session reset');
  }, [userId]);

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 backdrop-blur bg-background/80 border-b">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Discovery</h1>
          <div className="flex items-center gap-1">
            <Button asChild size="sm" variant="ghost" className="relative">
              <Link to="/matches">
                Matches
                {unseenMatches > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
                    aria-label={`${unseenMatches} nuovi match`}
                  >
                    {unseenMatches > 9 ? '9+' : unseenMatches}
                  </span>
                )}
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={signOut} aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {profiles.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nessun nuovo profilo per ora. Torna più tardi.
          </Card>
        ) : (
          profiles.map((p) => (
            <ProfileCardView
              key={p.id}
              profile={p}
              ref={setCardRef(p.id)}
              isActive={activeProfileId === p.id}
              isPulsing={pulseProfileId === p.id}
            />
          ))
        )}
      </main>

      {reveal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-6 animate-in fade-in duration-500"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-sm w-full text-center space-y-6">
            <div className="relative mx-auto h-32 w-32 flex items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary/30 animate-ping" />
              <span className="absolute inline-flex h-24 w-24 rounded-full bg-primary/50" />
              <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary">
                <Heart className="h-10 w-10 text-primary-foreground fill-current" />
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-xl font-semibold leading-snug">
                I vostri cuori hanno reagito allo stesso modo
              </p>
              <p className="text-3xl font-bold text-primary">
                {reveal.cardiacScore.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Cardiac score
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                onClick={() => {
                  const id = reveal.matchId;
                  setReveal(null);
                  navigate(`/chat/${id}`);
                }}
              >
                Vai alla chat
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReveal(null)}>
                Continua a esplorare
              </Button>
            </div>
          </div>
        </div>
      )}

      {IS_DEV && (
        <>
          <button
            type="button"
            onClick={() => setDebugOpen((v) => !v)}
            className="fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full bg-secondary text-secondary-foreground shadow-lg flex items-center justify-center border border-border"
            aria-label="Debug"
          >
            <Bug className="h-4 w-4" />
          </button>
          {debugOpen && (
            <div className="fixed bottom-20 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card text-card-foreground shadow-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Debug — fake BPM
                </span>
                <span className="text-xs text-muted-foreground">
                  active: {activeProfileId ? '✓' : '—'}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">BPM</span>
                  <span className="text-sm font-mono font-semibold">{debugBpm}</span>
                </div>
                <Slider
                  value={[debugBpm]}
                  min={50}
                  max={140}
                  step={1}
                  onValueChange={(v) => setDebugBpm(v[0])}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={() => injectDebugBpm(debugBpm)}
                  disabled={!activeProfileId}
                >
                  Inietta {debugBpm} BPM
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <Button size="sm" variant="outline" onClick={() => injectDebugBpm(70)} disabled={!activeProfileId}>
                  70
                </Button>
                <Button size="sm" variant="outline" onClick={() => injectDebugBpm(82)} disabled={!activeProfileId}>
                  82
                </Button>
                <Button size="sm" variant="outline" onClick={() => injectDebugBpm(95)} disabled={!activeProfileId}>
                  95
                </Button>
                <Button size="sm" variant="outline" onClick={triggerSpike} disabled={!activeProfileId}>
                  Spike
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => primeBaseline(12)}>
                  Prime baseline
                </Button>
                <Button size="sm" variant="ghost" onClick={resetDebugSession}>
                  Reset sessione
                </Button>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Last 10 events</div>
                <div className="max-h-48 overflow-y-auto rounded border border-border bg-muted/30 text-[11px] font-mono">
                  {debugLog.length === 0 ? (
                    <div className="p-2 text-muted-foreground">Nessun evento</div>
                  ) : (
                    debugLog.map((e) => (
                      <div
                        key={e.t}
                        className={`px-2 py-1 border-b border-border/50 last:border-0 flex justify-between gap-2 ${
                          e.decision === 'ACCEPTED' ? 'text-primary' : ''
                        }`}
                      >
                        <span>{e.bpm}bpm</span>
                        <span>z={e.z != null ? e.z.toFixed(2) : '—'}</span>
                        <span className="truncate">{e.reason.replace(/^(ACCEPTED_|REJECTED_)/, '')}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface ProfileCardViewProps {
  profile: ProfileCard;
  isActive: boolean;
  isPulsing: boolean;
}

const ProfileCardView = forwardRef<HTMLDivElement, ProfileCardViewProps>(({
  profile,
  isActive,
  isPulsing,
}, ref) => {
  const photo = profile.photos?.[0];
  return (
    <div ref={ref} data-profile-id={profile.id}>
      <Card
        className={`relative overflow-hidden transition-shadow ${
          isActive ? 'shadow-lg' : 'shadow-sm'
        }`}
      >
        <div className="aspect-[3/4] bg-muted relative">
          {photo ? (
            <img src={photo} alt={profile.name ?? 'Profilo'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              Nessuna foto
            </div>
          )}
          {/* Heartbeat pulse — discreet feedback only */}
          <div
            className={`absolute top-3 right-3 transition-opacity ${
              isPulsing ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden
          >
            <span className="relative flex h-10 w-10 items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary/40 animate-ping" />
              <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/80 backdrop-blur">
                <Heart className="h-5 w-5 text-primary-foreground fill-current" />
              </span>
            </span>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-background/95 via-background/70 to-transparent">
            <h2 className="text-xl font-bold">
              {profile.name ?? 'Senza nome'}
              {profile.age != null && (
                <span className="font-normal text-muted-foreground"> · {profile.age}</span>
              )}
            </h2>
          </div>
        </div>
        {profile.bio && (
          <div className="p-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {profile.bio}
          </div>
        )}
      </Card>
    </div>
  );
});
ProfileCardView.displayName = 'ProfileCardView';

export default Discovery;
