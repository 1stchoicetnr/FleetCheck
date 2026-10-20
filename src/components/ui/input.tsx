import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="block text-base font-semibold text-gray-900 mb-1.5"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "w-full rounded-xl border-2 border-line bg-[#141416] text-ink px-4 py-4 text-lg",
          "focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none",
          "placeholder:text-muted min-h-[56px]",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {hint && !error && (
        <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
      )}
      {error && <p className="mt-1.5 text-sm text-red-600 font-medium">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";
