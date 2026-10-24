import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <p className="text-base font-semibold text-gray-900">You do not have permission</p>
        <p className="mt-1 text-sm text-gray-500">
          You do not have access to this page with your current role.
        </p>
        <div className="mt-4 flex justify-center">
          <Button asChild variant="secondary">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
import { ButtonHTMLAttributes, cloneElement, isValidElement } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-line bg-white text-gray-900 hover:bg-gray-50',
  ghost: 'text-gray-700 hover:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-9 px-4 text-sm rounded-md',
  lg: 'h-10 px-5 text-sm rounded-md',
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);
  if (asChild && isValidElement(children)) {
    return cloneElement(children, {
      className: cn(classes, (children.props as { className?: string }).className),
    });
  }
  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
