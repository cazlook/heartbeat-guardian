import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

const noirBorder = { border: '1px solid #2a2a2a' } as const;

const Register = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender || !lookingFor) {
      toast({ title: 'Campi mancanti', description: 'Seleziona genere e chi cerchi.', variant: 'destructive' });
      return;
    }
    const ageNum = Number(age);
    if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 120) {
      toast({ title: 'Età non valida', description: 'Devi avere almeno 18 anni.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(email, password, {
      name,
      age: ageNum,
      gender,
      looking_for: lookingFor,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Registrazione fallita', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Account creato', description: 'Completa il tuo profilo.' });
    navigate('/profile/setup', { replace: true });
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#d4a574';
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#2a2a2a';
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 text-foreground"
      style={{ backgroundColor: '#0d0d0d' }}
    >
      <div className="w-full max-w-sm py-10">
        {/* Header */}
        <div className="text-center space-y-4 mb-10">
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
            Inizia.
          </h1>
          <p
            className="font-display italic text-base"
            style={{ color: '#d4a574' }}
          >
            Il tuo cuore lo ha scelto prima di te.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="h-12 rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              style={{ color: '#f0ece4', ...noirBorder }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="h-12 rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              style={{ color: '#f0ece4', ...noirBorder }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
              Nome
            </Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="h-12 rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              style={{ color: '#f0ece4', ...noirBorder }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="age" className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
              Età
            </Label>
            <Input
              id="age"
              type="number"
              min={18}
              max={120}
              required
              value={age}
              onChange={(e) => setAge(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="h-12 rounded-xl bg-transparent text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors"
              style={{ color: '#f0ece4', ...noirBorder }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                Genere
              </Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger
                  className="h-12 rounded-xl bg-transparent text-[14px] focus:ring-0 focus:ring-offset-0"
                  style={{ color: '#f0ece4', ...noirBorder }}
                >
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent
                  className="rounded-xl"
                  style={{ backgroundColor: '#1a1a1a', color: '#f0ece4', ...noirBorder }}
                >
                  <SelectItem value="female">Donna</SelectItem>
                  <SelectItem value="male">Uomo</SelectItem>
                  <SelectItem value="nonbinary">Non binario</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-[0.25em]" style={{ color: '#7a7570' }}>
                Chi cerchi
              </Label>
              <Select value={lookingFor} onValueChange={setLookingFor}>
                <SelectTrigger
                  className="h-12 rounded-xl bg-transparent text-[14px] focus:ring-0 focus:ring-offset-0"
                  style={{ color: '#f0ece4', ...noirBorder }}
                >
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent
                  className="rounded-xl"
                  style={{ backgroundColor: '#1a1a1a', color: '#f0ece4', ...noirBorder }}
                >
                  <SelectItem value="female">Donne</SelectItem>
                  <SelectItem value="male">Uomini</SelectItem>
                  <SelectItem value="everyone">Tutti</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 uppercase tracking-[0.25em] text-xs font-medium hover:brightness-110 transition-all mt-2"
            style={{ backgroundColor: '#d4a574', color: '#0d0d0d' }}
          >
            {submitting ? 'Creazione…' : 'Registrati'}
          </Button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs" style={{ color: '#7a7570' }}>
            Hai già un account?{' '}
            <Link
              to="/login"
              className="underline-offset-4 hover:underline transition-colors"
              style={{ color: '#d4a574' }}
            >
              Accedi
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
