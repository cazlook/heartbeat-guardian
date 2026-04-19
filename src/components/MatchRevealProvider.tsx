import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SEEN_KEY = 'heartsync:matches:lastSeenAt';

interface MatchRevealContextValue {
  unseenCount: number;
  markAllSeen: () => void;
}

const MatchRevealContext = createContext<MatchRevealContextValue | undefined>(undefined);

const readLastSeen = (): number => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
};

const writeLastSeen = (ts: number) => {
  try {
    localStorage.setItem(SEEN_KEY, String(ts));
  } catch {
    /* ignore */
  }
};

export const MatchRevealProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenRef = useRef<number>(readLastSeen());
  // Track recently revealed match ids to dedupe across realtime + initial fetch
  const revealedIdsRef = useRef<Set<string>>(new Set());

  const showRevealToast = useCallback(
    (matchId: string) => {
      if (revealedIdsRef.current.has(matchId)) return;
      revealedIdsRef.current.add(matchId);

      toast('Il tuo cuore ha reagito a qualcuno', {
        description: 'Scopri chi ti ha fatto battere il cuore',
        duration: 12000,
        icon: <Heart className="h-4 w-4 fill-current text-primary" />,
        action: {
          label: 'Scopri chi',
          onClick: () => navigate('/matches'),
        },
      });
    },
    [navigate],
  );

  // Initial unseen count + catch-up reveal for matches created while offline
  useEffect(() => {
    if (!user) {
      setUnseenCount(0);
      revealedIdsRef.current.clear();
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, created_at')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (cancelled || error || !data) return;

      const lastSeen = lastSeenRef.current;
      const newer = data.filter((m) => new Date(m.created_at).getTime() > lastSeen);
      setUnseenCount(newer.length);
      // Catch-up reveal: only the most recent one if any, to avoid toast spam
      if (newer.length > 0 && location.pathname !== '/matches') {
        showRevealToast(newer[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Realtime subscription on matches
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`matches:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const row = payload.new as { id: string; user_a: string; user_b: string };
          // Defense in depth: realtime currently has no server-side filter
          if (row.user_a !== user.id && row.user_b !== user.id) return;

          setUnseenCount((c) => c + 1);

          // If user is already on /matches, no toast needed — they will see it.
          if (location.pathname !== '/matches') {
            showRevealToast(row.id);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, location.pathname, showRevealToast]);

  const markAllSeen = useCallback(() => {
    const now = Date.now();
    lastSeenRef.current = now;
    writeLastSeen(now);
    setUnseenCount(0);
  }, []);

  return (
    <MatchRevealContext.Provider value={{ unseenCount, markAllSeen }}>
      {children}
    </MatchRevealContext.Provider>
  );
};

export const useMatchReveal = (): MatchRevealContextValue => {
  const ctx = useContext(MatchRevealContext);
  if (!ctx) {
    // Safe fallback so components outside the provider don't crash
    return { unseenCount: 0, markAllSeen: () => {} };
  }
  return ctx;
};
