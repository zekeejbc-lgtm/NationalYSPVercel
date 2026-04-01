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
    <div className={compact ? "space-y-2" : "space-y-3"} role="status" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className={compact ? "h-10 w-full" : "h-14 w-full"}
        />
      ))}
    </div>
  );
}
