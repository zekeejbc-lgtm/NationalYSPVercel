import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  label?: string;
  rows?: number;
  compact?: boolean;
}

export default function LoadingState({
  label = "Loading...",
  rows = 3,
  compact = false,
}: LoadingStateProps) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={compact ? "rounded-lg border p-3 space-y-2" : "rounded-xl border p-4 space-y-3"}
          >
            <Skeleton className={compact ? "h-4 w-2/5" : "h-5 w-1/3"} />
            <Skeleton className="h-4 w-full" />
            <Skeleton className={compact ? "h-4 w-4/5" : "h-4 w-2/3"} />
          </div>
        ))}
      </div>
    </div>
  );
}
