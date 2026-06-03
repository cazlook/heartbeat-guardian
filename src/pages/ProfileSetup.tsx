import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const BIO_MAX = 300;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

const noirBorder = { border: '1px solid #2a2a2a' } as const;

const ProfileSetup = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);

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
    e.target.value = '';
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0d0d' }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#7a7570' }} />
      </div>
    );
  }

  const bioRemaining = BIO_MAX - bio.length;

  return (
    <div className="min-h-screen p-6 text-foreground" style={{ backgroundColor: '#0d0d0d' }}>
      <div className="max-w-md mx-auto py-8 space-y-8">
        {/* Header noir */}
        <div className="text-center space-y-3">
          <p className="text-[10px] uppercase tracking-[0.4em] hs-fade-in" style={{ color: '#7a7570' }}>
            HeartSync · Profilo
          </p>
          <h1 className="font-display text-4xl leading-[1.05] hs-fade-in-delay-1" style={{ color: '#f0ece4' }}>
            Mostrati.
          </h1>
          <p className="font-display italic text-sm hs-fade-in-delay-2" style={{ color: '#d4a574' }}>
            Una foto, una frase. Il resto lo dirà il battito.
          </p>
        </div>

        {/* Photos */}
        <div className="space-y-3">
          <Label className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
            Foto
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url) => (
              <div
                key={url}
                className="relative aspect-square rounded-xl overflow-hidden group"
                style={{ backgroundColor: '#1a1a1a', ...noirBorder }}
              >
                <img src={url} alt="Foto profilo" className="w-full h-full object-cover photo-color" />
                <button
                  type="button"
                  onClick={() => removePhoto(url)}
                  className="absolute top-1 right-1 backdrop-blur rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                  style={{ backgroundColor: 'rgba(13,13,13,0.8)', color: '#f0ece4' }}
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
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 transition disabled:opacity-40"
              style={{
                border: '1px dashed #2a2a2a',
                color: '#7a7570',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#d4a574';
                e.currentTarget.style.color = '#d4a574';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#2a2a2a';
                e.currentTarget.style.color = '#7a7570';
              }}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Camera className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-[10px] uppercase tracking-[0.18em]">Aggiungi</span>
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
          <p className="text-[11px]" style={{ color: '#5a5550' }}>
            JPG, PNG o WebP · max 5 MB
          </p>
        </div>

        {/* Bio */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="bio" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
              Bio
            </Label>
            <span
              className="text-[11px] font-mono-bpm"
              style={{ color: bioRemaining < 0 ? '#e85d3a' : '#5a5550' }}
            >
              {bioRemaining}
            </span>
          </div>
          <Textarea
            id="bio"
            placeholder="Una frase, un dettaglio, un'ossessione…"
            value={bio}
            maxLength={BIO_MAX}
            rows={5}
            onChange={(e) => setBio(e.target.value)}
            className="rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors resize-none"
            style={{ color: '#f0ece4', ...noirBorder }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#d4a574')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
          />
        </div>

        <Button
          onClick={onSave}
          disabled={saving || uploading || photos.length === 0 || bioRemaining < 0}
          className="w-full h-12 rounded-none uppercase tracking-[0.25em] text-xs font-medium hover:brightness-110 transition-all disabled:opacity-30"
          style={{ backgroundColor: '#d4a574', color: '#0d0d0d' }}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvataggio…
            </span>
          ) : (
            'Salva e continua'
          )}
        </Button>
      </div>
    </div>
  );
};

export default ProfileSetup;
