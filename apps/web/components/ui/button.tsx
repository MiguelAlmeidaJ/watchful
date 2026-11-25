import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva,type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants=cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:pointer-events-none disabled:opacity-50',{variants:{variant:{default:'btn',outline:'btn-secondary',ghost:'icon-button'},size:{default:'min-h-10 px-4',icon:'size-10 p-0'}},defaultVariants:{variant:'default',size:'default'}});
export const Button=React.forwardRef<HTMLButtonElement,React.ButtonHTMLAttributes<HTMLButtonElement>&VariantProps<typeof variants>&{asChild?:boolean}>(({className,variant,size,asChild=false,...props},ref)=>{const Comp=asChild?Slot:'button';return <Comp ref={ref} className={twMerge(clsx(variants({variant,size}),className))} {...props}/>;});
Button.displayName='Button';
