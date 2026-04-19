import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Heart } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const Login = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Login fallito', description: error.message, variant: 'destructive' });
      return;
    }
    navigate('/discovery', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
      {/* Ambient noir glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute -bottom-40 right-1/4 h-[460px] w-[460px] rounded-full bg-primary/[0.05] blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="rounded-sm border border-border/60 bg-card/80 backdrop-blur-xl p-10 space-y-8">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex h-12 w-12 rounded-full bg-primary/[0.08] border border-primary/20 items-center justify-center mx-auto">
              <Heart className="h-5 w-5 fill-current text-primary" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              HeartSync
            </p>
            <h1 className="font-display text-4xl text-foreground leading-[1.05]">
              Bentornato.
            </h1>
            <p className="text-sm text-muted-foreground">
              Il tuo cuore ti aspetta.
            </p>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-sm bg-input/60 border-border focus-visible:ring-primary/40 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-sm bg-input/60 border-border focus-visible:ring-primary/40 h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 font-medium tracking-wide uppercase text-xs"
              disabled={submitting}
            >
              {submitting ? 'Accesso…' : 'Accedi'}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            Non hai un account?{' '}
            <Link to="/register" className="text-primary hover:text-primary/80 underline underline-offset-4 decoration-primary/30">
              Registrati
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
