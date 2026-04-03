import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingState from "@/components/ui/loading-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import PaginationControls from "@/components/ui/pagination-controls";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { createPdfExportContract } from "@/lib/export/pdfContract";
import { reportPdfFallbackRequest } from "@/lib/export/pdfFallback";
import { createSafeFileToken, formatManilaDateTime, getIsoDateFileStamp } from "@/lib/export/pdfStandards";
import { createYspPdfReport } from "@/lib/pdfReport";
import { usePagination } from "@/hooks/use-pagination";
import { UserCheck, Plus, Save, Trash2, Edit2, Phone, Mail, Calendar, FileDown } from "lucide-react";
import type { ChapterOfficer } from "@shared/schema";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

const OFFICER_POSITIONS = [
  "City/Municipality President",
  "Program Development Officer",
  "Finance and Treasury Officer",
  "Secretary and Documentation Officer",
  "Partnership and Fundraising Officer",
  "Communications and Marketing Officer",
  "Membership and Internal Affairs Officer"
];

export interface OfficersPanelProps {
  chapterId: string;
  level?: "chapter" | "barangay";
  barangayId?: string;
  chapterName?: string;
}

interface BarangayOption {
  id: string;
  barangayName: string;
  chapterId: string;
}

const BARANGAY_OFFICER_POSITIONS = [
  "Barangay President",
  "Program Development Officer",
  "Finance and Treasury Officer",
  "Secretary and Documentation Officer",
  "Partnership and Fundraising Officer",
  "Communications and Marketing Officer",
  "Membership and Internal Affairs Officer"
];

type OfficersExportSections = {
  scope: boolean;
  chapterTable: boolean;
  barangayTable: boolean;
};

type OfficersExportColumns = {
  barangay: boolean;
  name: boolean;
  position: boolean;
  contact: boolean;
  email: boolean;
  joinedDate: boolean;
};

type ExportPreset = "minimal" | "standard" | "full";

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function OfficersPanel({ chapterId, level = "chapter", barangayId, chapterName }: OfficersPanelProps) {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [officersExportReportTitle, setOfficersExportReportTitle] = useState(
    level === "chapter" ? "Officers Directory Report" : "Barangay Officers Report",
  );
  const [officersExportSections, setOfficersExportSections] = useState<OfficersExportSections>({
    scope: true,
    chapterTable: true,
    barangayTable: true,
  });
  const [officersExportColumns, setOfficersExportColumns] = useState<OfficersExportColumns>({
    barangay: true,
    name: true,
    position: true,
    contact: true,
    email: true,
    joinedDate: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    position: "",
    fullName: "",
    birthdate: "",
    contactNumber: "",
    chapterEmail: ""
  });

  const { data: officers = [], isLoading } = useQuery<ChapterOfficer[]>({
    queryKey: ["/api/chapter-officers", { chapterId, barangayId, level }],
    queryFn: async () => {
      let url = `/api/chapter-officers?chapterId=${chapterId}`;
      if (barangayId) {
        url += `&barangayId=${barangayId}`;
      }
      if (level) {
        url += `&level=${level}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch officers");
      return res.json();
    },
    enabled: !!chapterId,
  });

  const { data: barangays = [] } = useQuery<BarangayOption[]>({
    queryKey: ["/api/chapters", chapterId, "barangays"],
    queryFn: async () => {
      const res = await fetch(`/api/chapters/${chapterId}/barangays`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch barangays");
      return res.json();
    },
    enabled: level === "chapter" && !!chapterId,
  });

  const isBarangayOfficer = (officer: ChapterOfficer) => officer.level === "barangay" || Boolean(officer.barangayId);
  const chapterOfficers = level === "chapter" ? officers.filter((officer) => !isBarangayOfficer(officer)) : officers;
  const barangayOfficers = level === "chapter" ? officers.filter((officer) => isBarangayOfficer(officer)) : [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/chapter-officers", {
        ...data,
        chapterId,
        barangayId: barangayId || null,
        level: level || "chapter",
        birthdate: data.birthdate || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Officer added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-officers"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return await apiRequest("PUT", `/api/chapter-officers/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Officer updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-officers"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/chapter-officers/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Officer removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-officers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const resetForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({ position: "", fullName: "", birthdate: "", contactNumber: "", chapterEmail: "" });
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData({ position: "", fullName: "", birthdate: "", contactNumber: "", chapterEmail: "" });
    setIsFormOpen(true);
  };

  const handleEdit = (officer: ChapterOfficer) => {
    setEditingId(officer.id);
    let position = officer.position;
    if ((level === "barangay" || isBarangayOfficer(officer)) && position === "City/Municipality President") {
      position = "Barangay President";
    }
    setFormData({
      position,
      fullName: officer.fullName,
      birthdate: toDateInputValue(officer.birthdate),
      contactNumber: officer.contactNumber,
      chapterEmail: officer.chapterEmail
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.position || !formData.fullName || !formData.contactNumber || !formData.chapterEmail) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const editingOfficer = editingId ? officers.find((officer) => officer.id === editingId) : undefined;
  const editingBarangayId = editingOfficer?.barangayId || "unassigned";
  const isEditingBarangayOfficer = Boolean(editingOfficer && isBarangayOfficer(editingOfficer));

  const positions = level === "barangay" || (level === "chapter" && isEditingBarangayOfficer)
    ? BARANGAY_OFFICER_POSITIONS
    : OFFICER_POSITIONS;

  const summaryOfficers = level === "chapter" ? chapterOfficers : officers;
  const positionScopeOfficers = level === "chapter"
    ? (isEditingBarangayOfficer
      ? barangayOfficers.filter((officer) => (officer.barangayId || "unassigned") === editingBarangayId)
      : chapterOfficers)
    : officers;

  const filledPositions = positionScopeOfficers.map(o => {
    if ((level === "barangay" || isEditingBarangayOfficer) && o.position === "City/Municipality President") return "Barangay President";
    return o.position;
  });
  const availablePositions = positions.filter(p => !filledPositions.includes(p) || (editingId && positionScopeOfficers.find(o => o.id === editingId)?.position === p));

  const chapterNameForTitle = chapterName
    ? chapterName.replace(/^YSP[_\s-]*/i, "").replace(/_/g, " ").trim()
    : "";
  const chapterOfficerSectionTitle = chapterNameForTitle ? `${chapterNameForTitle} Chapter Officers` : "Chapter Officers";

  const barangayNameById = new Map(barangays.map((barangay) => [barangay.id, barangay.barangayName]));
  const groupedBarangayOfficers = barangayOfficers.reduce<Record<string, ChapterOfficer[]>>((acc, officer) => {
    const key = officer.barangayId || "unassigned";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(officer);
    return acc;
  }, {});
  const barangaySections = Object.entries(groupedBarangayOfficers).sort(([barangayIdA], [barangayIdB]) => {
    const labelA = barangayIdA === "unassigned" ? "Unassigned Barangay" : barangayNameById.get(barangayIdA) || "Unknown Barangay";
    const labelB = barangayIdB === "unassigned" ? "Unassigned Barangay" : barangayNameById.get(barangayIdB) || "Unknown Barangay";
    return labelA.localeCompare(labelB);
  });

  const barangaySectionsPagination = usePagination(barangaySections, {
    pageSize: 4,
    resetKey: barangaySections.length,
  });

  const officersPagination = usePagination(officers, {
    pageSize: 7,
    resetKey: officers.length,
  });

  const handleDeleteOfficer = async (officerId: string) => {
    if (!(await confirmDelete("Remove this officer?", "Delete Officer"))) {
      return;
    }

    deleteMutation.mutate(officerId);
  };

  const getOfficerDisplayPosition = (officer: ChapterOfficer, useBarangayLabel = false) => {
    if ((level === "barangay" || useBarangayLabel) && officer.position === "City/Municipality President") {
      return "Barangay President";
    }

    return officer.position;
  };

  const toggleOfficersExportSection = (key: keyof OfficersExportSections, checked: boolean) => {
    setOfficersExportSections((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const toggleOfficersExportColumn = (key: keyof OfficersExportColumns, checked: boolean) => {
    setOfficersExportColumns((prev) => ({
      ...prev,
      [key]: checked,
    }));
  };

  const applyOfficersExportPreset = (preset: ExportPreset) => {
    if (preset === "minimal") {
      setOfficersExportSections({
        scope: true,
        chapterTable: level === "chapter",
        barangayTable: level !== "chapter",
      });
      setOfficersExportColumns({
        barangay: false,
        name: true,
        position: true,
        contact: true,
        email: false,
        joinedDate: false,
      });
      return;
    }

    if (preset === "standard") {
      setOfficersExportSections({
        scope: true,
        chapterTable: level === "chapter",
        barangayTable: true,
      });
      setOfficersExportColumns({
        barangay: level === "chapter",
        name: true,
        position: true,
        contact: true,
        email: true,
        joinedDate: false,
      });
      return;
    }

    setOfficersExportSections({
      scope: true,
      chapterTable: level === "chapter",
      barangayTable: true,
    });
    setOfficersExportColumns({
      barangay: level === "chapter",
      name: true,
      position: true,
      contact: true,
      email: true,
      joinedDate: true,
    });
  };

  const createChapterFileToken = () => createSafeFileToken(chapterName || "chapter", "chapter");

  const handleExportOfficersPdf = async () => {
    if (isExportingPdf) {
      return;
    }

    const includeScopeSection = officersExportSections.scope;
    const includeChapterTable = level === "chapter" && officersExportSections.chapterTable;
    const includeBarangayTable = officersExportSections.barangayTable;

    if (!includeScopeSection && !includeChapterTable && !includeBarangayTable) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one report section before exporting the PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      exportContract = createPdfExportContract({
        reportId: "chapter-officers-directory",
        purpose: "chapter_and_barangay_officer_directory",
        title:
          officersExportReportTitle.trim() ||
          (level === "chapter" ? "Officers Directory Report" : "Barangay Officers Report"),
        subtitle: chapterName
          ? `${chapterName} | ${level === "chapter" ? "Chapter and barangay officers" : "Barangay officers"}`
          : level === "chapter"
            ? "Chapter and barangay officers"
            : "Barangay officers",
        selectedSections: officersExportSections,
        selectedColumns: officersExportColumns,
        filters: {
          chapterName: chapterName || "-",
          level,
          chapterOfficers: chapterOfficers.length,
          barangayOfficers: barangayOfficers.length,
          totalOfficers: officers.length,
        },
        filenamePolicy: {
          prefix: "YSP-Officers",
          includeChapterToken: true,
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: level === "chapter" ? "chapter" : "barangay",
          chapterId,
          barangayId,
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (includeScopeSection) {
        report.addSectionTitle("Report Scope");
        report.addMetricRow("Chapter", chapterName || "-");
        report.addMetricRow(
          "Officer Level",
          level === "chapter" ? "Chapter + Barangay Officers" : "Barangay Officers Only",
        );
        if (level === "chapter") {
          report.addMetricRow("Chapter Officers", String(chapterOfficers.length));
          report.addMetricRow("Barangay Officers", String(barangayOfficers.length));
        } else {
          report.addMetricRow("Total Officers", String(officers.length));
        }
        report.addSpacer(8);
      }

      if (includeChapterTable) {
        const selectedChapterColumns: Array<{ header: string; key: string; width: number }> = [];
        if (officersExportColumns.name) selectedChapterColumns.push({ header: "Name", key: "name", width: 2.2 });
        if (officersExportColumns.position) selectedChapterColumns.push({ header: "Position", key: "position", width: 2.1 });
        if (officersExportColumns.contact) selectedChapterColumns.push({ header: "Contact Number", key: "contact", width: 1.6 });
        if (officersExportColumns.email) selectedChapterColumns.push({ header: "Email", key: "email", width: 2 });
        if (officersExportColumns.joinedDate) selectedChapterColumns.push({ header: "Joined Date", key: "joinedDate", width: 1.3 });

        report.addSectionTitle("Chapter Officers Table");
        if (selectedChapterColumns.length === 0) {
          report.addTextBlock("No chapter officer columns selected.", "muted");
          report.addSpacer(6);
        } else {
          const rows = chapterOfficers.map((officer) => {
            const row: Record<string, string> = {};
            if (officersExportColumns.name) row.name = officer.fullName || "-";
            if (officersExportColumns.position) row.position = getOfficerDisplayPosition(officer);
            if (officersExportColumns.contact) row.contact = officer.contactNumber || "-";
            if (officersExportColumns.email) row.email = officer.chapterEmail || "-";
            if (officersExportColumns.joinedDate) row.joinedDate = formatManilaDateTime(String(officer.createdAt || officer.birthdate || ""));

            return row;
          });

          report.addTable(selectedChapterColumns, rows, { emptyMessage: "No chapter-level officers yet." });
        }
      }

      if (includeBarangayTable) {
        const selectedBarangayColumns: Array<{ header: string; key: string; width: number }> = [];
        if (level === "chapter" && officersExportColumns.barangay) {
          selectedBarangayColumns.push({ header: "Barangay", key: "barangay", width: 1.7 });
        }
        if (officersExportColumns.name) selectedBarangayColumns.push({ header: "Name", key: "name", width: 2 });
        if (officersExportColumns.position) selectedBarangayColumns.push({ header: "Position", key: "position", width: 1.9 });
        if (officersExportColumns.contact) selectedBarangayColumns.push({ header: "Contact Number", key: "contact", width: 1.5 });
        if (officersExportColumns.email) selectedBarangayColumns.push({ header: "Email", key: "email", width: 1.9 });
        if (officersExportColumns.joinedDate) selectedBarangayColumns.push({ header: "Joined Date", key: "joinedDate", width: 1.2 });

        report.addSectionTitle(level === "chapter" ? "Barangay Officers Table" : "Officers Table");
        if (selectedBarangayColumns.length === 0) {
          report.addTextBlock("No barangay officer columns selected.", "muted");
          report.addSpacer(6);
        } else if (level === "chapter") {
          const rows = barangayOfficers.map((officer) => {
            const row: Record<string, string> = {};
            if (officersExportColumns.barangay) {
              row.barangay = officer.barangayId ? barangayNameById.get(officer.barangayId) || "Unknown Barangay" : "Unassigned Barangay";
            }
            if (officersExportColumns.name) row.name = officer.fullName || "-";
            if (officersExportColumns.position) row.position = getOfficerDisplayPosition(officer, true);
            if (officersExportColumns.contact) row.contact = officer.contactNumber || "-";
            if (officersExportColumns.email) row.email = officer.chapterEmail || "-";
            if (officersExportColumns.joinedDate) row.joinedDate = formatManilaDateTime(String(officer.createdAt || officer.birthdate || ""));

            return row;
          });

          report.addTable(selectedBarangayColumns, rows, { emptyMessage: "No barangay officer records yet." });
        } else {
          const rows = officers.map((officer) => {
            const row: Record<string, string> = {};
            if (officersExportColumns.name) row.name = officer.fullName || "-";
            if (officersExportColumns.position) row.position = getOfficerDisplayPosition(officer, true);
            if (officersExportColumns.contact) row.contact = officer.contactNumber || "-";
            if (officersExportColumns.email) row.email = officer.chapterEmail || "-";
            if (officersExportColumns.joinedDate) row.joinedDate = formatManilaDateTime(String(officer.createdAt || officer.birthdate || ""));

            return row;
          });

          report.addTable(selectedBarangayColumns, rows, { emptyMessage: "No officers recorded." });
        }
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-Officers-${createChapterFileToken()}-${level}-${fileDate}.pdf`);

      setExportDialogOpen(false);
      toast({ title: "PDF Exported", description: "Officers PDF report downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export officers PDF report", error);
      toast({
        title: "Export failed",
        description: "Unable to generate officers PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const renderOfficerRow = (officer: ChapterOfficer, useBarangayLabel = false, showActions = true) => {
    const displayPosition = getOfficerDisplayPosition(officer, useBarangayLabel);

    return (
      <div key={officer.id} className="p-4 border rounded-lg hover-elevate">
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="font-medium break-words">{officer.fullName}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Position</p>
            <Badge variant="secondary" className="mt-1">{displayPosition}</Badge>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Number</p>
            <p className="flex items-center gap-1 break-all text-muted-foreground">
              <Phone className="h-3 w-3" />
              {officer.contactNumber || "-"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="flex items-center gap-1 break-all text-muted-foreground">
              <Mail className="h-3 w-3" />
              {officer.chapterEmail || "-"}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Joined Date</p>
            <p className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatManilaDateTime(String(officer.createdAt || officer.birthdate || ""))}
            </p>
          </div>
        </div>

        {showActions && (
          <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
            <Button size="icon" variant="ghost" onClick={() => handleEdit(officer)} data-testid={`button-edit-officer-${officer.id}`}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleDeleteOfficer(officer.id)}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-officer-${officer.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          {level === "barangay" ? "Barangay Officers" : "Chapter Officers"}
        </CardTitle>
        <CardDescription>
          {level === "chapter"
            ? "Manage your chapter officers and view all barangay officers grouped by barangay."
            : "Manage your barangay's officers. All positions are required."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={summaryOfficers.length === positions.length ? "default" : "outline"}>
            {summaryOfficers.length} / {positions.length} positions filled
          </Badge>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportDialogOpen(true)}
              disabled={isExportingPdf}
              data-testid="button-export-officers-pdf"
            >
              <FileDown className="h-4 w-4 mr-2" />
              {isExportingPdf ? "Generating PDF..." : "Export PDF"}
            </Button>
            {!isFormOpen && summaryOfficers.length < positions.length && (
              <Button onClick={openAddForm} data-testid="button-add-officer">
                <Plus className="h-4 w-4 mr-2" />
                Add Officer
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
          <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
        </div>

        {isLoading ? (
          <LoadingState label="Loading officers..." rows={2} compact />
        ) : officers.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            No officers added yet. Click "Add Officer" to get started.
          </p>
        ) : level === "chapter" ? (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{chapterOfficerSectionTitle}</h3>
                <Badge variant={chapterOfficers.length === OFFICER_POSITIONS.length ? "default" : "outline"}>
                  {chapterOfficers.length} / {OFFICER_POSITIONS.length} positions filled
                </Badge>
              </div>
              {chapterOfficers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chapter-level officers yet.</p>
              ) : (
                <div className="space-y-3">
                  {chapterOfficers.map((officer) => renderOfficerRow(officer))}
                </div>
              )}

              {chapterOfficers.length > 0 && chapterOfficers.length < OFFICER_POSITIONS.length && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Missing Chapter Positions:</h4>
                  <div className="flex flex-wrap gap-2">
                    {OFFICER_POSITIONS.filter(position => !chapterOfficers.map((officer) => officer.position).includes(position)).map((position) => (
                      <Badge key={position} variant="outline">{position}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">Barangay Officers</h3>
              {barangaySections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No barangay officer records yet.</p>
              ) : (
                <Accordion type="multiple" className="space-y-4">
                  {barangaySectionsPagination.paginatedItems.map(([barangayId, groupedOfficers]) => {
                    const barangayLabel = barangayId === "unassigned"
                      ? "Unassigned Barangay"
                      : barangayNameById.get(barangayId) || "Unknown Barangay";
                    const normalizedPositions = groupedOfficers.map((officer) =>
                      officer.position === "City/Municipality President" ? "Barangay President" : officer.position
                    );

                    return (
                      <Card key={barangayId}>
                        <AccordionItem value={`barangay-${barangayId}`} className="border-0">
                          <CardHeader className="pb-3">
                            <AccordionTrigger className="py-0 hover:no-underline">
                              <div className="flex w-full items-center justify-between gap-2 pr-2">
                                <CardTitle className="text-base">{barangayLabel}</CardTitle>
                                <Badge variant={normalizedPositions.length === BARANGAY_OFFICER_POSITIONS.length ? "default" : "outline"}>
                                  {normalizedPositions.length} / {BARANGAY_OFFICER_POSITIONS.length} positions filled
                                </Badge>
                              </div>
                            </AccordionTrigger>
                          </CardHeader>
                          <AccordionContent className="pb-0">
                            <CardContent className="space-y-3 pt-0">
                              {groupedOfficers.map((officer) => renderOfficerRow(officer, true))}
                            </CardContent>
                          </AccordionContent>
                        </AccordionItem>
                      </Card>
                    );
                  })}

                  <PaginationControls
                    currentPage={barangaySectionsPagination.currentPage}
                    totalPages={barangaySectionsPagination.totalPages}
                    itemsPerPage={barangaySectionsPagination.itemsPerPage}
                    totalItems={barangaySectionsPagination.totalItems}
                    startItem={barangaySectionsPagination.startItem}
                    endItem={barangaySectionsPagination.endItem}
                    onPageChange={barangaySectionsPagination.setCurrentPage}
                    onItemsPerPageChange={barangaySectionsPagination.setItemsPerPage}
                    itemLabel="barangay groups"
                  />
                </Accordion>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {officersPagination.paginatedItems.map((officer) => renderOfficerRow(officer))}

            <PaginationControls
              currentPage={officersPagination.currentPage}
              totalPages={officersPagination.totalPages}
              itemsPerPage={officersPagination.itemsPerPage}
              totalItems={officersPagination.totalItems}
              startItem={officersPagination.startItem}
              endItem={officersPagination.endItem}
              onPageChange={officersPagination.setCurrentPage}
              onItemsPerPageChange={officersPagination.setItemsPerPage}
              itemLabel="officers"
            />
          </div>
        )}

        {level !== "chapter" && officers.length < positions.length && officers.length > 0 && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm mb-2">Missing Positions:</h4>
            <div className="flex flex-wrap gap-2">
              {positions.filter(p => !filledPositions.includes(p)).map((position) => (
                <Badge key={position} variant="outline">{position}</Badge>
              ))}
            </div>
          </div>
        )}

        <Dialog
          open={exportDialogOpen}
          onOpenChange={(open) => {
            if (isExportingPdf) {
              return;
            }
            setExportDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Export Officers PDF</DialogTitle>
              <DialogDescription>
                Customize what to include in the officers report before downloading the PDF.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="officers-export-report-title">Report Title</Label>
                <Input
                  id="officers-export-report-title"
                  value={officersExportReportTitle}
                  onChange={(event) => setOfficersExportReportTitle(event.target.value)}
                  placeholder={level === "chapter" ? "Officers Directory Report" : "Barangay Officers Report"}
                  data-testid="input-officers-export-report-title"
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Presets</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyOfficersExportPreset("minimal")}
                    disabled={isExportingPdf}
                    data-testid="button-officers-export-preset-minimal"
                  >
                    Minimal
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyOfficersExportPreset("standard")}
                    disabled={isExportingPdf}
                    data-testid="button-officers-export-preset-standard"
                  >
                    Standard
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyOfficersExportPreset("full")}
                    disabled={isExportingPdf}
                    data-testid="button-officers-export-preset-full"
                  >
                    Full
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sections to Include</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={officersExportSections.scope}
                      onCheckedChange={(checked) => toggleOfficersExportSection("scope", checked === true)}
                      data-testid="checkbox-officers-export-section-scope"
                    />
                    Report Scope Summary
                  </label>

                  {level === "chapter" ? (
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={officersExportSections.chapterTable}
                        onCheckedChange={(checked) => toggleOfficersExportSection("chapterTable", checked === true)}
                        data-testid="checkbox-officers-export-section-chapter-table"
                      />
                      Chapter Officers Table
                    </label>
                  ) : null}

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={officersExportSections.barangayTable}
                      onCheckedChange={(checked) => toggleOfficersExportSection("barangayTable", checked === true)}
                      data-testid="checkbox-officers-export-section-barangay-table"
                    />
                    {level === "chapter" ? "Barangay Officers Table" : "Officers Table"}
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Officer Table Columns</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  {level === "chapter" ? (
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={officersExportColumns.barangay}
                        onCheckedChange={(checked) => toggleOfficersExportColumn("barangay", checked === true)}
                        data-testid="checkbox-officers-export-column-barangay"
                      />
                      Barangay
                    </label>
                  ) : null}

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={officersExportColumns.name}
                      onCheckedChange={(checked) => toggleOfficersExportColumn("name", checked === true)}
                      data-testid="checkbox-officers-export-column-name"
                    />
                    Name
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={officersExportColumns.position}
                      onCheckedChange={(checked) => toggleOfficersExportColumn("position", checked === true)}
                      data-testid="checkbox-officers-export-column-position"
                    />
                    Position
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={officersExportColumns.contact}
                      onCheckedChange={(checked) => toggleOfficersExportColumn("contact", checked === true)}
                      data-testid="checkbox-officers-export-column-contact"
                    />
                    Contact Number
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox
                      checked={officersExportColumns.email}
                      onCheckedChange={(checked) => toggleOfficersExportColumn("email", checked === true)}
                      data-testid="checkbox-officers-export-column-email"
                    />
                    Email
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2">
                    <Checkbox
                      checked={officersExportColumns.joinedDate}
                      onCheckedChange={(checked) => toggleOfficersExportColumn("joinedDate", checked === true)}
                      data-testid="checkbox-officers-export-column-joined-date"
                    />
                    Joined Date
                  </label>
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>PDF header and footer automatically include organization logo, organization name, full government name, motto, and SEC registry number.</p>
                <p>Footer also includes Facebook, website, email, and export date in Manila local time (12-hour format).</p>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setExportDialogOpen(false)} disabled={isExportingPdf}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleExportOfficersPdf} disabled={isExportingPdf} data-testid="button-download-officers-export-pdf">
                  <FileDown className="h-4 w-4 mr-2" />
                  {isExportingPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isFormOpen}
          onOpenChange={(open) => {
            if (!open) {
              resetForm();
            } else {
              setIsFormOpen(true);
            }
          }}
        >
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Officer" : "Add Officer"}</DialogTitle>
              <DialogDescription>
                Update officer details in a dedicated modal panel.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Position *</Label>
                  <Select value={formData.position} onValueChange={(v) => setFormData({ ...formData, position: v })}>
                    <SelectTrigger data-testid="select-officer-position">
                      <SelectValue placeholder="Select position..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePositions.map((position) => (
                        <SelectItem key={position} value={position}>{position}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Enter full name"
                    data-testid="input-officer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Birthdate</Label>
                  <Input
                    type="date"
                    value={formData.birthdate}
                    onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                    data-testid="input-officer-birthdate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Number *</Label>
                  <Input
                    value={formData.contactNumber}
                    onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                    placeholder="e.g., 09171234567"
                    data-testid="input-officer-phone"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Chapter Email *</Label>
                  <Input
                    type="email"
                    value={formData.chapterEmail}
                    onChange={(e) => setFormData({ ...formData, chapterEmail: e.target.value })}
                    placeholder="e.g., chapter@ysp.org"
                    data-testid="input-officer-email"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-officer">
                  <Save className="h-4 w-4 mr-2" />
                  {editingId ? "Update" : "Add"} Officer
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
