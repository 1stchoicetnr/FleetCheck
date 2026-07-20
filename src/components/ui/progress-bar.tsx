import { cn } from "@/lib/utils";

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  className?: string;
}

export function ProgressBar({ current, total, label, className }: ProgressBarProps) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="flex justify-between text-base text-gray-700 mb-2 font-medium">
          <span>{label}</span>
          <span className="text-brand-600">
            Step {current} of {total}
          </span>
        </div>
      )}
      <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-gray-500 mt-1.5 text-right">{pct}% complete</p>
    </div>
  );
}
