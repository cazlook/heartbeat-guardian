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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2, LogOut, Bug } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  createSession,
  processReading,
  DEFAULT_CONFIG,
  type ReadingLog,
  type SessionState,
  type SmartWatchData,
} from '@/engine';
import { HeartRatePoller, type LiveHrSample } from '@/engine/heartRatePoller';
import { Link, useNavigate } from 'react-router-dom';

const IS_DEV = import.meta.env.DEV;

interface ProfileCard {
  id: string;
  name: string | null;
  age: number | null;
  bio: string | null;
  photos: string[];
}

type Intensity = 'low' | 'medium' | 'high';

const REACTION_COOLDOWN_MS = 30_000; // don't write more than 1 row per profile / 30s
const VISIBILITY_THRESHOLD = 0.6;    // when card is "in view"

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

  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [pulseProfileId, setPulseProfileId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);

  // Debug-only state (rendered only when IS_DEV)
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugBpm, setDebugBpm] = useState(70);
  const [debugLog, setDebugLog] = useState<DebugEvent[]>([]);

  const sessionRef = useRef<SessionState | null>(null);
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
    if (!user) return;
    let cancelled = false;

    (async () => {
      // 1. Existing matches → exclude those users
      const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('user_a, user_b')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
      if (mErr) {
        toast({ title: 'Errore caricamento match', description: mErr.message, variant: 'destructive' });
      }
      const excluded = new Set<string>([user.id]);
      (matches ?? []).forEach((m) => {
        excluded.add(m.user_a);
        excluded.add(m.user_b);
      });

      // 2. Current user profile → baseline + default values for createSession
      const { data: me } = await supabase
        .from('profiles')
        .select('baseline_mean, baseline_std')
        .eq('id', user.id)
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
      sessionRef.current = createSession(watchData);

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
      setProfiles((list ?? []) as ProfileCard[]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user]);

  // ── Persist a reaction (debounced per profile) ─────────────────────
  const persistReaction = useCallback(
    async (profileId: string, reading: ReadingLog, peakBpm: number, durationMs: number) => {
      if (!user || reading.z_score == null) return;
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
    });

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
  useEffect(() => {
    if (!user) return;
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
  }, [user, persistReaction]);

  // ── Track which card is in view (intersection observer) ────────────
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (profiles.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio >= VISIBILITY_THRESHOLD)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (top) {
          const id = (top.target as HTMLElement).dataset.profileId ?? null;
          if (id !== activeProfileRef.current) {
            activeProfileRef.current = id;
            setActiveProfileId(id);
            // Reset reaction window when changing profile
            reactionWindowRef.current = null;
          }
        }
      },
      { threshold: [0, 0.3, VISIBILITY_THRESHOLD, 0.9, 1] },
    );
    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [profiles]);

  const setCardRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

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
            <Button asChild size="sm" variant="ghost">
              <Link to="/matches">Matches</Link>
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
    </div>
  );
};

interface ProfileCardViewProps {
  profile: ProfileCard;
  isActive: boolean;
  isPulsing: boolean;
}

const ProfileCardView = ({
  ref,
  profile,
  isActive,
  isPulsing,
}: ProfileCardViewProps & { ref?: (el: HTMLDivElement | null) => void }) => {
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
};

export default Discovery;
