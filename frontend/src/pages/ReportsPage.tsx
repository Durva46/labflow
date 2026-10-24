import { useState } from 'react';
import { apiRequestBlob } from '../lib/api';
import { downloadBlob, suggestFilenameFromTemplate } from '../lib/download';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { usePeriod } from '../context/PeriodContext';

export function ReportsPage() {
  const { month, year } = usePeriod();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const download = async (kind: 'autoclave' | 'monthly', format: 'xlsx' | 'pdf') => {
    const key = `${kind}-${format}`;
    setBusy(key);
    setMessage(null);
    try {
      const path =
        kind === 'autoclave'
          ? `/reports/autoclave/${format}?month=${month}&year=${year}`
          : `/reports/monthly/${format}?month=${month}&year=${year}`;
      const result = await apiRequestBlob(path);
      const filename =
        result.filename || suggestFilenameFromTemplate(kind, format, month, year);
      downloadBlob(result.blob, filename);
      setMessage('Download started.');
    } catch {
      setMessage('Failed to download report.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">
          Download reports for the selected reporting month.
        </p>
      </div>
      {message ? <p className="text-sm text-gray-600">{message}</p> : null}
      <p className="text-xs text-gray-500">
        Exported drafts are not verified records. Filenames follow the documented pattern.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-gray-900">Autoclave Log</p>
          <p className="mt-1 text-sm text-gray-500">
            Includes cycle load, times, temperature/pressure, end time, verification status and responsible user.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => download('autoclave', 'xlsx')} disabled={busy === 'autoclave-xlsx'}>
              {busy === 'autoclave-xlsx' ? 'Downloading...' : 'Download Excel'}
            </Button>
            <Button variant="secondary" onClick={() => download('autoclave', 'pdf')} disabled={busy === 'autoclave-pdf'}>
              {busy === 'autoclave-pdf' ? 'Downloading...' : 'Download PDF'}
            </Button>
          </div>
        </Card>
        <Card>
          <p className="text-sm font-medium text-gray-900">Monthly Lab Report</p>
          <p className="mt-1 text-sm text-gray-500">
            Summary of monthly samples, imports, media preparation and autoclave activity for the reporting period.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => download('monthly', 'xlsx')} disabled={busy === 'monthly-xlsx'}>
              {busy === 'monthly-xlsx' ? 'Downloading...' : 'Download Excel'}
            </Button>
            <Button variant="secondary" onClick={() => download('monthly', 'pdf')} disabled={busy === 'monthly-pdf'}>
              {busy === 'monthly-pdf' ? 'Downloading...' : 'Download PDF'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
