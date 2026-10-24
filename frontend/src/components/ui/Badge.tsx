import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  info: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
