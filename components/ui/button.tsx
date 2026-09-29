import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { button } from './styles';

/**
 * Botón con las clases del sistema (components/ui/styles.ts). Mantiene la API
 * de variantes de antes (default/outline/secondary/ghost/destructive/link)
 * para no tocar a quien lo usa; `size` solo ajusta alto y relleno.
 */
const buttonVariants = cva('', {
  variants: {
    variant: {
      default: button.primary,
      destructive: button.danger,
      outline: button.secondary,
      secondary: button.secondary,
      ghost: button.ghost,
      link: button.link,
    },
    size: {
      default: '',
      sm: 'h-10 px-4 text-sm',
      lg: 'h-12 px-7',
      icon: 'h-10 w-10 px-0',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export { Button, buttonVariants };
