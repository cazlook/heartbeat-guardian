import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { BannerData } from '@/components/InAppBanner';

const TYPE_LABEL: Record<string, string> = {
  coffee: 'Caffè',
  drink: 'Drink',
  dinner: 'Cena',
  walk: 'Passeggiata',
  activity: 'Attività',
  event: 'Evento',
};

const formatWhen = (iso: string | null | undefined, day: string | null | undefined): string => {
  if (iso) {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return '';
    }
  }
  return day ?? '';
};

const buildDetail = (inv: {
  type: string | null;
  invite_type: string | null;
  location: string | null;
  area: string | null;
  scheduled_at: string | null;
  day: string | null;
}): string => {
  const t = inv.type ?? inv.invite_type ?? '';
  const tipo = TYPE_LABEL[t] ?? (t ? t : '');
  const luogo = inv.location ?? inv.area ?? '';
  const quando = formatWhen(inv.scheduled_at, inv.day);
  return [tipo, luogo, quando].filter(Boolean).join(' · ');
};

export const useInAppNotifications = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [banner, setBanner] = useState<BannerData | null>(null);

  const dismissBanner = () => setBanner(null);

  useEffect(() => {
    if (!user?.id) return;

    const isInChatFor = (matchId: string) =>
      location.pathname.startsWith(`/chat/${matchId}`);

    const channel = supabase
      .channel(`inapp:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'date_invites',
          filter: `to_user_id=eq.${user.id}`,
        },
        async (payload) => {
          const inv = payload.new as any;
          if (isInChatFor(inv.match_id)) return;
          const { data: prof } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', inv.from_user_id)
            .maybeSingle();
          setBanner({
            id: inv.id,
            kind: 'invite',
            name: prof?.name ?? 'Match',
            detail: buildDetail(inv),
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'date_invites',
          filter: `from_user_id=eq.${user.id}`,
        },
        async (payload) => {
          const inv = payload.new as any;
          const oldInv = payload.old as any;
          if (inv.status !== 'accepted') return;
          if (oldInv?.status === 'accepted') return;
          if (isInChatFor(inv.match_id)) return;
          const { data: prof } = await supabase
            .from('profiles')
            .select('name')
            .eq('id', inv.to_user_id)
            .maybeSingle();
          setBanner({
            id: `acc-${inv.id}`,
            kind: 'accepted',
            name: prof?.name ?? 'Match',
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, location.pathname]);

  return { banner, dismissBanner };
};

export default useInAppNotifications;
