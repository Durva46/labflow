import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGetList, apiPost } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Pagination } from '../components/ui/Pagination';
import { usePeriod } from '../context/PeriodContext';
import { useAuth } from '../context/AuthContext';
import { formatBytes, formatDate } from '../lib/format';
import type { ImportRecord, ImportResult } from '../types';
import type { NormalisedError } from '../lib/api';

const MAX_SIZE = 10 * 1024 * 1024;

export function ImportsPage() {
  const { month, year } = usePeriod();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [replace, setReplace] = useState(false);
  const [columnMapping, setColumnMapping] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = async (nextPage = page) => {
    try {
      const response = await apiGetList<ImportRecord>('/imports', {
        params: { page: nextPage, pageSize: 25 },
      });
      setHistory(response.data);
      setMeta(response.meta);
    } catch {
      // ignore history load errors on this page
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadHistory(page);
  }, [isAdmin, page]);

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <p className="text-base font-semibold text-gray-900">You do not have permission</p>
          <p className="mt-1 text-sm text-gray-500">
            Only administrators can access monthly imports.
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Back to dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const validateFile = (candidate: File): string | null => {
    if (candidate.size > MAX_SIZE) return 'File must be 10 MiB or smaller.';
    const name = candidate.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      return 'Only .xlsx and .csv files are supported.';
    }
    return null;
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDrag(false);
    const candidate = event.dataTransfer.files?.[0];
    if (!candidate) return;
    const validation = validateFile(candidate);
    if (validation) {
      setError(validation);
      setFile(null);
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const onSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const candidate = event.target.files?.[0];
    if (!candidate) return;
    const validation = validateFile(candidate);
    if (validation) {
      setError(validation);
      setFile(null);
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Select a file to upload.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportingMonth', String(month));
      formData.append('reportingYear', String(year));
      formData.append('replace', String(replace));
      if (columnMapping.trim()) {
        formData.append('columnMapping', columnMapping.trim());
      }
      const response = await apiPost<ImportResult>('/imports/monthly', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response);
      await loadHistory(1);
      setPage(1);
    } catch (err) {
      const normalised = err as NormalisedError;
      if (normalised.code === 'UNSUPPORTED_FILE_TYPE') {
        setError('Only .xlsx and .csv files are supported.');
      } else if (normalised.code === 'INVALID_FILE_SIGNATURE') {
        setError('The file signature is not valid for the selected file type.');
      } else if (normalised.code === 'FILE_TOO_LARGE' || normalised.code === 'PAYLOAD_TOO_LARGE') {
        setError('The file is too large.');
      } else if (normalised.code === 'DUPLICATE_IMPORT') {
        setError('An import for this month already exists.');
      } else {
        setError(normalised.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Monthly Excel Upload</h1>
        <p className="text-sm text-gray-500">
          Upload a monthly report for {month}/{year}. This action replaces existing data only when confirmed.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            Drag and drop a .xlsx or .csv file, or use the picker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 ${
                drag ? 'border-brand-600 bg-brand-50' : 'border-line'
              }`}
            >
              <p className="text-sm text-gray-900">
                {file ? file.name : 'Drop file here or browse'}
              </p>
              {file ? (
                <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
              ) : (
                <p className="text-xs text-gray-500">Accepted: .xlsx, .csv (max 10 MiB)</p>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={onSelect}
                className="hidden"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              Re-import replaces existing month
            </label>
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-3 py-2 text-sm text-gray-900">
                Optional column mapping (JSON fallback)
              </summary>
              <div className="px-3 pb-3">
                <textarea
                  value={columnMapping}
                  onChange={(event) => setColumnMapping(event.target.value)}
                  placeholder='{"sampleIdentifier":"Sample ID","sampleName":"Name","registrationDate":"Date","sampleCategory":"Category"}'
                  className="mt-2 h-24 w-full rounded-md border border-line px-2 py-1 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Used only if the API expects it. Provide valid JSON.
                </p>
              </div>
            </details>
            {error ? <ErrorState message={error} /> : null}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={busy || !file}>
                {busy ? 'Uploading...' : 'Upload and process'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Processing summary</CardTitle>
            <CardDescription>Status: {result.status}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-line px-3 py-2">
                <p className="text-xs text-gray-500">Total rows</p>
                <p className="text-sm font-medium tabular-nums">{result.totalRows}</p>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <p className="text-xs text-gray-500">Accepted</p>
                <p className="text-sm font-medium tabular-nums">{result.acceptedRows}</p>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <p className="text-xs text-gray-500">Rejected</p>
                <p className="text-sm font-medium tabular-nums">{result.rejectedRows}</p>
              </div>
              <div className="rounded-md border border-line px-3 py-2">
                <p className="text-xs text-gray-500">Duplicates</p>
                <p className="text-sm font-medium tabular-nums">{result.duplicateRows}</p>
              </div>
            </div>
            {result.errors && result.errors.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-gray-900">Row-level errors (first 50)</p>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Row</Th>
                      <Th>Message</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {result.errors.map((item, index) => (
                      <Tr key={`${item.rowNumber}-${index}`}>
                        <Td className="tabular-nums">{item.rowNumber}</Td>
                        <Td>{item.message}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                <div className="mt-2">
                  <a
                    href={`/api/v1/imports/${result.id}/errors?format=csv`}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    Download validation report (.csv)
                  </a>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Import history</CardTitle>
          <CardDescription>Previous monthly imports.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState title="No imports yet" description="Upload a report to create history." />
          ) : (
            <>
              <Table>
                <Thead>
                  <Tr>
                    <Th>File</Th>
                    <Th>Period</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Accepted</Th>
                    <Th className="text-right">Rejected</Th>
                    <Th>Created</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {history.map((item) => (
                    <Tr key={item.id}>
                      <Td>{item.filename}</Td>
                      <Td>
                        {item.reportingMonth}/{item.reportingYear}
                      </Td>
                      <Td>
                        <Badge tone="neutral">{item.status}</Badge>
                      </Td>
                      <Td className="text-right tabular-nums">{item.acceptedRows}</Td>
                      <Td className="text-right tabular-nums">{item.rejectedRows}</Td>
                      <Td>{formatDate(item.createdAt)}</Td>
                      <Td>
                        <a
                          href={`/api/v1/imports/${item.id}/errors?format=csv`}
                          className="text-sm text-brand-600 hover:underline"
                        >
                          Download errors
                        </a>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                onChange={(next) => {
                  setPage(next);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
