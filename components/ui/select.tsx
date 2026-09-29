'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { field } from './styles';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select
      className={cn(field.input, 'appearance-none cursor-pointer pr-10', className)}
      ref={ref}
      {...props}
    />
  )
);

Select.displayName = 'Select';

export { Select };
