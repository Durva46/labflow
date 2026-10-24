import { useEffect, useState } from 'react';
import { apiGetList, apiPatch, apiPost } from '../lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Select } from '../components/ui/Select';
import { usePeriod } from '../context/PeriodContext';
import { formatDate } from '../lib/format';
import type { MediaPreparation, Sample } from '../types';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  sampleId: z.string().optional(),
  preparationDate: z.string().min(1, 'Required'),
  mediaType: z.string().min(1, 'Required'),
  batchNo: z.string().optional(),
  quantity: z.coerce.number().positive('Must be greater than 0').optional().or(z.literal('')),
  unit: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function MediaPage() {
  const { month, year } = usePeriod();
  const [items, setItems] = useState<MediaPreparation[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<MediaPreparation | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [search, setSearch] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { preparationDate: new Date().toISOString().slice(0, 10) },
  });

  const load = async () => {
    try {
      const response = await apiGetList<MediaPreparation>('/media-preparation', {
        params: { month, year, pageSize: 100 },
      });
      setItems(response.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void load();
  }, [month, year]);

  const searchSamples = async () => {
    try {
      const response = await apiGetList<Sample>('/samples', {
        params: { month, year, search: search || undefined, pageSize: 25 },
      });
      setSamples(response.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (open) void searchSamples();
  }, [open, search]);

  const openCreate = () => {
    setEdit(null);
    reset({ preparationDate: new Date().toISOString().slice(0, 10), quantity: '', sampleId: '' });
    setOpen(true);
  };

  const openEditDialog = (item: MediaPreparation) => {
    setEdit(item);
    reset({
      sampleId: item.sampleId ?? '',
      preparationDate: item.preparationDate,
      mediaType: item.mediaType,
      batchNo: item.batchNo ?? '',
      quantity: item.quantity ?? '',
      unit: item.unit ?? '',
      notes: item.notes ?? '',
    });
    setOpen(true);
  };

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ...values,
      quantity: values.quantity === '' || values.quantity === undefined ? null : Number(values.quantity),
    };
    if (edit) {
      await apiPatch<MediaPreparation>(`/media-preparation/${edit.id}`, payload);
    } else {
      await apiPost<MediaPreparation>('/media-preparation', payload);
    }
    setOpen(false);
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Media Preparation</h1>
          <p className="text-sm text-gray-500">
            Record preparations manually. Quantities are not auto-calculated.
          </p>
        </div>
        <Button onClick={openCreate}>New preparation</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Preparations</CardTitle>
          <CardDescription>
            Recipe, ingredient and stock calculations are not configured for this laboratory yet — quantities are recorded manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Sample</Th>
                <Th>Media type</Th>
                <Th>Batch</Th>
                <Th className="text-right">Quantity</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td>{formatDate(item.preparationDate)}</Td>
                  <Td>
                    {item.sampleName || item.sampleIdentifier || '—'}
                  </Td>
                  <Td>{item.mediaType}</Td>
                  <Td>{item.batchNo || '—'}</Td>
                  <Td className="text-right tabular-nums">
                    {item.quantity ?? '—'} {item.unit ?? ''}
                  </Td>
                  <Td>
                    <Badge tone={item.status === 'RECORDED' ? 'success' : 'neutral'}>
                      {item.status}
                    </Badge>
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? 'Edit preparation' : 'New preparation'}
        description="Enter confirmed values only."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
              {edit ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-3">
          <Field label="Sample (optional)" htmlFor="sampleId">
            <Select id="sampleId" {...register('sampleId')}>
              <option value="">None</option>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.sampleIdentifier} — {sample.sampleName}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Search samples"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-2"
            />
          </Field>
          <Field label="Preparation date" htmlFor="preparationDate" required error={errors.preparationDate?.message}>
            <Input id="preparationDate" type="date" {...register('preparationDate')} />
          </Field>
          <Field label="Media type" htmlFor="mediaType" required error={errors.mediaType?.message}>
            <Input id="mediaType" {...register('mediaType')} />
          </Field>
          <Field label="Batch no" htmlFor="batchNo">
            <Input id="batchNo" {...register('batchNo')} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity" htmlFor="quantity" error={errors.quantity?.message}>
              <Input id="quantity" type="number" step="any" {...register('quantity')} />
            </Field>
            <Field label="Unit" htmlFor="unit">
              <Input id="unit" {...register('unit')} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" {...register('notes')} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
