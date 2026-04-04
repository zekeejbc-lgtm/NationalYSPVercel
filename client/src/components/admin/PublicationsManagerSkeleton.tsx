import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PublicationsManagerSkeletonProps {
  label?: string;
}

function PublicationCardSkeleton() {
  return (
    <Card className="h-[20rem] overflow-hidden" aria-hidden="true">
      <CardContent className="p-4 h-full flex flex-col gap-3">
        <Skeleton className="h-32 w-full rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-4/5" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="mt-auto border-t pt-2 flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PublicationsManagerSkeleton({
  label = "Loading publications...",
}: PublicationsManagerSkeletonProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">{label}</p>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <PublicationCardSkeleton />
            <PublicationCardSkeleton />
            <PublicationCardSkeleton />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
