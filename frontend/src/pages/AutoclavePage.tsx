import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiGetList, apiPatch, apiPost } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs, useTabs } from '../components/ui/Tabs';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { usePeriod } from '../context/PeriodContext';
import { useAuth } from '../context/AuthContext';
import {
  addMinutesToTime,
  calculateEndTime,
  formatDate,
  formatTime12h,
  toDateInputValue,
  toTimeInputValue,
  todayISO,
} from '../lib/format';
import type { AutoclaveLog, AutoclaveSettings, CleaningRecord, User } from '../types';

export function AutoclavePage() {
  const { month, year } = usePeriod();
  const { user } = useAuth();
  const { active, setActive } = useTabs('log');
  const [logs, setLogs] = useState<AutoclaveLog[]>([]);
  const [settings, setSettings] = useState<AutoclaveSettings | null>(null);
  const [cleaning, setCleaning] = useState<CleaningRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [edit, setEdit] = useState<AutoclaveLog | null>(null);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'LAB_MANAGER';
  const canGenerate = isAdmin || isManager;
  const canVerify = isAdmin || isManager;

  const loadLogs = async () => {
    try {
      const response = await apiGetList<AutoclaveLog>('/autoclave-logs', {
        params: { month, year },
      });
      setLogs(response.data);
    } catch {
      // ignore
    }
  };

  const loadSettings = async () => {
    try {
      const result = await apiGet<AutoclaveSettings>('/autoclave-settings');
      setSettings(result);
    } catch {
      // ignore
    }
  };

  const loadCleaning = async () => {
    try {
      const response = await apiGetList<CleaningRecord>('/autoclave-cleaning', {
        params: { month, year },
      });
      setCleaning(response.data);
    } catch {
      // ignore
    }
  };

  const loadUsers = async () => {
    try {
      const response = await apiGetList<User>('/users', { params: { pageSize: 100 } });
      setUsers(response.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadLogs();
    void loadSettings();
    void loadCleaning();
    if (isAdmin) void loadUsers();
  }, [month, year, isAdmin]);

  const generate = async () => {
    setBusy(true);
    setSummary(null);
    try {
      const result = await apiPost<{ created: number; skipped: number; groupingRule?: string }>('/autoclave-logs/generate', {
        month,
        year,
      });
      setSummary(`Created ${result.created}, skipped ${result.skipped}. Grouping: ${result.groupingRule ?? 'PER_DAY'}.`);
      await loadLogs();
    } catch {
      setSummary('Failed to generate draft entries.');
    } finally {
      setBusy(false);
    }
  };

  const generateCleaning = async () => {
    setBusy(true);
    setSummary(null);
    try {
      await apiPost('/autoclave-cleaning/generate', { month, year });
      setSummary('Cleaning schedule generated.');
      await loadCleaning();
    } catch {
      setSummary('Failed to generate cleaning schedule.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Autoclave Log Book</h1>
        <p className="text-sm text-gray-500">
          Log entries, cleaning schedule, and autoclave settings.
        </p>
      </div>
      <Tabs
        tabs={[
          { id: 'log', label: 'Log Book' },
          { id: 'cleaning', label: 'Cleaning Schedule' },
          { id: 'settings', label: 'Settings' },
        ]}
        active={active}
        onChange={setActive}
      />
      {summary ? <p className="text-sm text-gray-600">{summary}</p> : null}
      {active === 'log' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Log Book</CardTitle>
                <CardDescription>
                  Times shown in 12-hour format. Temperature in °C, pressure in LBS.
                </CardDescription>
              </div>
              {canGenerate ? (
                <Button onClick={generate} disabled={busy}>
                  Generate draft entries
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-xs text-gray-500">
              Legend: Draft vs actual vs Pending Verification vs Verified. Draft entries are not labelled as sterilized/certified.
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Name of Cycle Load</Th>
                  <Th>Autoclave Start Time</Th>
                  <Th>Sterilization Start Time</Th>
                  <Th>Temperature</Th>
                  <Th>Pressure</Th>
                  <Th>End Time</Th>
                  <Th>Cleaning (weekly)</Th>
                  <Th>Done By</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log) => (
                  <Tr key={log.id}>
                    <Td>{formatDate(log.logDate)}</Td>
                    <Td>{log.cycleLoadName}</Td>
                    <Td>{formatTime12h(log.autoclaveStartTime)}</Td>
                    <Td>{formatTime12h(log.sterilizationStartTime)}</Td>
                    <Td className="tabular-nums">
                      {log.temperature ?? '—'} {log.temperature ? log.temperatureUnit || '°C' : ''}
                    </Td>
                    <Td className="tabular-nums">
                      {log.pressure ?? '—'} {log.pressure ? log.pressureUnit || 'LBS' : ''}
                    </Td>
                    <Td>{formatTime12h(log.endTime)}</Td>
                    <Td>—</Td>
                    <Td>{log.responsibleUser?.name || '—'}</Td>
                    <Td>
                      <Badge tone={log.verificationStatus === 'VERIFIED' ? 'success' : log.verificationStatus === 'PENDING_VERIFICATION' ? 'warning' : 'neutral'}>
                        {log.verificationStatus}
                      </Badge>
                    </Td>
                    <Td>
                      <Button variant="ghost" size="sm" onClick={() => setEdit(log)}>
                        Edit
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {active === 'cleaning' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cleaning Schedule</CardTitle>
                <CardDescription>Weekly cleaning schedule for the selected month.</CardDescription>
              </div>
              {canGenerate ? (
                <Button onClick={generateCleaning} disabled={busy}>
                  Generate schedule
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <Thead>
                <Tr>
                  <Th>Scheduled date</Th>
                  <Th>Status</Th>
                  <Th>Completed date</Th>
                  <Th>Responsible person</Th>
                  <Th>Remarks</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {cleaning.map((item) => (
                  <Tr key={item.id}>
                    <Td>{formatDate(item.scheduledDate)}</Td>
                    <Td>
                      <Badge tone={item.status === 'COMPLETED' ? 'success' : item.status === 'OVERDUE' ? 'warning' : 'neutral'}>
                        {item.status}
                      </Badge>
                    </Td>
                    <Td>{item.completedAt ? formatDate(item.completedAt) : '—'}</Td>
                    <Td>
                      {item.responsibleUser && typeof item.responsibleUser === 'object'
                        ? item.responsibleUser.name
                        : '—'}
                    </Td>
                    <Td>{item.remarks || '—'}</Td>
                    <Td>
                      {item.status !== 'COMPLETED' ? (
                        <Button variant="ghost" size="sm" onClick={() => setCompleteId(item.id)}>
                          Record completion
                        </Button>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {active === 'settings' ? (
        <AutoclaveSettingsForm settings={settings} isAdmin={isAdmin} onSaved={loadSettings} />
      ) : null}
      {edit ? (
        <AutoclaveEditDialog
          log={edit}
          users={users}
          canVerify={canVerify}
          isAdmin={isAdmin}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void loadLogs();
          }}
        />
      ) : null}
      {completeId ? (
        <CleaningCompleteDialog
          cleaningId={completeId}
          users={users}
          currentUserId={user?.id ?? null}
          onClose={() => setCompleteId(null)}
          onSaved={() => {
            setCompleteId(null);
            void loadCleaning();
          }}
        />
      ) : null}
    </div>
  );
}

function AutoclaveSettingsForm({
  settings,
  isAdmin,
  onSaved,
}: {
  settings: AutoclaveSettings | null;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<AutoclaveSettings>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const save = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await apiPatch('/autoclave-settings', form);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const update = (key: keyof AutoclaveSettings, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Autoclave Settings</CardTitle>
        <CardDescription>
          Changing defaults never rewrites existing records. Grouping rule is PER_DAY (disabled).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Lab name">
            <Input value={form.labName ?? ''} onChange={(e) => update('labName', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Lab address">
            <Input value={form.labAddress ?? ''} onChange={(e) => update('labAddress', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Document format no">
            <Input value={form.documentFormatNo ?? ''} onChange={(e) => update('documentFormatNo', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="SOP reference">
            <Input value={form.documentSopReference ?? ''} onChange={(e) => update('documentSopReference', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Equipment no">
            <Input value={form.equipmentNumber ?? ''} onChange={(e) => update('equipmentNumber', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Autoclave start time">
            <Input type="time" value={toTimeInputValue(form.autoclaveStartTime)} onChange={(e) => update('autoclaveStartTime', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Sterilization start time">
            <Input type="time" value={toTimeInputValue(form.sterilizationStartTime)} onChange={(e) => update('sterilizationStartTime', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Temperature">
            <Input type="number" value={form.temperature ?? ''} onChange={(e) => update('temperature', Number(e.target.value))} disabled={!isAdmin} />
          </Field>
          <Field label="Temperature unit">
            <Input value={form.temperatureUnit ?? '°C'} onChange={(e) => update('temperatureUnit', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Pressure">
            <Input type="number" value={form.pressure ?? ''} onChange={(e) => update('pressure', Number(e.target.value))} disabled={!isAdmin} />
          </Field>
          <Field label="Pressure unit">
            <Input value={form.pressureUnit ?? 'LBS'} onChange={(e) => update('pressureUnit', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" value={form.durationMinutes ?? ''} onChange={(e) => update('durationMinutes', Number(e.target.value))} disabled={!isAdmin} />
          </Field>
          <Field label="Cleaning anchor date">
            <Input type="date" value={toDateInputValue(form.cleaningAnchorDate)} onChange={(e) => update('cleaningAnchorDate', e.target.value)} disabled={!isAdmin} />
          </Field>
          <Field label="First interval days">
            <Input type="number" value={form.cleaningFirstIntervalDays ?? ''} onChange={(e) => update('cleaningFirstIntervalDays', Number(e.target.value))} disabled={!isAdmin} />
          </Field>
          <Field label="Interval days">
            <Input type="number" value={form.cleaningIntervalDays ?? ''} onChange={(e) => update('cleaningIntervalDays', Number(e.target.value))} disabled={!isAdmin} />
          </Field>
          <Field label="Grouping rule">
            <Select value={form.groupingRule ?? 'PER_DAY'} disabled>
              <option value="PER_DAY">PER_DAY</option>
            </Select>
            <p className="text-xs text-gray-500">Only PER_DAY is implemented.</p>
          </Field>
        </div>
        {isAdmin ? (
          <div className="mt-4">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving...' : 'Save settings'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AutoclaveEditDialog({
  log,
  users,
  canVerify,
  isAdmin,
  onClose,
  onSaved,
}: {
  log: AutoclaveLog;
  users: User[];
  canVerify: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    autoclaveStartTime: log.autoclaveStartTime,
    sterilizationStartTime: log.sterilizationStartTime,
    temperature: log.temperature ?? '',
    pressure: log.pressure ?? '',
    sterilizationDurationMinutes: log.sterilizationDurationMinutes ?? 0,
    endTime: log.endTime,
    endTimeOverridden: log.endTimeOverridden,
    responsibleUserId: log.responsibleUserId ?? '',
    remarks: log.remarks ?? '',
    verificationStatus: log.verificationStatus,
  });
  const [busy, setBusy] = useState(false);

  const computedEnd = useMemo(() => {
    if (form.endTimeOverridden) return form.endTime;
    if (!form.sterilizationStartTime || !form.sterilizationDurationMinutes) return form.endTime;
    return calculateEndTime(form.sterilizationStartTime, Number(form.sterilizationDurationMinutes));
  }, [form.endTimeOverridden, form.sterilizationStartTime, form.sterilizationDurationMinutes, form.endTime]);

  useEffect(() => {
    if (!form.endTimeOverridden) {
      setForm((prev) => ({ ...prev, endTime: computedEnd }));
    }
  }, [computedEnd, form.endTimeOverridden]);

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        autoclaveStartTime: form.autoclaveStartTime,
        sterilizationStartTime: form.sterilizationStartTime,
        temperature: form.temperature === '' ? null : Number(form.temperature),
        pressure: form.pressure === '' ? null : Number(form.pressure),
        sterilizationDurationMinutes:
          form.sterilizationDurationMinutes === '' ? null : Number(form.sterilizationDurationMinutes),
        endTime: form.endTime,
        endTimeOverridden: form.endTimeOverridden,
        responsibleUserId: form.responsibleUserId || null,
        remarks: form.remarks || null,
      };
      if (canVerify) {
        payload.verificationStatus = form.verificationStatus;
      }
      await apiPatch(`/autoclave-logs/${log.id}`, payload);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const override = () => {
    setForm((prev) => ({ ...prev, endTimeOverridden: true }));
  };

  const resetToCalculated = () => {
    setForm((prev) => ({
      ...prev,
      endTimeOverridden: false,
      endTime: calculateEndTime(prev.sterilizationStartTime, Number(prev.sterilizationDurationMinutes)),
    }));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit autoclave entry"
      description="End time is calculated as sterilization start + duration. Editing it marks it as manually overridden."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Autoclave start time">
            <Input type="time" value={toTimeInputValue(form.autoclaveStartTime)} onChange={(e) => setForm((p) => ({ ...p, autoclaveStartTime: e.target.value }))} />
          </Field>
          <Field label="Sterilization start time">
            <Input type="time" value={toTimeInputValue(form.sterilizationStartTime)} onChange={(e) => setForm((p) => ({ ...p, sterilizationStartTime: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Temperature (°C)">
            <Input type="number" value={form.temperature} onChange={(e) => setForm((p) => ({ ...p, temperature: e.target.value }))} />
          </Field>
          <Field label="Pressure (LBS)">
            <Input type="number" value={form.pressure} onChange={(e) => setForm((p) => ({ ...p, pressure: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Duration (minutes)">
            <Input type="number" value={form.sterilizationDurationMinutes} onChange={(e) => setForm((p) => ({ ...p, sterilizationDurationMinutes: Number(e.target.value) }))} />
          </Field>
          <Field label="End time">
            <Input type="time" value={toTimeInputValue(form.endTime)} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value, endTimeOverridden: true }))} onFocus={override} />
          </Field>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={resetToCalculated}>
            Reset to calculated
          </Button>
          {form.endTimeOverridden ? (
            <Badge tone="warning">Manually overridden</Badge>
          ) : (
            <Badge tone="neutral">Calculated</Badge>
          )}
        </div>
        <Field label="Responsible user">
          <Select value={form.responsibleUserId} onChange={(e) => setForm((p) => ({ ...p, responsibleUserId: e.target.value }))}>
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Remarks">
          <Textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
        </Field>
        {(canVerify || isAdmin) ? (
          <Field label="Verification status">
            <Select value={form.verificationStatus} onChange={(e) => setForm((p) => ({ ...p, verificationStatus: e.target.value as AutoclaveLog['verificationStatus'] }))}>
              <option value="DRAFT">DRAFT</option>
              <option value="PENDING_VERIFICATION">PENDING VERIFICATION</option>
              <option value="VERIFIED">VERIFIED</option>
            </Select>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

function CleaningCompleteDialog({
  cleaningId,
  users,
  currentUserId,
  onClose,
  onSaved,
}: {
  cleaningId: string;
  users: User[];
  currentUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    completedAt: todayISO(),
    responsibleUserId: currentUserId ?? '',
    remarks: '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await apiPost(`/autoclave-cleaning/${cleaningId}/complete`, {
        completedAt: form.completedAt,
        responsibleUserId: form.responsibleUserId || undefined,
        remarks: form.remarks || undefined,
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record cleaning completion"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Completed date">
          <Input type="date" value={form.completedAt} onChange={(e) => setForm((p) => ({ ...p, completedAt: e.target.value }))} />
        </Field>
        <Field label="Responsible person">
          <Select value={form.responsibleUserId} onChange={(e) => setForm((p) => ({ ...p, responsibleUserId: e.target.value }))}>
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Remarks">
          <Textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}
