import { cn } from "@/lib/utils";
import {
  dangerButtonClass,
  ghostButtonClass,
  outlineButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/button-styles";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "xl";
}

const variants = {
  primary: primaryButtonClass,
  secondary: secondaryButtonClass,
  danger: dangerButtonClass,
  ghost: ghostButtonClass,
  outline: outlineButtonClass,
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80] focus-visible:ring-offset-2 focus-visible:ring-offset-[#101012]",
        "touch-manipulation select-none",
        variants[variant],
        sizes[size],
        className,
        "disabled:opacity-100 disabled:pointer-events-none"
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
