import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import LoadingState from "@/components/ui/loading-state";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseKpiDependencyConfig } from "@shared/kpi-dependencies";
import { Target, Calendar, Check } from "lucide-react";
import type { KpiCompletion, KpiTemplate } from "@shared/schema";
import { format } from "date-fns";

interface BarangayKpiPanelProps {
  chapterId: string;
  barangayId: string;
}

export default function BarangayKpiPanel({ chapterId, barangayId }: BarangayKpiPanelProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");

  const {
    data: templates = [],
    isLoading: templatesLoading,
    isFetched: templatesFetched,
  } = useQuery<KpiTemplate[]>({
    queryKey: ["/api/kpi-templates", { year: currentYear, barangayId }],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-templates?year=${currentYear}&barangayScope=true&barangayId=${barangayId}&chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI templates");
      return res.json();
    },
    enabled: !!barangayId,
  });

  const {
    data: completions = [],
    isLoading: completionsLoading,
    isFetched: completionsFetched,
  } = useQuery<KpiCompletion[]>({
    queryKey: ["/api/barangay-kpi-completions", { year: currentYear, barangayId }],
    queryFn: async () => {
      const res = await fetch(`/api/barangay-kpi-completions?year=${currentYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI completions");
      return res.json();
    },
    enabled: !!barangayId,
  });

  const isDashboardDataLoading =
    templatesLoading ||
    !templatesFetched ||
    completionsLoading ||
    !completionsFetched;

  const submitMutation = useMutation({
    mutationFn: async (data: { kpiTemplateId: string; numericValue?: number | null; textValue?: string | null }) => {
      return apiRequest("POST", "/api/barangay-kpi-completions", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI value saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-kpi-completions", { year: currentYear, barangayId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates", { year: currentYear, barangayId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates", { year: currentYear, chapterId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
      setEditingTemplateId(null);
      setDraftValue("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (completionId: string) => {
      return apiRequest("POST", `/api/barangay-kpi-completions/${completionId}/mark-complete`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI marked as done." });
      queryClient.invalidateQueries({ queryKey: ["/api/barangay-kpi-completions", { year: currentYear, barangayId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates", { year: currentYear, barangayId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates", { year: currentYear, chapterId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getCompletion = (templateId: string) =>
    completions.find((completion) => completion.kpiTemplateId === templateId);

  const startEditing = (template: KpiTemplate) => {
    const completion = getCompletion(template.id);
    const currentValue = template.inputType === "numeric"
      ? completion?.numericValue
      : completion?.textValue;
    setDraftValue(currentValue === null || currentValue === undefined ? "" : String(currentValue));
    setEditingTemplateId(template.id);
  };

  const handleSave = (template: KpiTemplate) => {
    if (template.inputType === "numeric") {
      const parsedValue = Number.parseInt(draftValue, 10);
      if (Number.isNaN(parsedValue)) {
        toast({ title: "Invalid value", description: "Please enter a valid number.", variant: "destructive" });
        return;
      }

      submitMutation.mutate({
        kpiTemplateId: template.id,
        numericValue: parsedValue,
        textValue: null,
      });
      return;
    }

    if (!draftValue.trim()) {
      toast({ title: "Missing value", description: "Please enter your accomplishment notes.", variant: "destructive" });
      return;
    }

    submitMutation.mutate({
      kpiTemplateId: template.id,
      numericValue: null,
      textValue: draftValue.trim(),
    });
  };

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

  if (isDashboardDataLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <LoadingState label="Loading KPIs..." rows={2} compact />
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium break-normal">{kpi.name}</h4>
                    {Boolean(parseKpiDependencyConfig(kpi.linkedEntityId)) && (
                      <Badge variant="secondary">Auto-Tracked</Badge>
                    )}
                    {getCompletion(kpi.id)?.isCompleted && (
                      <Badge className="bg-green-600">Completed</Badge>
                    )}
                  </div>
                  {kpi.description && (
                    <p className="mt-1 text-sm text-muted-foreground break-normal">{kpi.description}</p>
                  )}
                </div>
                <Badge variant="outline" className="self-start sm:self-auto">{getScopeLabel(kpi.scope)}</Badge>
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

              {kpi.inputType === "numeric" && kpi.targetValue && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <Progress
                    value={Math.min(
                      100,
                      Math.round((((getCompletion(kpi.id)?.numericValue ?? 0) / kpi.targetValue) * 100) || 0),
                    )}
                    className="h-2 w-full sm:max-w-48"
                  />
                  <span>
                    {getCompletion(kpi.id)?.numericValue ?? 0} / {kpi.targetValue}
                  </span>
                </div>
              )}

              {getCompletion(kpi.id) && !getCompletion(kpi.id)?.isCompleted && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Current value: <strong>{getCompletion(kpi.id)?.numericValue ?? getCompletion(kpi.id)?.textValue ?? "Not set"}</strong>
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!getCompletion(kpi.id)?.isCompleted && !Boolean(parseKpiDependencyConfig(kpi.linkedEntityId)) && (
                  <>
                    {editingTemplateId === kpi.id ? (
                      <div className="flex w-full flex-wrap items-center gap-2">
                        {kpi.inputType === "numeric" ? (
                          <Input
                            type="number"
                            value={draftValue}
                            onChange={(event) => setDraftValue(event.target.value)}
                            className="w-full sm:w-36"
                            placeholder="Enter value"
                          />
                        ) : (
                          <Textarea
                            value={draftValue}
                            onChange={(event) => setDraftValue(event.target.value)}
                            className="w-full sm:max-w-lg"
                            placeholder="Enter accomplishment details"
                          />
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleSave(kpi)}
                          disabled={submitMutation.isPending || markCompleteMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingTemplateId(null);
                            setDraftValue("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEditing(kpi)}
                      >
                        {getCompletion(kpi.id) ? "Update" : "Add Value"}
                      </Button>
                    )}

                    {getCompletion(kpi.id) && (
                      <Button
                        size="sm"
                        onClick={() => markCompleteMutation.mutate(getCompletion(kpi.id)!.id)}
                        disabled={submitMutation.isPending || markCompleteMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Mark Done
                      </Button>
                    )}
                  </>
                )}

                {!getCompletion(kpi.id)?.isCompleted && Boolean(parseKpiDependencyConfig(kpi.linkedEntityId)) && (
                  <Badge variant="outline">Waiting For Dependency Check</Badge>
                )}

                {getCompletion(kpi.id)?.isCompleted && (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Done</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
