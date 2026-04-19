import { useState } from 'react';
import { HealthConsent } from '@/components/HealthConsent';
import type { SessionState } from '@/engine/types';
import type { HealthBridgeResult } from '@/engine/healthBridge';
import { Card } from '@/components/ui/card';

const Index = () => {
  const [session, setSession] = useState<SessionState | null>(null);
  const [result, setResult] = useState<HealthBridgeResult | null>(null);

  if (!session) {
    return (
      <HealthConsent
        onReady={(s, r) => {
          setSession(s);
          setResult(r);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen p-6 bg-background">
      <Card className="max-w-lg mx-auto p-6 space-y-3">
        <h1 className="text-2xl font-bold">Sessione attiva</h1>
        <div className="text-sm space-y-1 font-mono">
          <p>Phase: <span className="text-primary">{session.phase}</span></p>
          <p>Resting HR: {session.baseline.resting_hr.toFixed(1)} bpm</p>
          <p>Baseline mean: {session.baseline.combined_mean.toFixed(1)}</p>
          <p>Baseline std: {session.baseline.combined_std.toFixed(2)}</p>
          <p>Source: {result?.data?.source}</p>
          <p>Samples: {result?.data?.resting_hr_history.length}</p>
        </div>
        <a href="/debug" className="inline-block text-sm text-primary underline">
          Apri schermata Debug →
        </a>
      </Card>
    </div>
  );
};

export default Index;
