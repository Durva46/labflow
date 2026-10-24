import { createContext, useContext, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { currentPeriod } from './format';

interface Period {
  month: number;
  year: number;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  setPeriod: (month: number, year: number) => void;
}

const PeriodContext = createContext<Period | undefined>(undefined);

function parsePeriod(params: URLSearchParams): PeriodState {
  const monthRaw = params.get('month');
  const yearRaw = params.get('year');
  const base = currentPeriod();
  let month = base.month;
  let year = base.year;
  if (monthRaw) {
    const value = Number(monthRaw);
    if (Number.isInteger(value) && value >= 1 && value <= 12) {
      month = value;
    }
  }
  if (yearRaw) {
    const value = Number(yearRaw);
    if (Number.isInteger(value) && value >= 2000 && value <= 2100) {
      year = value;
    }
  }
  return { month, year };
}

interface PeriodState {
  month: number;
  year: number;
}

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<PeriodState>(() => parsePeriod(params));

  const update = (next: PeriodState) => {
    setState(next);
    const p = new URLSearchParams(params);
    p.set('month', String(next.month));
    p.set('year', String(next.year));
    setParams(p, { replace: true });
  };

  const value: Period = {
    month: state.month,
    year: state.year,
    setMonth: (month: number) => update({ month, year: state.year }),
    setYear: (year: number) => update({ month: state.month, year }),
    setPeriod: (month: number, year: number) => update({ month, year }),
  };

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    throw new Error('usePeriod must be used within PeriodProvider');
  }
  return ctx;
}
