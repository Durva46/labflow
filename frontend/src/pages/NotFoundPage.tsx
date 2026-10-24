import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        title="Page not found"
        description="The page you are looking for does not exist."
        actionLabel="Go to dashboard"
        onAction={() => navigate('/')}
      />
    </div>
  );
}
