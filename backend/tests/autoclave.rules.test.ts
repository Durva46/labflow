import { describe, expect, it } from 'vitest';
import { cleaningDatesForMonth, deriveCleaningStatus } from '../src/modules/autoclave/service';
import { addMinutesToTime } from '../src/lib/time';

describe('autoclave rules', () => {
  it('uses 6-day gap then 7-day gaps to match the September example', () => {
    const anchor = new Date(Date.UTC(2026, 8, 1)); // 1 Sep
    const dates = cleaningDatesForMonth(anchor, 6, 7, 2026, 9);
    const iso = dates.map((d) => d.toISOString().slice(0, 10));
    expect(iso).toEqual(['2026-09-01', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('calculates end time as start + duration across midnight', () => {
    expect(addMinutesToTime('11:10', 15)).toBe('11:25');
    expect(addMinutesToTime('23:50', 20)).toBe('00:10');
  });

  it('does not mark cleaning complete automatically by date', () => {
    const past = new Date(Date.UTC(2020, 0, 1));
    expect(deriveCleaningStatus(past, null, new Date())).toBe('OVERDUE');
    expect(deriveCleaningStatus(new Date(Date.UTC(2099, 0, 1)), null, new Date())).toBe('PENDING');
  });
});
