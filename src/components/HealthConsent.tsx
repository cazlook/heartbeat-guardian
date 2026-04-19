import { useState } from 'react';
import { Heart, Shield, Activity, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { readSmartWatch, readRestingHrLast3Days, isHealthAvailable, type HealthBridgeResult } from '@/engine/healthBridge';
import { createSession } from '@/engine';
import type { SessionState } from '@/engine/types';

interface Props {
  onReady: (session: SessionState, result: HealthBridgeResult) => void;
}

export const HealthConsent = ({ onReady }: Props) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthBridgeResult | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    const r = Capacitor.getPlatform() === 'android'
      ? await readRestingHrLast3Days()
      : await readSmartWatch();
    setResult(r);
    setLoading(false);
    if (r.status === 'granted' && r.data) {
      const session = createSession(r.data);
      onReady(session, r);
    }
  };

  const native = isHealthAvailable();
  const isDone = result?.status === 'granted' && !!result.data;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Ambient warm noir glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-primary/[0.08] blur-[120px]" />
        <div className="absolute -bottom-40 right-1/4 h-[460px] w-[460px] rounded-full bg-primary/[0.06] blur-[120px]" />
      </div>

      <style>{`
        @keyframes hc-noir-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes hc-ring-breath {
          0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.25), 0 0 60px 0 hsl(var(--primary) / 0.12); }
          50% { box-shadow: 0 0 0 14px hsl(var(--primary) / 0), 0 0 90px 4px hsl(var(--primary) / 0.22); }
        }
      `}</style>

      <div className="relative w-full max-w-md">
        <div className="rounded-sm border border-border/60 bg-card/80 backdrop-blur-xl p-10 space-y-8">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-5">
            <div
              className="relative h-16 w-16 rounded-full flex items-center justify-center bg-primary/[0.08] border border-primary/20"
              style={{ animation: 'hc-ring-breath 2.8s ease-in-out infinite' }}
            >
              <Heart
                className="h-7 w-7 fill-current text-primary"
                style={{ animation: 'hc-noir-pulse 1.6s ease-in-out infinite' }}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                HeartSync · Calibrazione
              </p>
              <h1 className="font-display text-4xl text-foreground leading-[1.05]">
                Il tuo cuore,<br />
                <em className="text-primary not-italic font-display">la tua firma.</em>
              </h1>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Leggiamo la tua baseline cardiaca dagli ultimi 7 giorni —
                via HealthKit o Health Connect.
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {/* Info rows */}
          <div className="space-y-5 text-sm">
            <div className="flex gap-4">
              <Activity className="h-4 w-4 text-primary shrink-0 mt-1" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Cosa leggiamo</p>
                <p className="text-muted-foreground leading-relaxed">
                  Resting heart rate degli ultimi 7 giorni, niente di più.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Shield className="h-4 w-4 text-primary shrink-0 mt-1" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Privacy</p>
                <p className="text-muted-foreground leading-relaxed">
                  I dati restano sul dispositivo. Salviamo solo media e deviazione standard.
                </p>
              </div>
            </div>
          </div>

          {/* Native required */}
          {!native && (
            <div className="flex gap-3 p-4 border border-border bg-muted/40 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-muted-foreground leading-relaxed">
                Build nativa richiesta. In anteprima web i dati non sono disponibili: esporta su GitHub e usa{' '}
                <code className="px-1.5 py-0.5 bg-background/60 text-foreground/80 text-xs">npx cap run ios/android</code>.
              </p>
            </div>
          )}

          {/* Success */}
          {isDone && result?.data && (
            <div className="border border-primary/30 bg-primary/[0.04] p-5">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-1" strokeWidth={1.5} />
                <div className="flex-1 space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Calibrazione completata
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl text-primary leading-none">
                      {result.data.resting_hr.toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      bpm resting
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/80 font-mono">
                    σ {(result.data.std_resting_hr ?? 0).toFixed(1)} · {result.data.resting_hr_history.length} campioni · {result.data.source}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {result && result.status !== 'granted' && (
            <div className="flex gap-3 p-4 border border-destructive/40 bg-destructive/[0.06] text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" strokeWidth={1.5} />
              <p className="text-foreground/85 leading-relaxed">{result.error ?? 'Permesso negato'}</p>
            </div>
          )}

          {/* CTA */}
          <Button
            onClick={handleConnect}
            disabled={loading || !native}
            className="w-full h-12 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium tracking-wide uppercase text-xs disabled:opacity-30 transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Lettura in corso
              </span>
            ) : isDone ? (
              'Continua'
            ) : (
              'Connetti smartwatch'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
