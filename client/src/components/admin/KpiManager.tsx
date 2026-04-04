import { useEffect, useMemo, useRef, useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { createPdfExportContract } from "@/lib/export/pdfContract";
import { reportPdfFallbackRequest } from "@/lib/export/pdfFallback";
import { formatManilaDateTime12h, ORGANIZATION_REPORT_INFO } from "@/lib/export/pdfStandards";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Save, BarChart3, Trash2, Edit2, Target, Calendar, Building2, MapPin, Trophy, TrendingUp, CheckCircle2, Clock3, Users, Search, Copy, FileDown, Eye } from "lucide-react";
import type { Chapter, KpiTemplate, KpiCompletion } from "@shared/schema";
import {
  createDefaultKpiDependencyRule,
  parseKpiDependencyConfig,
  serializeKpiDependencyConfig,
  summarizeKpiDependencyConfig,
  type KpiDependencyRule,
} from "@shared/kpi-dependencies";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import KpiDependencyEditor from "@/components/kpi/KpiDependencyEditor";

interface BarangayUser {
  id: string;
  barangayName: string;
  chapterId: string;
  createdAt?: string;
}

interface KpiTemplateWithOrigin extends KpiTemplate {
  createdByRole?: "admin" | "chapter";
  createdByChapterId?: string | null;
  createdByChapterName?: string | null;
}

interface ChapterTemplateBarangayRow {
  barangayId: string;
  barangayName: string;
  chapterName: string;
  isAffected: boolean;
  exclusionReason: string | null;
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
  dependencySummary: string | null;
  assignedChapterIds: string[];
  completedChapterIds: string[];
  pendingChapterIds: string[];
  assignedCount: number;
  completedCount: number;
  completionRate: number;
  completedPeople: Array<{ personName: string; chapterName: string }>;
  completedChapterNames: string[];
  pendingChapterNames: string[];
}

interface TemplateBarangayAnalyticsResponse {
  assignedBarangays: Array<{
    barangayId: string;
    barangayName: string;
    chapterId: string;
    accomplished: boolean;
  }>;
  assignedCount: number;
  accomplishedCount: number;
  pendingCount: number;
}

type PdfSectionOptions = {
  rankings: boolean;
  analytics: boolean;
  charts: boolean;
  kpiRequirements: boolean;
  completionPeople: boolean;
};

type PdfChartOptions = {
  leaderboard: boolean;
  completionBreakdown: boolean;
};

const PIE_COLORS = ["#16a34a", "#f59e0b"];

const SCOPE_OPTIONS = [
  { value: "all_chapters_and_barangays", label: "All Chapters & Barangays" },
  { value: "all_chapters", label: "All Chapters Only" },
  { value: "all_barangays", label: "All Barangays Only" },
  { value: "selected_chapters", label: "Selected Chapters" },
  { value: "selected_barangays", label: "Selected Barangays" },
];

const truncateChartLabel = (value: string | number, maxLength = 12) => {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
};

export default function KpiManager() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [viewTab, setViewTab] = useState<string>("templates");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [coverageSearch, setCoverageSearch] = useState("");
  const [selectedCoverageTemplateId, setSelectedCoverageTemplateId] = useState<string>("");
  const [isCoverageDialogOpen, setIsCoverageDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isChapterTemplateDetailsOpen, setIsChapterTemplateDetailsOpen] = useState(false);
  const [selectedChapterTemplate, setSelectedChapterTemplate] = useState<KpiTemplateWithOrigin | null>(null);
  const [exportReportTitle, setExportReportTitle] = useState("KPI Summary Report");
  const [pdfSectionOptions, setPdfSectionOptions] = useState<PdfSectionOptions>({
    rankings: true,
    analytics: true,
    charts: true,
    kpiRequirements: true,
    completionPeople: true,
  });
  const [pdfChartOptions, setPdfChartOptions] = useState<PdfChartOptions>({
    leaderboard: true,
    completionBreakdown: true,
  });
  const [selectedPdfTemplateIds, setSelectedPdfTemplateIds] = useState<string[]>([]);

  const leaderboardChartCardRef = useRef<HTMLDivElement | null>(null);
  const completionBreakdownCardRef = useRef<HTMLDivElement | null>(null);
  
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
    selectedEntityIds: [] as string[],
    dependencyEnabled: false,
    dependencyAggregation: "all" as "all" | "any",
    dependencyRules: [] as KpiDependencyRule[]
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

  const { data: kpiTemplates = [], isLoading } = useQuery<KpiTemplateWithOrigin[]>({
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

  const leaderboardTimeframe = selectedQuarter ? "quarterly" : "all";

  const { data: chapterLeaderboard = [], isLoading: isLeaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: [
      "/api/leaderboard",
      { timeframe: leaderboardTimeframe, year: selectedYear, quarter: selectedQuarter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        timeframe: leaderboardTimeframe,
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
      selectedEntityIds: [],
      dependencyEnabled: false,
      dependencyAggregation: "all",
      dependencyRules: []
    });
  };

  const handleOpenChapterTemplateDetails = (template: KpiTemplateWithOrigin) => {
    setSelectedChapterTemplate(template);
    setIsChapterTemplateDetailsOpen(true);
  };

  const handleOpenCreateTemplate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleEdit = async (template: KpiTemplateWithOrigin) => {
    if (template.createdByRole === "chapter") {
      toast({
        title: "Read-only template",
        description: "KPI templates created by chapters can only be viewed by national admins.",
        variant: "destructive",
      });
      return;
    }

    setEditingId(template.id);
    const dependencyConfig = parseKpiDependencyConfig(template.linkedEntityId);
    
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
      selectedEntityIds: entityIds,
      dependencyEnabled: Boolean(dependencyConfig),
      dependencyAggregation: dependencyConfig?.aggregation || "all",
      dependencyRules: dependencyConfig?.rules || []
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

    if (formData.dependencyEnabled && formData.dependencyRules.length === 0) {
      toast({ title: "Error", description: "Add at least one dependency rule", variant: "destructive" });
      return;
    }

    const hasInvalidRuleTarget = formData.dependencyRules.some(
      (rule) => !Number.isFinite(rule.targetValue) || rule.targetValue < 0,
    );
    if (formData.dependencyEnabled && hasInvalidRuleTarget) {
      toast({ title: "Error", description: "Dependency targets must be zero or greater", variant: "destructive" });
      return;
    }

    const serializedDependencyConfig = formData.dependencyEnabled
      ? serializeKpiDependencyConfig({
          version: 1,
          mode: "auto",
          aggregation: formData.dependencyAggregation,
          rules: formData.dependencyRules,
        })
      : null;

    const resolvedInputType = formData.dependencyEnabled ? "numeric" : formData.inputType;
    const dependencyDerivedTarget = formData.dependencyEnabled
      ? formData.dependencyRules[0]?.targetValue ?? null
      : null;

    const submitData = {
      name: formData.name,
      description: formData.description,
      timeframe: formData.timeframe,
      inputType: resolvedInputType,
      year: formData.year,
      quarter: formData.timeframe === "quarterly" || formData.timeframe === "both" ? formData.quarter : null,
      targetValue: resolvedInputType === "numeric" ? (dependencyDerivedTarget ?? formData.targetValue) : null,
      isActive: formData.isActive,
      scope: formData.scope,
      selectedEntityIds: formData.selectedEntityIds,
      linkedEntityId: serializedDependencyConfig
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

  const getTemplateDependencySummary = (template: KpiTemplate) => {
    const config = parseKpiDependencyConfig(template.linkedEntityId);
    if (!config) {
      return null;
    }

    return summarizeKpiDependencyConfig(config);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const quarters = [1, 2, 3, 4];

  const groupedTemplates = {
    quarterly: kpiTemplates.filter(t => t.timeframe === "quarterly"),
    yearly: kpiTemplates.filter(t => t.timeframe === "yearly"),
    both: kpiTemplates.filter(t => t.timeframe === "both")
  };

  const chapterCreatedTemplates = useMemo(
    () => kpiTemplates.filter((template) => template.createdByRole === "chapter"),
    [kpiTemplates],
  );

  const chapterById = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter]));
  }, [chapters]);

  const chapterTemplateScopeBarangayIds = useMemo(() => {
    if (!selectedChapterTemplate) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        (selectedScopesByTemplate[selectedChapterTemplate.id] || [])
          .filter((scope) => scope.entityType === "barangay")
          .map((scope) => scope.entityId),
      ),
    );
  }, [selectedChapterTemplate, selectedScopesByTemplate]);

  const chapterTemplateBarangayRows = useMemo<ChapterTemplateBarangayRow[]>(() => {
    if (!selectedChapterTemplate?.createdByChapterId) {
      return [];
    }

    const scopeBarangayIdSet = new Set(chapterTemplateScopeBarangayIds);
    const creatorChapter = chapterById.get(selectedChapterTemplate.createdByChapterId);
    const creatorChapterName =
      selectedChapterTemplate.createdByChapterName || creatorChapter?.name || "Unknown chapter";
    const templateCreatedAt = selectedChapterTemplate.createdAt
      ? new Date(selectedChapterTemplate.createdAt).getTime()
      : null;

    return barangayUsers
      .filter((barangay) => barangay.chapterId === selectedChapterTemplate.createdByChapterId)
      .map((barangay) => {
        const isAffected = scopeBarangayIdSet.has(barangay.id);
        const barangayCreatedAt = barangay.createdAt ? new Date(barangay.createdAt).getTime() : null;
        const exclusionReason = isAffected
          ? null
          : templateCreatedAt !== null && barangayCreatedAt !== null && barangayCreatedAt > templateCreatedAt
            ? "Newly added barangay after KPI creation"
            : "Excluded from chapter assignment list";

        return {
          barangayId: barangay.id,
          barangayName: barangay.barangayName,
          chapterName: creatorChapterName,
          isAffected,
          exclusionReason,
        };
      })
      .sort((a, b) => {
        if (a.isAffected !== b.isAffected) {
          return a.isAffected ? -1 : 1;
        }
        return a.barangayName.localeCompare(b.barangayName);
      });
  }, [barangayUsers, chapterById, chapterTemplateScopeBarangayIds, selectedChapterTemplate]);

  const chapterTemplateAffectedCount = chapterTemplateBarangayRows.filter((row) => row.isAffected).length;
  const chapterTemplateExcludedCount = chapterTemplateBarangayRows.filter((row) => !row.isAffected).length;

  const selectedChapter = chapters.find(chapter => chapter.id === selectedChapterId);
  const activeChapterTemplates = selectedChapterTemplates.filter(template => template.isActive);
  const completionByTemplateId = new Map(selectedChapterCompletions.map(completion => [completion.kpiTemplateId, completion]));
  const completedChapterKpis = activeChapterTemplates.filter(template => completionByTemplateId.get(template.id)?.isCompleted).length;
  const pendingChapterKpis = Math.max(activeChapterTemplates.length - completedChapterKpis, 0);
  const chapterProgressPercent = activeChapterTemplates.length > 0
    ? Math.round((completedChapterKpis / activeChapterTemplates.length) * 100)
    : 0;

  const chaptersWithCompletedKpis = chapterLeaderboard.filter((entry) => entry.completedKpis > 0);
  const chaptersWithoutCompletedKpis = chapterLeaderboard.filter((entry) => entry.completedKpis === 0);
  const topChapter = chaptersWithCompletedKpis[0] || chapterLeaderboard[0];
  const hasCompletedChapterData = chaptersWithCompletedKpis.length > 0;
  const selectedChapterRank = chaptersWithCompletedKpis.findIndex(entry => entry.chapterId === selectedChapterId) + 1;
  const activeChapterCount = chaptersWithCompletedKpis.length;
  const averageScore = chaptersWithCompletedKpis.length > 0
    ? Math.round(chaptersWithCompletedKpis.reduce((sum, entry) => sum + entry.score, 0) / chaptersWithCompletedKpis.length)
    : 0;
  const topChapterLeaderboardEntries = chaptersWithCompletedKpis.slice(0, 3);

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
          const chapterName = chapter?.name || "Unknown chapter";
          const personName = chapter?.contactPerson?.trim() || chapterName;

          return {
            personName,
            chapterName,
          };
        });

        const assignedCount = uniqueAssignedChapterIds.length;
        const completedCount = completedWithinAssigned.length;
        const completionRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;

        return {
          templateId: template.id,
          templateName: template.name,
          timeframe: template.timeframe,
          scope: template.scope,
          dependencySummary: getTemplateDependencySummary(template),
          assignedChapterIds: uniqueAssignedChapterIds,
          completedChapterIds: completedWithinAssigned,
          pendingChapterIds,
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
  const totalAssignedSubmissions = templateAnalyticsRows.reduce((sum, row) => sum + row.assignedCount, 0);
  const totalCompletedSubmissions = templateAnalyticsRows.reduce((sum, row) => sum + row.completedCount, 0);
  const overallCompletionRate = totalAssignedSubmissions > 0
    ? Math.round((totalCompletedSubmissions / totalAssignedSubmissions) * 100)
    : 0;
  const allAssignedSubmissionsCompleted = totalAssignedSubmissions > 0 && totalCompletedSubmissions >= totalAssignedSubmissions;

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
  const { data: selectedCoverageBarangayAnalytics, isLoading: isSelectedCoverageBarangayAnalyticsLoading } = useQuery<TemplateBarangayAnalyticsResponse | null>({
    queryKey: [
      "/api/kpi-template-barangay-analytics",
      selectedCoverageTemplateId,
      selectedCoverageTemplate?.scope,
      selectedYear,
      selectedQuarter,
    ],
    queryFn: async () => {
      if (!selectedCoverageTemplateId) return null;
      const res = await fetch(`/api/kpi-templates/${selectedCoverageTemplateId}/barangay-analytics`, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch barangay KPI analytics");
      }
      return (await res.json()) as TemplateBarangayAnalyticsResponse;
    },
    enabled: isCoverageDialogOpen && !!selectedCoverageTemplateId && selectedCoverageTemplate?.scope === "selected_barangays",
  });

  const selectedCoverageBreakdown = useMemo(() => {
    if (!selectedCoverageTemplate) {
      return null;
    }

    const usesBarangayRecipients =
      selectedCoverageTemplate.scope === "all_chapters_and_barangays" ||
      selectedCoverageTemplate.scope === "all_barangays" ||
      selectedCoverageTemplate.scope === "selected_barangays";

    const accomplishedChapters = [...selectedCoverageTemplate.completedChapterNames].sort((a, b) => a.localeCompare(b));
    const pendingChapters = [...selectedCoverageTemplate.pendingChapterNames].sort((a, b) => a.localeCompare(b));
    const assignedChapterIdSet = new Set(selectedCoverageTemplate.assignedChapterIds);
    const completedChapterIdSet = new Set(selectedCoverageTemplate.completedChapterIds);
    const selectedScopeBarangayIds = (selectedScopesByTemplate[selectedCoverageTemplate.templateId] || [])
      .filter((scope) => scope.entityType === "barangay")
      .map((scope) => scope.entityId);

    const hasDirectBarangayCompletionRows =
      selectedCoverageTemplate.scope === "selected_barangays" &&
      (selectedCoverageBarangayAnalytics?.assignedBarangays.length || 0) > 0;

    const recipientBarangays = (hasDirectBarangayCompletionRows
      ? selectedCoverageBarangayAnalytics!.assignedBarangays.map((barangay) => ({
          barangayId: barangay.barangayId,
          barangayName: barangay.barangayName,
          chapterId: barangay.chapterId,
          chapterName: chapterById.get(barangay.chapterId)?.name || "Unknown chapter",
          accomplished: Boolean(barangay.accomplished),
        }))
      : (
          usesBarangayRecipients && selectedCoverageTemplate.scope === "selected_barangays"
            ? selectedScopeBarangayIds
                .map((barangayId) => barangayUsers.find((barangay) => barangay.id === barangayId))
                .filter((barangay): barangay is BarangayUser => Boolean(barangay))
            : barangayUsers.filter((barangay) => assignedChapterIdSet.has(barangay.chapterId))
        ).map((barangay) => ({
          barangayId: barangay.id,
          barangayName: barangay.barangayName,
          chapterId: barangay.chapterId,
          chapterName: chapterById.get(barangay.chapterId)?.name || "Unknown chapter",
          accomplished: completedChapterIdSet.has(barangay.chapterId),
        })))
      .sort((a, b) => a.barangayName.localeCompare(b.barangayName));

    const recipientChapterNames = Array.from(new Set(recipientBarangays.map((row) => row.chapterName))).sort((a, b) =>
      a.localeCompare(b),
    );
    const recipientContextLabel = recipientChapterNames.length === 1
      ? `${recipientChapterNames[0]} chapter only`
      : recipientChapterNames.length > 1
        ? `Across ${recipientChapterNames.length} chapters`
        : "No recipient chapter available";

    const accomplishedBarangays = recipientBarangays.filter((row) => row.accomplished);
    const pendingBarangays = recipientBarangays.filter((row) => !row.accomplished);
    const assignedRecipientCount = usesBarangayRecipients ? recipientBarangays.length : selectedCoverageTemplate.assignedCount;
    const completedRecipientCount = usesBarangayRecipients ? accomplishedBarangays.length : selectedCoverageTemplate.completedCount;
    const pendingRecipientCount = Math.max(assignedRecipientCount - completedRecipientCount, 0);
    const completionRate = assignedRecipientCount > 0 ? Math.round((completedRecipientCount / assignedRecipientCount) * 100) : 0;
    const totalRuleChecks = assignedRecipientCount;
    const passedRuleChecks = completedRecipientCount;
    const failedRuleChecks = pendingRecipientCount;
    const completionPeopleByChapter = selectedCoverageTemplate.completedPeople.reduce((map, person) => {
      map.set(person.chapterName, (map.get(person.chapterName) || 0) + 1);
      return map;
    }, new Map<string, number>());

    const statusChartData = [
      { name: "Accomplished", value: completedRecipientCount, fill: "#16a34a" },
      { name: "Pending", value: pendingRecipientCount, fill: "#f97316" },
    ].filter((entry) => entry.value > 0);

    return {
      accomplishedChapters,
      pendingChapters,
      accomplishedBarangays,
      pendingBarangays,
      pendingCount: pendingRecipientCount,
      assignedRecipientCount,
      completedRecipientCount,
      completionRate,
      recipientContextLabel,
      recipientLabelPlural: usesBarangayRecipients ? "barangays" : "chapters",
      recipientLabelTitle: usesBarangayRecipients ? "Barangays" : "Chapters",
      totalRuleChecks,
      passedRuleChecks,
      failedRuleChecks,
      statusChartData,
      ruleCheckChartData: [
        { label: "Passed checks", count: passedRuleChecks, fill: "#14b8a6" },
        { label: "Failed checks", count: failedRuleChecks, fill: "#ef4444" },
      ],
      accomplishedChapterRows: accomplishedChapters.map((chapterName) => ({
        chapterName,
        completionPeopleCount: completionPeopleByChapter.get(chapterName) || 0,
      })),
    };
  }, [barangayUsers, chapterById, selectedCoverageBarangayAnalytics, selectedCoverageTemplate, selectedScopesByTemplate]);
  const selectedPdfTemplates = useMemo(() => {
    const idSet = new Set(selectedPdfTemplateIds);
    return templateAnalyticsRows.filter((row) => idSet.has(row.templateId));
  }, [selectedPdfTemplateIds, templateAnalyticsRows]);

  useEffect(() => {
    if (templateAnalyticsRows.length === 0) {
      setSelectedPdfTemplateIds([]);
      return;
    }

    setSelectedPdfTemplateIds((currentIds) => {
      const validIds = currentIds.filter((id) => templateAnalyticsRows.some((row) => row.templateId === id));
      if (validIds.length > 0) {
        return validIds;
      }

      return templateAnalyticsRows.map((row) => row.templateId);
    });
  }, [templateAnalyticsRows]);

  const togglePdfSectionOption = (key: keyof PdfSectionOptions, checked: boolean) => {
    setPdfSectionOptions((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const togglePdfChartOption = (key: keyof PdfChartOptions, checked: boolean) => {
    setPdfChartOptions((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const togglePdfTemplateSelection = (templateId: string, checked: boolean) => {
    setSelectedPdfTemplateIds((prev) => {
      if (checked) {
        if (prev.includes(templateId)) return prev;
        return [...prev, templateId];
      }

      return prev.filter((id) => id !== templateId);
    });
  };

  const handleSelectAllPdfTemplates = () => {
    setSelectedPdfTemplateIds(templateAnalyticsRows.map((row) => row.templateId));
  };

  const handleClearPdfTemplates = () => {
    setSelectedPdfTemplateIds([]);
  };

  const handleOpenCoverageDialog = (templateId: string) => {
    setSelectedCoverageTemplateId(templateId);
    setIsCoverageDialogOpen(true);
  };

  const handleOpenCoverageTemplateExport = () => {
    if (!selectedCoverageTemplate) return;
    setSelectedPdfTemplateIds([selectedCoverageTemplate.templateId]);
    setIsCoverageDialogOpen(false);
    setIsExportDialogOpen(true);
  };

  const handleTemplateCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, templateId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenCoverageDialog(templateId);
    }
  };

  const handleCopyCoverageSummary = async () => {
    if (!selectedCoverageTemplate) return;

    const recipientLabelPlural = (selectedCoverageBreakdown?.recipientLabelPlural || "chapters").toLowerCase();
    const recipientTitle = selectedCoverageBreakdown?.recipientLabelTitle || "Chapters";
    const completedNames = selectedCoverageBreakdown
      ? (selectedCoverageBreakdown.accomplishedBarangays.length > 0
        ? selectedCoverageBreakdown.accomplishedBarangays.map((row) => row.barangayName)
        : selectedCoverageTemplate.completedChapterNames)
      : selectedCoverageTemplate.completedChapterNames;
    const pendingNames = selectedCoverageBreakdown
      ? (selectedCoverageBreakdown.pendingBarangays.length > 0
        ? selectedCoverageBreakdown.pendingBarangays.map((row) => row.barangayName)
        : selectedCoverageTemplate.pendingChapterNames)
      : selectedCoverageTemplate.pendingChapterNames;
    const completedCount = selectedCoverageBreakdown?.completedRecipientCount ?? selectedCoverageTemplate.completedCount;
    const pendingCount = selectedCoverageBreakdown?.pendingCount ?? selectedCoverageTemplate.pendingChapterNames.length;
    const assignedCount = selectedCoverageBreakdown?.assignedRecipientCount ?? selectedCoverageTemplate.assignedCount;

    const didSection = completedNames.length > 0
      ? completedNames.map((name) => `- ${name}`).join("\n")
      : "- None";
    const didNotSection = pendingNames.length > 0
      ? pendingNames.map((name) => `- ${name}`).join("\n")
      : "- None";

    const summaryText = [
      `KPI Requirement: ${selectedCoverageTemplate.templateName}`,
      `Completed ${recipientLabelPlural}: ${completedCount}`,
      `Pending ${recipientLabelPlural}: ${pendingCount}`,
      `Assigned ${recipientLabelPlural}: ${assignedCount}`,
      selectedCoverageBreakdown?.recipientContextLabel
        ? `Recipient Context: ${selectedCoverageBreakdown.recipientContextLabel}`
        : null,
      "",
      `${recipientTitle} that DID complete:`,
      didSection,
      "",
      `${recipientTitle} that DID NOT complete:`,
      didNotSection,
    ].filter((line): line is string => Boolean(line)).join("\n");

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

  const handleExportPdf = async () => {
    if (isExportingPdf) return;

    const requiresTemplates = pdfSectionOptions.kpiRequirements || pdfSectionOptions.completionPeople;
    if (requiresTemplates && selectedPdfTemplates.length === 0) {
      toast({
        title: "Select KPI Requirements",
        description: "Choose at least one KPI requirement to include in the PDF report.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      const contract = createPdfExportContract({
        reportId: "admin-kpi-summary",
        purpose: "admin_kpi_summary_reporting",
        title: exportReportTitle || "KPI Summary Report",
        subtitle: selectedQuarter ? `Q${selectedQuarter} ${selectedYear}` : `Year ${selectedYear}`,
        selectedSections: pdfSectionOptions,
        selectedColumns: pdfChartOptions,
        filters: {
          year: selectedYear,
          quarter: selectedQuarter || "all",
          selectedTemplateIds: selectedPdfTemplateIds.join(","),
        },
        filenamePolicy: {
          prefix: "YSP-KPI-Summary",
          includeYear: true,
          includeQuarter: Boolean(selectedQuarter),
        },
        snapshotMetadata: {
          actorRole: "admin",
        },
      });
      exportContract = contract;

      const [{ jsPDF }, html2canvasModule] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const html2canvas = html2canvasModule.default;

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const contentWidth = pageWidth - marginX * 2;
      const headerBottomY = 126;
      const footerStartY = pageHeight - 70;
      const contentStartY = headerBottomY + 20;
      const usablePageHeight = footerStartY - contentStartY;
      const sectionSpacing = 14;
      const itemSpacing = 6;
      const reportPeriod = selectedQuarter ? `Q${selectedQuarter} ${selectedYear}` : `Year ${selectedYear}`;
      const exportedAt = `${formatManilaDateTime12h(new Date())} (Asia/Manila)`;
      const reportTemplates = selectedPdfTemplates;
      const pdfTheme = {
        accent: [249, 115, 22] as const,
        success: [22, 163, 74] as const,
        border: [229, 231, 235] as const,
        text: [17, 24, 39] as const,
        mutedText: [75, 85, 99] as const,
      };

      const getLogoDataUrl = async () => {
        const logoCandidates = [
          ORGANIZATION_REPORT_INFO.logoPath,
          "/images/ysp-logo.png",
          "images/ysp-logo.png",
        ];

        const blobToDataUrl = async (blob: Blob) =>
          await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(typeof reader.result === "string" ? reader.result : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });

        for (const candidate of logoCandidates) {
          try {
            const response = await fetch(candidate, { cache: "no-store" });
            if (!response.ok) continue;

            const contentType = response.headers.get("content-type") || "";
            if (!contentType.startsWith("image/")) continue;

            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl) return dataUrl;
          } catch {
            // Keep trying fallback candidates.
          }
        }

        const loadImageToDataUrl = async (src: string) =>
          await new Promise<string | null>((resolve) => {
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth || 96;
              canvas.height = image.naturalHeight || 96;
              const context = canvas.getContext("2d");
              if (!context) {
                resolve(null);
                return;
              }

              context.drawImage(image, 0, 0);
              resolve(canvas.toDataURL("image/png"));
            };
            image.onerror = () => resolve(null);
            image.src = `${src}${src.includes("?") ? "&" : "?"}v=${Date.now()}`;
          });

        for (const candidate of logoCandidates) {
          const dataUrl = await loadImageToDataUrl(candidate);
          if (dataUrl) return dataUrl;
        }

        return null;
      };

      const logoDataUrl = await getLogoDataUrl();
      let cursorY = contentStartY;

      const drawHeader = (pageNumber = 1) => {
        let titleStartX = marginX;

        doc.setDrawColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.setLineWidth(1.2);
        doc.line(marginX, 18, pageWidth - marginX, 18);

        if (logoDataUrl) {
          doc.addImage(logoDataUrl, "PNG", marginX, 24, 48, 48);
          titleStartX = marginX + 60;
        } else {
          // Fallback marker when logo image cannot be loaded.
          doc.setDrawColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
          doc.setLineWidth(0.8);
          doc.roundedRect(marginX, 24, 48, 48, 6, 6);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
          doc.text("YSP", marginX + 24, 53, { align: "center" });
          titleStartX = marginX + 60;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.text(ORGANIZATION_REPORT_INFO.name, titleStartX, 36);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(pdfTheme.mutedText[0], pdfTheme.mutedText[1], pdfTheme.mutedText[2]);
        doc.text(ORGANIZATION_REPORT_INFO.fullGovernmentName, titleStartX, 50);
        doc.text(ORGANIZATION_REPORT_INFO.motto, titleStartX, 64);
        doc.text(`SEC Registry No.: ${ORGANIZATION_REPORT_INFO.secRegistryNumber}`, titleStartX, 78);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(pdfTheme.mutedText[0], pdfTheme.mutedText[1], pdfTheme.mutedText[2]);
        doc.text(`Exported: ${exportedAt}`, pageWidth - marginX, 30, { align: "right" });

        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.line(marginX, 90, pageWidth - marginX, 90);

        if (pageNumber === 1) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
          doc.text(contract.title, marginX, 111);

          doc.setLineWidth(0.8);
          doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
          doc.line(marginX, 118, pageWidth - marginX, 118);
        }
      };

      const ensureSpace = (requiredHeight: number) => {
        if (cursorY + requiredHeight > footerStartY) {
          doc.addPage();
          drawHeader(doc.getNumberOfPages());
          cursorY = contentStartY;
        }
      };

      const addSectionTitle = (title: string) => {
        ensureSpace(30);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.text(title, marginX, cursorY);
        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.setLineWidth(0.7);
        doc.line(marginX, cursorY + 8, pageWidth - marginX, cursorY + 8);
        cursorY += 24;
      };

      const startSection = (title: string, estimatedSectionHeight: number, minContentHeight = 56) => {
        // If the whole section can fit on one page but not in remaining space, move it entirely to next page.
        if (estimatedSectionHeight <= usablePageHeight && cursorY + estimatedSectionHeight > footerStartY) {
          doc.addPage();
          drawHeader(doc.getNumberOfPages());
          cursorY = contentStartY;
        }

        // Keep section heading with at least part of its content on the same page.
        ensureSpace(minContentHeight + 30);
        addSectionTitle(title);
      };

      const addTextBlock = (text: string, font: "normal" | "bold" = "normal", size = 10) => {
        const lines = doc.splitTextToSize(text, contentWidth) as string[];
        const height = lines.length * 14 + 3;
        ensureSpace(height);
        const textColor = font === "bold" ? pdfTheme.text : pdfTheme.mutedText;
        doc.setFont("helvetica", font);
        doc.setFontSize(size);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text(lines, marginX, cursorY);
        cursorY += height;
      };

      const estimateTextBlockHeight = (text: string) => {
        const lines = doc.splitTextToSize(text, contentWidth) as string[];
        return lines.length * 14 + 3;
      };

      const addMetricRow = (label: string, value: string, tone: "accent" | "success" | "brand" = "accent") => {
        ensureSpace(26);
        void tone;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(pdfTheme.text[0], pdfTheme.text[1], pdfTheme.text[2]);
        doc.text(label, marginX, cursorY);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(pdfTheme.text[0], pdfTheme.text[1], pdfTheme.text[2]);
        doc.text(value, pageWidth - marginX, cursorY, { align: "right" });

        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.setLineWidth(0.5);
        doc.line(marginX, cursorY + 7, pageWidth - marginX, cursorY + 7);
        cursorY += 20;
      };

      const addRankingRow = (rank: number, chapterName: string, score: number, completedKpis: number) => {
        ensureSpace(34);
        void rank;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(pdfTheme.text[0], pdfTheme.text[1], pdfTheme.text[2]);
        doc.text(`#${rank} ${chapterName}`, marginX, cursorY);

        doc.setTextColor(pdfTheme.text[0], pdfTheme.text[1], pdfTheme.text[2]);
        doc.text(`${score} pts`, pageWidth - marginX, cursorY, { align: "right" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(pdfTheme.mutedText[0], pdfTheme.mutedText[1], pdfTheme.mutedText[2]);
        doc.text(`${completedKpis} completed KPIs`, marginX, cursorY + 13);

        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.setLineWidth(0.5);
        doc.line(marginX, cursorY + 19, pageWidth - marginX, cursorY + 19);

        cursorY += 26;
      };

      const addSubsectionLabel = (label: string) => {
        ensureSpace(24);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(pdfTheme.text[0], pdfTheme.text[1], pdfTheme.text[2]);
        doc.text(label, marginX, cursorY);
        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.setLineWidth(0.5);
        doc.line(marginX, cursorY + 4, pageWidth - marginX, cursorY + 4);
        cursorY += 18;
      };

      const addChartSnapshot = async (
        title: string,
        element: HTMLDivElement | null,
        options?: { maxHeight?: number; widthRatio?: number },
      ) => {
        if (!element) return;

        const canvas = await html2canvas(element, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
        });
        const imageData = canvas.toDataURL("image/png");

        let renderWidth = contentWidth * (options?.widthRatio ?? 0.98);
        let renderHeight = (canvas.height / canvas.width) * renderWidth;
        const maxChartHeight = options?.maxHeight ?? 250;
        if (renderHeight > maxChartHeight) {
          const scale = maxChartHeight / renderHeight;
          renderHeight = maxChartHeight;
          renderWidth = renderWidth * scale;
        }

        ensureSpace(renderHeight + 24);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.text(title, marginX, cursorY);
        cursorY += 10;

        const chartX = marginX + (contentWidth - renderWidth) / 2;
        doc.addImage(imageData, "PNG", chartX, cursorY, renderWidth, renderHeight);
        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.setLineWidth(0.7);
        doc.rect(chartX, cursorY, renderWidth, renderHeight);
        cursorY += renderHeight + 14;
      };

      const drawFooterIconWithText = (
        x: number,
        y: number,
        kind: "facebook" | "website" | "email",
        text: string,
      ) => {
        const iconCenterX = x + 4;
        const iconCenterY = y - 3;

        doc.setDrawColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.setLineWidth(0.7);
        doc.circle(iconCenterX, iconCenterY, 4);

        doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);

        if (kind === "website") {
          // Better minimal globe icon: equator, latitudes, and meridians.
          doc.setLineWidth(0.5);
          doc.line(iconCenterX - 2.3, iconCenterY, iconCenterX + 2.3, iconCenterY);
          doc.ellipse(iconCenterX, iconCenterY - 1.4, 2.2, 0.9);
          doc.ellipse(iconCenterX, iconCenterY + 1.4, 2.2, 0.9);
          doc.ellipse(iconCenterX, iconCenterY, 1.0, 2.9);
          doc.ellipse(iconCenterX, iconCenterY, 2.0, 2.9);
        } else {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6);
          doc.text(kind === "facebook" ? "f" : "@", iconCenterX, y - 1, { align: "center" });
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(pdfTheme.mutedText[0], pdfTheme.mutedText[1], pdfTheme.mutedText[2]);
        doc.text(text, x + 12, y);
      };

      drawHeader(1);

      const reportScopeEstimatedHeight = 24 + 20 + 20 + sectionSpacing;
      startSection("Report Scope", reportScopeEstimatedHeight, 62);
      addMetricRow("Period", reportPeriod, "brand");
      addMetricRow("Exported On", exportedAt, "accent");
      cursorY += sectionSpacing;

      if (pdfSectionOptions.kpiRequirements) {
        const kpiRequirementsEstimatedHeight =
          24 +
          reportTemplates.reduce((sum, _row) => sum + 18 + 20 + 20 + 20 + itemSpacing, 0) +
          sectionSpacing;

        startSection("KPI Requirements Included", kpiRequirementsEstimatedHeight, 72);
        reportTemplates.forEach((row) => {
          const pending = Math.max(row.assignedCount - row.completedCount, 0);
          addSubsectionLabel(row.templateName);
          addMetricRow("Completion", `${row.completedCount}/${row.assignedCount}`, "success");
          addMetricRow("Pending", String(pending), "brand");
          addMetricRow("Rate", `${row.completionRate}%`, "accent");
          cursorY += itemSpacing;
        });
        cursorY += sectionSpacing;
      }

      if (pdfSectionOptions.analytics) {
        const analyticsEstimatedHeight = 24 + 20 + 20 + 20 + 20 + sectionSpacing;
        startSection("Analytics Snapshot", analyticsEstimatedHeight, 72);
        addMetricRow(
          "Top Chapter",
          hasCompletedChapterData && topChapter ? `${topChapter.chapterName} (${topChapter.score} pts)` : "No completed KPI data yet",
          "brand",
        );
        addMetricRow("Active Chapters", `${activeChapterCount} of ${chapters.length}`, "accent");
        addMetricRow("Average Score", String(averageScore), "accent");
        addMetricRow(
          "Overall Completion",
          `${overallCompletionRate}% (${totalCompletedSubmissions} / ${totalAssignedSubmissions} assigned submissions)`,
          "success",
        );
        cursorY += sectionSpacing;
      }

      if (pdfSectionOptions.rankings) {
        const rankingsEstimatedHeight =
          24 +
          (chaptersWithCompletedKpis.length === 0
            ? estimateTextBlockHeight("No chapter has completed KPI tasks yet for this period.")
            : chaptersWithCompletedKpis.length * 26) +
          18 +
          (chaptersWithoutCompletedKpis.length === 0
            ? estimateTextBlockHeight("All chapters have completed at least one KPI.")
            : chaptersWithoutCompletedKpis.reduce((sum, entry) => sum + estimateTextBlockHeight(`- ${entry.chapterName}`), 0)) +
          sectionSpacing;

        startSection("Chapter KPI Rankings", rankingsEstimatedHeight, 72);
        if (chaptersWithCompletedKpis.length === 0) {
          addTextBlock("No chapter has completed KPI tasks yet for this period.");
        } else {
          chaptersWithCompletedKpis.forEach((entry, index) => {
            addRankingRow(index + 1, entry.chapterName, entry.score, entry.completedKpis);
          });
        }

        addSubsectionLabel("Chapters with no KPI completion yet");
        if (chaptersWithoutCompletedKpis.length === 0) {
          addTextBlock("All chapters have completed at least one KPI.");
        } else {
          chaptersWithoutCompletedKpis.forEach((entry) => {
            addTextBlock(`- ${entry.chapterName}`);
          });
        }
        cursorY += sectionSpacing;
      }

      if (pdfSectionOptions.completionPeople) {
        const completionPeopleEstimatedHeight =
          24 +
          reportTemplates.reduce((sum, row) => {
            const entriesHeight =
              row.completedPeople.length === 0
                ? estimateTextBlockHeight("No completed chapter entries.")
                : row.completedPeople.reduce(
                    (entrySum, entry) => entrySum + estimateTextBlockHeight(`- ${entry.personName} (${entry.chapterName})`),
                    0,
                  );

            return sum + 18 + entriesHeight + itemSpacing;
          }, 0) +
          sectionSpacing;

        startSection("People and Their Chapters Who Completed KPI Requirements", completionPeopleEstimatedHeight, 72);
        reportTemplates.forEach((row) => {
          addSubsectionLabel(`KPI Requirement: ${row.templateName}`);

          if (row.completedPeople.length === 0) {
            addTextBlock("No completed chapter entries.");
            return;
          }

          row.completedPeople.forEach((entry) => {
            addTextBlock(`- ${entry.personName} (${entry.chapterName})`);
          });

          cursorY += itemSpacing;
        });
        cursorY += sectionSpacing;
      }

      if (pdfSectionOptions.charts) {
        const selectedChartEntries = [
          pdfChartOptions.leaderboard
            ? { title: "Chapter Performance Leaderboard", element: leaderboardChartCardRef.current }
            : null,
          pdfChartOptions.completionBreakdown
            ? { title: "Submission Completion Breakdown", element: completionBreakdownCardRef.current }
            : null,
        ].filter((entry): entry is { title: string; element: HTMLDivElement | null } => Boolean(entry));

        const denseChartMode = selectedChartEntries.length > 1;
        const chartMaxHeight = denseChartMode ? 180 : 250;
        const chartWidthRatio = denseChartMode ? 0.92 : 0.98;
        const chartsEstimatedHeight =
          24 +
          (selectedChartEntries.length === 0 ? 34 : selectedChartEntries.length * (chartMaxHeight + 30)) +
          sectionSpacing;
        startSection("Charts", chartsEstimatedHeight, 120);

        if (selectedChartEntries.length === 0) {
          addTextBlock("No chart selected.");
        } else {
          for (const chart of selectedChartEntries) {
            await addChartSnapshot(chart.title, chart.element, {
              maxHeight: chartMaxHeight,
              widthRatio: chartWidthRatio,
            });
          }
        }
      }

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(pdfTheme.border[0], pdfTheme.border[1], pdfTheme.border[2]);
        doc.setLineWidth(0.8);
        doc.line(marginX, footerStartY - 12, pageWidth - marginX, footerStartY - 12);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.text(ORGANIZATION_REPORT_INFO.fullGovernmentName, marginX, footerStartY - 4);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(pdfTheme.mutedText[0], pdfTheme.mutedText[1], pdfTheme.mutedText[2]);
        doc.text(`SEC Registry No.: ${ORGANIZATION_REPORT_INFO.secRegistryNumber}`, marginX, footerStartY + 6);

        drawFooterIconWithText(marginX, footerStartY + 18, "facebook", ORGANIZATION_REPORT_INFO.facebook);
        drawFooterIconWithText(marginX + 165, footerStartY + 18, "website", ORGANIZATION_REPORT_INFO.website);
        drawFooterIconWithText(marginX + 305, footerStartY + 18, "email", ORGANIZATION_REPORT_INFO.email);

        doc.setTextColor(pdfTheme.accent[0], pdfTheme.accent[1], pdfTheme.accent[2]);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - marginX, footerStartY + 32, { align: "right" });
      }

      const fileSuffix = selectedQuarter ? `${selectedYear}-Q${selectedQuarter}` : `${selectedYear}`;
      doc.save(`YSP-KPI-Summary-${fileSuffix}.pdf`);
      setIsExportDialogOpen(false);
      toast({ title: "PDF Exported", description: "KPI summary PDF report downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export KPI PDF report", error);
      toast({
        title: "Export failed",
        description: "Unable to generate KPI PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
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

          <Button type="button" onClick={handleOpenCreateTemplate} data-testid="button-create-template">
            <Plus className="h-4 w-4 mr-2" />
            Create KPI Template
          </Button>
        </div>

        <Dialog
          open={isCreating}
          onOpenChange={(open) => {
            if (!open) {
              resetForm();
            } else {
              setIsCreating(true);
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit KPI Template" : "Create New KPI Template"}</DialogTitle>
              <DialogDescription>
                Configure KPI template details, assignment scope, and auto-tracking rules.
              </DialogDescription>
            </DialogHeader>

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
                      <SelectTrigger data-testid="select-input-type" disabled={formData.dependencyEnabled}>
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
                      <Label htmlFor="targetValue">
                        {formData.dependencyEnabled ? "Target Value (from first dependency rule)" : "Target Value (optional)"}
                      </Label>
                      <Input
                        id="targetValue"
                        type="number"
                        min="0"
                        value={
                          formData.dependencyEnabled
                            ? (formData.dependencyRules[0]?.targetValue ?? "")
                            : (formData.targetValue || "")
                        }
                        onChange={(e) => setFormData({ ...formData, targetValue: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="e.g., 100"
                        disabled={formData.dependencyEnabled}
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

                <KpiDependencyEditor
                  enabled={formData.dependencyEnabled}
                  onEnabledChange={(enabled) => {
                    setFormData((prev) => ({
                      ...prev,
                      dependencyEnabled: enabled,
                      inputType: enabled ? "numeric" : prev.inputType,
                      dependencyRules: enabled && prev.dependencyRules.length === 0
                        ? [createDefaultKpiDependencyRule()]
                        : prev.dependencyRules,
                    }));
                  }}
                  aggregation={formData.dependencyAggregation}
                  onAggregationChange={(aggregation) =>
                    setFormData((prev) => ({
                      ...prev,
                      dependencyAggregation: aggregation,
                    }))
                  }
                  rules={formData.dependencyRules}
                  onRulesChange={(rules) =>
                    setFormData((prev) => ({
                      ...prev,
                      dependencyRules: rules,
                    }))
                  }
                  dataTestIdPrefix="admin-kpi-dependency"
                />

                {formData.dependencyEnabled && (
                  <p className="text-xs text-muted-foreground">
                    Auto-tracked KPI templates are completed automatically based on dependency rules.
                  </p>
                )}

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
          </DialogContent>
        </Dialog>

        <Tabs value={viewTab} onValueChange={setViewTab} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
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
            <TabsTrigger value="chapter-created" data-testid="tab-chapter-created" className="py-2 text-xs sm:text-sm">
              <span className="sm:hidden">Chapter ({chapterCreatedTemplates.length})</span>
              <span className="hidden sm:inline">Chapter-Created ({chapterCreatedTemplates.length})</span>
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
                kpiTemplates.map((template) => {
                  const dependencySummary = getTemplateDependencySummary(template);
                  const isChapterCreated = template.createdByRole === "chapter";
                  const creatorChapterLabel = template.createdByChapterName || "Unknown chapter";

                  return (
                    <div
                      key={template.id}
                      className="flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30 hover-elevate sm:flex-row sm:items-start sm:justify-between"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenCoverageDialog(template.id)}
                      onKeyDown={(event) => handleTemplateCardKeyDown(event, template.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{template.name}</span>
                          {getTimeframeBadge(template.timeframe)}
                          {getInputTypeBadge(template.inputType)}
                          {dependencySummary && <Badge className="bg-amber-600">Auto-Tracked</Badge>}
                          {!template.isActive && <Badge variant="destructive">Inactive</Badge>}
                          {isChapterCreated && <Badge variant="outline">Chapter-Created</Badge>}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                        {dependencySummary && (
                          <p className="mt-1 text-xs text-muted-foreground">{dependencySummary}</p>
                        )}
                        {isChapterCreated && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Created by chapter: {creatorChapterLabel} (read-only for national)
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Calendar className="h-3 w-3" />
                            {template.year}{template.quarter && ` Q${template.quarter}`}
                          </span>
                          {template.targetValue && (
                            <span className="flex items-center gap-1 whitespace-nowrap">
                              <Target className="h-3 w-3" />
                              Target: {template.targetValue}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        {isChapterCreated ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenChapterTemplateDetails(template);
                            }}
                            data-testid={`button-view-chapter-template-${template.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEdit(template);
                              }}
                              data-testid={`button-edit-${template.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteMutation.mutate(template.id);
                              }}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${template.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
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
                groupedTemplates.quarterly.map((template) => {
                  const dependencySummary = getTemplateDependencySummary(template);
                  const isChapterCreated = template.createdByRole === "chapter";
                  const creatorChapterLabel = template.createdByChapterName || "Unknown chapter";

                  return (
                    <div
                      key={template.id}
                      className="flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30 hover-elevate sm:flex-row sm:items-start sm:justify-between"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenCoverageDialog(template.id)}
                      onKeyDown={(event) => handleTemplateCardKeyDown(event, template.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{template.name}</span>
                          {template.quarter && <Badge variant="outline">Q{template.quarter}</Badge>}
                          {getInputTypeBadge(template.inputType)}
                          {dependencySummary && <Badge className="bg-amber-600">Auto-Tracked</Badge>}
                          {isChapterCreated && <Badge variant="outline">Chapter-Created</Badge>}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                        {dependencySummary && (
                          <p className="mt-1 text-xs text-muted-foreground">{dependencySummary}</p>
                        )}
                        {isChapterCreated && (
                          <p className="mt-1 text-xs text-muted-foreground">Created by chapter: {creatorChapterLabel}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        {isChapterCreated ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenChapterTemplateDetails(template);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEdit(template);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteMutation.mutate(template.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
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
                [...groupedTemplates.yearly, ...groupedTemplates.both].map((template) => {
                  const dependencySummary = getTemplateDependencySummary(template);
                  const isChapterCreated = template.createdByRole === "chapter";
                  const creatorChapterLabel = template.createdByChapterName || "Unknown chapter";

                  return (
                    <div
                      key={template.id}
                      className="flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30 hover-elevate sm:flex-row sm:items-start sm:justify-between"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenCoverageDialog(template.id)}
                      onKeyDown={(event) => handleTemplateCardKeyDown(event, template.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-medium break-words">{template.name}</span>
                          {getTimeframeBadge(template.timeframe)}
                          {getInputTypeBadge(template.inputType)}
                          {dependencySummary && <Badge className="bg-amber-600">Auto-Tracked</Badge>}
                          {isChapterCreated && <Badge variant="outline">Chapter-Created</Badge>}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                        {dependencySummary && (
                          <p className="mt-1 text-xs text-muted-foreground">{dependencySummary}</p>
                        )}
                        {isChapterCreated && (
                          <p className="mt-1 text-xs text-muted-foreground">Created by chapter: {creatorChapterLabel}</p>
                        )}
                        {template.targetValue && (
                          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                            <Target className="h-3 w-3" />
                            Target: {template.targetValue}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                        {isChapterCreated ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenChapterTemplateDetails(template);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEdit(template);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteMutation.mutate(template.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="chapter-created" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Chapter-Created KPI Templates</CardTitle>
                <CardDescription>
                  National can view chapter-created KPI templates but cannot edit or delete them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chapterCreatedTemplates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No chapter-created KPI templates found for the selected period.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {chapterCreatedTemplates.map((template) => {
                      const dependencySummary = getTemplateDependencySummary(template);
                      const creatorChapterLabel = template.createdByChapterName || "Unknown chapter";

                      return (
                        <div
                          key={template.id}
                          className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-muted/30"
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenCoverageDialog(template.id)}
                          onKeyDown={(event) => handleTemplateCardKeyDown(event, template.id)}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-medium break-words">{template.name}</span>
                                {getTimeframeBadge(template.timeframe)}
                                {getInputTypeBadge(template.inputType)}
                                <Badge variant="outline">Chapter-Created</Badge>
                                {!template.isActive && <Badge variant="destructive">Inactive</Badge>}
                              </div>

                              {template.description && (
                                <p className="text-sm text-muted-foreground">{template.description}</p>
                              )}
                              {dependencySummary && (
                                <p className="mt-1 text-xs text-muted-foreground">{dependencySummary}</p>
                              )}

                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Building2 className="h-3 w-3" />
                                  Chapter: {creatorChapterLabel}
                                </span>
                                <span className="flex items-center gap-1 whitespace-nowrap">
                                  <Calendar className="h-3 w-3" />
                                  {template.year}{template.quarter ? ` Q${template.quarter}` : ""}
                                </span>
                                {template.targetValue !== null && template.targetValue !== undefined && (
                                  <span className="flex items-center gap-1 whitespace-nowrap">
                                    <Target className="h-3 w-3" />
                                    Target: {template.targetValue}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenChapterTemplateDetails(template);
                                }}
                                data-testid={`button-view-chapter-created-${template.id}`}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setIsExportDialogOpen(true)} data-testid="button-open-kpi-export-pdf">
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF Report
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Card className="p-4 bg-primary/5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Top Chapter</div>
                    <div className="text-lg font-semibold">
                      {isLeaderboardLoading ? "Loading..." : hasCompletedChapterData && topChapter ? topChapter.chapterName : "No data"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {isLeaderboardLoading
                        ? "Fetching chapter performance..."
                        : hasCompletedChapterData && topChapter
                          ? `${topChapter.score} pts`
                          : "No KPI submissions yet"}
                    </div>
                  </div>
                  <Trophy className="h-6 w-6 text-yellow-500" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Active Chapters</div>
                    <div className="text-2xl font-bold">{isLeaderboardLoading ? "..." : activeChapterCount}</div>
                    <div className="text-sm text-muted-foreground">of {chapters.length} chapters</div>
                  </div>
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Average Score</div>
                    <div className="text-2xl font-bold">{isLeaderboardLoading ? "..." : averageScore}</div>
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
              <Card ref={leaderboardChartCardRef}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Chapter Performance Leaderboard</CardTitle>
                  <CardDescription>Top 3 chapters with completed KPI tasks for this period.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLeaderboardLoading ? (
                    <p className="text-sm text-muted-foreground">Loading chapter performance...</p>
                  ) : allAssignedSubmissionsCompleted ? (
                    <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                      All of them are completed.
                    </p>
                  ) : topChapterLeaderboardEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No chapter has completed KPI tasks yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {topChapterLeaderboardEntries.map((entry, index) => (
                        <div key={entry.chapterId} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                                index === 0
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                                  : index === 1
                                    ? "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200"
                                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                              }`}
                            >
                              #{index + 1}
                            </span>
                            <div>
                              <p className="font-medium">{entry.chapterName}</p>
                              <p className="text-xs text-muted-foreground">{entry.completedKpis} completed KPIs</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{entry.score} pts</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card ref={completionBreakdownCardRef}>
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
                          <Legend
                            verticalAlign="bottom"
                            height={30}
                            iconType="circle"
                            formatter={(value: string | number) => {
                              const label = String(value);
                              const matched = overallCompletionPieData.find((item) => item.name === label);
                              return `${label}: ${matched?.value ?? 0}`;
                            }}
                          />
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
              <CardContent className="max-h-[26rem] overflow-y-auto pr-1">
                {templateAnalyticsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No KPI template analytics available yet.</p>
                ) : (
                  <div className="space-y-3">
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
                <CardTitle className="text-base">Template Analytics Table</CardTitle>
                <CardDescription>Completion rates and scope coverage for each KPI template.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[26rem] overflow-y-auto pr-1">
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
                    ? `Chapter rankings for Q${selectedQuarter} ${selectedYear} (completed KPI tasks only)`
                    : `Chapter rankings for ${selectedYear} (completed KPI tasks only)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[26rem] overflow-y-auto pr-1">
                {isLeaderboardLoading ? (
                  <p className="text-sm text-muted-foreground">Loading rankings...</p>
                ) : chapterLeaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No chapter KPI analytics available yet.</p>
                ) : (
                  <div className="space-y-3">
                    {chaptersWithCompletedKpis.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No chapter has completed KPI tasks yet for this period.</p>
                    ) : (
                      <div className="space-y-2">
                        {allAssignedSubmissionsCompleted ? (
                          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                            All of them are completed.
                          </p>
                        ) : null}
                        {chaptersWithCompletedKpis.map((entry, index) => {
                          const isSelected = entry.chapterId === selectedChapterId;
                          return (
                            <div
                              key={entry.chapterId}
                              className={`flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${isSelected ? "bg-primary/10 border-primary/30" : ""}`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="w-6 text-sm font-semibold text-muted-foreground">#{index + 1}</span>
                                <div className="min-w-0">
                                  <p className="font-medium break-normal">{entry.chapterName}</p>
                                  <p className="text-xs text-muted-foreground">{entry.completedKpis} completed KPIs</p>
                                </div>
                              </div>
                              <Badge variant="secondary" className="self-start sm:self-auto">{entry.score} pts</Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="rounded-md border border-dashed p-3">
                      <p className="mb-2 text-sm font-medium">Chapters with no KPI completion yet</p>
                      {chaptersWithoutCompletedKpis.length === 0 ? (
                        <p className="text-xs text-muted-foreground">All chapters have completed at least one KPI.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {chaptersWithoutCompletedKpis.map((entry) => (
                            <Badge key={`pending-kpi-${entry.chapterId}`} variant="outline">
                              {entry.chapterName}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
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
                      <Card className="p-4 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-muted-foreground">Completed KPIs</div>
                            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{completedChapterKpis}</div>
                          </div>
                          <CheckCircle2 className="h-6 w-6 text-green-700 dark:text-green-300" />
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
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex flex-wrap items-center gap-2">
                                    <p className="font-medium break-normal">{template.name}</p>
                                    {getTimeframeBadge(template.timeframe)}
                                    {getInputTypeBadge(template.inputType)}
                                  </div>
                                  {template.description && (
                                    <p className="text-sm text-muted-foreground break-normal">{template.description}</p>
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
                                  <Badge className="bg-green-600 self-start sm:self-auto">Completed</Badge>
                                ) : (
                                  <Badge variant="outline" className="self-start sm:self-auto">Pending</Badge>
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

        <Dialog
          open={isCoverageDialogOpen}
          onOpenChange={(open) => {
            setIsCoverageDialogOpen(open);
            if (!open) {
              setSelectedCoverageTemplateId("");
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedCoverageTemplate?.templateName || "KPI Template Analytics"}</DialogTitle>
              <DialogDescription>
                Assigned chapters, completion status, and rule-check health.
              </DialogDescription>
            </DialogHeader>

            {!selectedCoverageTemplate ? (
              <p className="text-sm text-muted-foreground">Select a KPI template to view analytics details.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenCoverageTemplateExport}
                    data-testid="button-export-specific-admin-kpi-pdf"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Customize KPI PDF
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Assigned {selectedCoverageBreakdown?.recipientLabelTitle || "Recipients"}</p>
                    <p className="text-xl font-semibold">{selectedCoverageBreakdown?.assignedRecipientCount || 0}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Accomplished {selectedCoverageBreakdown?.recipientLabelTitle || "Recipients"}</p>
                    <p className="text-xl font-semibold text-green-600">{selectedCoverageBreakdown?.completedRecipientCount || 0}</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Pending {selectedCoverageBreakdown?.recipientLabelTitle || "Recipients"}</p>
                    <p className="text-xl font-semibold text-orange-500">
                      {selectedCoverageBreakdown?.pendingCount || 0}
                    </p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Completion Rate</p>
                    <p className="text-xl font-semibold">{selectedCoverageBreakdown?.completionRate || 0}%</p>
                  </Card>
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Failed Rule Checks</p>
                    <p className="text-xl font-semibold text-orange-500">{selectedCoverageBreakdown?.failedRuleChecks || 0}</p>
                  </Card>
                </div>

                {selectedCoverageTemplate.dependencySummary && (
                  <p className="text-xs text-muted-foreground">{selectedCoverageTemplate.dependencySummary}</p>
                )}

                {selectedCoverageTemplate.scope === "selected_barangays" && isSelectedCoverageBarangayAnalyticsLoading && (
                  <p className="text-xs text-muted-foreground">Checking barangay completion records...</p>
                )}

                {selectedCoverageBreakdown?.recipientContextLabel && (
                  <p className="text-xs text-muted-foreground">
                    Recipient context: {selectedCoverageBreakdown.recipientContextLabel}
                  </p>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="min-w-0 overflow-hidden">
                    <CardHeader>
                      <CardTitle className="text-base">Status Breakdown</CardTitle>
                      <CardDescription>
                        Visual split of accomplished and pending {selectedCoverageBreakdown?.recipientLabelPlural || "recipients"} for this template.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(selectedCoverageBreakdown?.statusChartData.reduce((sum, item) => sum + item.value, 0) || 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">No status data available yet.</p>
                      ) : (
                        <div className="mx-auto h-[220px] w-full max-w-[320px] sm:h-[240px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Tooltip formatter={(value: number, name: string) => [value, name]} cursor={{ fill: "rgba(148, 163, 184, 0.12)" }} />
                              <Legend verticalAlign="bottom" height={24} iconType="circle" />
                              <Pie
                                data={selectedCoverageBreakdown?.statusChartData || []}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="42%"
                                outerRadius="78%"
                                stroke="transparent"
                                strokeWidth={0}
                              >
                                {(selectedCoverageBreakdown?.statusChartData || []).map((entry) => (
                                  <Cell key={entry.name} fill={entry.fill} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="min-w-0 overflow-hidden">
                    <CardHeader>
                      <CardTitle className="text-base">Rule Check Health</CardTitle>
                      <CardDescription>
                        Passed and failed rule checks across assigned {selectedCoverageBreakdown?.recipientLabelPlural || "recipients"}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(selectedCoverageBreakdown?.totalRuleChecks || 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">No rule checks recorded for this template.</p>
                      ) : (
                        <>
                          <div className="h-[220px] w-full sm:h-[240px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={selectedCoverageBreakdown?.ruleCheckChartData || []}
                                layout="vertical"
                                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                              >
                                <CartesianGrid horizontal={false} />
                                <XAxis
                                  type="number"
                                  tickLine={false}
                                  axisLine={false}
                                  allowDecimals={false}
                                  domain={[0, Math.max(selectedCoverageBreakdown?.totalRuleChecks || 1, 1)]}
                                />
                                <YAxis
                                  type="category"
                                  dataKey="label"
                                  tickLine={false}
                                  axisLine={false}
                                  width={84}
                                  tickFormatter={(value) => truncateChartLabel(value, 12)}
                                />
                                <Tooltip formatter={(value: number, name: string) => [value, name]} cursor={{ fill: "rgba(148, 163, 184, 0.12)" }} />
                                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={24}>
                                  {(selectedCoverageBreakdown?.ruleCheckChartData || []).map((entry) => (
                                    <Cell key={entry.label} fill={entry.fill} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {selectedCoverageBreakdown?.passedRuleChecks || 0} passed out of {selectedCoverageBreakdown?.totalRuleChecks || 0} total checks.
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Accomplished Barangays ({selectedCoverageBreakdown?.accomplishedBarangays.length || 0})
                      </CardTitle>
                      <CardDescription>
                        Barangay recipients under {selectedCoverageBreakdown?.recipientContextLabel || "the assigned chapter scope"}.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!selectedCoverageBreakdown || selectedCoverageBreakdown.accomplishedBarangays.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No barangays have accomplished this KPI yet.</p>
                      ) : (
                        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                          {selectedCoverageBreakdown.accomplishedBarangays.map((barangay) => (
                            <div key={`accomplished-${selectedCoverageTemplate.templateId}-${barangay.barangayId}`} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{barangay.barangayName}</p>
                                <Badge className="bg-green-600">Accomplished</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{barangay.chapterName}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Pending Barangays ({selectedCoverageBreakdown?.pendingBarangays.length || 0})
                      </CardTitle>
                      <CardDescription>
                        Barangay recipients that still have incomplete chapter-level requirements.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!selectedCoverageBreakdown || selectedCoverageBreakdown.pendingBarangays.length === 0 ? (
                        <p className="text-sm text-muted-foreground">All assigned barangays have completed this KPI.</p>
                      ) : (
                        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                          {selectedCoverageBreakdown.pendingBarangays.map((barangay) => (
                            <div key={`pending-${selectedCoverageTemplate.templateId}-${barangay.barangayId}`} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-medium">{barangay.barangayName}</p>
                                <Badge className="bg-orange-500">Pending</Badge>
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {barangay.chapterName}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={handleCopyCoverageSummary}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Summary
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={isChapterTemplateDetailsOpen}
          onOpenChange={(open) => {
            setIsChapterTemplateDetailsOpen(open);
            if (!open) {
              setSelectedChapterTemplate(null);
            }
          }}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Chapter-Created KPI Template Details</DialogTitle>
              <DialogDescription>
                National view only. This KPI affects only the barangays under the creator chapter.
              </DialogDescription>
            </DialogHeader>

            {!selectedChapterTemplate ? (
              <p className="text-sm text-muted-foreground">Select a chapter-created template to view details.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{selectedChapterTemplate.name}</p>
                    {getTimeframeBadge(selectedChapterTemplate.timeframe)}
                    {getInputTypeBadge(selectedChapterTemplate.inputType)}
                    <Badge variant="outline">Chapter-Created</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Creator Chapter: {selectedChapterTemplate.createdByChapterName || "Unknown chapter"}
                  </p>
                  {selectedChapterTemplate.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{selectedChapterTemplate.description}</p>
                  ) : null}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Total Barangays Under Chapter</p>
                    <p className="text-2xl font-semibold">{chapterTemplateBarangayRows.length}</p>
                  </Card>
                  <Card className="p-3 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                    <p className="text-xs text-muted-foreground">Affected Barangays</p>
                    <p className="text-2xl font-semibold text-green-700 dark:text-green-300">{chapterTemplateAffectedCount}</p>
                  </Card>
                  <Card className="p-3 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-xs text-muted-foreground">Excluded Barangays</p>
                    <p className="text-2xl font-semibold text-amber-700 dark:text-amber-300">{chapterTemplateExcludedCount}</p>
                  </Card>
                </div>

                {!selectedChapterTemplate.createdByChapterId ? (
                  <p className="text-sm text-muted-foreground">
                    Creator chapter information is missing for this template.
                  </p>
                ) : isTemplateScopesLoading ? (
                  <p className="text-sm text-muted-foreground">Loading barangay coverage...</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Barangay</TableHead>
                          <TableHead>Chapter</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Exclusion Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chapterTemplateBarangayRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No barangays found for this creator chapter.
                            </TableCell>
                          </TableRow>
                        ) : (
                          chapterTemplateBarangayRows.map((row) => (
                            <TableRow key={row.barangayId}>
                              <TableCell className="font-medium">{row.barangayName}</TableCell>
                              <TableCell>{row.chapterName}</TableCell>
                              <TableCell>
                                {row.isAffected ? (
                                  <Badge className="bg-green-600">Affected</Badge>
                                ) : (
                                  <Badge variant="outline">Excluded</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {row.isAffected ? "-" : row.exclusionReason}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Export KPI Analytics PDF</DialogTitle>
              <DialogDescription>
                Customize what to include in the report before downloading the PDF summary.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="kpi-export-report-title">Report Title</Label>
                <Input
                  id="kpi-export-report-title"
                  value={exportReportTitle}
                  onChange={(event) => setExportReportTitle(event.target.value)}
                  placeholder="KPI Summary Report"
                  data-testid="input-kpi-export-report-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Sections to Include</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={pdfSectionOptions.analytics}
                      onCheckedChange={(checked) => togglePdfSectionOption("analytics", checked === true)}
                      data-testid="checkbox-kpi-export-analytics"
                    />
                    Analytics Summary
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={pdfSectionOptions.rankings}
                      onCheckedChange={(checked) => togglePdfSectionOption("rankings", checked === true)}
                      data-testid="checkbox-kpi-export-rankings"
                    />
                    Chapter KPI Rankings
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={pdfSectionOptions.charts}
                      onCheckedChange={(checked) => togglePdfSectionOption("charts", checked === true)}
                      data-testid="checkbox-kpi-export-charts"
                    />
                    Charts
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={pdfSectionOptions.kpiRequirements}
                      onCheckedChange={(checked) => togglePdfSectionOption("kpiRequirements", checked === true)}
                      data-testid="checkbox-kpi-export-requirements"
                    />
                    KPI Requirements Summary
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2">
                    <Checkbox
                      checked={pdfSectionOptions.completionPeople}
                      onCheckedChange={(checked) => togglePdfSectionOption("completionPeople", checked === true)}
                      data-testid="checkbox-kpi-export-completion-people"
                    />
                    People and Chapters Who Completed KPI Requirements
                  </label>
                </div>
              </div>

              {pdfSectionOptions.charts ? (
                <div className="space-y-2">
                  <Label>Charts to Include</Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={pdfChartOptions.leaderboard}
                        onCheckedChange={(checked) => togglePdfChartOption("leaderboard", checked === true)}
                        data-testid="checkbox-kpi-export-chart-leaderboard"
                      />
                      Chapter Performance Leaderboard
                    </label>

                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={pdfChartOptions.completionBreakdown}
                        onCheckedChange={(checked) => togglePdfChartOption("completionBreakdown", checked === true)}
                        data-testid="checkbox-kpi-export-chart-completion"
                      />
                      Submission Completion Breakdown
                    </label>
                  </div>
                </div>
              ) : null}

              {pdfSectionOptions.kpiRequirements || pdfSectionOptions.completionPeople ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>KPI Requirements to Include</Label>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={handleSelectAllPdfTemplates}>
                        Select All
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={handleClearPdfTemplates}>
                        Clear
                      </Button>
                    </div>
                  </div>

                  {templateAnalyticsRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No KPI requirements found for the selected period.</p>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                      {templateAnalyticsRows.map((row) => {
                        const isChecked = selectedPdfTemplateIds.includes(row.templateId);
                        return (
                          <label key={row.templateId} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => togglePdfTemplateSelection(row.templateId, checked === true)}
                              data-testid={`checkbox-kpi-export-template-${row.templateId}`}
                            />
                            <div className="space-y-1">
                              <p className="font-medium">{row.templateName}</p>
                              <p className="text-xs text-muted-foreground">
                                Completed {row.completedCount}/{row.assignedCount} ({row.completionRate}%)
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
                <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsExportDialogOpen(false)} disabled={isExportingPdf}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleExportPdf} disabled={isExportingPdf} data-testid="button-download-kpi-export-pdf">
                  <FileDown className="h-4 w-4 mr-2" />
                  {isExportingPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
