import type { ComponentProps } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

type Props = ComponentProps<typeof CheckboxPrimitive.Root> & { shape?: 'square' | 'circle' };

// shadcn/ui pattern: Radix owns keyboard/ARIA state; project tokens own the visual treatment.
export function Checkbox({ className = '', shape = 'square', checked, ...props }: Props) {
  return <CheckboxPrimitive.Root
    {...props}
    checked={checked}
    data-slot="checkbox"
    data-shape={shape}
    className={`group/control relative inline-flex size-[18px] shrink-0 items-center justify-center border border-line-strong bg-surface text-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] outline-none transition-[background-color,border-color,box-shadow] hover:border-accent focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent motion-reduce:transition-none ${shape === 'circle' ? 'rounded-full data-[state=unchecked]:hover:bg-accent-soft' : 'rounded-[5px]'} ${className}`}
  >
    {shape === 'circle' && <Check aria-hidden className="pointer-events-none absolute size-3 text-accent opacity-0 group-hover/control:opacity-70 group-data-[state=checked]/control:hidden" strokeWidth={2.5} />}
    <CheckboxPrimitive.Indicator className="pointer-events-none inline-flex items-center justify-center text-current">
      {checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={2.5} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>;
}
