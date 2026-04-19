import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Crea il tuo account</h1>
          <p className="text-sm text-muted-foreground">Bastano 30 secondi</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Età</Label>
            <Input id="age" type="number" min={18} max={120} required value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Genere</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Donna</SelectItem>
                  <SelectItem value="male">Uomo</SelectItem>
                  <SelectItem value="nonbinary">Non binario</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chi cerchi</Label>
              <Select value={lookingFor} onValueChange={setLookingFor}>
                <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Donne</SelectItem>
                  <SelectItem value="male">Uomini</SelectItem>
                  <SelectItem value="everyone">Tutti</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creazione…' : 'Registrati'}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          Hai già un account?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Accedi
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default Register;
