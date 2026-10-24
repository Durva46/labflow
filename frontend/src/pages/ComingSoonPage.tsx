import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function ComingSoonPage({ stage }: { stage: number }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <p className="text-base font-semibold text-gray-900">Stage {stage} — Coming Soon</p>
        <p className="mt-1 text-sm text-gray-500">This stage is not specified yet.</p>
        <p className="mt-1 text-sm text-gray-500">No business rules have been invented for this stage.</p>
        <div className="mt-4 flex justify-center">
          <Button asChild variant="secondary">
            <Link to="/">Back to Dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
