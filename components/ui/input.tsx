import React from 'react';
import { cn } from '@/lib/utils';
import { field } from './styles';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(field.input, props['aria-invalid'] ? field.invalid : '', className)}
      ref={ref}
      {...props}
    />
  )
);

Input.displayName = 'Input';

export { Input };
