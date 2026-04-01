import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Calendar } from "lucide-react";
import type { KpiTemplate } from "@shared/schema";
import { format } from "date-fns";

interface BarangayKpiPanelProps {
  chapterId: string;
  barangayId: string;
}

export default function BarangayKpiPanel({ chapterId, barangayId }: BarangayKpiPanelProps) {
  const currentYear = new Date().getFullYear();

  const { data: templates = [], isLoading } = useQuery<KpiTemplate[]>({
    queryKey: ["/api/kpi-templates", { year: currentYear, barangayId }],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-templates?year=${currentYear}&barangayScope=true&barangayId=${barangayId}&chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI templates");
      return res.json();
    },
    enabled: !!barangayId,
  });

  const getScopeLabel = (scope: string | undefined) => {
    switch (scope) {
      case "barangay":
        return "Barangay-specific";
      case "all_barangays":
        return "All Barangays";
      case "chapter_barangays":
        return "Chapter Barangays";
      default:
        return scope || "Unknown";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3" role="status" aria-label="Loading KPIs">
            <div className="h-5 w-36 rounded-md bg-muted skeleton-shimmer" />
            <div className="h-12 w-full rounded-lg bg-muted skeleton-shimmer" />
            <div className="h-12 w-full rounded-lg bg-muted skeleton-shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Key Performance Indicators
          </CardTitle>
          <CardDescription>
            KPIs assigned to your barangay chapter.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-muted-foreground">
          No KPIs have been assigned to your barangay yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Key Performance Indicators
        </CardTitle>
        <CardDescription>
          KPIs assigned to your barangay chapter for {currentYear}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {templates.map((kpi) => (
            <div key={kpi.id} className="p-4 border rounded-lg hover-elevate">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-medium">{kpi.name}</h4>
                  {kpi.description && (
                    <p className="text-sm text-muted-foreground mt-1">{kpi.description}</p>
                  )}
                </div>
                <Badge variant="outline">{getScopeLabel(kpi.scope)}</Badge>
              </div>
              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                {kpi.targetValue && (
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Target: {kpi.targetValue}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {kpi.timeframe === "quarterly" ? `Q${kpi.quarter} ${kpi.year}` : kpi.year}
                </span>
                <span className="text-xs">
                  Created: {format(new Date(kpi.createdAt), "MMM d, yyyy")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
