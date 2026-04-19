/**
 * ProfileDetailSheet — dettaglio profilo (mock o reale).
 *
 * Mostra galleria foto scorrevole orizzontalmente (snap), bio completa,
 * interessi, distanza. Si apre come bottom sheet per accordarsi al tono
 * mobile-first dell'app.
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { MapPin, Sparkles } from 'lucide-react';

export interface ProfileDetail {
  id: string;
  name: string;
  age: number | null;
  bio: string | null;
  photos: string[];
  interests?: string[];
  distance_km?: number | null;
}

interface Props {
  profile: ProfileDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProfileDetailSheet = ({ profile, open, onOpenChange }: Props) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[90vh] p-0 overflow-hidden rounded-t-3xl border-t border-border bg-gradient-surface"
      >
        {profile && (
          <div className="h-full overflow-y-auto pb-12">
            {/* Galleria foto orizzontale con snap */}
            <div className="relative">
              <div
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: 'none' }}
              >
                {profile.photos.length === 0 ? (
                  <div className="aspect-[3/4] w-full shrink-0 bg-muted flex items-center justify-center text-muted-foreground">
                    Nessuna foto
                  </div>
                ) : (
                  profile.photos.map((src, i) => (
                    <div key={`${src}-${i}`} className="aspect-[3/4] w-full shrink-0 snap-center relative">
                      <img
                        src={src}
                        alt={`${profile.name} ${i + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {/* dots overlay */}
                      {profile.photos.length > 1 && (
                        <div className="absolute top-3 inset-x-0 flex justify-center gap-1.5 px-4">
                          {profile.photos.map((_, j) => (
                            <span
                              key={j}
                              className={`h-1 flex-1 max-w-12 rounded-full transition-colors ${
                                j === i ? 'bg-foreground' : 'bg-foreground/30'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-overlay" />
            </div>

            {/* Header info */}
            <div className="px-6 -mt-20 relative">
              <SheetHeader className="text-left space-y-1">
                <SheetTitle className="text-3xl font-bold tracking-tight">
                  {profile.name}
                  {profile.age != null && (
                    <span className="font-light text-muted-foreground"> · {profile.age}</span>
                  )}
                </SheetTitle>
                {profile.distance_km != null && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>a {profile.distance_km} km da te</span>
                  </div>
                )}
              </SheetHeader>
            </div>

            {/* Bio */}
            {profile.bio && (
              <section className="px-6 mt-6">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Su di me
                </h3>
                <p className="text-base leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {profile.bio}
                </p>
              </section>
            )}

            {/* Interessi */}
            {profile.interests && profile.interests.length > 0 && (
              <section className="px-6 mt-6">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> Interessi
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
      </SheetContent>
    </Sheet>
  );
};
