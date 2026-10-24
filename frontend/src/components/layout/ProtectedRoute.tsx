import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FullPageSpinner } from '../ui/Spinner';
import type { Role } from '../../types';

interface ProtectedRouteProps {
  roles?: Role[];
}

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <ForbiddenView />;
  }

  return <Outlet />;
}

function ForbiddenView() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-base font-semibold text-gray-900">You do not have permission</p>
      <p className="text-sm text-gray-500">This page is not available for your role.</p>
    </div>
  );
}
