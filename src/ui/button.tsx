// Adapted from shadcn/ui new-york Button. MIT; see shadcn-LICENSE.txt.
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-solid border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-solid border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'border border-solid border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground',
      },
      size: { default: 'min-h-11 px-4 py-2', sm: 'min-h-11 px-3 py-2 text-xs' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type = 'button', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} ref={ref}
      {...(!asChild ? { type } : {})} {...props} />;
  },
);
Button.displayName = 'Button';
export { Button, buttonVariants };
