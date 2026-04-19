import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const BIO_MAX = 300;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ProfileSetup = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  // Load existing profile (so the user can re-enter the page without losing data)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('photos, bio')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast({ title: 'Errore caricamento profilo', description: error.message, variant: 'destructive' });
      } else if (data) {
        setPhotos(data.photos ?? []);
        setBio(data.bio ?? '');
      }
      setHydrating(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking same file
    if (!file || !user) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: 'Formato non supportato', description: 'Usa JPG, PNG o WebP.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: 'File troppo grande', description: 'Massimo 5 MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) {
      setUploading(false);
      toast({ title: 'Upload fallito', description: upErr.message, variant: 'destructive' });
      return;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    setPhotos((prev) => [...prev, pub.publicUrl]);
    setUploading(false);
  };

  const removePhoto = async (url: string) => {
    if (!user) return;
    // Best-effort storage cleanup (path = "<uid>/<filename>")
    const marker = `/avatars/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      const objectPath = url.substring(idx + marker.length);
      await supabase.storage.from('avatars').remove([objectPath]);
    }
    setPhotos((prev) => prev.filter((p) => p !== url));
  };

  const onSave = async () => {
    if (!user) return;
    if (photos.length === 0) {
      toast({ title: 'Aggiungi almeno una foto', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          photos,
          bio: bio.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
    setSaving(false);
    if (error) {
      toast({ title: 'Salvataggio fallito', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Profilo salvato' });
    navigate('/discovery', { replace: true });
  };

  if (authLoading || hydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const bioRemaining = BIO_MAX - bio.length;

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Completa il tuo profilo</h1>
          <p className="text-sm text-muted-foreground">Aggiungi una foto e una bio per iniziare.</p>
        </header>

        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Foto</Label>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url) => (
                <div key={url} className="relative aspect-square rounded-md overflow-hidden bg-muted group">
                  <img src={url} alt="Foto profilo" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute top-1 right-1 bg-background/80 backdrop-blur rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                    aria-label="Rimuovi foto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={onPickFile}
                disabled={uploading}
                className="aspect-square rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Camera className="h-5 w-5" />
                    <span className="text-[10px]">Aggiungi</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              className="hidden"
              onChange={onFileChange}
            />
            <p className="text-xs text-muted-foreground">JPG, PNG o WebP · max 5 MB</p>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="bio">Bio</Label>
            <span
              className={`text-xs ${bioRemaining < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {bioRemaining}
            </span>
          </div>
          <Textarea
            id="bio"
            placeholder="Raccontaci qualcosa di te…"
            value={bio}
            maxLength={BIO_MAX}
            rows={4}
            onChange={(e) => setBio(e.target.value)}
          />
        </Card>

        <Button
          onClick={onSave}
          disabled={saving || uploading || photos.length === 0 || bioRemaining < 0}
          className="w-full"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvataggio…</>
          ) : (
            'Salva e continua'
          )}
        </Button>
      </div>
    </div>
  );
};

export default ProfileSetup;
