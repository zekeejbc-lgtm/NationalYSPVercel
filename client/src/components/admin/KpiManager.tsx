import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Save, BarChart3, Trash2, Edit2, Target, Calendar, Building2, MapPin, Trophy, TrendingUp, CheckCircle2, Clock3, Users, Search, Copy } from "lucide-react";
import type { Chapter, KpiTemplate, KpiCompletion } from "@shared/schema";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface BarangayUser {
  id: string;
  barangayName: string;
  chapterId: string;
}

interface LeaderboardEntry {
  chapterId: string;
  chapterName: string;
  score: number;
  completedKpis: number;
}

interface KpiScopeRecord {
  entityType: string;
  entityId: string;
}

interface TemplateAnalyticsRow {
  templateId: string;
  templateName: string;
  timeframe: string;
  scope: string;
  assignedCount: number;
  completedCount: number;
  completionRate: number;
  completedPeople: string[];
  completedChapterNames: string[];
  pendingChapterNames: string[];
}

const PIE_COLORS = ["#16a34a", "#f59e0b"];

const SCOPE_OPTIONS = [
  { value: "all_chapters_and_barangays", label: "All Chapters & Barangays" },
  { value: "all_chapters", label: "All Chapters Only" },
  { value: "all_barangays", label: "All Barangays Only" },
  { value: "selected_chapters", label: "Selected Chapters" },
  { value: "selected_barangays", label: "Selected Barangays" },
];

export default function KpiManager() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [viewTab, setViewTab] = useState<string>("templates");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [coverageSearch, setCoverageSearch] = useState("");
  const [selectedCoverageTemplateId, setSelectedCoverageTemplateId] = useState<string>("");
  const [isCoverageDialogOpen, setIsCoverageDialogOpen] = useState(false);
  
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
    isActive: true,
    scope: "all_chapters_and_barangays",
    selectedEntityIds: [] as string[]
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId]);

  const { data: barangayUsers = [] } = useQuery<BarangayUser[]>({
    queryKey: ["/api/barangay-users"],
    queryFn: async () => {
      const res = await fetch("/api/barangay-users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch barangay users");
      return res.json();
    },
  });

  const { data: kpiTemplates = [], isLoading } = useQuery<KpiTemplate[]>({
    queryKey: ["/api/kpi-templates", { year: selectedYear, quarter: selectedQuarter }],
    queryFn: async () => {
      const url = selectedQuarter 
        ? `/api/kpi-templates?year=${selectedYear}&quarter=${selectedQuarter}`
        : `/api/kpi-templates?year=${selectedYear}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch KPI templates");
      return res.json();
    },
  });

  const { data: chapterLeaderboard = [], isLoading: isLeaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: [
      "/api/leaderboard",
      { timeframe: selectedQuarter ? "quarterly" : "yearly", year: selectedYear, quarter: selectedQuarter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeframe: selectedQuarter ? "quarterly" : "yearly",
        year: String(selectedYear),
      });
      if (selectedQuarter) {
        params.set("quarter", String(selectedQuarter));
      }

      const res = await fetch(`/api/leaderboard?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chapter KPI leaderboard");
      return res.json();
    },
  });

  const { data: selectedChapterTemplates = [], isLoading: isChapterTemplatesLoading } = useQuery<KpiTemplate[]>({
    queryKey: [
      "/api/kpi-templates",
      { chapterScope: true, chapterId: selectedChapterId, year: selectedYear, quarter: selectedQuarter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        year: String(selectedYear),
        chapterScope: "true",
        chapterId: selectedChapterId,
      });
      if (selectedQuarter) {
        params.set("quarter", String(selectedQuarter));
      }

      const res = await fetch(`/api/kpi-templates?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chapter KPI templates");
      return res.json();
    },
    enabled: !!selectedChapterId,
  });

  const { data: selectedChapterCompletions = [], isLoading: isChapterCompletionsLoading } = useQuery<KpiCompletion[]>({
    queryKey: [
      "/api/kpi-completions",
      { chapterId: selectedChapterId, year: selectedYear, quarter: selectedQuarter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        chapterId: selectedChapterId,
        year: String(selectedYear),
      });
      if (selectedQuarter) {
        params.set("quarter", String(selectedQuarter));
      }

      const res = await fetch(`/api/kpi-completions?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch chapter KPI completions");
      return res.json();
    },
    enabled: !!selectedChapterId,
  });

  const { data: allChapterCompletions = [], isLoading: isAllChapterCompletionsLoading } = useQuery<KpiCompletion[]>({
    queryKey: [
      "/api/kpi-completions-analytics",
      { chapterIds: chapters.map((chapter) => chapter.id).join(","), year: selectedYear, quarter: selectedQuarter },
    ],
    queryFn: async () => {
      const completionGroups = await Promise.all(
        chapters.map(async (chapter) => {
          const params = new URLSearchParams({
            chapterId: chapter.id,
            year: String(selectedYear),
          });
          if (selectedQuarter) {
            params.set("quarter", String(selectedQuarter));
          }

          const res = await fetch(`/api/kpi-completions?${params.toString()}`, { credentials: "include" });
          if (!res.ok) {
            throw new Error(`Failed to fetch KPI completions for ${chapter.name}`);
          }
          return (await res.json()) as KpiCompletion[];
        })
      );

      return completionGroups.flat();
    },
    enabled: chapters.length > 0,
  });

  const selectedScopedTemplateIds = useMemo(
    () => kpiTemplates
      .filter((template) => template.scope === "selected_chapters" || template.scope === "selected_barangays")
      .map((template) => template.id),
    [kpiTemplates]
  );

  const { data: selectedScopesByTemplate = {}, isLoading: isTemplateScopesLoading } = useQuery<Record<string, KpiScopeRecord[]>>({
    queryKey: ["/api/kpi-template-scopes-analytics", selectedScopedTemplateIds.join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        selectedScopedTemplateIds.map(async (templateId) => {
          const res = await fetch(`/api/kpi-templates/${templateId}/scopes`, { credentials: "include" });
          if (!res.ok) {
            return [templateId, []] as const;
          }

          const scopes = (await res.json()) as KpiScopeRecord[];
          return [templateId, scopes] as const;
        })
      );

      return Object.fromEntries(entries);
    },
    enabled: selectedScopedTemplateIds.length > 0,
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
      isActive: true,
      scope: "all_chapters_and_barangays",
      selectedEntityIds: []
    });
  };

  const handleEdit = async (template: KpiTemplate) => {
    setEditingId(template.id);
    
    let entityIds: string[] = [];
    if (template.scope === "selected_chapters" || template.scope === "selected_barangays") {
      try {
        const res = await fetch(`/api/kpi-templates/${template.id}/scopes`);
        if (res.ok) {
          const scopes = await res.json();
          entityIds = scopes.map((s: { entityId: string }) => s.entityId);
        }
      } catch (e) {
        console.error("Failed to load scopes:", e);
      }
    }
    
    setFormData({
      name: template.name,
      description: template.description || "",
      timeframe: template.timeframe,
      inputType: template.inputType,
      year: template.year,
      quarter: template.quarter,
      targetValue: template.targetValue,
      isActive: template.isActive,
      scope: template.scope || "all_chapters_and_barangays",
      selectedEntityIds: entityIds
    });
    setIsCreating(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "KPI name is required", variant: "destructive" });
      return;
    }

    if ((formData.scope === "selected_chapters" || formData.scope === "selected_barangays") && formData.selectedEntityIds.length === 0) {
      toast({ title: "Error", description: "Please select at least one entity", variant: "destructive" });
      return;
    }

    const submitData = {
      name: formData.name,
      description: formData.description,
      timeframe: formData.timeframe,
      inputType: formData.inputType,
      year: formData.year,
      quarter: formData.timeframe === "quarterly" || formData.timeframe === "both" ? formData.quarter : null,
      targetValue: formData.inputType === "numeric" ? formData.targetValue : null,
      isActive: formData.isActive,
      scope: formData.scope,
      selectedEntityIds: formData.selectedEntityIds
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEntityToggle = (entityId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedEntityIds: prev.selectedEntityIds.includes(entityId)
        ? prev.selectedEntityIds.filter(id => id !== entityId)
        : [...prev.selectedEntityIds, entityId]
    }));
  };

  const getScopeBadge = (scope: string | undefined) => {
    switch (scope) {
      case "all_chapters_and_barangays":
        return <Badge variant="default">All</Badge>;
      case "all_chapters":
        return <Badge className="bg-blue-600">Chapters</Badge>;
      case "all_barangays":
        return <Badge className="bg-green-600">Barangays</Badge>;
      case "selected_chapters":
        return <Badge variant="outline"><Building2 className="h-3 w-3 mr-1" />Selected Chapters</Badge>;
      case "selected_barangays":
        return <Badge variant="outline"><MapPin className="h-3 w-3 mr-1" />Selected Barangays</Badge>;
      default:
        return null;
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

  const chapterById = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter]));
  }, [chapters]);

  const selectedChapter = chapters.find(chapter => chapter.id === selectedChapterId);
  const activeChapterTemplates = selectedChapterTemplates.filter(template => template.isActive);
  const completionByTemplateId = new Map(selectedChapterCompletions.map(completion => [completion.kpiTemplateId, completion]));
  const completedChapterKpis = activeChapterTemplates.filter(template => completionByTemplateId.get(template.id)?.isCompleted).length;
  const pendingChapterKpis = Math.max(activeChapterTemplates.length - completedChapterKpis, 0);
  const chapterProgressPercent = activeChapterTemplates.length > 0
    ? Math.round((completedChapterKpis / activeChapterTemplates.length) * 100)
    : 0;

  const topChapter = chapterLeaderboard[0];
  const selectedChapterRank = chapterLeaderboard.findIndex(entry => entry.chapterId === selectedChapterId) + 1;
  const activeChapterCount = chapterLeaderboard.filter(entry => entry.completedKpis > 0).length;
  const averageScore = chapterLeaderboard.length > 0
    ? Math.round(chapterLeaderboard.reduce((sum, entry) => sum + entry.score, 0) / chapterLeaderboard.length)
    : 0;

  const templateAnalyticsRows = useMemo<TemplateAnalyticsRow[]>(() => {
    const activeTemplates = kpiTemplates.filter((template) => template.isActive);

    return activeTemplates
      .map((template) => {
        const completedChapterIds = Array.from(
          new Set(
            allChapterCompletions
              .filter((completion) => completion.kpiTemplateId === template.id && completion.isCompleted)
              .map((completion) => completion.chapterId)
          )
        );

        let assignedChapterIds: string[] = [];
        if (
          template.scope === "all_chapters" ||
          template.scope === "all_chapters_and_barangays" ||
          template.scope === "all_barangays"
        ) {
          assignedChapterIds = chapters.map((chapter) => chapter.id);
        } else if (template.scope === "selected_chapters") {
          assignedChapterIds = (selectedScopesByTemplate[template.id] || [])
            .filter((scope) => scope.entityType === "chapter")
            .map((scope) => scope.entityId);
        } else if (template.scope === "selected_barangays") {
          const selectedBarangayIds = (selectedScopesByTemplate[template.id] || [])
            .filter((scope) => scope.entityType === "barangay")
            .map((scope) => scope.entityId);

          assignedChapterIds = Array.from(
            new Set(
              selectedBarangayIds
                .map((barangayId) => barangayUsers.find((barangay) => barangay.id === barangayId)?.chapterId)
                .filter((chapterId): chapterId is string => Boolean(chapterId))
            )
          );
        }

        const uniqueAssignedChapterIds = Array.from(new Set(assignedChapterIds));
        const completedWithinAssigned = uniqueAssignedChapterIds.filter((chapterId) => completedChapterIds.includes(chapterId));
        const pendingChapterIds = uniqueAssignedChapterIds.filter((chapterId) => !completedChapterIds.includes(chapterId));

        const completedChapterNames = completedWithinAssigned.map((chapterId) => chapterById.get(chapterId)?.name || "Unknown chapter");
        const pendingChapterNames = pendingChapterIds.map((chapterId) => chapterById.get(chapterId)?.name || "Unknown chapter");

        const completedPeople = completedWithinAssigned.map((chapterId) => {
          const chapter = chapterById.get(chapterId);
          if (!chapter) return "Unknown chapter";

          const contactPerson = chapter.contactPerson?.trim();
          if (contactPerson) {
            return `${contactPerson} (${chapter.name})`;
          }
          return chapter.name;
        });

        const assignedCount = uniqueAssignedChapterIds.length;
        const completedCount = completedWithinAssigned.length;
        const completionRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;

        return {
          templateId: template.id,
          templateName: template.name,
          timeframe: template.timeframe,
          scope: template.scope,
          assignedCount,
          completedCount,
          completionRate,
          completedPeople,
          completedChapterNames,
          pendingChapterNames,
        };
      })
      .sort((a, b) => b.completedCount - a.completedCount || a.templateName.localeCompare(b.templateName));
  }, [allChapterCompletions, barangayUsers, chapterById, chapters, kpiTemplates, selectedScopesByTemplate]);

  useEffect(() => {
    if (templateAnalyticsRows.length === 0) {
      setSelectedTemplateId("");
      return;
    }

    const templateExists = templateAnalyticsRows.some((row) => row.templateId === selectedTemplateId);
    if (!selectedTemplateId || !templateExists) {
      setSelectedTemplateId(templateAnalyticsRows[0].templateId);
    }
  }, [selectedTemplateId, templateAnalyticsRows]);

  const selectedTemplateAnalytics = templateAnalyticsRows.find((row) => row.templateId === selectedTemplateId);
  const totalAssignedSubmissions = templateAnalyticsRows.reduce((sum, row) => sum + row.assignedCount, 0);
  const totalCompletedSubmissions = templateAnalyticsRows.reduce((sum, row) => sum + row.completedCount, 0);
  const overallCompletionRate = totalAssignedSubmissions > 0
    ? Math.round((totalCompletedSubmissions / totalAssignedSubmissions) * 100)
    : 0;

  const chapterPerformanceChartData = chapterLeaderboard.slice(0, 10).map((entry) => ({
    chapterName: entry.chapterName.length > 18 ? `${entry.chapterName.slice(0, 18)}...` : entry.chapterName,
    score: entry.score,
    completedKpis: entry.completedKpis,
  }));

  const overallCompletionPieData = [
    { name: "Completed", value: totalCompletedSubmissions },
    { name: "Pending", value: Math.max(totalAssignedSubmissions - totalCompletedSubmissions, 0) },
  ];

  const filteredTemplateCoverageRows = useMemo(() => {
    const query = coverageSearch.trim().toLowerCase();
    if (!query) return templateAnalyticsRows;

    return templateAnalyticsRows.filter((row) => row.templateName.toLowerCase().includes(query));
  }, [coverageSearch, templateAnalyticsRows]);

  const selectedCoverageTemplate = templateAnalyticsRows.find((row) => row.templateId === selectedCoverageTemplateId);

  const handleOpenCoverageDialog = (templateId: string) => {
    setSelectedCoverageTemplateId(templateId);
    setIsCoverageDialogOpen(true);
  };

  const handleCopyCoverageSummary = async () => {
    if (!selectedCoverageTemplate) return;

    const didSection = selectedCoverageTemplate.completedChapterNames.length > 0
      ? selectedCoverageTemplate.completedChapterNames.map((name) => `- ${name}`).join("\n")
      : "- None";
    const didNotSection = selectedCoverageTemplate.pendingChapterNames.length > 0
      ? selectedCoverageTemplate.pendingChapterNames.map((name) => `- ${name}`).join("\n")
      : "- None";

    const summaryText = [
      `KPI Requirement: ${selectedCoverageTemplate.templateName}`,
      `Completed: ${selectedCoverageTemplate.completedCount}`,
      `Pending: ${selectedCoverageTemplate.pendingChapterNames.length}`,
      `Assigned: ${selectedCoverageTemplate.assignedCount}`,
      "",
      "Chapters that DID complete:",
      didSection,
      "",
      "Chapters that DID NOT complete:",
      didNotSection,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(summaryText);
      toast({ title: "Copied", description: "KPI completion summary copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Unable to copy summary text.", variant: "destructive" });
    }
  };

  const isAnalyticsLoading = isLeaderboardLoading || isAllChapterCompletionsLoading || isTemplateScopesLoading;

  const getCompletionValue = (completion?: KpiCompletion) => {
    if (!completion) return "No value submitted";
    if (completion.numericValue !== null && completion.numericValue !== undefined) return completion.numericValue;
    if (completion.textValue) return completion.textValue;
    return "No value submitted";
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
          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v, 10))}>
              <SelectTrigger className="w-32" data-testid="select-filter-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quarter</Label>
            <Select
              value={selectedQuarter ? String(selectedQuarter) : "all"}
              onValueChange={(v) => setSelectedQuarter(v === "all" ? null : parseInt(v, 10))}
            >
              <SelectTrigger className="w-36" data-testid="select-filter-quarter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Year</SelectItem>
                {quarters.map((quarter) => (
                  <SelectItem key={quarter} value={String(quarter)}>{`Q${quarter}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="button" onClick={() => setIsCreating((prev) => !prev)} data-testid="button-create-template">
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

                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="scope">Assign To *</Label>
                    <Select 
                      value={formData.scope} 
                      onValueChange={(v) => setFormData({ ...formData, scope: v, selectedEntityIds: [] })}
                    >
                      <SelectTrigger data-testid="select-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCOPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.scope === "selected_chapters" && (
                    <div className="space-y-2">
                      <Label>Select Chapters</Label>
                      <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                        {chapters.map((chapter) => (
                          <div key={chapter.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`chapter-${chapter.id}`}
                              checked={formData.selectedEntityIds.includes(chapter.id)}
                              onCheckedChange={() => handleEntityToggle(chapter.id)}
                              data-testid={`checkbox-chapter-${chapter.id}`}
                            />
                            <label htmlFor={`chapter-${chapter.id}`} className="text-sm cursor-pointer">
                              {chapter.name}
                            </label>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formData.selectedEntityIds.length} chapter(s) selected
                      </p>
                    </div>
                  )}

                  {formData.scope === "selected_barangays" && (
                    <div className="space-y-2">
                      <Label>Select Barangays</Label>
                      <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
                        {barangayUsers.map((barangay) => {
                          const chapter = chapters.find(c => c.id === barangay.chapterId);
                          return (
                            <div key={barangay.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`barangay-${barangay.id}`}
                                checked={formData.selectedEntityIds.includes(barangay.id)}
                                onCheckedChange={() => handleEntityToggle(barangay.id)}
                                data-testid={`checkbox-barangay-${barangay.id}`}
                              />
                              <label htmlFor={`barangay-${barangay.id}`} className="text-sm cursor-pointer">
                                {barangay.barangayName} {chapter && <span className="text-muted-foreground">({chapter.name})</span>}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formData.selectedEntityIds.length} barangay(s) selected
                      </p>
                    </div>
                  )}
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
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
            <TabsTrigger value="templates" data-testid="tab-all-templates" className="py-2 text-xs sm:text-sm">
              <span className="sm:hidden">All ({kpiTemplates.length})</span>
              <span className="hidden sm:inline">All Templates ({kpiTemplates.length})</span>
            </TabsTrigger>
            <TabsTrigger value="quarterly" data-testid="tab-quarterly" className="py-2 text-xs sm:text-sm">
              <span className="sm:hidden">Quarterly ({groupedTemplates.quarterly.length})</span>
              <span className="hidden sm:inline">Quarterly ({groupedTemplates.quarterly.length})</span>
            </TabsTrigger>
            <TabsTrigger value="yearly" data-testid="tab-yearly" className="py-2 text-xs sm:text-sm">
              <span className="sm:hidden">Yearly ({groupedTemplates.yearly.length + groupedTemplates.both.length})</span>
              <span className="hidden sm:inline">Yearly ({groupedTemplates.yearly.length + groupedTemplates.both.length})</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-kpi-analytics" className="py-2 text-xs sm:text-sm">
              Analytics
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

          <TabsContent value="analytics" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="p-4 bg-primary/5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Top Chapter</div>
                    <div className="text-lg font-semibold">{topChapter ? topChapter.chapterName : "No data"}</div>
                    <div className="text-sm text-muted-foreground">
                      {topChapter ? `${topChapter.score} pts` : "No KPI submissions yet"}
                    </div>
                  </div>
                  <Trophy className="h-6 w-6 text-yellow-500" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Active Chapters</div>
                    <div className="text-2xl font-bold">{activeChapterCount}</div>
                    <div className="text-sm text-muted-foreground">of {chapters.length} chapters</div>
                  </div>
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Average Score</div>
                    <div className="text-2xl font-bold">{averageScore}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedQuarter ? `Q${selectedQuarter} ${selectedYear}` : `Year ${selectedYear}`}
                    </div>
                  </div>
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Overall Completion</div>
                    <div className="text-2xl font-bold">{overallCompletionRate}%</div>
                    <div className="text-sm text-muted-foreground">
                      {totalCompletedSubmissions} / {totalAssignedSubmissions} assigned submissions
                    </div>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Chapter Performance Chart</CardTitle>
                  <CardDescription>Top chapters by KPI score and completed KPI count.</CardDescription>
                </CardHeader>
                <CardContent>
                  {chapterPerformanceChartData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chapter performance data yet.</p>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chapterPerformanceChartData} margin={{ top: 8, right: 8, left: -16, bottom: 24 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="chapterName" tickLine={false} axisLine={false} angle={-12} textAnchor="end" height={58} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                          <Tooltip formatter={(value: number, name: string) => [value, name === "score" ? "Score" : "Completed KPIs"]} />
                          <Bar dataKey="score" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Submission Completion Breakdown</CardTitle>
                  <CardDescription>Completed versus pending submissions for assigned KPI workloads.</CardDescription>
                </CardHeader>
                <CardContent>
                  {totalAssignedSubmissions === 0 ? (
                    <p className="text-sm text-muted-foreground">No assigned KPI submissions found for this period.</p>
                  ) : (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={overallCompletionPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={56}
                            outerRadius={84}
                            paddingAngle={2}
                          >
                            {overallCompletionPieData.map((entry, index) => (
                              <Cell key={`completion-pie-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number, name: string) => [value, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">KPI Coverage List</CardTitle>
                <CardDescription>Readable KPI completion coverage, even when many KPI templates are assigned.</CardDescription>
              </CardHeader>
              <CardContent>
                {templateAnalyticsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No KPI template analytics available yet.</p>
                ) : (
                  <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {templateAnalyticsRows.map((row) => {
                      const pendingCount = Math.max(row.assignedCount - row.completedCount, 0);

                      return (
                        <div key={row.templateId} className="rounded-md border p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{row.templateName}</p>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant="secondary">Completed: {row.completedCount}</Badge>
                              <Badge variant="outline">Pending: {pendingCount}</Badge>
                              <Badge variant="outline">Assigned: {row.assignedCount}</Badge>
                            </div>
                          </div>

                          <Progress value={row.completionRate} className="h-2" />
                          <p className="mt-2 text-xs text-muted-foreground">Completion rate: {row.completionRate}%</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">People Who Completed It</CardTitle>
                <CardDescription>
                  Shows chapter contact people for chapters that completed the selected KPI template.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="w-full md:w-[26rem]">
                  <Label>KPI Template</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger data-testid="select-analytics-template">
                      <SelectValue placeholder="Select KPI template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateAnalyticsRows.map((row) => (
                        <SelectItem key={row.templateId} value={row.templateId}>
                          {row.templateName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!selectedTemplateAnalytics ? (
                  <p className="text-sm text-muted-foreground">No KPI template analytics available for this period.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Completed: {selectedTemplateAnalytics.completedCount}</Badge>
                      <Badge variant="outline">Assigned: {selectedTemplateAnalytics.assignedCount}</Badge>
                      <Badge variant="outline">Rate: {selectedTemplateAnalytics.completionRate}%</Badge>
                      {getTimeframeBadge(selectedTemplateAnalytics.timeframe)}
                      {getScopeBadge(selectedTemplateAnalytics.scope)}
                    </div>

                    {selectedTemplateAnalytics.completedPeople.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No chapter has completed this KPI yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplateAnalytics.completedPeople.map((person) => (
                          <Badge key={`${selectedTemplateAnalytics.templateId}-${person}`} variant="secondary">
                            {person}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Template Analytics Table</CardTitle>
                <CardDescription>Completion rates and scope coverage for each KPI template.</CardDescription>
              </CardHeader>
              <CardContent>
                {isAnalyticsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading KPI analytics...</p>
                ) : templateAnalyticsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No KPI templates available for analytics.</p>
                ) : (
                  <div className="space-y-2">
                    {templateAnalyticsRows.map((row) => (
                      <div key={row.templateId} className="rounded-md border p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="font-medium">{row.templateName}</p>
                          {getTimeframeBadge(row.timeframe)}
                          {getScopeBadge(row.scope)}
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span>Completed: {row.completedCount}</span>
                          <span>Assigned: {row.assignedCount}</span>
                          <span>Rate: {row.completionRate}%</span>
                        </div>
                        <Progress value={row.completionRate} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Chapter KPI Rankings</CardTitle>
                <CardDescription>
                  {selectedQuarter
                    ? `Chapter rankings for Q${selectedQuarter} ${selectedYear}`
                    : `Chapter rankings for ${selectedYear}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLeaderboardLoading ? (
                  <p className="text-sm text-muted-foreground">Loading rankings...</p>
                ) : chapterLeaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chapter KPI analytics available yet.</p>
                ) : (
                  <div className="space-y-2">
                    {chapterLeaderboard.map((entry, index) => {
                      const isSelected = entry.chapterId === selectedChapterId;
                      return (
                        <div
                          key={entry.chapterId}
                          className={`flex items-center justify-between rounded-md border px-3 py-2 ${isSelected ? "bg-primary/10 border-primary/30" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 text-sm font-semibold text-muted-foreground">#{index + 1}</span>
                            <div>
                              <p className="font-medium">{entry.chapterName}</p>
                              <p className="text-xs text-muted-foreground">{entry.completedKpis} completed KPIs</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{entry.score} pts</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Chapter KPI Detail</CardTitle>
                <CardDescription>
                  Review KPI completion status and submitted values for each chapter.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="w-full md:w-72">
                  <Label>Chapter</Label>
                  <Select value={selectedChapterId} onValueChange={setSelectedChapterId}>
                    <SelectTrigger data-testid="select-analytics-chapter">
                      <SelectValue placeholder="Select chapter" />
                    </SelectTrigger>
                    <SelectContent>
                      {chapters.map((chapter) => (
                        <SelectItem key={chapter.id} value={chapter.id}>
                          {chapter.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!selectedChapterId ? (
                  <p className="text-sm text-muted-foreground">Select a chapter to view detailed KPI analytics.</p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Card className="p-4 bg-green-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-muted-foreground">Completed KPIs</div>
                            <div className="text-2xl font-bold text-green-700">{completedChapterKpis}</div>
                          </div>
                          <CheckCircle2 className="h-6 w-6 text-green-700" />
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-muted-foreground">Pending KPIs</div>
                            <div className="text-2xl font-bold">{pendingChapterKpis}</div>
                          </div>
                          <Clock3 className="h-6 w-6 text-muted-foreground" />
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">Progress</div>
                            <div className="text-sm font-medium">{chapterProgressPercent}%</div>
                          </div>
                          <Progress value={chapterProgressPercent} />
                          <div className="text-xs text-muted-foreground">
                            {selectedChapterRank > 0
                              ? `${selectedChapter?.name || "Selected chapter"} is #${selectedChapterRank} in rankings`
                              : `${selectedChapter?.name || "Selected chapter"} has no ranking yet`}
                          </div>
                        </div>
                      </Card>
                    </div>

                    {isChapterTemplatesLoading || isChapterCompletionsLoading ? (
                      <p className="text-sm text-muted-foreground">Loading chapter KPI details...</p>
                    ) : activeChapterTemplates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No active KPI templates available for this chapter and selected period.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {activeChapterTemplates.map((template) => {
                          const completion = completionByTemplateId.get(template.id);
                          return (
                            <div key={template.id} className="rounded-md border p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex items-center gap-2">
                                    <p className="font-medium truncate">{template.name}</p>
                                    {getTimeframeBadge(template.timeframe)}
                                    {getInputTypeBadge(template.inputType)}
                                  </div>
                                  {template.description && (
                                    <p className="text-sm text-muted-foreground">{template.description}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {template.year}{template.quarter ? ` Q${template.quarter}` : ""}
                                    </span>
                                    {template.targetValue ? (
                                      <span className="flex items-center gap-1">
                                        <Target className="h-3 w-3" />
                                        Target: {template.targetValue}
                                      </span>
                                    ) : null}
                                    <span>Value: {String(getCompletionValue(completion))}</span>
                                  </div>
                                </div>
                                {completion?.isCompleted ? (
                                  <Badge className="bg-green-600">Completed</Badge>
                                ) : (
                                  <Badge variant="outline">Pending</Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
