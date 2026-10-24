import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { Card } from '../components/ui/Card';
import { StatTile } from '../components/ui/StatTile';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { usePeriod } from '../context/PeriodContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatMonthYear } from '../lib/format';
import type { DashboardData } from '../types';

export function DashboardPage() {
  const { month, year } = usePeriod();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<DashboardData>('/dashboard', {
        params: { month, year },
      });
      setData(result);
    } catch (err) {
      setError('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [month, year]);

  const isAdmin = user?.role === 'ADMIN';
  const hasImport = data?.importStatus?.state === 'COMPLETED' && data.importStatus.import;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">{formatMonthYear(month, year)}</p>
      </div>
      {loading ? <Spinner /> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {data && !hasImport ? (
        <Card>
          <EmptyState
            title={`No monthly report for ${formatMonthYear(month, year)}`}
            description="Upload a monthly Excel report to populate samples and downstream records."
            actionLabel={isAdmin ? 'Go to Imports' : undefined}
            onAction={isAdmin ? () => (window.location.href = '/imports') : undefined}
          />
        </Card>
      ) : null}
      {data && hasImport ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Samples total" value={data.samples.total} />
            <StatTile label="Water" value={data.samples.water} />
            <StatTile label="Non-water" value={data.samples.nonWater} />
            <StatTile label="Unknown" value={data.samples.unknown} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <p className="text-sm font-medium text-gray-900">Media preparation</p>
              <div className="mt-2 flex gap-4 text-sm text-gray-600">
                <span>Total: {data.media.total}</span>
                <span>Draft: {data.media.draft}</span>
                <span>Recorded: {data.media.recorded}</span>
              </div>
            </Card>
            <Card>
              <p className="text-sm font-medium text-gray-900">Autoclave</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                <span>Total: {data.autoclave.total}</span>
                <span>Draft: {data.autoclave.draft}</span>
                <span>Pending verification: {data.autoclave.pendingVerification}</span>
                <span>Verified: {data.autoclave.verified}</span>
              </div>
            </Card>
          </div>
          <Card>
            <p className="text-sm font-medium text-gray-900">Cleaning schedule</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
              <span>Scheduled: {data.cleaning.scheduled}</span>
              <span>Completed: {data.cleaning.completed}</span>
              <span>Pending: {data.cleaning.pending}</span>
              <span>Overdue: {data.cleaning.overdue}</span>
              <span>Next due: {data.cleaning.nextDue ? formatDate(data.cleaning.nextDue) : '—'}</span>
            </div>
            {data.cleaning.items.length > 0 ? (
              <div className="mt-3 flex flex-col divide-y divide-line">
                {data.cleaning.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-gray-900">{formatDate(item.scheduledDate)}</p>
                      <p className="text-xs text-gray-500">
                        {item.responsibleUser && typeof item.responsibleUser === 'object'
                          ? item.responsibleUser.name
                          : ''}
                      </p>
                    </div>
                    <Badge
                      tone={
                        item.status === 'COMPLETED'
                          ? 'success'
                          : item.status === 'OVERDUE'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
          <Card>
            <p className="text-sm font-medium text-gray-900">Recent activity</p>
            <div className="mt-2 flex flex-col divide-y divide-line">
              {data.recentActivity.length === 0 ? (
                <p className="py-2 text-sm text-gray-500">No recent activity.</p>
              ) : (
                data.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-500">
                        {activity.actorName} · {formatDate(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
          {isAdmin && !hasImport ? null : null}
          <Card>
            <p className="text-sm font-medium text-gray-900">Import status</p>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-900">{data.importStatus.state}</p>
                {data.importStatus.import ? (
                  <p className="text-xs text-gray-500">{data.importStatus.import.filename}</p>
                ) : null}
              </div>
              {isAdmin ? <Button asChild variant="secondary" size="sm"><Link to="/imports">Manage imports</Link></Button> : null}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
