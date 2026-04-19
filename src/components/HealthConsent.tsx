import { useState } from 'react';
import { Heart, Shield, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    const r = await readSmartWatch();
    setResult(r);
    setLoading(false);
    if (r.status === 'granted' && r.data) {
      const session = createSession(r.data);
      onReady(session, r);
    }
  };

  const native = isHealthAvailable();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-lg w-full p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Connetti il tuo smartwatch</h1>
            <p className="text-sm text-muted-foreground">Calibrazione automatica via HealthKit / Health Connect</p>
          </div>
        </div>

        <div className="space-y-4 text-sm">
          <div className="flex gap-3">
            <Activity className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Quali dati leggiamo</p>
              <p className="text-muted-foreground">Resting heart rate degli ultimi 7 giorni — per inizializzare la baseline senza calibrazione manuale.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Privacy</p>
              <p className="text-muted-foreground">I dati restano sul dispositivo. Salviamo solo media e deviazione standard, mai timestamp né campioni grezzi completi.</p>
            </div>
          </div>
        </div>

        {!native && (
          <div className="flex gap-2 p-3 rounded-md bg-muted text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>Build nativa richiesta. In anteprima web i dati non sono disponibili: esporta su GitHub e usa <code>npx cap run ios/android</code>.</p>
          </div>
        )}

        {result?.status === 'granted' && result.data && (
          <div className="flex gap-2 p-3 rounded-md bg-primary/10 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Connesso</p>
              <p className="text-muted-foreground">
                Resting HR: {result.data.resting_hr.toFixed(0)} bpm · σ {(result.data.std_resting_hr ?? 0).toFixed(1)} · {result.data.resting_hr_history.length} campioni ({result.data.source})
              </p>
            </div>
          </div>
        )}

        {result && result.status !== 'granted' && (
          <div className="flex gap-2 p-3 rounded-md bg-destructive/10 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p>{result.error ?? 'Permesso negato'}</p>
          </div>
        )}

        <Button onClick={handleConnect} disabled={loading || !native} className="w-full" size="lg">
          {loading ? 'Lettura in corso…' : 'Connetti smartwatch'}
        </Button>
      </Card>
    </div>
  );
};
