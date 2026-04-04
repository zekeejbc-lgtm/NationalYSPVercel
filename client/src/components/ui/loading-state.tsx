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
  const safeRows = Math.max(1, rows);

  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>

      <div
        className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2"}
      >
        {Array.from({ length: safeRows }).map((_, index) => (
          <div
            key={index}
            className={compact ? "rounded-xl border bg-card p-3 space-y-2" : "rounded-xl border bg-card p-4 space-y-3"}
            aria-hidden="true"
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton className={compact ? "h-4 w-2/5" : "h-5 w-1/2"} />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className={compact ? "h-4 w-3/4" : "h-4 w-4/5"} />

            <div className="pt-1 flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
