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
        <div className="photo-step-progress-meta flex justify-between text-base text-gray-700 mb-2 font-medium">
          <span>{label}</span>
          <span className="text-accent">
            Step {current} of {total}
          </span>
        </div>
      )}
      <div className="h-2.5 w-full rounded-full bg-raised overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="photo-step-progress-pct text-sm text-gray-500 mt-1.5 text-right">
        {pct}% complete
      </p>
    </div>
  );
}
