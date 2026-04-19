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
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface OtherProfile {
  id: string;
  name: string | null;
  photos: string[];
}

const Chat = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [other, setOther] = useState<OtherProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

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

      const [profRes, msgRes] = await Promise.all([
        supabase.from('profiles').select('id, name, photos').eq('id', otherId).maybeSingle(),
        supabase
          .from('messages')
          .select('id, match_id, sender_id, content, created_at')
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // ── Auto-scroll on new messages ───────────────────────────────────
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur bg-background/85 border-b">
        <div className="max-w-md mx-auto px-3 py-2 flex items-center gap-3">
          <Button asChild size="icon" variant="ghost" aria-label="Indietro">
            <Link to="/matches">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="h-9 w-9 rounded-full overflow-hidden bg-muted shrink-0">
            {headerPhoto ? (
              <img src={headerPhoto} alt={headerName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                ?
              </div>
            )}
          </div>
          <h1 className="font-semibold truncate">{headerName}</h1>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-3 py-4 space-y-2">
          {messages.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Nessun messaggio. Scrivi per primo.
            </Card>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={[
                      'max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                      mine
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm',
                    ].join(' ')}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>
      </main>

      {/* Composer */}
      <form
        onSubmit={handleSend}
        className="sticky bottom-0 border-t bg-background/95 backdrop-blur"
      >
        <div className="max-w-md mx-auto px-3 py-2 flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Scrivi un messaggio…"
            maxLength={2000}
            autoComplete="off"
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Invia">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Chat;
