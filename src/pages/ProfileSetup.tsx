import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const ProfileSetup = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Completa il tuo profilo</h1>
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Placeholder. Upload foto e bio verranno aggiunti nello step successivo.
          </p>
          <Button className="w-full" onClick={() => navigate('/discovery')}>
            Continua
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default ProfileSetup;
