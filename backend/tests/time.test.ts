import { describe, expect, it } from 'vitest';
import { addMinutesToTime, endTimeAcrossMidnight, minutesToTime, parseLooseDate, timeToMinutes, to12Hour } from '../src/lib/time';

describe('time helpers', () => {
  it('converts HH:mm to 12h format', () => {
    expect(to12Hour('11:00')).toBe('11:00 AM');
    expect(to12Hour('11:10')).toBe('11:10 AM');
    expect(to12Hour('11:25')).toBe('11:25 AM');
    expect(to12Hour('00:05')).toBe('12:05 AM');
    expect(to12Hour('12:00')).toBe('12:00 PM');
    expect(to12Hour('23:30')).toBe('11:30 PM');
  });

  it('adds minutes and wraps across midnight', () => {
    expect(addMinutesToTime('11:10', 15)).toBe('11:25');
    expect(addMinutesToTime('23:50', 20)).toBe('00:10');
    expect(timeToMinutes('00:10')).toBe(10);
    expect(minutesToTime(1450)).toBe('00:10');
  });

  it('parses loose dates without guessing month-first for ambiguous strings', () => {
    expect(parseLooseDate('2026-09-01')?.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(parseLooseDate('01/09/2026')?.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(parseLooseDate('1 Sep 2026')?.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(parseLooseDate(null)).toBeNull();
    expect(parseLooseDate('09/01/2026')).toBeNull(); // month-first ambiguous - rejected
  });

  it('computes end time helper name used by tests', () => {
    // The app uses addMinutesToTime; keep compatibility if older helper name appears.
    const end = addMinutesToTime('23:45', 30);
    expect(end).toBe('00:15');
  });
});

// Keep a named export for any test that might import it.
export const endTimeAcrossMidnight = (start: string, duration: number) => addMinutesToTime(start, duration);
