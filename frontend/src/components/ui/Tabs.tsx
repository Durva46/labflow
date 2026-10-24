import { useState } from 'react';
import { cn } from '../../lib/cn';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-2 border-b border-line', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            '-mb-px px-3 py-2 text-sm',
            active === tab.id
              ? 'border-b-2 border-brand-600 text-gray-900'
              : 'text-gray-500 hover:text-gray-900',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function useTabs(initial: string) {
  const [active, setActive] = useState(initial);
  return { active, setActive };
}
