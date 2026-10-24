import { cn } from '../../lib/cn';

interface StatTileProps {
  label: string;
  value: number | string;
  hint?: string;
  className?: string;
}

export function StatTile({ label, value, hint, className }: StatTileProps) {
  return (
    <Card className={cn('flex flex-col gap-2', className)}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
    </Card>
  );
}
import { Card } from './Card';
