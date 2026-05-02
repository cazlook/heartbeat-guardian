/**
 * Chat — realtime 1:1 messaging for a given match.
 *
 * Route: /chat/:matchId
 *
 * - Loads the match, resolves the "other" participant and their profile header.
 * - Loads existing messages ordered ASC, then subscribes to INSERTs via
 *   Supabase Realtime (filtered by match_id).
 * - Sends new messages via insert; RLS on `messages` enforces that only the
 *   two match participants can read/write, and that sender_id = auth.uid().
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, CalendarHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

interface InviteEvent {
  id: string;
  match_id: string;
  from_user_id: string;
  invite_type: string | null;
  type: string | null;
  location: string | null;
  area: string | null;
  scheduled_at: string | null;
  day: string | null;
  slot: string | null;
  status: string;
  created_at: string;
}

type TimelineItem =
  | { kind: 'msg'; data: Message }
  | { kind: 'invite'; data: InviteEvent };

interface OtherProfile {
  id: string;
  name: string | null;
  photos: string[];
}

const DATE_TYPES = ['Caffè', 'Aperitivo', 'Cena', 'Passeggiata'] as const;
const DAYS = ['Stasera', 'Domani', 'Weekend'] as const;
const SLOTS = ['Pomeriggio', 'Sera', 'Notte'] as const;

const formatInviteWhen = (inv: InviteEvent): string => {
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
  return [inv.day, inv.slot].filter(Boolean).join(' · ');
};

const inviteTypeLabel = (inv: InviteEvent): string => {
  const raw = (inv.invite_type ?? inv.type ?? '').trim();
  if (!raw) return 'Incontro';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const invitePlace = (inv: InviteEvent): string => inv.location ?? inv.area ?? '';

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  if (sameDay) return `Oggi ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  if (isYesterday) return `Ieri ${time}`;

  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo} ${time}`;
};

const Chat = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [other, setOther] = useState<OtherProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [invites, setInvites] = useState<InviteEvent[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteType, setInviteType] = useState<(typeof DATE_TYPES)[number]>('Caffè');
  const [inviteDay, setInviteDay] = useState<(typeof DAYS)[number]>('Stasera');
  const [inviteSlot, setInviteSlot] = useState<(typeof SLOTS)[number]>('Sera');
  const [inviteArea, setInviteArea] = useState('');

  const listEndRef = useRef<HTMLDivElement | null>(null);

  // ── Load match → other profile → messages ─────────────────────────
  useEffect(() => {
    if (!user || !matchId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: match, error: mErr } = await supabase
        .from('matches')
        .select('id, user_a, user_b')
        .eq('id', matchId)
        .maybeSingle();

      if (cancelled) return;
      if (mErr || !match) {
        toast({
          title: 'Match non trovato',
          description: mErr?.message ?? 'Verifica il link',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const otherId = match.user_a === user.id ? match.user_b : match.user_a;

      const [profRes, msgRes, invRes] = await Promise.all([
        supabase.from('profiles').select('id, name, photos').eq('id', otherId).maybeSingle(),
        supabase
          .from('messages')
          .select('id, match_id, sender_id, content, created_at, read_at')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true }),
        supabase
          .from('date_invites')
          .select('id, match_id, from_user_id, invite_type, type, location, area, scheduled_at, day, slot, status, created_at')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true }),
      ]);

      if (cancelled) return;

      if (profRes.error) {
        toast({ title: 'Errore profilo', description: profRes.error.message, variant: 'destructive' });
      } else {
        setOther((profRes.data as OtherProfile) ?? { id: otherId, name: null, photos: [] });
      }

      if (msgRes.error) {
        toast({ title: 'Errore messaggi', description: msgRes.error.message, variant: 'destructive' });
      } else {
        setMessages((msgRes.data ?? []) as Message[]);
      }

      if (!invRes.error) {
        setInvites((invRes.data ?? []) as InviteEvent[]);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, matchId]);

  // ── Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // ── Typing broadcast channel ──────────────────────────────────────
  useEffect(() => {
    if (!matchId || !user) return;

    const channel = supabase
      .channel(`typing-${matchId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, (payload) => {
        console.log('[typing-in]', payload);
        const fromId = (payload.payload as { from?: string } | undefined)?.from;
        if (!fromId || fromId === user.id) return;
        setOtherTyping(true);
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
        otherTypingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [matchId, user]);

  // ── Auto-scroll on new messages ───────────────────────────────────
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Mark unread incoming messages as read ─────────────────────────
  useEffect(() => {
    if (!user || !matchId) return;
    const unreadIds = messages
      .filter((m) => m.sender_id !== user.id && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;

    (async () => {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('messages')
        .update({ read_at: nowIso })
        .in('id', unreadIds)
        .is('read_at', null);
      if (!error) {
        setMessages((prev) =>
          prev.map((x) => (unreadIds.includes(x.id) ? { ...x, read_at: nowIso } : x)),
        );
      }
    })();
  }, [messages, user, matchId]);

  // ── Send ──────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const content = draft.trim();
      if (!content || !user || !matchId || sending) return;

      setSending(true);
      const { error } = await supabase
        .from('messages')
        .insert({ match_id: matchId, sender_id: user.id, content });
      setSending(false);

      if (error) {
        toast({ title: 'Invio fallito', description: error.message, variant: 'destructive' });
        return;
      }
      setDraft('');
    },
    [draft, user, matchId, sending],
  );

  const headerName = useMemo(() => other?.name ?? 'Match', [other]);
  const headerPhoto = other?.photos?.[0];

  const showMeetSuggestion = messages.length >= 5;

  const handleSendInvite = () => {
    setInviteOpen(false);
    toast({
      title: 'Invito inviato',
      description: `${inviteType} · ${inviteDay} · ${inviteSlot}${inviteArea ? ` · ${inviteArea}` : ''}`,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-background/90 border-b border-border/40">
        <div className="max-w-md mx-auto px-3 py-3 flex items-center gap-3">
          <Button asChild size="icon" variant="ghost" aria-label="Indietro" className="text-muted-foreground hover:text-foreground">
            <Link to="/matches">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>

          <div className="relative h-10 w-10 shrink-0">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-muted ring-1 ring-border/60">
              {headerPhoto ? (
                <img
                  src={headerPhoto}
                  alt={headerName}
                  className="h-full w-full object-cover photo-color"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                  ?
                </div>
              )}
            </div>
            <span
              aria-hidden
              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background"
              style={{ backgroundColor: '#d4a574' }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl leading-tight truncate text-foreground">
              {headerName}
            </h1>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {otherTyping ? 'sta scrivendo…' : 'Online'}
            </p>
          </div>
        </div>

        {/* Cardiac whisper banner */}
        <div className="border-t border-border/40">
          <div className="max-w-md mx-auto px-4 py-2">
            <p className="text-[12px] italic font-display text-primary/90 text-center leading-snug">
              Il tuo cuore ha battuto più forte. Solo per questa persona.
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-3 py-5 space-y-4">
          {messages.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-lg text-foreground/80">
                Nessun messaggio.
              </p>
              <p className="text-xs text-muted-foreground mt-1 italic">
                Scrivi per primo.
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const mine = m.sender_id === user?.id;
              const prev = messages[i - 1];
              const showTime =
                !prev ||
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000 ||
                prev.sender_id !== m.sender_id;

              return (
                <div key={m.id} className="space-y-1">
                  {showTime && (
                    <div
                      className={`text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 px-1 ${
                        mine ? 'text-right' : 'text-left'
                      }`}
                    >
                      {formatTimestamp(m.created_at)}
                    </div>
                  )}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={[
                        'relative max-w-[78%] rounded-2xl px-4 py-2.5 pr-4 text-sm whitespace-pre-wrap break-words leading-relaxed',
                        mine
                          ? 'bg-primary text-primary-foreground rounded-br-sm pb-5'
                          : 'bg-secondary text-foreground rounded-bl-sm',
                      ].join(' ')}
                      style={
                        mine
                          ? undefined
                          : { backgroundColor: '#2a2a2a' }
                      }
                    >
                      {m.content}
                      {mine && (
                        <span
                          aria-label={m.read_at ? 'Letto' : 'Consegnato'}
                          className="absolute bottom-1 right-2 font-mono-bpm"
                          style={{
                            fontSize: '10px',
                            color: m.read_at ? '#d4a574' : '#7a7570',
                            lineHeight: 1,
                          }}
                        >
                          ✓✓
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {showMeetSuggestion && (
            <div className="pt-6 pb-2 text-center">
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="inline-flex items-center gap-2 text-sm font-display italic text-primary hover:text-primary/80 transition-colors"
              >
                <CalendarHeart className="h-4 w-4" />
                Pronti a incontrarvi?
              </button>
            </div>
          )}

          <div ref={listEndRef} />
        </div>
      </main>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="sticky bottom-0 border-t border-border/40 bg-background/95 backdrop-blur-md"
      >
        <div className="max-w-md mx-auto px-3 py-3 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const now = Date.now();
              if (typingChannelRef.current && now - lastTypingSentRef.current > 1500) {
                lastTypingSentRef.current = now;
                typingChannelRef.current.send({
                  type: 'broadcast',
                  event: 'typing',
                  payload: { from: user?.id },
                });
                console.log('[typing-out] broadcast inviato');
              }
            }}
            placeholder="Scrivi un messaggio…"
            maxLength={2000}
            autoComplete="off"
            disabled={sending}
            className="bg-secondary/60 border-border/40 focus-visible:ring-primary/40 text-foreground placeholder:text-muted-foreground/60"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || sending}
            aria-label="Invia"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      {/* Invite sheet */}
      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="bottom" className="bg-card border-border/40">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-2xl text-foreground">
              Invita a uscire
            </SheetTitle>
            <SheetDescription className="text-muted-foreground italic">
              Un gesto vale più di mille messaggi.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5 max-w-md mx-auto">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Tipo
              </p>
              <div className="flex flex-wrap gap-2">
                {DATE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInviteType(t)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      inviteType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-foreground border-border/60 hover:border-primary/60'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Giorno
              </p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setInviteDay(d)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      inviteDay === d
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-foreground border-border/60 hover:border-primary/60'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Fascia
              </p>
              <div className="flex flex-wrap gap-2">
                {SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInviteSlot(s)}
                    className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                      inviteSlot === s
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-foreground border-border/60 hover:border-primary/60'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Zona
              </p>
              <Input
                value={inviteArea}
                onChange={(e) => setInviteArea(e.target.value)}
                placeholder="Es. Navigli, Trastevere…"
                className="bg-secondary/60 border-border/40 text-foreground placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              onClick={handleSendInvite}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-display text-base tracking-wide"
            >
              Invia invito
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Chat;
