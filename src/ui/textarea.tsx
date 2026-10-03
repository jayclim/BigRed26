// Adapted from shadcn/ui new-york-v4 Textarea. MIT; see shadcn-LICENSE.txt.
import * as React from 'react';
import { cn } from './cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(
    'flex min-h-20 w-full rounded-md border border-solid border-input bg-transparent px-3 py-2 text-base transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm', className,
  )} {...props} />;
}
export { Textarea };
