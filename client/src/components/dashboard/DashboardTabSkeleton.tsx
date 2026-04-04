import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

export type DashboardTabSkeletonVariant =
  | "stats"
  | "programs"
  | "chapters"
  | "members"
  | "officers"
  | "kpis"
  | "volunteer"
  | "documents"
  | "requests"
  | "inbox"
  | "contact"
  | "social"
  | "leaderboard"
  | "map"
  | "reports";

interface DashboardTabSkeletonProps {
  label?: string;
  variant: DashboardTabSkeletonVariant;
  embedded?: boolean;
}

function GridCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`grid-card-${index}`} className="rounded-xl border bg-card p-4 space-y-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="pt-1 flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`list-card-${index}`} className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaderboardRows() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={`leader-row-${index}`} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function KpiCards() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`kpi-card-${index}`} className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MapPanel() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

function StatsTiles() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`stats-tile-${index}`} className="rounded-lg border bg-card p-4 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function EmbeddedContainer({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export default function DashboardTabSkeleton({
  label = "Loading...",
  variant,
  embedded = false,
}: DashboardTabSkeletonProps) {
  const content = (() => {
    switch (variant) {
      case "stats":
        return <StatsTiles />;
      case "kpis":
        return <KpiCards />;
      case "leaderboard":
        return <LeaderboardRows />;
      case "map":
        return <MapPanel />;
      case "inbox":
      case "requests":
      case "contact":
      case "social":
      case "reports":
        return <ListCards count={3} />;
      case "programs":
      case "chapters":
      case "members":
      case "officers":
      case "volunteer":
      case "documents":
      default:
        return <GridCards count={3} />;
    }
  })();

  if (embedded) {
    return <EmbeddedContainer label={label}>{content}</EmbeddedContainer>;
  }

  return (
    <Card>
      <CardContent className="p-6">
        <EmbeddedContainer label={label}>{content}</EmbeddedContainer>
      </CardContent>
    </Card>
  );
}
