import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <p className="text-base font-semibold text-gray-900">You do not have permission</p>
        <p className="mt-1 text-sm text-gray-500">
          You do not have access to this page with your current role.
        </p>
        <div className="mt-4 flex justify-center">
          <Button asChild variant="secondary">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
