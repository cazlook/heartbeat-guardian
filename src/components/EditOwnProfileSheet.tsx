/**
 * EditOwnProfileSheet — form inline per modificare il proprio profilo.
 *
 * Salva su `profiles` (Supabase): name, bio, photos[]. Lo schema attuale
 * non ha colonna `interests` né `distance` quindi non li salviamo qui —
 * gli interessi appaiono solo per i profili mock di esempio.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X, Plus, Loader2, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface OwnProfile {
  name: string;
  bio: string;
  photos: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const EditOwnProfileSheet = ({ open, onOpenChange, onSaved }: Props) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OwnProfile>({ name: '', bio: '', photos: [] });
  const [newPhoto, setNewPhoto] = useState('');

  // Carica i dati attuali ogni volta che si apre
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, bio, photos')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast({ title: 'Errore caricamento', description: error.message, variant: 'destructive' });
      } else {
        setForm({
          name: data?.name ?? '',
          bio: data?.bio ?? '',
          photos: data?.photos ?? [],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const handleAddPhoto = () => {
    const url = newPhoto.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      toast({ title: 'URL non valido', description: 'Deve iniziare con http:// o https://', variant: 'destructive' });
      return;
    }
    setForm((f) => ({ ...f, photos: [...f.photos, url] }));
    setNewPhoto('');
  };

  const handleRemovePhoto = (i: number) => {
    setForm((f) => ({ ...f, photos: f.photos.filter((_, idx) => idx !== i) }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim() || null,
        bio: form.bio.trim() || null,
        photos: form.photos,
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Errore salvataggio', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Profilo aggiornato', description: 'Le modifiche sono salvate.' });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] p-0 overflow-hidden rounded-t-3xl border-t border-border bg-gradient-surface"
      >
        <div className="h-full overflow-y-auto">
          <SheetHeader className="px-6 pt-8 pb-4 text-left">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Heart className="h-4 w-4 fill-current" />
              </span>
              <SheetTitle className="text-2xl font-bold tracking-tight">Il tuo profilo</SheetTitle>
            </div>
            <SheetDescription className="text-sm text-muted-foreground">
              Cura come ti presenti — è quello che gli altri vedranno mentre i loro cuori reagiscono.
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="px-6 py-12 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-6 pb-12 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="own-name">Nome</Label>
                <Input
                  id="own-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Come vuoi essere chiamato/a"
                  maxLength={40}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="own-bio">Bio</Label>
                <Textarea
                  id="own-bio"
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Una frase che dice qualcosa di vero su di te."
                  rows={4}
                  maxLength={300}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {form.bio.length}/300
                </p>
              </div>

              <div className="space-y-3">
                <Label>Foto</Label>
                {form.photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {form.photos.map((src, i) => (
                      <div key={`${src}-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-border group">
                        <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(i)}
                          className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Rimuovi foto"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Incolla URL foto (https://…)"
                    value={newPhoto}
                    onChange={(e) => setNewPhoto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPhoto();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" size="icon" onClick={handleAddPhoto} aria-label="Aggiungi foto">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
                  Annulla
                </Button>
                <Button type="submit" className="flex-1 bg-gradient-cardiac text-primary-foreground shadow-elegant" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
