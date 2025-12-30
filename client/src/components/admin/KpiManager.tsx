import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Save, BarChart3 } from "lucide-react";
import type { Chapter, ChapterKpi, KpisData } from "@shared/schema";

export default function KpiManager() {
  const { toast } = useToast();
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  
  const [projectsCompleted, setProjectsCompleted] = useState<string>("0");
  const [volunteers, setVolunteers] = useState<string>("0");
  const [beneficiaries, setBeneficiaries] = useState<string>("0");
  const [fundsRaised, setFundsRaised] = useState<string>("0");

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: existingKpi, isLoading: kpiLoading } = useQuery<ChapterKpi>({
    queryKey: ["/api/chapter-kpis", selectedChapterId, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/chapter-kpis/${selectedChapterId}/${selectedYear}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch KPI data");
      }
      return res.json();
    },
    enabled: !!selectedChapterId,
  });

  const saveKpiMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/chapter-kpis", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "KPIs saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-kpis"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleLoadKpi = () => {
    if (existingKpi) {
      const kpiData = existingKpi.kpisJson as KpisData;
      setProjectsCompleted(String(kpiData.projectsCompleted || 0));
      setVolunteers(String(kpiData.volunteers || 0));
      setBeneficiaries(String(kpiData.beneficiaries || 0));
      setFundsRaised(String(kpiData.fundsRaised || 0));
    } else {
      setProjectsCompleted("0");
      setVolunteers("0");
      setBeneficiaries("0");
      setFundsRaised("0");
    }
  };

  const handleChapterChange = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    setProjectsCompleted("0");
    setVolunteers("0");
    setBeneficiaries("0");
    setFundsRaised("0");
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(parseInt(year));
    setProjectsCompleted("0");
    setVolunteers("0");
    setBeneficiaries("0");
    setFundsRaised("0");
  };

  const handleSaveKpi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapterId) {
      toast({ title: "Error", description: "Please select a chapter", variant: "destructive" });
      return;
    }

    const kpisJson: KpisData = {
      projectsCompleted: parseInt(projectsCompleted) || 0,
      volunteers: parseInt(volunteers) || 0,
      beneficiaries: parseInt(beneficiaries) || 0,
      fundsRaised: parseInt(fundsRaised) || 0
    };

    saveKpiMutation.mutate({
      chapterId: selectedChapterId,
      year: selectedYear,
      kpisJson
    });
  };

  const selectedChapter = chapters.find(c => c.id === selectedChapterId);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          KPI Management
        </CardTitle>
        <CardDescription>
          Set and manage key performance indicators for each chapter
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <Label>Select Chapter</Label>
            <Select value={selectedChapterId} onValueChange={handleChapterChange}>
              <SelectTrigger data-testid="select-chapter">
                <SelectValue placeholder="Select a chapter..." />
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
          <div className="w-32">
            <Label>Year</Label>
            <Select value={String(selectedYear)} onValueChange={handleYearChange}>
              <SelectTrigger data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedChapterId && (
            <Button variant="outline" onClick={handleLoadKpi} data-testid="button-load-kpi">
              Load Existing
            </Button>
          )}
        </div>

        {selectedChapterId && (
          <form onSubmit={handleSaveKpi} className="space-y-6">
            <div className="bg-muted/50 p-4 rounded-lg">
              <h3 className="font-medium mb-4">
                KPIs for {selectedChapter?.name} - {selectedYear}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="projectsCompleted">Projects Completed</Label>
                  <Input
                    id="projectsCompleted"
                    type="number"
                    min="0"
                    value={projectsCompleted}
                    onChange={(e) => setProjectsCompleted(e.target.value)}
                    data-testid="input-projects-completed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="volunteers">Volunteers</Label>
                  <Input
                    id="volunteers"
                    type="number"
                    min="0"
                    value={volunteers}
                    onChange={(e) => setVolunteers(e.target.value)}
                    data-testid="input-volunteers"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beneficiaries">Beneficiaries</Label>
                  <Input
                    id="beneficiaries"
                    type="number"
                    min="0"
                    value={beneficiaries}
                    onChange={(e) => setBeneficiaries(e.target.value)}
                    data-testid="input-beneficiaries"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fundsRaised">Funds Raised (₱)</Label>
                  <Input
                    id="fundsRaised"
                    type="number"
                    min="0"
                    value={fundsRaised}
                    onChange={(e) => setFundsRaised(e.target.value)}
                    data-testid="input-funds-raised"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={saveKpiMutation.isPending} data-testid="button-save-kpi">
              <Save className="h-4 w-4 mr-2" />
              {saveKpiMutation.isPending ? "Saving..." : "Save KPIs"}
            </Button>
          </form>
        )}

        {!selectedChapterId && (
          <p className="text-center text-muted-foreground py-8">
            Select a chapter to manage its KPIs
          </p>
        )}
      </CardContent>
    </Card>
  );
}
