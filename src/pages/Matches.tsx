import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, CalendarHeart, Check, Coffee, Wine, UtensilsCrossed, Footprints, Sparkles, MapPin, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useMatchReveal } from '@/components/MatchRevealProvider';

type InviteType = 'caffe' | 'aperitivo' | 'cena' | 'passeggiata' | 'altro';

const INVITE_TYPES: { value: InviteType; label: string; Icon: typeof Coffee }[] = [
  { value: 'caffe', label: 'Caffè', Icon: Coffee },
  { value: 'aperitivo', label: 'Aperitivo', Icon: Wine },
  { value: 'cena', label: 'Cena', Icon: UtensilsCrossed },
  { value: 'passeggiata', label: 'Passeggiata', Icon: Footprints },
  { value: 'altro', label: 'Altro', Icon: Sparkles },
];

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

interface ReceivedInvite {
  id: string;
  from_user_id: string;
  invite_type: string | null;
  type: string | null;
  location: string | null;
  scheduled_at: string | null;
  day: string | null;
  slot: string | null;
  area: string | null;
  note: string | null;
  status: string;
  sender: { id: string; name: string | null; photos: string[] } | null;
}

const INVITE_TYPE_META: Record<string, { label: string; Icon: typeof Coffee }> = {
  caffe: { label: 'Caffè', Icon: Coffee },
  aperitivo: { label: 'Aperitivo', Icon: Wine },
  cena: { label: 'Cena', Icon: UtensilsCrossed },
  passeggiata: { label: 'Passeggiata', Icon: Footprints },
  altro: { label: 'Altro', Icon: Sparkles },
};

const formatItalianDateTime = (inv: ReceivedInvite): string => {
  if (inv.scheduled_at) {
    const d = new Date(inv.scheduled_at);
    const datePart = new Intl.DateTimeFormat('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(d);
    const timePart = new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit', minute: '2-digit',
    }).format(d);
    const cap = datePart.charAt(0).toUpperCase() + datePart.slice(1);
    return `${cap} · ${timePart}`;
  }
  const parts = [inv.day, inv.slot].filter(Boolean);
  return parts.join(' · ');
};

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
  const [sentInvites, setSentInvites] = useState<Set<string>>(new Set());
  const [inviteDialogMatch, setInviteDialogMatch] = useState<MatchRow | null>(null);
  const [inviteType, setInviteType] = useState<InviteType | null>(null);
  const [inviteLocation, setInviteLocation] = useState('');
  const [inviteDate, setInviteDate] = useState('');
  const [inviteTime, setInviteTime] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [receivedInvites, setReceivedInvites] = useState<ReceivedInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [fadingId, setFadingId] = useState<string | null>(null);

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

      const matchIds = enriched.map((m) => m.id);
      if (matchIds.length > 0) {
        const { data: existingInvites } = await supabase
          .from('date_invites')
          .select('match_id')
          .eq('from_user_id', user.id)
          .in('match_id', matchIds);

        if (existingInvites && !cancelled) {
          setSentInvites(new Set(existingInvites.map((i) => i.match_id)));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const handleInvite = async (m: MatchRow) => {
    if (!user) return;
    setInviteDialogMatch(m);
    setInviteType(null);
    setInviteLocation('');
    setInviteDate('');
    setInviteTime('');
    setInviteNote('');
  };

  const handleSubmitInvite = async () => {
    if (!user || !inviteDialogMatch) return;
    if (!inviteType || !inviteLocation.trim() || !inviteDate || !inviteTime) {
      toast({ title: 'Compila tutti i campi obbligatori', variant: 'destructive' });
      return;
    }
    const m = inviteDialogMatch;
    setInvitingId(m.id);
    const toUserId = m.user_a === user.id ? m.user_b : m.user_a;
    const scheduledAt = new Date(`${inviteDate}T${inviteTime}`).toISOString();
    const { error } = await supabase.from('date_invites').insert({
      match_id: m.id,
      from_user_id: user.id,
      to_user_id: toUserId,
      invite_type: inviteType,
      location: inviteLocation.trim(),
      scheduled_at: scheduledAt,
      note: inviteNote.trim() || null,
    });
    setInvitingId(null);
    if (error) {
      toast({ title: "Errore nell'invio dell'invito", description: error.message, variant: 'destructive' });
      return;
    }
    setSentInvites((prev) => new Set(prev).add(m.id));
    setInviteDialogMatch(null);
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
                        disabled={invitingId === m.id || sentInvites.has(m.id)}
                        onClick={() => handleInvite(m)}
                        className="flex-1 h-10 rounded-sm border-border/70 hover:border-primary/50 hover:bg-primary/[0.06] hover:text-primary uppercase tracking-wider text-[11px] font-medium text-foreground/85 disabled:opacity-100"
                      >
                        {invitingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : sentInvites.has(m.id) ? (
                          <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                        ) : (
                          <CalendarHeart className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                        {sentInvites.has(m.id) ? 'Invito inviato' : 'Invita a uscire'}
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!inviteDialogMatch} onOpenChange={(o) => !o && setInviteDialogMatch(null)}>
        <DialogContent
          className="rounded-sm sm:max-w-md"
          style={{ background: '#111', border: '1px solid #2a2a2a', color: '#f0ece4' }}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl leading-tight" style={{ color: '#f0ece4' }}>
              Invita {inviteDialogMatch?.other?.name ?? ''} a uscire
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* 1. Tipo incontro */}
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                Tipo di incontro
              </Label>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {INVITE_TYPES.map(({ value, label, Icon }) => {
                  const selected = inviteType === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setInviteType(value)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-xs uppercase tracking-wider transition-colors"
                      style={{
                        background: selected ? '#d4a574' : '#1a1a1a',
                        color: selected ? '#0d0d0d' : '#7a7570',
                        borderColor: selected ? '#d4a574' : '#2a2a2a',
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Luogo */}
            <div className="space-y-2">
              <Label htmlFor="invite-location" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                Luogo
              </Label>
              <Input
                id="invite-location"
                value={inviteLocation}
                onChange={(e) => setInviteLocation(e.target.value)}
                placeholder="Es. Caffè San Marco, Napoli"
                maxLength={120}
                className="rounded-sm"
                style={{ background: '#1a1a1a', borderColor: '#2a2a2a', color: '#f0ece4' }}
              />
            </div>

            {/* 3. Data + Ora */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-date" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                  Data
                </Label>
                <Input
                  id="invite-date"
                  type="date"
                  value={inviteDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setInviteDate(e.target.value)}
                  className="rounded-sm"
                  style={{ background: '#1a1a1a', borderColor: '#2a2a2a', color: '#f0ece4' }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-time" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                  Orario
                </Label>
                <Input
                  id="invite-time"
                  type="time"
                  value={inviteTime}
                  onChange={(e) => setInviteTime(e.target.value)}
                  className="rounded-sm"
                  style={{ background: '#1a1a1a', borderColor: '#2a2a2a', color: '#f0ece4' }}
                />
              </div>
            </div>

            {/* 4. Nota */}
            <div className="space-y-2">
              <Label htmlFor="invite-note" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                Nota (opzionale)
              </Label>
              <Textarea
                id="invite-note"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value.slice(0, 150))}
                placeholder="Un messaggio per accompagnare l'invito…"
                maxLength={150}
                rows={3}
                className="rounded-sm resize-none"
                style={{ background: '#1a1a1a', borderColor: '#2a2a2a', color: '#f0ece4' }}
              />
              <div className="text-right text-[10px]" style={{ color: '#7a7570' }}>
                {inviteNote.length}/150
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteDialogMatch(null)}
                className="flex-1 h-10 rounded-sm uppercase tracking-wider text-[11px]"
                style={{ color: '#7a7570' }}
              >
                Annulla
              </Button>
              <Button
                type="button"
                onClick={handleSubmitInvite}
                disabled={invitingId === inviteDialogMatch?.id}
                className="flex-1 h-10 rounded-sm uppercase tracking-wider text-[11px] font-medium hover:opacity-90"
                style={{ background: '#d4a574', color: '#0d0d0d' }}
              >
                {invitingId === inviteDialogMatch?.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Invia invito'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Matches;
