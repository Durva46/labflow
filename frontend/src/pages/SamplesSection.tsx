import { useEffect, useState } from 'react';
import { apiGet, apiGetList } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, Tbody, Td, Th, Thead, Tr } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Pagination } from '../components/ui/Pagination';
import { usePeriod } from '../context/PeriodContext';
import { formatDate } from '../lib/format';
import type { DailySummary, Sample, SampleCategory } from '../types';

export function SamplesSection() {
  const { month, year } = usePeriod();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'' | SampleCategory>('');
  const [summary, setSummary] = useState<DailySummary | null>(null);

  const load = async () => {
    try {
      const response = await apiGetList<Sample>('/samples', {
        params: {
          month,
          year,
          page,
          pageSize: 25,
          search: search || undefined,
          category: category || undefined,
        },
      });
      setSamples(response.data);
      setMeta(response.meta);
    } catch {
      // ignore
    }
  };

  const loadSummary = async () => {
    try {
      const result = await apiGet<DailySummary>('/samples/daily-summary', {
        params: { month, year },
      });
      setSummary(result);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void load();
  }, [month, year, page, search, category]);

  useEffect(() => {
    void loadSummary();
  }, [month, year]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Daily counts</CardTitle>
        </CardHeader>
        <CardContent>
          {summary ? (
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Water</Th>
                  <Th className="text-right">Non-water</Th>
                  <Th className="text-right">Unknown</Th>
                </Tr>
              </Thead>
              <Tbody>
                {summary.days.map((day) => (
                  <Tr key={day.date}>
                    <Td>{formatDate(day.date)}</Td>
                    <Td className="text-right tabular-nums">{day.total}</Td>
                    <Td className="text-right tabular-nums">{day.water}</Td>
                    <Td className="text-right tabular-nums">{day.nonWater}</Td>
                    <Td className="text-right tabular-nums">{day.unknown}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <p className="text-sm text-gray-500">No data.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registered samples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search samples"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <Select
              value={category}
              onChange={(event) => {
                setPage(1);
                setCategory(event.target.value as '' | SampleCategory);
              }}
              className="sm:w-[200px]"
            >
              <option value="">All categories</option>
              <option value="WATER">Water</option>
              <option value="NON_WATER">Non-water</option>
              <option value="UNKNOWN">Unknown</option>
            </Select>
          </div>
          <Table>
            <Thead>
              <Tr>
                <Th>Sample ID</Th>
                <Th>Name</Th>
                <Th>Date</Th>
                <Th>Category</Th>
              </Tr>
            </Thead>
            <Tbody>
              {samples.map((sample) => (
                <Tr key={sample.id}>
                  <Td>{sample.sampleIdentifier}</Td>
                  <Td>{sample.sampleName}</Td>
                  <Td>{formatDate(sample.registrationDate)}</Td>
                  <Td>
                    <Badge tone="neutral">{sample.sampleCategory}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination page={page} totalPages={meta.totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
