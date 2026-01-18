import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Save, BarChart3, Trash2, Edit2, Target, Calendar } from "lucide-react";
import type { Chapter, KpiTemplate } from "@shared/schema";

export default function KpiManager() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [viewTab, setViewTab] = useState<string>("templates");
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    timeframe: "yearly",
    inputType: "numeric",
    year: currentYear,
    quarter: null as number | null,
    targetValue: null as number | null,
    isActive: true
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: kpiTemplates = [], isLoading } = useQuery<KpiTemplate[]>({
    queryKey: ["/api/kpi-templates", { year: selectedYear }],
    queryFn: async () => {
      const url = selectedQuarter 
        ? `/api/kpi-templates?year=${selectedYear}&quarter=${selectedQuarter}`
        : `/api/kpi-templates?year=${selectedYear}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI templates");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/kpi-templates", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI template created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/kpi-templates/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI template updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/kpi-templates/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPI template deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/kpi-templates"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      timeframe: "yearly",
      inputType: "numeric",
      year: currentYear,
      quarter: null,
      targetValue: null,
      isActive: true
    });
  };

  const handleEdit = (template: KpiTemplate) => {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      description: template.description || "",
      timeframe: template.timeframe,
      inputType: template.inputType,
      year: template.year,
      quarter: template.quarter,
      targetValue: template.targetValue,
      isActive: template.isActive
    });
    setIsCreating(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "KPI name is required", variant: "destructive" });
      return;
    }

    const submitData = {
      ...formData,
      quarter: formData.timeframe === "quarterly" || formData.timeframe === "both" ? formData.quarter : null,
      targetValue: formData.inputType === "numeric" ? formData.targetValue : null
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const getTimeframeBadge = (timeframe: string) => {
    switch (timeframe) {
      case "quarterly":
        return <Badge variant="secondary">Quarterly</Badge>;
      case "yearly":
        return <Badge variant="default">Yearly</Badge>;
      case "both":
        return <Badge className="bg-purple-600">Both</Badge>;
      default:
        return null;
    }
  };

  const getInputTypeBadge = (inputType: string) => {
    return inputType === "numeric" 
      ? <Badge variant="outline">Numeric</Badge>
      : <Badge variant="outline">Text</Badge>;
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const quarters = [1, 2, 3, 4];

  const groupedTemplates = {
    quarterly: kpiTemplates.filter(t => t.timeframe === "quarterly"),
    yearly: kpiTemplates.filter(t => t.timeframe === "yearly"),
    both: kpiTemplates.filter(t => t.timeframe === "both")
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          KPI Template Management
        </CardTitle>
        <CardDescription>
          Create and manage KPI templates for chapters to track. Set timeframes, input types, and target values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="w-32">
            <Label>Year</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger data-testid="select-filter-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label>Quarter</Label>
            <Select value={selectedQuarter ? String(selectedQuarter) : "all"} onValueChange={(v) => setSelectedQuarter(v === "all" ? null : parseInt(v))}>
              <SelectTrigger data-testid="select-filter-quarter">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quarters</SelectItem>
                {quarters.map((q) => (
                  <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setIsCreating(true)} data-testid="button-create-kpi">
            <Plus className="h-4 w-4 mr-2" />
            Create KPI Template
          </Button>
        </div>

        {isCreating && (
          <Card className="border-primary">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{editingId ? "Edit KPI Template" : "Create New KPI Template"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">KPI Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Number of Members, Projects Completed"
                      data-testid="input-kpi-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeframe">Timeframe *</Label>
                    <Select value={formData.timeframe} onValueChange={(v) => setFormData({ ...formData, timeframe: v })}>
                      <SelectTrigger data-testid="select-timeframe">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                        <SelectItem value="both">Both (Quarterly + Yearly)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inputType">Input Type *</Label>
                    <Select value={formData.inputType} onValueChange={(v) => setFormData({ ...formData, inputType: v })}>
                      <SelectTrigger data-testid="select-input-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="numeric">Numeric (e.g., counts, amounts)</SelectItem>
                        <SelectItem value="text">Text (qualitative notes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year *</Label>
                    <Select value={String(formData.year)} onValueChange={(v) => setFormData({ ...formData, year: parseInt(v) })}>
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
                  {(formData.timeframe === "quarterly" || formData.timeframe === "both") && (
                    <div className="space-y-2">
                      <Label htmlFor="quarter">Quarter</Label>
                      <Select value={formData.quarter ? String(formData.quarter) : ""} onValueChange={(v) => setFormData({ ...formData, quarter: v ? parseInt(v) : null })}>
                        <SelectTrigger data-testid="select-kpi-quarter">
                          <SelectValue placeholder="Select quarter..." />
                        </SelectTrigger>
                        <SelectContent>
                          {quarters.map((q) => (
                            <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {formData.inputType === "numeric" && (
                    <div className="space-y-2">
                      <Label htmlFor="targetValue">Target Value (optional)</Label>
                      <Input
                        id="targetValue"
                        type="number"
                        min="0"
                        value={formData.targetValue || ""}
                        onChange={(e) => setFormData({ ...formData, targetValue: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="e.g., 100"
                        data-testid="input-target-value"
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe what this KPI measures and how chapters should report it..."
                    data-testid="input-kpi-description"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    data-testid="switch-is-active"
                  />
                  <Label htmlFor="isActive">Active (chapters can submit this KPI)</Label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-template">
                    <Save className="h-4 w-4 mr-2" />
                    {editingId ? "Update Template" : "Create Template"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Tabs value={viewTab} onValueChange={setViewTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="templates" data-testid="tab-all-templates">
              All Templates ({kpiTemplates.length})
            </TabsTrigger>
            <TabsTrigger value="quarterly" data-testid="tab-quarterly">
              Quarterly ({groupedTemplates.quarterly.length})
            </TabsTrigger>
            <TabsTrigger value="yearly" data-testid="tab-yearly">
              Yearly ({groupedTemplates.yearly.length + groupedTemplates.both.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="mt-4">
            <div className="space-y-3">
              {kpiTemplates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No KPI templates found for {selectedYear}. Create one to get started.
                </p>
              ) : (
                kpiTemplates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{template.name}</span>
                        {getTimeframeBadge(template.timeframe)}
                        {getInputTypeBadge(template.inputType)}
                        {!template.isActive && <Badge variant="destructive">Inactive</Badge>}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {template.year}{template.quarter && ` Q${template.quarter}`}
                        </span>
                        {template.targetValue && (
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Target: {template.targetValue}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(template)} data-testid={`button-edit-${template.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => deleteMutation.mutate(template.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="quarterly" className="mt-4">
            <div className="space-y-3">
              {groupedTemplates.quarterly.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No quarterly KPI templates found.
                </p>
              ) : (
                groupedTemplates.quarterly.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{template.name}</span>
                        {template.quarter && <Badge variant="outline">Q{template.quarter}</Badge>}
                        {getInputTypeBadge(template.inputType)}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(template)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(template.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="yearly" className="mt-4">
            <div className="space-y-3">
              {[...groupedTemplates.yearly, ...groupedTemplates.both].length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No yearly KPI templates found.
                </p>
              ) : (
                [...groupedTemplates.yearly, ...groupedTemplates.both].map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg hover-elevate">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{template.name}</span>
                        {getTimeframeBadge(template.timeframe)}
                        {getInputTypeBadge(template.inputType)}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      {template.targetValue && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <Target className="h-3 w-3" />
                          Target: {template.targetValue}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(template)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(template.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
