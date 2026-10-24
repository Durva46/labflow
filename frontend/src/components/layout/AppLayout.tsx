import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { usePeriod } from '../../context/PeriodContext';
import type { DashboardData } from '../../types';

interface AppLayoutProps {
  dashboard?: DashboardData | null;
  title?: string;
  breadcrumb?: string;
}

export function AppLayout({ dashboard, title, breadcrumb }: AppLayoutProps) {
  const [open, setOpen] = useState(false);
  const { month, year } = usePeriod();
  const pageTitle = title ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-canvas text-sm text-gray-900">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[240px]">
        <Topbar
          title={pageTitle}
          breadcrumb={breadcrumb}
          onMenu={() => setOpen(true)}
          dashboard={dashboard}
        />
        <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-4">
          <Outlet context={{ dashboard, month, year }} />
        </main>
      </div>
    </div>
  );
}
