import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "xl";
}

const variants = {
  primary: "bg-accent text-[#052e16] hover:bg-emerald-400 active:bg-emerald-600 shadow-sm",
  secondary: "bg-raised text-ink hover:bg-line active:bg-line",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  ghost: "bg-transparent text-ink hover:bg-raised",
  outline:
    "border-2 border-accent text-accent hover:bg-brand-50 bg-surface",
};

const sizes = {
  sm: "px-3 py-2 text-sm min-h-[44px]",
  md: "px-4 py-3 text-base min-h-[48px]",
  lg: "px-6 py-4 text-lg min-h-[56px]",
  xl: "px-8 py-5 text-xl min-h-[64px] font-semibold",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold tracking-tight transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:opacity-50 disabled:pointer-events-none",
        "touch-manipulation select-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
