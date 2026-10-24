import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../types';

type NavItem =
  | {
      type: 'link';
      to: string;
      label: string;
      roles?: Role[];
      subtle?: boolean;
    }
  | { type: 'section'; label: string };

const items: NavItem[] = [
  { type: 'section', label: 'Workflow' },
  { type: 'link', to: '/', label: 'Dashboard' },
  { type: 'link', to: '/imports', label: 'Monthly Excel Upload', roles: ['ADMIN'] },
  { type: 'link', to: '/media', label: 'Media Preparation' },
  { type: 'link', to: '/autoclave', label: 'Autoclave Log Book' },
  { type: 'link', to: '/reports', label: 'Reports' },
  { type: 'section', label: 'Records' },
  { type: 'link', to: '/stages/3', label: 'Stage 3 — Coming Soon', subtle: true },
  { type: 'link', to: '/stages/4', label: 'Stage 4 — Coming Soon', subtle: true },
  { type: 'link', to: '/stages/5', label: 'Stage 5 — Coming Soon', subtle: true },
  { type: 'link', to: '/stages/6', label: 'Stage 6 — Coming Soon', subtle: true },
  { type: 'link', to: '/stages/7', label: 'Stage 7 — Coming Soon', subtle: true },
  { type: 'section', label: 'Administration' },
  { type: 'link', to: '/settings', label: 'Settings', roles: ['ADMIN'] },
  { type: 'link', to: '/users', label: 'User Management', roles: ['ADMIN'] },
];

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();

  const canView = (roles?: Role[]) => {
    if (!roles || roles.length === 0) return true;
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-gray-900/40 lg:hidden',
          open ? 'block' : 'hidden',
        )}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-[240px] flex-col border-r border-line bg-white transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white">
            LF
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">LabFlow</p>
            <p className="text-xs text-gray-500">Laboratory Operations</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {items.map((item, index) => {
            if (item.type === 'section') {
              return (
                <p
                  key={`section-${index}`}
                  className="px-2 pb-1 pt-3 text-xs uppercase tracking-wide text-gray-500"
                >
                  {item.label}
                </p>
              );
            }
            if (!canView(item.roles)) return null;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  cn(
                    'mb-0.5 flex items-center rounded-md px-2 py-1.5 text-sm',
                    item.subtle ? 'text-gray-400' : 'text-gray-700',
                    isActive
                      ? 'border-l-2 border-brand-600 bg-brand-50 text-gray-900'
                      : 'hover:bg-gray-50',
                  )
                }
                end={item.to === '/'}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
