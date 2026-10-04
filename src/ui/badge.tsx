// Adapted from shadcn/ui new-york-v4 Badge. MIT; see shadcn-LICENSE.txt.
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border border-solid border-transparent px-2 py-1 text-xs font-medium whitespace-nowrap',
  { variants: { variant: {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    success: 'bg-success text-success-foreground',
    outline: 'border-border text-foreground',
  } }, defaultVariants: { variant: 'default' } },
);
function Badge({ className, variant = 'default', asChild = false, ...props }:
  React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
