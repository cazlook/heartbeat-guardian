/**
 * Profile — view-only di un altro utente, raggiunta da Chat header e Matches list.
 * Riusa lo stile di ProfileDetailSheet ma in pagina full-screen.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface ProfileRow {
  id: string;
  name: string | null;
  age: number | null;
  bio: string | null;
  photos: string[];
  interests: string[] | null;
  distance_km: number | null;
}

const Profile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, age, bio, photos, interests, distance_km')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setProfile(data as ProfileRow);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="min-h-screen" style={{ background: '#0d0d0d', color: '#f0ece4' }}>
      <header className="sticky top-0 z-10 backdrop-blur-md border-b border-border/40" style={{ background: 'rgba(13,13,13,0.9)' }}>
        <div className="max-w-md mx-auto px-3 py-3 flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Indietro"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-display text-lg leading-tight truncate" style={{ color: '#f0ece4' }}>
            {profile?.name ?? 'Profilo'}
          </h1>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notFound || !profile ? (
        <div className="max-w-md mx-auto px-6 py-16 text-center text-muted-foreground">
          Profilo non trovato.
        </div>
      ) : (
        <div className="max-w-md mx-auto pb-16">
          {/* Galleria foto orizzontale con snap */}
          <div className="relative">
            <div className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
              {profile.photos.length === 0 ? (
                <div className="aspect-[3/4] w-full shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                  Nessuna foto
                </div>
              ) : (
                profile.photos.map((src, i) => (
                  <div key={`${src}-${i}`} className="aspect-[3/4] w-full shrink-0 snap-center relative">
                    <img src={src} alt={`${profile.name ?? 'Profilo'} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    {profile.photos.length > 1 && (
                      <div className="absolute top-3 inset-x-0 flex justify-center gap-1.5 px-4">
                        {profile.photos.map((_, j) => (
                          <span
                            key={j}
                            className="h-1 flex-1 max-w-12 rounded-full"
                            style={{ background: j === i ? '#f0ece4' : 'rgba(240,236,228,0.3)' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Header info */}
          <div className="px-6 mt-6">
            <h2 className="text-3xl font-bold tracking-tight font-display" style={{ color: '#f0ece4' }}>
              {profile.name ?? 'Senza nome'}
              {profile.age != null && (
                <span className="font-light text-muted-foreground"> · {profile.age}</span>
              )}
            </h2>
            {profile.distance_km != null && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                <MapPin className="h-3.5 w-3.5" />
                <span>a {profile.distance_km} km da te</span>
              </div>
            )}
          </div>

          {profile.bio && (
            <section className="px-6 mt-6">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Su di me</h3>
              <p className="text-base leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(240,236,228,0.9)' }}>
                {profile.bio}
              </p>
            </section>
          )}

          {profile.interests && profile.interests.length > 0 && (
            <section className="px-6 mt-6">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" style={{ color: '#d4a574' }} /> Interessi
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-full px-3 py-1 text-xs font-medium bg-secondary/80 backdrop-blur border border-border/50"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default Profile;
