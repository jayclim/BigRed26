// Adapted from shadcn/ui new-york-v4 Input. MIT; see shadcn-LICENSE.txt.
import * as React from 'react';
import { cn } from './cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(
    'h-11 w-full min-w-0 rounded-md border border-solid border-input bg-transparent px-3 py-1 text-base transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-9 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive', className,
  )} {...props} />;
}
export { Input };
