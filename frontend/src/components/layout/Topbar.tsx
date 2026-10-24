import { useMemo } from 'react';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { useAuth } from '../../context/AuthContext';
import { usePeriod } from '../../context/PeriodContext';
import { initials, monthOptions } from '../../lib/format';
import type { DashboardData } from '../../types';

interface TopbarProps {
  title: string;
  breadcrumb?: string;
  onMenu: () => void;
  dashboard?: DashboardData | null;
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M9 2.25a4.5 4.5 0 00-4.5 4.5v2.25l-1.125 1.5v.75h11.25v-.75L13.5 9V6.75a4.5 4.5 0 00-4.5-4.5zM7.125 14.25a1.875 1.875 0 003.75 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Topbar({ title, breadcrumb, onMenu, dashboard }: TopbarProps) {
  const { user, logout } = useAuth();
  const { month, year, setMonth, setYear } = usePeriod();

  const pending = useMemo(() => {
    return dashboard?.autoclave?.pendingVerification ?? 0;
  }, [dashboard]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4">
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={onMenu}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M3 5h12M3 9h12M3 13h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="flex flex-1 flex-col">
        {breadcrumb ? (
          <p className="text-xs text-gray-500">{breadcrumb}</p>
        ) : null}
        <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <Select
          aria-label="Reporting month"
          value={String(month)}
          onChange={(event) => setMonth(Number(event.target.value))}
          className="w-[130px]"
        >
          {monthOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <input
          aria-label="Reporting year"
          type="number"
          className="h-9 w-[90px] rounded-md border border-line bg-white px-2 text-sm"
          value={year}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value)) setYear(value);
          }}
        />
      </div>
      <button
        type="button"
        aria-label="Pending verifications"
        className="relative rounded-md p-1.5 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <BellIcon />
        {pending > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] text-white">
            {pending}
          </span>
        ) : null}
      </button>
      <div className="flex items-center gap-2 rounded-md px-2 py-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
          {user ? initials(user.name) : '?'}
        </div>
        <div className="hidden sm:block">
          <p className="text-sm text-gray-900">{user?.name}</p>
          <p className="text-xs text-gray-500">{user?.role}</p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => void logout()}>
        Logout
      </Button>
    </header>
  );
}
