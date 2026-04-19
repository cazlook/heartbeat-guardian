import { Link, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const ChatPlaceholder = () => {
  const { matchId } = useParams<{ matchId: string }>();
  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Chat</h1>
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            La chat sarà disponibile a breve.
          </p>
          <p className="text-xs text-muted-foreground">
            Match ID: <span className="font-mono">{matchId}</span>
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/matches">Torna ai match</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default ChatPlaceholder;
