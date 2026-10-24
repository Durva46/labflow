import { describe, expect, it } from 'vitest';
import { classifyByRules, normaliseCategory } from '../src/modules/imports/excel';

describe('sample classification', () => {
  it('normalises known categories', () => {
    expect(normaliseCategory('Water')).toBe('WATER');
    expect(normaliseCategory('Non-Water')).toBe('NON_WATER');
    expect(normaliseCategory('Non water sample')).toBe('NON_WATER');
  });

  it('applies admin-defined rules (substring and regex)', () => {
    expect(classifyByRules('RO Water', [{ match: 'RO', category: 'WATER' }])).toBe('WATER');
    expect(classifyByRules('SWAB-01', [{ match: '/^SWAB/i', category: 'NON_WATER' }])).toBe('NON_WATER');
  });

  it('never guesses when category cannot be determined', () => {
    expect(classifyByRules('Mystery Sample', [])).toBeNull();
    expect(normaliseCategory('Unknown')).toBeNull();
  });
});
