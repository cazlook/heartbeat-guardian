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
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);

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
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Matches</h1>
          <Button asChild size="sm" variant="ghost">
            <Link to="/discovery">Discovery</Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : matches.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground text-center">
            Nessun match per ora. Continua a esplorare in Discovery.
          </Card>
        ) : (
          <ul className="space-y-3">
            {matches.map((m) => {
              const photo = m.other?.photos?.[0];
              const name = m.other?.name ?? 'Senza nome';
              return (
                <li key={m.id}>
                  <Link to={`/chat/${m.id}`} className="block">
                    <Card className="p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                      <div className="h-14 w-14 rounded-full overflow-hidden bg-muted shrink-0">
                        {photo ? (
                          <img src={photo} alt={name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                            ?
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-primary font-bold">
                        <Heart className="h-4 w-4 fill-current" />
                        <span>{m.cardiac_score.toFixed(1)}</span>
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
