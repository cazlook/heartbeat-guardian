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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0f] relative overflow-hidden">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-[#e53e3e] opacity-[0.12] blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-[#7c3aed] opacity-[0.14] blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 h-[260px] w-[260px] rounded-full bg-[#e53e3e] opacity-[0.08] blur-[100px]" />
      </div>

      {/* Local keyframes */}
      <style>{`
        @keyframes hc-pulse-glow {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 12px rgba(229,62,62,0.55)) drop-shadow(0 0 24px rgba(124,58,237,0.35)); }
          50% { transform: scale(1.18); filter: drop-shadow(0 0 24px rgba(229,62,62,0.95)) drop-shadow(0 0 48px rgba(124,58,237,0.6)); }
        }
        @keyframes hc-ring-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(229,62,62,0.55), 0 0 60px 0 rgba(124,58,237,0.35); }
          50% { box-shadow: 0 0 0 18px rgba(229,62,62,0), 0 0 90px 4px rgba(124,58,237,0.55); }
        }
        @keyframes hc-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div className="relative w-full max-w-lg">
        {/* Card with gradient border */}
        <div
          className="rounded-3xl p-[1px]"
          style={{
            background: 'linear-gradient(135deg, rgba(229,62,62,0.55), rgba(124,58,237,0.55) 60%, rgba(229,62,62,0.2))',
          }}
        >
          <div className="rounded-3xl bg-[#0f0f17]/95 backdrop-blur-xl p-8 space-y-7 text-white">
            {/* Header with pulsing heart */}
            <div className="flex flex-col items-center text-center gap-4">
              <div
                className="relative h-20 w-20 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle at 30% 30%, rgba(229,62,62,0.35), rgba(124,58,237,0.2) 70%, transparent)',
                  animation: 'hc-ring-pulse 2.4s ease-in-out infinite',
                }}
              >
                <Heart
                  className="h-10 w-10 fill-current"
                  style={{
                    color: '#e53e3e',
                    animation: 'hc-pulse-glow 1.4s ease-in-out infinite',
                  }}
                />
              </div>
              <div>
                <h1
                  className="text-3xl font-bold tracking-tight bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(90deg, #ffffff, #f5d0d6 50%, #c4b5fd)' }}
                >
                  Calibrazione cardiaca
                </h1>
                <p className="text-sm text-white/55 mt-1">
                  HeartSync legge la tua baseline reale via{' '}
                  <span className="text-white/80">HealthKit</span> /{' '}
                  <span className="text-white/80">Health Connect</span>
                </p>
              </div>
            </div>

            {/* Info rows */}
            <div className="space-y-3">
              <div className="flex gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(229,62,62,0.25), rgba(124,58,237,0.25))' }}
                >
                  <Activity className="h-4 w-4" style={{ color: '#f87171' }} />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-white/95">Cosa leggiamo</p>
                  <p className="text-white/55 leading-relaxed">
                    Resting heart rate degli ultimi 7 giorni — baseline iniziale senza calibrazione manuale.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(229,62,62,0.25))' }}
                >
                  <Shield className="h-4 w-4" style={{ color: '#c4b5fd' }} />
                </div>
                <div className="text-sm">
                  <p className="font-medium text-white/95">Privacy</p>
                  <p className="text-white/55 leading-relaxed">
                    I dati restano sul dispositivo. Salviamo solo media e deviazione standard, mai timestamp né campioni grezzi.
                  </p>
                </div>
              </div>
            </div>

            {/* Native required */}
            {!native && (
              <div className="flex gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <p className="text-amber-100/80">
                  Build nativa richiesta. In anteprima web i dati non sono disponibili: esporta su GitHub e usa{' '}
                  <code className="px-1.5 py-0.5 rounded bg-black/40 text-amber-200">npx cap run ios/android</code>.
                </p>
              </div>
            )}

            {/* Success */}
            {isDone && result?.data && (
              <div
                className="rounded-2xl p-4 border"
                style={{
                  background: 'linear-gradient(135deg, rgba(229,62,62,0.10), rgba(124,58,237,0.10))',
                  borderColor: 'rgba(229,62,62,0.35)',
                }}
              >
                <div className="flex gap-3 items-start">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #e53e3e, #7c3aed)' }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-sm flex-1">
                    <p className="font-semibold text-white">Calibrazione completata</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span
                        className="text-3xl font-bold bg-clip-text text-transparent"
                        style={{ backgroundImage: 'linear-gradient(90deg, #f87171, #c4b5fd)' }}
                      >
                        {result.data.resting_hr.toFixed(0)}
                      </span>
                      <span className="text-white/50 text-xs uppercase tracking-wider">bpm resting</span>
                    </div>
                    <p className="text-white/50 text-xs mt-1">
                      σ {(result.data.std_resting_hr ?? 0).toFixed(1)} · {result.data.resting_hr_history.length} campioni · {result.data.source}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {result && result.status !== 'granted' && (
              <div className="flex gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <p className="text-red-100/85">{result.error ?? 'Permesso negato'}</p>
              </div>
            )}

            {/* CTA */}
            <Button
              onClick={handleConnect}
              disabled={loading || !native}
              className="w-full h-12 rounded-full text-white font-semibold border-0 relative overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(90deg, #e53e3e 0%, #7c3aed 100%)',
                boxShadow: loading || !native
                  ? 'none'
                  : '0 8px 32px -8px rgba(229,62,62,0.6), 0 4px 24px -4px rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lettura in corso…
                </span>
              ) : isDone ? (
                'Continua'
              ) : (
                <>
                  <Heart className="h-4 w-4 fill-current" />
                  Connetti smartwatch
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
