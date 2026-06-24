import * as React from "react";
import { cn } from "@/lib/utils";

// Radix 의존 없이 가벼운 native checkbox 래퍼.
export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <input
        id={id}
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-input accent-[hsl(var(--primary))]",
          className,
        )}
        {...props}
      />
      {label}
    </label>
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
