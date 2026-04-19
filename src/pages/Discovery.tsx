import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';

const Discovery = () => {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Discovery</h1>
          <Button size="sm" variant="ghost" onClick={signOut}>Logout</Button>
        </header>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Loggato come {user?.email}</p>
          <p className="text-sm mt-2">La discovery dei profili verrà costruita nello step successivo.</p>
        </Card>
        <div className="flex gap-2 text-sm">
          <Link to="/matches" className="text-primary hover:underline">Matches</Link>
          <Link to="/profile/setup" className="text-primary hover:underline">Profilo</Link>
          <Link to="/debug" className="text-primary hover:underline">Debug</Link>
        </div>
      </div>
    </div>
  );
};

export default Discovery;
