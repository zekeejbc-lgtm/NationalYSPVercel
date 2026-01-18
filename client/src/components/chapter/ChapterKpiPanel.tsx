import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BarChart3, Target, Check, Clock, Calendar, TrendingUp } from "lucide-react";
import type { KpiTemplate, KpiCompletion } from "@shared/schema";

interface ChapterKpiPanelProps {
  chapterId: string;
}

export default function ChapterKpiPanel({ chapterId }: ChapterKpiPanelProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [viewTab, setViewTab] = useState("quarterly");

  const { data: templates = [] } = useQuery<KpiTemplate[]>({
    queryKey: ["/api/kpi-templates", { year: selectedYear }],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-templates?year=${selectedYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI templates");
      return res.json();
    },
  });

  const { data: completions = [] } = useQuery<KpiCompletion[]>({
    queryKey: ["/api/kpi-completions", { chapterId }],
    queryFn: async () => {
      const res = await fetch(`/api/kpi-completions?chapterId=${chapterId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch completions");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/kpi-completions", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-completions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const markCompleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/kpi-completions/${id}/mark-complete`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI marked as completed. Your score has increased!" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-completions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const getCompletion = (templateId: string) => {
    return completions.find(c => c.kpiTemplateId === templateId);
  };

  const quarterlyTemplates = templates.filter(t => t.timeframe === "quarterly" || t.timeframe === "both");
  const yearlyTemplates = templates.filter(t => t.timeframe === "yearly" || t.timeframe === "both");

  const totalKpis = templates.filter(t => t.isActive).length;
  const completedKpis = completions.filter(c => c.isCompleted).length;
  const progressPercent = totalKpis > 0 ? Math.round((completedKpis / totalKpis) * 100) : 0;

  const years = Array.from({ length: 3 }, (_, i) => currentYear - 1 + i);
  const quarters = [1, 2, 3, 4];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Chapter KPIs
        </CardTitle>
        <CardDescription>
          Track and complete your chapter's key performance indicators
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 bg-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-primary">{completedKpis}</div>
                <div className="text-sm text-muted-foreground">Completed KPIs</div>
              </div>
              <Check className="h-8 w-8 text-primary" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{totalKpis - completedKpis}</div>
                <div className="text-sm text-muted-foreground">Pending KPIs</div>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{progressPercent}%</div>
                <div className="text-sm text-muted-foreground">Progress</div>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
            <Progress value={progressPercent} className="mt-2" />
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-32">
            <Label>Year</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger data-testid="select-kpi-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={viewTab} onValueChange={setViewTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quarterly" data-testid="tab-quarterly-kpis">
              Quarterly ({quarterlyTemplates.filter(t => t.isActive).length})
            </TabsTrigger>
            <TabsTrigger value="yearly" data-testid="tab-yearly-kpis">
              Yearly ({yearlyTemplates.filter(t => t.isActive).length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quarterly" className="mt-4">
            <div className="space-y-4">
              {quarters.map((quarter) => {
                const quarterKpis = quarterlyTemplates.filter(t => t.isActive && (t.quarter === quarter || !t.quarter));
                if (quarterKpis.length === 0) return null;
                
                const isCurrentQuarter = quarter === currentQuarter && selectedYear === currentYear;
                
                return (
                  <div key={quarter} className={`p-4 border rounded-lg ${isCurrentQuarter ? 'border-primary bg-primary/5' : ''}`}>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="font-medium">Q{quarter} {selectedYear}</h3>
                      {isCurrentQuarter && <Badge>Current Quarter</Badge>}
                    </div>
                    <div className="space-y-3">
                      {quarterKpis.map((template) => (
                        <KpiItem
                          key={template.id}
                          template={template}
                          completion={getCompletion(template.id)}
                          onSubmit={(data) => submitMutation.mutate({ kpiTemplateId: template.id, ...data })}
                          onMarkComplete={(id) => markCompleteMutation.mutate(id)}
                          isPending={submitMutation.isPending || markCompleteMutation.isPending}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              {quarterlyTemplates.filter(t => t.isActive).length === 0 && (
                <p className="text-center text-muted-foreground py-8">No quarterly KPIs available for {selectedYear}</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="yearly" className="mt-4">
            <div className="space-y-3">
              {yearlyTemplates.filter(t => t.isActive).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No yearly KPIs available for {selectedYear}</p>
              ) : (
                yearlyTemplates.filter(t => t.isActive).map((template) => (
                  <KpiItem
                    key={template.id}
                    template={template}
                    completion={getCompletion(template.id)}
                    onSubmit={(data) => submitMutation.mutate({ kpiTemplateId: template.id, ...data })}
                    onMarkComplete={(id) => markCompleteMutation.mutate(id)}
                    isPending={submitMutation.isPending || markCompleteMutation.isPending}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface KpiItemProps {
  template: KpiTemplate;
  completion?: KpiCompletion;
  onSubmit: (data: { numericValue?: number; textValue?: string }) => void;
  onMarkComplete: (id: string) => void;
  isPending: boolean;
}

function KpiItem({ template, completion, onSubmit, onMarkComplete, isPending }: KpiItemProps) {
  const [value, setValue] = useState(completion?.numericValue?.toString() || completion?.textValue || "");
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    if (template.inputType === "numeric") {
      onSubmit({ numericValue: parseInt(value) || 0 });
    } else {
      onSubmit({ textValue: value });
    }
    setIsEditing(false);
  };

  const progressValue = completion?.numericValue || 0;
  const targetValue = template.targetValue || 0;
  const progressPercent = targetValue > 0 ? Math.min(100, Math.round((progressValue / targetValue) * 100)) : 0;

  return (
    <div className={`p-4 border rounded-lg ${completion?.isCompleted ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium">{template.name}</span>
            <Badge variant={template.timeframe === "quarterly" ? "secondary" : "default"}>
              {template.timeframe}
            </Badge>
            {template.inputType === "text" && <Badge variant="outline">Text</Badge>}
            {completion?.isCompleted && <Badge className="bg-green-600">Completed</Badge>}
          </div>
          {template.description && (
            <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
          )}
          
          {template.inputType === "numeric" && targetValue > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Target: {targetValue}</span>
              <Progress value={progressPercent} className="flex-1 max-w-32" />
              <span className="text-sm">{progressValue} / {targetValue}</span>
            </div>
          )}
          
          {completion && !completion.isCompleted && !isEditing && (
            <div className="mt-2 text-sm">
              Current value: <strong>{completion.numericValue ?? completion.textValue ?? "Not set"}</strong>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!completion?.isCompleted && (
            <>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  {template.inputType === "numeric" ? (
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-24"
                      placeholder="Value"
                    />
                  ) : (
                    <Textarea
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-48"
                      placeholder="Enter notes..."
                    />
                  )}
                  <Button size="sm" onClick={handleSave} disabled={isPending}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  {completion ? "Update" : "Add Value"}
                </Button>
              )}
              
              {completion && (
                <Button 
                  size="sm" 
                  onClick={() => onMarkComplete(completion.id)}
                  disabled={isPending}
                  data-testid={`button-complete-kpi-${template.id}`}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark Done
                </Button>
              )}
            </>
          )}
          
          {completion?.isCompleted && (
            <div className="flex items-center gap-1 text-green-600">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">Done</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
