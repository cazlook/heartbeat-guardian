import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useMatchReveal } from '@/components/MatchRevealProvider';

interface MatchRow {
  id: string;
  cardiac_score: number;
  created_at: string;
  other: {
    id: string;
    name: string | null;
    photos: string[];
  } | null;
}

const Matches = () => {
  const { user } = useAuth();
  const { markAllSeen } = useMatchReveal();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    markAllSeen();
  }, [markAllSeen]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data: rows, error } = await supabase
        .from('matches')
        .select('id, cardiac_score, created_at, user_a, user_b')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        toast({ title: 'Errore caricamento match', description: error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }

      const otherIds = Array.from(
        new Set((rows ?? []).map((r) => (r.user_a === user.id ? r.user_b : r.user_a))),
      );

      let profilesById: Record<string, { id: string; name: string | null; photos: string[] }> = {};
      if (otherIds.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('id, name, photos')
          .in('id', otherIds);
        if (pErr) {
          toast({ title: 'Errore profili', description: pErr.message, variant: 'destructive' });
        } else {
          profilesById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
        }
      }

      const enriched: MatchRow[] = (rows ?? []).map((r) => {
        const otherId = r.user_a === user.id ? r.user_b : r.user_a;
        return {
          id: r.id,
          cardiac_score: Number(r.cardiac_score),
          created_at: r.created_at,
          other: profilesById[otherId] ?? { id: otherId, name: null, photos: [] },
        };
      });

      if (!cancelled) {
        setMatches(enriched);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-end justify-between border-b border-border/60 pb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              HeartSync
            </p>
            <h1 className="font-display text-4xl text-foreground leading-none mt-1">
              Matches
            </h1>
          </div>
          <Button asChild size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground uppercase tracking-wider text-xs">
            <Link to="/discovery">Discovery</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : matches.length === 0 ? (
          <div className="border border-border/60 rounded-sm p-8 text-center text-sm text-muted-foreground italic">
            Nessun match per ora.<br />
            Continua a esplorare in Discovery.
          </div>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => {
              const photo = m.other?.photos?.[0];
              const name = m.other?.name ?? 'Senza nome';
              return (
                <li key={m.id}>
                  <Link to={`/chat/${m.id}`} className="block group">
                    <Card className="rounded-sm p-4 flex items-center gap-4 bg-card border border-border/60 group-hover:border-primary/40 transition-colors">
                      <div className="h-14 w-14 rounded-sm overflow-hidden bg-muted shrink-0">
                        {photo ? (
                          <img
                            src={photo}
                            alt={name}
                            className="h-full w-full object-cover photo-color"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                            ?
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-xl text-foreground truncate leading-tight">
                          {name}
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                          {new Date(m.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-mono-bpm text-2xl text-primary leading-none">
                          {m.cardiac_score.toFixed(1)}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                          Score
                        </span>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Matches;
