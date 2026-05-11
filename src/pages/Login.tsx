import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div
      className="min-h-screen flex items-center justify-center p-6 text-foreground"
      style={{ backgroundColor: '#0d0d0d' }}
    >
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <p
            className="text-[10px] uppercase tracking-[0.4em]"
            style={{ color: '#7a7570' }}
          >
            HeartSync
          </p>
          <h1
            className="font-display text-5xl leading-[1.05]"
            style={{ color: '#f0ece4' }}
          >
            Bentornato.
          </h1>
          <p
            className="font-display italic text-base"
            style={{ color: '#d4a574' }}
          >
            Il tuo cuore lo ha scelto prima di te.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-[10px] uppercase tracking-[0.25em]"
              style={{ color: '#7a7570' }}
            >
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              style={{
                color: '#f0ece4',
                border: '1px solid #2a2a2a',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#d4a574')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-[10px] uppercase tracking-[0.25em]"
              style={{ color: '#7a7570' }}
            >
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
              className="h-12 rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              style={{
                color: '#f0ece4',
                border: '1px solid #2a2a2a',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#d4a574')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2a2a')}
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-none uppercase tracking-[0.25em] text-xs font-medium hover:brightness-110 transition-all"
            style={{
              backgroundColor: '#d4a574',
              color: '#0d0d0d',
            }}
          >
            {submitting ? 'Accesso…' : 'Accedi'}
          </Button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-xs" style={{ color: '#7a7570' }}>
            Non hai un account?{' '}
            <Link
              to="/register"
              className="underline-offset-4 hover:underline transition-colors"
              style={{ color: '#d4a574' }}
            >
              Registrati
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
