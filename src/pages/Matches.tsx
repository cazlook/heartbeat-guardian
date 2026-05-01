import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, CalendarHeart } from 'lucide-react';
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
  user_a: string;
  user_b: string;
  other: {
    id: string;
    name: string | null;
    photos: string[];
  } | null;
}

const formatRelative = (iso: string): string => {
  const dayMs = 24 * 60 * 60 * 1000;
  const dayThen = new Date(iso); dayThen.setHours(0, 0, 0, 0);
  const dayNow = new Date(); dayNow.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((dayNow.getTime() - dayThen.getTime()) / dayMs);

  if (dayDiff <= 0) return 'Oggi';
  if (dayDiff === 1) return 'Ieri';
  if (dayDiff < 7) return `${dayDiff} giorni fa`;
  if (dayDiff < 30) {
    const w = Math.floor(dayDiff / 7);
    return w === 1 ? '1 settimana fa' : `${w} settimane fa`;
  }
  if (dayDiff < 365) {
    const m = Math.floor(dayDiff / 30);
    return m === 1 ? '1 mese fa' : `${m} mesi fa`;
  }
  const y = Math.floor(dayDiff / 365);
  return y === 1 ? '1 anno fa' : `${y} anni fa`;
};

const Matches = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { markAllSeen } = useMatchReveal();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [invitingId, setInvitingId] = useState<string | null>(null);

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
          user_a: r.user_a,
          user_b: r.user_b,
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

  const handleInvite = async (m: MatchRow) => {
    if (!user) return;
    setInvitingId(m.id);
    const toUserId = m.user_a === user.id ? m.user_b : m.user_a;
    const { error } = await supabase.from('date_invites').insert({
      match_id: m.id,
      from_user_id: user.id,
      to_user_id: toUserId,
      type: 'caffè',
      day: 'venerdì',
      slot: '19:00 – 21:00',
      area: null,
    });
    setInvitingId(null);
    if (error) {
      toast({ title: 'Errore invito', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Invito inviato',
      description: `${m.other?.name ?? 'questa persona'} riceverà la tua proposta.`,
    });
  };

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header — invariato */}
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
          <div className="border border-border/60 rounded-sm py-16 px-8 text-center space-y-3">
            <p className="font-display text-2xl text-foreground italic leading-tight">
              Il tuo cuore non ha ancora reagito.
            </p>
            <p className="text-sm text-muted-foreground">
              Continua a scoprire profili.
            </p>
            <div className="pt-3">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="rounded-sm uppercase tracking-wider text-xs border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              >
                <Link to="/discovery">Vai a Discovery</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {matches.map((m) => {
              const photo = m.other?.photos?.[0];
              const name = m.other?.name ?? 'Senza nome';
              const scoreInt = Math.round(m.cardiac_score);
              const barPct = Math.max(0, Math.min(100, scoreInt));
              const when = formatRelative(m.created_at);
              const isNew = (Date.now() - new Date(m.created_at).getTime()) < 86400000;

              return (
                <li key={m.id}>
                  <Card className="relative rounded-sm p-4 bg-card border border-border/60 hover:border-primary/40 transition-colors space-y-4">
                    {isNew && (
                      <span
                        className="absolute font-mono-bpm uppercase"
                        style={{
                          top: '12px',
                          right: '12px',
                          background: '#d4a574',
                          color: '#0d0d0d',
                          fontSize: '10px',
                          letterSpacing: '0.08em',
                          padding: '2px 6px',
                          borderRadius: '2px',
                        }}
                      >
                        NUOVO
                      </span>
                    )}

                    {/* Top row */}
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 rounded-sm overflow-hidden bg-muted shrink-0">
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
                        <div className="flex items-baseline justify-between gap-3 pr-16">
                          <div className="font-display text-2xl text-foreground truncate leading-tight">
                            {name}
                          </div>
                          <span className="font-mono-bpm text-3xl text-primary leading-none shrink-0">
                            {scoreInt}
                          </span>
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-1">
                          {when}
                        </div>

                        {/* Cardiac progress bar — ambra */}
                        <div className="mt-3">
                          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-700 ease-out"
                              style={{ width: `${barPct}%` }}
                              aria-label={`Cardiac score ${scoreInt} su 100`}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] uppercase tracking-[0.2em] text-muted-foreground mt-1.5">
                            <span>Cardiac</span>
                            <span className="font-mono-bpm">{scoreInt}/100</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => navigate(`/chat/${m.id}`)}
                        className="flex-1 h-10 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider text-[11px] font-medium"
                      >
                        <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Chatta
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={invitingId === m.id}
                        onClick={() => handleInvite(m)}
                        className="flex-1 h-10 rounded-sm border-border/70 hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary uppercase tracking-wider text-[11px] font-medium text-foreground/85"
                      >
                        {invitingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CalendarHeart className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                        Invita a uscire
                      </Button>
                    </div>
                  </Card>
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
