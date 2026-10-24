import { useEffect, useState } from 'react';
import { apiGet, apiPatch } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import type { LabSettings } from '../types';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [settings, setSettings] = useState<LabSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await apiGet<LabSettings>('/settings');
      setSettings(result);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!isAdmin || !settings) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiPatch('/settings', settings);
      setMessage('Settings saved.');
    } catch {
      setMessage('Failed to save settings.');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md text-center">
          <p className="text-base font-semibold text-gray-900">You do not have permission</p>
          <p className="mt-1 text-sm text-gray-500">Only administrators can access settings.</p>
        </Card>
      </div>
    );
  }

  if (!settings) return null;

  const update = (key: keyof LabSettings, value: unknown) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateMapping = (key: keyof LabSettings['columnMapping'], value: string) => {
    setSettings((prev) =>
      prev ? { ...prev, columnMapping: { ...prev.columnMapping, [key]: value } } : prev,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Document metadata, column mapping and classification rules.</p>
      </div>
      {message ? <p className="text-sm text-gray-600">{message}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>Document metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Lab name">
              <Input value={settings.labName} onChange={(e) => update('labName', e.target.value)} />
            </Field>
            <Field label="Lab address">
              <Input value={settings.labAddress} onChange={(e) => update('labAddress', e.target.value)} />
            </Field>
            <Field label="Document format no">
              <Input value={settings.documentFormatNo} onChange={(e) => update('documentFormatNo', e.target.value)} />
            </Field>
            <Field label="SOP reference">
              <Input value={settings.documentSopReference} onChange={(e) => update('documentSopReference', e.target.value)} />
            </Field>
            <Field label="Equipment number">
              <Input value={settings.equipmentNumber} onChange={(e) => update('equipmentNumber', e.target.value)} />
            </Field>
            <Field label="Retention days">
              <Input type="number" value={settings.retentionDays} onChange={(e) => update('retentionDays', Number(e.target.value))} />
            </Field>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Default column mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Sample identifier header">
              <Input value={settings.columnMapping.sampleIdentifier} onChange={(e) => updateMapping('sampleIdentifier', e.target.target.value)} />
            </Field>
            <Field label="Sample name header">
              <Input value={settings.columnMapping.sampleName} onChange={(e) => updateMapping('sampleName', e.target.value)} />
            </Field>
            <Field label="Registration date header">
              <Input value={settings.columnMapping.registrationDate} onChange={(e) => updateMapping('registrationDate', e.target.value)} />
            </Field>
            <Field label="Sample category header">
              <Input value={settings.columnMapping.sampleCategory} onChange={(e) => updateMapping('sampleCategory', e.target.value)} />
            </Field>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Classification rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {(settings.classificationRules || []).map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={rule.match}
                  onChange={(e) => {
                    const rules = [...settings.classificationRules];
                    rules[index] = { ...rules[index], match: e.target.value };
                    update('classificationRules', rules);
                  }}
                />
                <select
                  value={rule.category}
                  onChange={(e) => {
                    const rules = [...settings.classificationRules];
                    rules[index] = { ...rules[index], category: e.target.value as 'WATER' | 'NON_WATER' };
                    update('classificationRules', rules);
                  }}
                  className="h-9 rounded-md border border-line px-2 text-sm"
                >
                  <option value="WATER">WATER</option>
                  <option value="NON_WATER">NON_WATER</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const rules = settings.classificationRules.filter((_, i) => i !== index);
                    update('classificationRules', rules);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                update('classificationRules', [
                  ...(settings.classificationRules || []),
                  { match: '', category: 'WATER' },
                ]);
              }}
            >
              Add rule
            </Button>
          </div>
        </CardContent>
      </Card>
      <div>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
}
