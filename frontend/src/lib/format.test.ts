import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  addMinutesToTime,
  calculateEndTime,
  formatDate,
  formatTime12h,
} from '../lib/format';

describe('format', () => {
  it('converts 24h to 12h', () => {
    expect(formatTime12h('00:05')).toBe('12:05 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
    expect(formatTime12h('11:00')).toBe('11:00 AM');
    expect(formatTime12h('13:30')).toBe('1:30 PM');
  });

  it('calculates end time across midnight', () => {
    expect(calculateEndTime('23:00', 120)).toBe('01:00');
    expect(addMinutesToTime('23:45', 30)).toBe('00:15');
  });

  it('formats dates', () => {
    expect(formatDate('2026-09-01')).toBe('1 Sep 2026');
    expect(addDaysISO('2026-09-01', 1)).toBe('2026-09-02');
  });
});
