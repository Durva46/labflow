import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

function InboxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3 6.5V14a2 2 0 002 2h10a2 2 0 002-2V6.5M3 6.5l5.2 4.33a3 3 0 003.6 0L17 6.5M3 6.5V6a2 2 0 012-2h10a2 2 0 012 2v.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600">
        {icon ?? <InboxIcon />}
      </div>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description ? <p className="max-w-md text-sm text-gray-500">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
