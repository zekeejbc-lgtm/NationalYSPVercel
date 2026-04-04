import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import LoadingState from "@/components/ui/loading-state";
import ViewModeToggle, { type ViewMode } from "@/components/ui/view-mode-toggle";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { getDisplayImageUrl } from "@/lib/driveUtils";
import { createPdfExportContract } from "@/lib/export/pdfContract";
import { reportPdfFallbackRequest } from "@/lib/export/pdfFallback";
import { formatManilaDateTime, getIsoDateFileStamp } from "@/lib/export/pdfStandards";
import { createYspPdfReport } from "@/lib/pdfReport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Search, Trash2, Phone, Calendar, Download, Plus, Check, X, ChevronDown, ChevronRight, FileDown } from "lucide-react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { BarangayUser, Chapter, Member } from "@shared/schema";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";

interface AddMemberFormData {
  fullName: string;
  age: number;
  chapterId: string;
  contactNumber: string;
  email: string;
  registeredVoter: boolean;
  facebookLink?: string;
  isActive: boolean;
}

interface DirectoryEditFormState {
  fullName: string;
  contactNumber: string;
  email: string;
  age: string;
  birthdate: string;
  facebookLink: string;
  householdSize: string;
}

const GROUP_PAGE_SIZE = 10;
type ApplicationScopeFilter = "all" | "chapter-direct" | "barangay-only";
type ApplicationVoterFilter = "all" | "registered-voter" | "not-registered-voter";

const DEFAULT_ADMIN_APPLICATIONS_EXPORT_SECTIONS = {
  scope: true,
  applicationsTable: true,
  chapterDistribution: true,
  originDistribution: true,
};

const DEFAULT_ADMIN_APPLICATIONS_EXPORT_COLUMNS = {
  name: true,
  referenceId: true,
  chapter: true,
  type: true,
  barangay: true,
  contact: true,
  submitted: true,
  directoryCheck: true,
  duplicateCheck: true,
  voterStatus: true,
};

const DEFAULT_ADMIN_DIRECTORY_EXPORT_SECTIONS = {
  scope: true,
  summaryStats: true,
  directoryTable: true,
};

const DEFAULT_ADMIN_DIRECTORY_EXPORT_COLUMNS = {
  name: true,
  chapter: true,
  type: true,
  barangay: true,
  contact: true,
  email: false,
  age: true,
  household: true,
  voter: true,
  active: true,
  dateAdded: true,
};

type AdminApplicationsExportSectionKey = keyof typeof DEFAULT_ADMIN_APPLICATIONS_EXPORT_SECTIONS;
type AdminApplicationsExportColumnKey = keyof typeof DEFAULT_ADMIN_APPLICATIONS_EXPORT_COLUMNS;
type AdminDirectoryExportSectionKey = keyof typeof DEFAULT_ADMIN_DIRECTORY_EXPORT_SECTIONS;
type AdminDirectoryExportColumnKey = keyof typeof DEFAULT_ADMIN_DIRECTORY_EXPORT_COLUMNS;

const applicationAnalyticsChartConfig = {
  applications: {
    label: "Applications",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const defaultDirectoryEditFormState: DirectoryEditFormState = {
  fullName: "",
  contactNumber: "",
  email: "",
  age: "",
  birthdate: "",
  facebookLink: "",
  householdSize: "1",
};

function getMemberProfilePhotoSrc(photoUrl: string | null | undefined) {
  const normalizedPhotoUrl = (photoUrl || "").trim();
  if (!normalizedPhotoUrl) {
    return undefined;
  }

  return getDisplayImageUrl(normalizedPhotoUrl);
}

function getMemberInitials(fullName: string | null | undefined) {
  const normalizedName = (fullName || "").trim();
  if (!normalizedName) {
    return "NA";
  }

  const nameParts = normalizedName.split(/\s+/).filter(Boolean);
  const initials = nameParts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "NA";
}

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) {
    return "";
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return format(parsedDate, "yyyy-MM-dd");
}

function toDirectoryEditFormState(member: Member): DirectoryEditFormState {
  return {
    fullName: member.fullName || "",
    contactNumber: member.contactNumber || "",
    email: member.email || "",
    age: String(member.age ?? ""),
    birthdate: toDateInputValue(member.birthdate),
    facebookLink: member.facebookLink || "",
    householdSize: String(member.householdSize ?? 1),
  };
}

export default function MemberListManager() {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const isMobile = useIsMobile();
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [memberSubTab, setMemberSubTab] = useState<"applications" | "directory">("applications");
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [expandedApplicationGroups, setExpandedApplicationGroups] = useState<Record<string, boolean>>({});
  const [expandedDirectoryGroups, setExpandedDirectoryGroups] = useState<Record<string, boolean>>({});
  const [applicationGroupPages, setApplicationGroupPages] = useState<Record<string, number>>({});
  const [directoryGroupPages, setDirectoryGroupPages] = useState<Record<string, number>>({});
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [selectedDuplicateMember, setSelectedDuplicateMember] = useState<Member | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<Member[]>([]);
  const [applicationSearchTerm, setApplicationSearchTerm] = useState("");
  const [applicationScopeFilter, setApplicationScopeFilter] = useState<ApplicationScopeFilter>("all");
  const [applicationVoterFilter, setApplicationVoterFilter] = useState<ApplicationVoterFilter>("all");
  const [applicationChapterFilter, setApplicationChapterFilter] = useState<string>("all");
  const [applicationBarangayFilter, setApplicationBarangayFilter] = useState<string>("all");
  const [applicantDetailsOpen, setApplicantDetailsOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<Member | null>(null);
  const [directoryDetailsOpen, setDirectoryDetailsOpen] = useState(false);
  const [selectedDirectoryMemberId, setSelectedDirectoryMemberId] = useState<string | null>(null);
  const [isEditingDirectoryInfo, setIsEditingDirectoryInfo] = useState(false);
  const [directoryEditForm, setDirectoryEditForm] = useState<DirectoryEditFormState>(defaultDirectoryEditFormState);
  const [directoryEditRegisteredVoter, setDirectoryEditRegisteredVoter] = useState(false);
  const [directoryEditIsActive, setDirectoryEditIsActive] = useState(false);
  const [isExportingApplicationsPdf, setIsExportingApplicationsPdf] = useState(false);
  const [isExportingDirectoryPdf, setIsExportingDirectoryPdf] = useState(false);
  const [applicationsExportDialogOpen, setApplicationsExportDialogOpen] = useState(false);
  const [directoryExportDialogOpen, setDirectoryExportDialogOpen] = useState(false);
  const [applicationsExportReportTitle, setApplicationsExportReportTitle] = useState("Admin Membership Applications Report");
  const [directoryExportReportTitle, setDirectoryExportReportTitle] = useState("Admin Member Directory Report");
  const [applicationsExportSections, setApplicationsExportSections] = useState(() => ({
    ...DEFAULT_ADMIN_APPLICATIONS_EXPORT_SECTIONS,
  }));
  const [applicationsExportColumns, setApplicationsExportColumns] = useState(() => ({
    ...DEFAULT_ADMIN_APPLICATIONS_EXPORT_COLUMNS,
  }));
  const [directoryExportSections, setDirectoryExportSections] = useState(() => ({
    ...DEFAULT_ADMIN_DIRECTORY_EXPORT_SECTIONS,
  }));
  const [directoryExportColumns, setDirectoryExportColumns] = useState(() => ({
    ...DEFAULT_ADMIN_DIRECTORY_EXPORT_COLUMNS,
  }));

  useEffect(() => {
    if (isMobile) {
      setViewMode((current) => (current === "table" ? "tile" : current));
    }
  }, [isMobile]);

  const form = useForm<AddMemberFormData>({
    defaultValues: {
      fullName: "",
      age: 18,
      chapterId: "",
      contactNumber: "",
      email: "",
      registeredVoter: false,
      facebookLink: "",
      isActive: false,
    }
  });

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const {
    data: members = [],
    isLoading: membersLoading,
    isFetched: membersFetched,
  } = useQuery<Member[]>({
    queryKey: ["/api/members", { chapterId: filterChapter }],
    queryFn: async () => {
      const url = filterChapter && filterChapter !== "all"
        ? `/api/members?chapterId=${filterChapter}`
        : "/api/members";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
  });

  const {
    data: barangayUsers = [],
    isLoading: barangayUsersLoading,
    isFetched: barangayUsersFetched,
  } = useQuery<BarangayUser[]>({
    queryKey: ["/api/barangay-users", { chapterId: filterChapter }],
    queryFn: async () => {
      const url = filterChapter && filterChapter !== "all"
        ? `/api/barangay-users?chapterId=${filterChapter}`
        : "/api/barangay-users";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch barangays");
      }

      return response.json();
    },
  });

  const isDashboardDataLoading =
    chaptersLoading ||
    !chaptersFetched ||
    membersLoading ||
    !membersFetched ||
    barangayUsersLoading ||
    !barangayUsersFetched;

  const resolveMemberApplicationStatus = (member: Member): "approved" | "pending" | "rejected" => {
    const normalizedStatus = (member.applicationStatus || "").toLowerCase();
    if (normalizedStatus === "approved" || normalizedStatus === "pending" || normalizedStatus === "rejected") {
      return normalizedStatus;
    }

    return member.isActive ? "approved" : "pending";
  };

  const approvedDirectoryMembers = members.filter((member) => resolveMemberApplicationStatus(member) === "approved");

  const createMutation = useMutation({
    mutationFn: async (data: AddMemberFormData) => {
      return await apiRequest("POST", "/api/members", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setAddDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Member> }) => {
      setUpdatingMemberId(id);
      return await apiRequest("PATCH", `/api/members/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setUpdatingMemberId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setUpdatingMemberId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/members/${id}`, {});
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Member deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const filteredMembers = approvedDirectoryMembers.filter(member => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      member.fullName.toLowerCase().includes(search) ||
      member.email?.toLowerCase().includes(search) ||
      member.contactNumber?.toLowerCase().includes(search) ||
      member.applicationReferenceId?.toLowerCase().includes(search)
    );
  });

  const groupedDirectoryMembers = useMemo(() => {
    const chapterLookup = new Map(chapters.map((chapter) => [chapter.id, chapter.name]));
    const chapterGroups = new Map<string, { chapterName: string; members: Member[] }>();

    const visibleChapters = filterChapter === "all"
      ? chapters
      : chapters.filter((chapter) => chapter.id === filterChapter);

    for (const chapter of visibleChapters) {
      const groupKey = `${chapter.id}::${chapter.name}`;
      chapterGroups.set(groupKey, { chapterName: chapter.name, members: [] });
    }

    for (const member of filteredMembers) {
      const chapterName = member.chapterId
        ? chapterLookup.get(member.chapterId) || "Unknown Chapter"
        : "No Chapter";
      const groupKey = `${member.chapterId || "no-chapter"}::${chapterName}`;

      if (!chapterGroups.has(groupKey)) {
        chapterGroups.set(groupKey, { chapterName, members: [] });
      }

      chapterGroups.get(groupKey)?.members.push(member);
    }

    const hasNoChapterMembers = filteredMembers.some((member) => !member.chapterId);
    if (filterChapter === "all" && hasNoChapterMembers && !chapterGroups.has("no-chapter::No Chapter")) {
      chapterGroups.set("no-chapter::No Chapter", { chapterName: "No Chapter", members: [] });
    }

    return Array.from(chapterGroups.entries())
      .map(([groupKey, group]) => ({
        groupKey,
        chapterName: group.chapterName,
        members: [...group.members].sort((a, b) => a.fullName.localeCompare(b.fullName)),
      }))
      .sort((a, b) => {
        if (a.chapterName === "No Chapter") return 1;
        if (b.chapterName === "No Chapter") return -1;
        return a.chapterName.localeCompare(b.chapterName);
      });
  }, [chapters, filteredMembers, filterChapter]);

  const isDirectoryGroupExpanded = (groupKey: string) => Boolean(expandedDirectoryGroups[groupKey]);

  const isApplicationGroupExpanded = (groupKey: string) => Boolean(expandedApplicationGroups[groupKey]);

  const toggleApplicationGroup = (groupKey: string) => {
    setExpandedApplicationGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const toggleDirectoryGroup = (groupKey: string) => {
    setExpandedDirectoryGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const getGroupPagination = (items: Member[], selectedPage?: number) => {
    const totalPages = Math.max(1, Math.ceil(items.length / GROUP_PAGE_SIZE));
    const currentPage = Math.min(Math.max(selectedPage || 1, 1), totalPages);
    const startIndex = (currentPage - 1) * GROUP_PAGE_SIZE;
    const paginatedItems = items.slice(startIndex, startIndex + GROUP_PAGE_SIZE);

    return {
      currentPage,
      totalPages,
      paginatedItems,
      startItem: items.length === 0 ? 0 : startIndex + 1,
      endItem: startIndex + paginatedItems.length,
      totalItems: items.length,
    };
  };

  const setApplicationGroupPage = (groupKey: string, page: number, totalPages: number) => {
    setApplicationGroupPages((prev) => ({
      ...prev,
      [groupKey]: Math.min(Math.max(page, 1), totalPages),
    }));
  };

  const setDirectoryGroupPage = (groupKey: string, page: number, totalPages: number) => {
    setDirectoryGroupPages((prev) => ({
      ...prev,
      [groupKey]: Math.min(Math.max(page, 1), totalPages),
    }));
  };

  const getChapterName = (chapterId: string | null) => {
    if (!chapterId) return "No Chapter";
    const chapter = chapters.find(c => c.id === chapterId);
    return chapter?.name || "Unknown Chapter";
  };

  const formatOptionalDate = (value?: Date | string | null) => {
    if (!value) return "-";
    const parsedDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return "-";
    return format(parsedDate, "MMM d, yyyy");
  };

  const getDirectoryChapterFilterLabel = () => {
    if (filterChapter === "all") {
      return "All Chapters";
    }

    return getChapterName(filterChapter);
  };

  const getApplicationsScopeFilterLabel = () => {
    if (applicationScopeFilter === "chapter-direct") {
      return "Chapter Direct Only";
    }

    if (applicationScopeFilter === "barangay-only") {
      return "Barangay Applicants Only";
    }

    return "All Applications";
  };

  const getApplicationsVoterFilterLabel = () => {
    if (applicationVoterFilter === "registered-voter") {
      return "Registered Voters";
    }

    if (applicationVoterFilter === "not-registered-voter") {
      return "Not Registered Voters";
    }

    return "All Applicants";
  };

  const handleExportCSV = () => {
    const headers = ["Name", "Age", "Household Size", "Chapter", "Contact Number", "Email", "Registered Voter", "Facebook Link", "Active", "Date Added"];
    const rows = filteredMembers.map(member => [
      member.fullName,
      member.age,
      member.householdSize ?? 1,
      getChapterName(member.chapterId),
      member.contactNumber,
      member.email || "",
      member.registeredVoter ? "Yes" : "No",
      member.facebookLink || "",
      member.isActive ? "Yes" : "No",
      format(new Date(member.createdAt), "yyyy-MM-dd")
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `ysp_members_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "Export Complete", description: "Members exported to CSV successfully" });
  };

  const handleExportApplicationsPdf = async () => {
    if (isExportingApplicationsPdf) {
      return;
    }

    if (!Object.values(applicationsExportSections).some(Boolean)) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one report section before exporting the PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingApplicationsPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      exportContract = createPdfExportContract({
        reportId: "admin-member-applications",
        purpose: "admin_membership_application_review",
        title: applicationsExportReportTitle.trim() || "Admin Membership Applications Report",
        subtitle: "Youth Service Philippines - Admin Applications",
        selectedSections: applicationsExportSections,
        selectedColumns: applicationsExportColumns,
        filters: {
          pendingTotal: pendingApplications.length,
          pendingFiltered: filteredPendingApplications.length,
          applicantScope: getApplicationsScopeFilterLabel(),
          chapterFilter: getApplicationChapterFilterLabel(),
          barangayFilter: getApplicationBarangayFilterLabel(),
          voterFilter: getApplicationsVoterFilterLabel(),
          search: applicationSearchTerm.trim() || "",
        },
        filenamePolicy: {
          prefix: "YSP-Admin-Applications",
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: "admin",
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (applicationsExportSections.scope) {
        report.addSectionTitle("Report Scope");
        report.addMetricRow("Pending Applications (Total)", String(pendingApplications.length));
        report.addMetricRow("Pending Applications (Filtered)", String(filteredPendingApplications.length));
        report.addMetricRow("Applicant Scope", getApplicationsScopeFilterLabel());
        report.addMetricRow("Chapter Filter", applicationScopeFilter === "chapter-direct" ? getApplicationChapterFilterLabel() : "Not Applied");
        report.addMetricRow("Barangay Filter", applicationScopeFilter === "chapter-direct" ? "Not Applied" : getApplicationBarangayFilterLabel());
        report.addMetricRow("Voter Filter", getApplicationsVoterFilterLabel());
        report.addMetricRow("Search Filter", applicationSearchTerm.trim() || "None");
        report.addSpacer(8);
      }

      if (applicationsExportSections.chapterDistribution) {
        report.addSectionTitle("Top Chapters by Pending Applications");
        report.addTable(
          [
            { header: "Chapter", key: "chapter", width: 2.8 },
            { header: "Applications", key: "applications", width: 1.1, align: "right" },
          ],
          pendingApplicationsByChapterData.map((entry) => ({
            chapter: entry.label,
            applications: entry.applications,
          })),
          { emptyMessage: "No chapter distribution data for current filters." },
        );
      }

      if (applicationsExportSections.originDistribution) {
        report.addSectionTitle("Application Origin Breakdown");
        report.addTable(
          [
            { header: "Origin", key: "origin", width: 2.5 },
            { header: "Applications", key: "applications", width: 1.1, align: "right" },
          ],
          pendingApplicationsScopeData.map((entry) => ({
            origin: entry.label,
            applications: entry.applications,
          })),
          { emptyMessage: "No origin distribution data for current filters." },
        );
      }

      if (applicationsExportSections.applicationsTable) {
        report.addSectionTitle("Applications Table");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (applicationsExportColumns.name) selectedColumns.push({ header: "Name", key: "name", width: 2.2 });
        if (applicationsExportColumns.referenceId) selectedColumns.push({ header: "Reference ID", key: "referenceId", width: 1.5 });
        if (applicationsExportColumns.chapter) selectedColumns.push({ header: "Chapter", key: "chapter", width: 1.5 });
        if (applicationsExportColumns.type) selectedColumns.push({ header: "Type", key: "type", width: 1.2 });
        if (applicationsExportColumns.barangay) selectedColumns.push({ header: "Barangay", key: "barangay", width: 1.6 });
        if (applicationsExportColumns.contact) selectedColumns.push({ header: "Contact", key: "contact", width: 1.3 });
        if (applicationsExportColumns.submitted) selectedColumns.push({ header: "Submitted", key: "submitted", width: 1.2 });
        if (applicationsExportColumns.directoryCheck) selectedColumns.push({ header: "Directory Check", key: "directoryCheck", width: 1.8 });
        if (applicationsExportColumns.duplicateCheck) selectedColumns.push({ header: "Duplicate", key: "duplicateCheck", width: 1.1, align: "center" });
        if (applicationsExportColumns.voterStatus) selectedColumns.push({ header: "Voter", key: "voterStatus", width: 0.9, align: "center" });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No applications table columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            filteredPendingApplications.map((member) => {
              const insights = getPendingApplicationInsights(member);
              const row: Record<string, string | number> = {};
              if (applicationsExportColumns.name) row.name = member.fullName || "-";
              if (applicationsExportColumns.referenceId) row.referenceId = member.applicationReferenceId || "-";
              if (applicationsExportColumns.chapter) row.chapter = getChapterName(member.chapterId);
              if (applicationsExportColumns.type) row.type = member.barangayId ? "Barangay Member" : "Chapter Member";
              if (applicationsExportColumns.barangay) row.barangay = getDirectoryMemberBarangayLabel(member);
              if (applicationsExportColumns.contact) row.contact = member.contactNumber || "-";
              if (applicationsExportColumns.submitted) row.submitted = format(new Date(member.createdAt), "MMM d, yyyy");
              if (applicationsExportColumns.directoryCheck) row.directoryCheck = getDirectoryCheckLabel(insights);
              if (applicationsExportColumns.duplicateCheck) row.duplicateCheck = insights.duplicateCount > 0 ? `x${insights.duplicateCount}` : "None";
              if (applicationsExportColumns.voterStatus) row.voterStatus = member.registeredVoter ? "Yes" : "No";
              return row;
            }),
            { emptyMessage: "No applications found for current application filters." },
          );
        }
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-Admin-Applications-${fileDate}.pdf`);
      setApplicationsExportDialogOpen(false);

      toast({ title: "PDF Exported", description: "Admin applications PDF downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export admin applications PDF", error);
      toast({
        title: "Export failed",
        description: "Unable to generate admin applications PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingApplicationsPdf(false);
    }
  };

  const handleExportDirectoryPdf = async () => {
    if (isExportingDirectoryPdf) {
      return;
    }

    if (!Object.values(directoryExportSections).some(Boolean)) {
      toast({
        title: "Select at least one section",
        description: "Choose at least one report section before exporting the PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingDirectoryPdf(true);

    let exportContract: ReturnType<typeof createPdfExportContract> | null = null;

    try {
      exportContract = createPdfExportContract({
        reportId: "admin-member-directory",
        purpose: "admin_member_directory",
        title: directoryExportReportTitle.trim() || "Admin Member Directory Report",
        subtitle: "Youth Service Philippines - Admin Directory",
        selectedSections: directoryExportSections,
        selectedColumns: directoryExportColumns,
        filters: {
          chapterFilter: getDirectoryChapterFilterLabel(),
          search: searchTerm.trim() || "",
          viewMode,
          includedMembers: filteredMembers.length,
        },
        filenamePolicy: {
          prefix: "YSP-Admin-Directory",
          includeDateStamp: true,
        },
        snapshotMetadata: {
          actorRole: "admin",
        },
      });

      const report = await createYspPdfReport({
        reportTitle: exportContract.title,
        reportSubtitle: exportContract.subtitle,
      });

      if (directoryExportSections.scope) {
        report.addSectionTitle("Report Scope");
        report.addMetricRow("Chapter Filter", getDirectoryChapterFilterLabel());
        report.addMetricRow("Search Filter", searchTerm.trim() || "None");
        report.addMetricRow("View Mode", viewMode === "table" ? "Table" : "Tile");
        report.addMetricRow("Members Included", String(filteredMembers.length));
        report.addSpacer(8);
      }

      if (directoryExportSections.summaryStats) {
        const activeCount = filteredMembers.filter((member) => member.isActive).length;
        const voterCount = filteredMembers.filter((member) => member.registeredVoter).length;
        const uniqueChapterCount = new Set(filteredMembers.map((member) => member.chapterId || "no-chapter")).size;

        report.addSectionTitle("Directory Summary Stats");
        report.addMetricRow("Total Members", String(filteredMembers.length));
        report.addMetricRow("Active Members", String(activeCount));
        report.addMetricRow("Registered Voters", String(voterCount));
        report.addMetricRow("Covered Chapters", String(uniqueChapterCount));
        report.addSpacer(8);
      }

      if (directoryExportSections.directoryTable) {
        report.addSectionTitle("Directory Table");

        const selectedColumns: Array<{ header: string; key: string; width: number; align?: "left" | "center" | "right" }> = [];
        if (directoryExportColumns.name) selectedColumns.push({ header: "Name", key: "name", width: 2.1 });
        if (directoryExportColumns.chapter) selectedColumns.push({ header: "Chapter", key: "chapter", width: 1.5 });
        if (directoryExportColumns.type) selectedColumns.push({ header: "Type", key: "type", width: 1.2 });
        if (directoryExportColumns.barangay) selectedColumns.push({ header: "Barangay", key: "barangay", width: 1.5 });
        if (directoryExportColumns.contact) selectedColumns.push({ header: "Contact", key: "contact", width: 1.3 });
        if (directoryExportColumns.email) selectedColumns.push({ header: "Email", key: "email", width: 1.8 });
        if (directoryExportColumns.age) selectedColumns.push({ header: "Age", key: "age", width: 0.7, align: "right" });
        if (directoryExportColumns.household) selectedColumns.push({ header: "Household", key: "household", width: 0.9, align: "right" });
        if (directoryExportColumns.voter) selectedColumns.push({ header: "Voter", key: "voter", width: 0.9, align: "center" });
        if (directoryExportColumns.active) selectedColumns.push({ header: "Active", key: "active", width: 0.9, align: "center" });
        if (directoryExportColumns.dateAdded) selectedColumns.push({ header: "Date Added", key: "dateAdded", width: 1.1 });

        if (selectedColumns.length === 0) {
          report.addTextBlock("No directory table columns selected.", "muted");
          report.addSpacer(6);
        } else {
          report.addTable(
            selectedColumns,
            filteredMembers.map((member) => {
              const row: Record<string, string | number> = {};
              if (directoryExportColumns.name) row.name = member.fullName || "-";
              if (directoryExportColumns.chapter) row.chapter = getChapterName(member.chapterId);
              if (directoryExportColumns.type) row.type = member.barangayId ? "Barangay Member" : "Chapter Member";
              if (directoryExportColumns.barangay) row.barangay = getDirectoryMemberBarangayLabel(member);
              if (directoryExportColumns.contact) row.contact = member.contactNumber || "-";
              if (directoryExportColumns.email) row.email = member.email || "-";
              if (directoryExportColumns.age) row.age = member.age ?? "-";
              if (directoryExportColumns.household) row.household = member.householdSize ?? 1;
              if (directoryExportColumns.voter) row.voter = member.registeredVoter ? "Yes" : "No";
              if (directoryExportColumns.active) row.active = member.isActive ? "Yes" : "No";
              if (directoryExportColumns.dateAdded) row.dateAdded = format(new Date(member.createdAt), "MMM d, yyyy");
              return row;
            }),
            { emptyMessage: "No members found for current directory filters." },
          );
        }
      }

      const fileDate = getIsoDateFileStamp();
      report.save(`YSP-Admin-Directory-${fileDate}.pdf`);
      setDirectoryExportDialogOpen(false);

      toast({ title: "PDF Exported", description: "Admin directory PDF downloaded successfully." });
    } catch (error) {
      if (exportContract) {
        void reportPdfFallbackRequest(exportContract, error);
      }
      console.error("Failed to export admin directory PDF", error);
      toast({
        title: "Export failed",
        description: "Unable to generate admin directory PDF report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingDirectoryPdf(false);
    }
  };

  const onSubmit = (data: AddMemberFormData) => {
    if (!data.chapterId) {
      toast({ title: "Error", description: "Please select a chapter", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...data,
      age: Number(data.age),
    });
  };

  const totalMembers = filteredMembers.length;
  const activeMembers = filteredMembers.filter(m => m.isActive).length;
  const registeredVoters = filteredMembers.filter(m => m.registeredVoter).length;

  const getMemberApplicationStatus = (member: Member) => {
    return resolveMemberApplicationStatus(member);
  };

  const pendingApplications = members.filter((member) => getMemberApplicationStatus(member) === "pending");
  const chapterNameById = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter.name]));
  }, [chapters]);
  const barangayNameById = useMemo(() => {
    return new Map(barangayUsers.map((barangay) => [barangay.id, barangay.barangayName]));
  }, [barangayUsers]);

  const chapterSearchTerms = useMemo(() => {
    return applicationSearchTerm
      .split(",")
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
  }, [applicationSearchTerm]);

  const chapterIdsFromSearch = useMemo(() => {
    if (chapterSearchTerms.length === 0) {
      return null;
    }

    const matchingChapterIds = new Set<string>();

    for (const chapter of chapters) {
      const normalizedChapterName = chapter.name.toLowerCase();

      for (const token of chapterSearchTerms) {
        if (normalizedChapterName.includes(token) || chapter.id.toLowerCase() === token) {
          matchingChapterIds.add(chapter.id);
          break;
        }
      }
    }

    return matchingChapterIds;
  }, [chapterSearchTerms, chapters]);

  const pendingApplicationChapterOptions = useMemo(() => {
    const options = new Map<string, { id: string; label: string }>();

    for (const member of pendingApplications) {
      if (member.barangayId) {
        continue;
      }

      const chapterId = member.chapterId || "no-chapter";
      if (options.has(chapterId)) {
        continue;
      }

      options.set(chapterId, {
        id: chapterId,
        label: member.chapterId ? chapterNameById.get(member.chapterId) || "Unknown Chapter" : "No Chapter",
      });
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingApplications, chapterNameById]);

  const pendingApplicationBarangayOptions = useMemo(() => {
    const options = new Map<string, { id: string; label: string }>();
    const shouldRestrictBySearchChapter = applicationScopeFilter === "barangay-only" && chapterIdsFromSearch !== null;

    for (const member of pendingApplications) {
      if (!member.barangayId) {
        continue;
      }

      if (shouldRestrictBySearchChapter) {
        if (!member.chapterId || !chapterIdsFromSearch.has(member.chapterId)) {
          continue;
        }
      }

      if (options.has(member.barangayId)) {
        continue;
      }

      const barangayName = barangayNameById.get(member.barangayId) || "Unknown Barangay";
      const chapterName = member.chapterId ? chapterNameById.get(member.chapterId) || "Unknown Chapter" : "No Chapter";
      options.set(member.barangayId, {
        id: member.barangayId,
        label: `${barangayName} (${chapterName})`,
      });
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingApplications, barangayNameById, chapterNameById, applicationScopeFilter, chapterIdsFromSearch]);

  const getApplicationChapterFilterLabel = () => {
    if (applicationChapterFilter === "all") {
      return "All Chapters";
    }

    if (applicationChapterFilter === "no-chapter") {
      return "No Chapter";
    }

    const selectedOption = pendingApplicationChapterOptions.find((option) => option.id === applicationChapterFilter);
    return selectedOption?.label || "Unknown Chapter";
  };

  const getApplicationBarangayFilterLabel = () => {
    if (applicationBarangayFilter === "all") {
      return "All Barangays";
    }

    if (applicationBarangayFilter === "chapter-direct") {
      return "Chapter Direct";
    }

    const selectedOption = pendingApplicationBarangayOptions.find((option) => option.id === applicationBarangayFilter);
    return selectedOption?.label || "Unknown Barangay";
  };

  const filteredPendingApplications = useMemo(() => {
    const normalizedSearch = applicationSearchTerm.trim().toLowerCase();
    const useChapterSearchForBarangayScope = applicationScopeFilter === "barangay-only" && chapterIdsFromSearch !== null;

    return pendingApplications.filter((member) => {
      const chapterName = member.chapterId
        ? chapterNameById.get(member.chapterId) || "Unknown Chapter"
        : "No Chapter";

      const matchesSearch =
        useChapterSearchForBarangayScope
          ? Boolean(member.chapterId && chapterIdsFromSearch.has(member.chapterId))
          : normalizedSearch.length === 0 ||
            member.fullName.toLowerCase().includes(normalizedSearch) ||
            (member.email || "").toLowerCase().includes(normalizedSearch) ||
            (member.contactNumber || "").toLowerCase().includes(normalizedSearch) ||
            (member.applicationReferenceId || "").toLowerCase().includes(normalizedSearch) ||
            chapterName.toLowerCase().includes(normalizedSearch);

      const matchesScope =
        applicationScopeFilter === "all" ||
        (applicationScopeFilter === "chapter-direct" && !member.barangayId) ||
        (applicationScopeFilter === "barangay-only" && Boolean(member.barangayId));

      const matchesChapter =
        applicationScopeFilter !== "chapter-direct" ||
        applicationChapterFilter === "all" ||
        (applicationChapterFilter === "no-chapter" ? !member.chapterId : member.chapterId === applicationChapterFilter);

      const matchesVoter =
        applicationVoterFilter === "all" ||
        (applicationVoterFilter === "registered-voter" && member.registeredVoter) ||
        (applicationVoterFilter === "not-registered-voter" && !member.registeredVoter);

      const matchesBarangay =
        applicationScopeFilter === "chapter-direct" ||
        applicationBarangayFilter === "all" ||
        (applicationBarangayFilter === "chapter-direct" && !member.barangayId) ||
        member.barangayId === applicationBarangayFilter;

      return matchesSearch && matchesScope && matchesChapter && matchesVoter && matchesBarangay;
    });
  }, [pendingApplications, chapterNameById, applicationSearchTerm, applicationScopeFilter, applicationChapterFilter, applicationVoterFilter, applicationBarangayFilter, chapterIdsFromSearch]);

  useEffect(() => {
    setApplicationChapterFilter("all");
    setApplicationBarangayFilter("all");
  }, [applicationScopeFilter]);

  const clearApplicationFilters = () => {
    setApplicationSearchTerm("");
    setApplicationScopeFilter("all");
    setApplicationChapterFilter("all");
    setApplicationVoterFilter("all");
    setApplicationBarangayFilter("all");
  };

  const toggleApplicationsExportSection = (key: AdminApplicationsExportSectionKey, enabled: boolean) => {
    setApplicationsExportSections((prev) => ({ ...prev, [key]: enabled }));
  };

  const toggleApplicationsExportColumn = (key: AdminApplicationsExportColumnKey, enabled: boolean) => {
    setApplicationsExportColumns((prev) => ({ ...prev, [key]: enabled }));
  };

  const applyApplicationsExportPreset = (preset: "minimal" | "standard" | "full") => {
    if (preset === "minimal") {
      setApplicationsExportSections({
        scope: true,
        applicationsTable: true,
        chapterDistribution: false,
        originDistribution: false,
      });
      setApplicationsExportColumns({
        name: true,
        referenceId: true,
        chapter: true,
        type: true,
        barangay: false,
        contact: false,
        submitted: true,
        directoryCheck: false,
        duplicateCheck: false,
        voterStatus: false,
      });
      return;
    }

    if (preset === "standard") {
      setApplicationsExportSections({
        scope: true,
        applicationsTable: true,
        chapterDistribution: true,
        originDistribution: true,
      });
      setApplicationsExportColumns({
        name: true,
        referenceId: true,
        chapter: true,
        type: true,
        barangay: true,
        contact: true,
        submitted: true,
        directoryCheck: true,
        duplicateCheck: true,
        voterStatus: false,
      });
      return;
    }

    setApplicationsExportSections({ ...DEFAULT_ADMIN_APPLICATIONS_EXPORT_SECTIONS });
    setApplicationsExportColumns({ ...DEFAULT_ADMIN_APPLICATIONS_EXPORT_COLUMNS });
  };

  const toggleDirectoryExportSection = (key: AdminDirectoryExportSectionKey, enabled: boolean) => {
    setDirectoryExportSections((prev) => ({ ...prev, [key]: enabled }));
  };

  const toggleDirectoryExportColumn = (key: AdminDirectoryExportColumnKey, enabled: boolean) => {
    setDirectoryExportColumns((prev) => ({ ...prev, [key]: enabled }));
  };

  const applyDirectoryExportPreset = (preset: "minimal" | "standard" | "full") => {
    if (preset === "minimal") {
      setDirectoryExportSections({
        scope: true,
        summaryStats: true,
        directoryTable: true,
      });
      setDirectoryExportColumns({
        name: true,
        chapter: true,
        type: true,
        barangay: true,
        contact: false,
        email: false,
        age: false,
        household: false,
        voter: false,
        active: false,
        dateAdded: false,
      });
      return;
    }

    if (preset === "standard") {
      setDirectoryExportSections({
        scope: true,
        summaryStats: true,
        directoryTable: true,
      });
      setDirectoryExportColumns({
        name: true,
        chapter: true,
        type: true,
        barangay: true,
        contact: true,
        email: false,
        age: true,
        household: true,
        voter: true,
        active: true,
        dateAdded: true,
      });
      return;
    }

    setDirectoryExportSections({ ...DEFAULT_ADMIN_DIRECTORY_EXPORT_SECTIONS });
    setDirectoryExportColumns({ ...DEFAULT_ADMIN_DIRECTORY_EXPORT_COLUMNS });
  };

  const normalizeMemberName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const normalizeContactNumber = (value?: string | null) => (value || "").replace(/\D+/g, "");
  const buildMemberIdentityKey = (member: Member) => {
    const chapterScope = member.chapterId || "no-chapter";
    return `${chapterScope}::${normalizeMemberName(member.fullName)}::${normalizeContactNumber(member.contactNumber)}`;
  };

  const approvedDirectoryIdentityKeys = new Set<string>();
  const memberIdentityCounts = new Map<string, number>();
  const memberIdentityMembers = new Map<string, Member[]>();

  for (const member of members) {
    const identityKey = buildMemberIdentityKey(member);
    memberIdentityCounts.set(identityKey, (memberIdentityCounts.get(identityKey) || 0) + 1);
    const existingIdentityMembers = memberIdentityMembers.get(identityKey) || [];
    existingIdentityMembers.push(member);
    memberIdentityMembers.set(identityKey, existingIdentityMembers);

    if (getMemberApplicationStatus(member) === "approved") {
      approvedDirectoryIdentityKeys.add(identityKey);
    }
  }

  const getPendingApplicationInsights = (member: Member) => {
    const identityKey = buildMemberIdentityKey(member);
    const directoryRecordCount = memberIdentityCounts.get(identityKey) || 0;

    return {
      inOfficialDirectory: directoryRecordCount > 0,
      hasApprovedDirectoryRecord: approvedDirectoryIdentityKeys.has(identityKey),
      directoryRecordCount,
      duplicateCount: Math.max((memberIdentityCounts.get(identityKey) || 1) - 1, 0),
    };
  };

  const getDuplicateApplications = (member: Member) => {
    const identityKey = buildMemberIdentityKey(member);
    const matchingMembers = memberIdentityMembers.get(identityKey) || [];

    return matchingMembers
      .filter((matchingMember) => matchingMember.id !== member.id)
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  };

  const openDuplicateDialog = (member: Member) => {
    const duplicates = getDuplicateApplications(member);
    setSelectedDuplicateMember(member);
    setDuplicateMatches(duplicates);
    setDuplicateDialogOpen(true);
  };

  const openApplicantDetailsDialog = (member: Member) => {
    setSelectedApplicant(member);
    setApplicantDetailsOpen(true);
  };

  const openDirectoryMemberDetailsDialog = (member: Member) => {
    setSelectedDirectoryMemberId(member.id);
    setDirectoryEditForm(toDirectoryEditFormState(member));
    setDirectoryEditRegisteredVoter(Boolean(member.registeredVoter));
    setDirectoryEditIsActive(Boolean(member.isActive));
    setIsEditingDirectoryInfo(false);
    setDirectoryDetailsOpen(true);
  };

  const getDirectoryCheckLabel = (insights: { hasApprovedDirectoryRecord: boolean; inOfficialDirectory: boolean }) => {
    if (insights.hasApprovedDirectoryRecord) {
      return "Official Directory (Approved Member)";
    }

    if (insights.inOfficialDirectory) {
      return "Directory Record (Pending, Not Yet Member)";
    }

    return "No Directory Record Yet";
  };

  const getApplicantTypeLabel = (member: Member) => {
    return member.barangayId ? "Barangay Member" : "Chapter Member";
  };

  const getApplicantBarangayLabel = (member: Member) => {
    return member.barangayId ? "Barangay Assigned" : "Chapter Direct";
  };

  const getDirectoryMemberBarangayLabel = (member: Member) => {
    if (!member.barangayId) {
      return "Chapter Direct";
    }

    return barangayNameById.get(member.barangayId) || "Unknown Barangay";
  };

  const selectedDirectoryMember = useMemo(() => {
    if (!selectedDirectoryMemberId) {
      return null;
    }

    return approvedDirectoryMembers.find((member) => member.id === selectedDirectoryMemberId) || null;
  }, [approvedDirectoryMembers, selectedDirectoryMemberId]);

  useEffect(() => {
    if (!selectedDirectoryMember || isEditingDirectoryInfo) {
      return;
    }

    setDirectoryEditForm(toDirectoryEditFormState(selectedDirectoryMember));
    setDirectoryEditRegisteredVoter(Boolean(selectedDirectoryMember.registeredVoter));
    setDirectoryEditIsActive(Boolean(selectedDirectoryMember.isActive));
  }, [selectedDirectoryMember, isEditingDirectoryInfo]);

  const selectedApplicantInsights = useMemo(() => {
    if (!selectedApplicant) {
      return null;
    }

    return getPendingApplicationInsights(selectedApplicant);
  }, [selectedApplicant, members]);

  const uniqueApplicantIdentityCount = useMemo(() => {
    return new Set(filteredPendingApplications.map((member) => buildMemberIdentityKey(member))).size;
  }, [filteredPendingApplications]);

  const duplicateFlaggedApplicationsCount = useMemo(() => {
    return filteredPendingApplications.filter((member) => getPendingApplicationInsights(member).duplicateCount > 0).length;
  }, [filteredPendingApplications]);

  const chapterDirectPendingApplicationsCount = useMemo(() => {
    return filteredPendingApplications.filter((member) => !member.barangayId).length;
  }, [filteredPendingApplications]);

  const barangayBasedPendingApplicationsCount = Math.max(
    filteredPendingApplications.length - chapterDirectPendingApplicationsCount,
    0,
  );

  const pendingApplicationsScopeData = useMemo(() => {
    return [
      { label: "Chapter Direct", applications: chapterDirectPendingApplicationsCount },
      { label: "Barangay", applications: barangayBasedPendingApplicationsCount },
    ];
  }, [chapterDirectPendingApplicationsCount, barangayBasedPendingApplicationsCount]);

  const pendingApplicationsByChapterData = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const member of filteredPendingApplications) {
      const chapterName = member.chapterId
        ? chapterNameById.get(member.chapterId) || "Unknown Chapter"
        : "No Chapter";
      grouped.set(chapterName, (grouped.get(chapterName) || 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([label, applications]) => ({ label, applications }))
      .sort((a, b) => b.applications - a.applications || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [filteredPendingApplications, chapterNameById]);

  const groupedApplications = useMemo(() => {
    const grouped = new Map<string, { chapterName: string; members: Member[] }>();

    for (const member of filteredPendingApplications) {
      const chapterName = member.chapterId
        ? chapterNameById.get(member.chapterId) || "Unknown Chapter"
        : "No Chapter";
      const groupKey = `${member.chapterId || "no-chapter"}::${chapterName}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, { chapterName, members: [] });
      }

      grouped.get(groupKey)?.members.push(member);
    }

    return Array.from(grouped.entries())
      .map(([groupKey, group]) => ({
        groupKey,
        chapterName: group.chapterName,
        members: group.members,
      }))
      .sort((a, b) => a.chapterName.localeCompare(b.chapterName));
  }, [filteredPendingApplications, chapters]);

  const handleDeleteMember = async (id: string) => {
    if (!(await confirmDelete("Are you sure you want to delete this member?"))) {
      return;
    }

    deleteMutation.mutate(id);
  };

  const submitDirectoryMemberInfoUpdate = () => {
    if (!selectedDirectoryMember) {
      return;
    }

    const normalizedFullName = directoryEditForm.fullName.trim();
    const normalizedContactNumber = directoryEditForm.contactNumber.trim();
    const parsedAge = Number(directoryEditForm.age);
    const parsedHouseholdSize = Number(directoryEditForm.householdSize);
    const normalizedBirthdate = directoryEditForm.birthdate
      ? new Date(`${directoryEditForm.birthdate}T00:00:00`)
      : null;

    if (!normalizedFullName) {
      toast({ title: "Error", description: "Full name is required", variant: "destructive" });
      return;
    }

    if (!normalizedContactNumber) {
      toast({ title: "Error", description: "Contact number is required", variant: "destructive" });
      return;
    }

    if (!Number.isFinite(parsedAge) || parsedAge < 1) {
      toast({ title: "Error", description: "Age must be at least 1", variant: "destructive" });
      return;
    }

    if (!Number.isFinite(parsedHouseholdSize) || parsedHouseholdSize < 1) {
      toast({ title: "Error", description: "Household size must be at least 1", variant: "destructive" });
      return;
    }

    if (normalizedBirthdate && Number.isNaN(normalizedBirthdate.getTime())) {
      toast({ title: "Error", description: "Birthdate is invalid", variant: "destructive" });
      return;
    }

    updateMutation.mutate(
      {
        id: selectedDirectoryMember.id,
        data: {
          fullName: normalizedFullName,
          contactNumber: normalizedContactNumber,
          email: directoryEditForm.email.trim() || null,
          age: Math.floor(parsedAge),
          birthdate: normalizedBirthdate,
          facebookLink: directoryEditForm.facebookLink.trim() || null,
          householdSize: Math.floor(parsedHouseholdSize),
          registeredVoter: directoryEditRegisteredVoter,
          isActive: directoryEditIsActive,
        },
      },
      {
        onSuccess: () => {
          setIsEditingDirectoryInfo(false);
        },
      },
    );
  };

  const applicationSearchPlaceholder =
    applicationScopeFilter === "barangay-only"
      ? "Type chapter name(s), comma-separated, then choose a barangay..."
      : "Search applications by name, chapter, email, phone, or reference ID...";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Member List
            </CardTitle>
            <CardDescription>
              View and manage all registered YSP members across chapters
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto" data-testid="button-add-member">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Member</DialogTitle>
                  <DialogDescription>Add a new member to Youth Service Philippines</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="fullName"
                      rules={{ required: "Name is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Full name" data-testid="input-member-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="age"
                      rules={{ required: "Age is required", min: { value: 1, message: "Age must be positive" } }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age *</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-member-age" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="chapterId"
                      rules={{ required: "Chapter is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Chapter *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-member-chapter">
                                <SelectValue placeholder="Select chapter" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {chapters.map((chapter) => (
                                <SelectItem key={chapter.id} value={chapter.id}>
                                  {chapter.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contactNumber"
                      rules={{ required: "Contact number is required" }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Number *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Phone number" data-testid="input-member-contact" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      rules={{
                        required: "Email is required",
                        pattern: {
                          value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                          message: "Please enter a valid email address",
                        },
                      }}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address *</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              {...field}
                              placeholder="name@example.com"
                              data-testid="input-member-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="facebookLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Facebook Link (optional)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://facebook.com/..." data-testid="input-member-facebook" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                      <FormField
                        control={form.control}
                        name="registeredVoter"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-member-voter"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Registered Voter</FormLabel>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-member-active"
                              />
                            </FormControl>
                            <FormLabel className="!mt-0">Active</FormLabel>
                          </FormItem>
                        )}
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-member">
                        {createMutation.isPending ? "Adding..." : "Add Member"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-primary">{totalMembers}</div>
            <div className="text-sm text-muted-foreground">Total Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{activeMembers}</div>
            <div className="text-sm text-muted-foreground">Active Members</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{registeredVoters}</div>
            <div className="text-sm text-muted-foreground">Registered Voters</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold">{chapters.length}</div>
            <div className="text-sm text-muted-foreground">Active Chapters</div>
          </Card>
        </div>

        <Tabs value={memberSubTab} onValueChange={(value) => setMemberSubTab(value as "applications" | "directory")} className="space-y-4">
          <TabsList className="w-full justify-start" data-testid="tabs-member-subpages">
            <TabsTrigger value="applications" data-testid="tab-member-applications-subpage">
              Applications
            </TabsTrigger>
            <TabsTrigger value="directory" data-testid="tab-member-directory-subpage">
              Directory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-4">
            <Card data-testid="card-membership-applications">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">Membership Applications</CardTitle>
                  <Badge variant={pendingApplications.length > 0 ? "default" : "secondary"}>
                    {pendingApplications.length} Pending
                  </Badge>
                </div>
                <CardDescription>
                  Public membership form submissions appear here until approved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isDashboardDataLoading ? (
                  <LoadingState label="Loading member applications..." rows={3} compact />
                ) : pendingApplications.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No pending applications right now.
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Unique Applicants</p>
                          <p className="text-xl font-semibold">{uniqueApplicantIdentityCount}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.max(filteredPendingApplications.length - uniqueApplicantIdentityCount, 0)} possible duplicate entries
                          </p>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Duplicate Alerts</p>
                          <p className="text-xl font-semibold">{duplicateFlaggedApplicationsCount}</p>
                          <p className="text-xs text-muted-foreground">Applications with duplicate identity matches</p>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Applicant Type Mix</p>
                          <p className="text-lg font-semibold">
                            {chapterDirectPendingApplicationsCount} Chapter Direct / {barangayBasedPendingApplicationsCount} Barangay
                          </p>
                          <p className="text-xs text-muted-foreground">Current filtered applicants</p>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Pending Volume</p>
                          <p className="text-xl font-semibold">{filteredPendingApplications.length}</p>
                          <p className="text-xs text-muted-foreground">Filtered out of {pendingApplications.length} pending</p>
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-md border p-3">
                          <p className="mb-2 text-xs text-muted-foreground">Applications by Origin</p>
                          <ChartContainer config={applicationAnalyticsChartConfig} className="h-[220px] w-full min-w-0 aspect-auto">
                            <BarChart data={pendingApplicationsScopeData} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
                              <CartesianGrid vertical={false} />
                              <XAxis dataKey="label" tickLine={false} axisLine={false} />
                              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                              <Bar dataKey="applications" fill="var(--color-applications)" radius={6} />
                            </BarChart>
                          </ChartContainer>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="mb-2 text-xs text-muted-foreground">Top Chapters by Pending Applications</p>
                          {pendingApplicationsByChapterData.length === 0 ? (
                            <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                              No chart data for current filters.
                            </div>
                          ) : (
                            <ChartContainer config={applicationAnalyticsChartConfig} className="h-[220px] w-full min-w-0 aspect-auto">
                              <BarChart data={pendingApplicationsByChapterData} margin={{ left: 4, right: 4, top: 8, bottom: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                  dataKey="label"
                                  tickLine={false}
                                  axisLine={false}
                                  tickFormatter={(value) => (String(value).length > 12 ? `${String(value).slice(0, 12)}...` : String(value))}
                                />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="applications" fill="var(--color-applications)" radius={6} />
                              </BarChart>
                            </ChartContainer>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={applicationSearchTerm}
                            onChange={(event) => setApplicationSearchTerm(event.target.value)}
                            placeholder={applicationSearchPlaceholder}
                            className="pl-10"
                            data-testid="input-search-member-applications"
                          />
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Applicant Scope</Label>
                            <Select
                              value={applicationScopeFilter}
                              onValueChange={(value) => setApplicationScopeFilter(value as ApplicationScopeFilter)}
                            >
                              <SelectTrigger data-testid="select-member-application-scope-filter">
                                <SelectValue placeholder="Filter by scope" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Applications</SelectItem>
                                <SelectItem value="chapter-direct">Chapter Direct Only</SelectItem>
                                <SelectItem value="barangay-only">Barangay Applicants Only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Voter Status</Label>
                            <Select
                              value={applicationVoterFilter}
                              onValueChange={(value) => setApplicationVoterFilter(value as ApplicationVoterFilter)}
                            >
                              <SelectTrigger data-testid="select-member-application-voter-filter">
                                <SelectValue placeholder="Filter by voter status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Applicants</SelectItem>
                                <SelectItem value="registered-voter">Registered Voters</SelectItem>
                                <SelectItem value="not-registered-voter">Not Registered Voters</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            {applicationScopeFilter === "chapter-direct" ? (
                              <>
                                <Label className="mb-1.5 block text-xs text-muted-foreground">Chapter</Label>
                                <Select
                                  value={applicationChapterFilter}
                                  onValueChange={setApplicationChapterFilter}
                                >
                                  <SelectTrigger data-testid="select-member-application-barangay-filter">
                                    <SelectValue placeholder="Filter by chapter" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All Chapters</SelectItem>
                                    {pendingApplicationChapterOptions.map((option) => (
                                      <SelectItem key={option.id} value={option.id}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </>
                            ) : (
                              <>
                                <Label className="mb-1.5 block text-xs text-muted-foreground">Barangay</Label>
                                <Select
                                  value={applicationBarangayFilter}
                                  onValueChange={setApplicationBarangayFilter}
                                >
                                  <SelectTrigger data-testid="select-member-application-barangay-filter">
                                    <SelectValue placeholder="Filter by barangay" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All Barangays</SelectItem>
                                    {applicationScopeFilter !== "barangay-only" && (
                                      <SelectItem value="chapter-direct">Chapter Direct</SelectItem>
                                    )}
                                    {pendingApplicationBarangayOptions.map((option) => (
                                      <SelectItem key={option.id} value={option.id}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </>
                            )}
                          </div>

                          <div className="flex items-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={clearApplicationFilters}
                              disabled={
                                applicationSearchTerm.length === 0 &&
                                applicationScopeFilter === "all" &&
                                applicationChapterFilter === "all" &&
                                applicationVoterFilter === "all" &&
                                applicationBarangayFilter === "all"
                              }
                              data-testid="button-clear-member-application-filters"
                            >
                              Clear Filters
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={() => setApplicationsExportDialogOpen(true)}
                              disabled={isExportingApplicationsPdf}
                              data-testid="button-export-admin-applications-pdf"
                            >
                              <FileDown className="h-4 w-4 mr-2" />
                              {isExportingApplicationsPdf ? "Exporting PDF..." : "Export PDF"}
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">Filtered: {filteredPendingApplications.length}</Badge>
                          {applicationScopeFilter !== "all" && (
                            <Badge variant="secondary">
                              Scope: {applicationScopeFilter === "chapter-direct" ? "Chapter Direct" : "Barangay Applicants"}
                            </Badge>
                          )}
                          {applicationVoterFilter !== "all" && (
                            <Badge variant="secondary">
                              Voter: {applicationVoterFilter === "registered-voter" ? "Registered" : "Not Registered"}
                            </Badge>
                          )}
                          {applicationScopeFilter === "chapter-direct" && applicationChapterFilter !== "all" && (
                            <Badge variant="secondary">Chapter: {getApplicationChapterFilterLabel()}</Badge>
                          )}
                          {applicationBarangayFilter !== "all" && (
                            <Badge variant="secondary">Barangay: {getApplicationBarangayFilterLabel()}</Badge>
                          )}
                        </div>
                      </div>

                      {filteredPendingApplications.length === 0 ? (
                        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                          No applications match your current filters.
                        </div>
                      ) : (
                        groupedApplications.map((group) => {
                          const isExpanded = isApplicationGroupExpanded(group.groupKey);
                          const groupPagination = getGroupPagination(group.members, applicationGroupPages[group.groupKey]);

                          return (
                            <section key={group.groupKey} className="rounded-md border overflow-hidden">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 -ml-2"
                                  onClick={() => toggleApplicationGroup(group.groupKey)}
                                  data-testid={`button-toggle-applications-group-${group.groupKey}`}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 mr-1" />
                                  )}
                                  <span className="text-sm font-semibold">{group.chapterName}</span>
                                </Button>
                                <Badge variant="outline">
                                  {group.members.length} {group.members.length === 1 ? "Application" : "Applications"}
                                </Badge>
                              </div>

                              {isExpanded && (
                                <>
                                  <div className="divide-y">
                                  {groupPagination.paginatedItems.map((member) => {
                                    const applicationInsights = getPendingApplicationInsights(member);

                                    return (
                                      <div key={member.id} className="space-y-3 p-4" data-testid={`member-application-row-${member.id}`}>
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                          <div className="min-w-0 space-y-1">
                                            <p className="font-medium break-words">{member.fullName}</p>
                                            <p className="text-xs font-mono text-muted-foreground break-all">
                                              Ref: {member.applicationReferenceId || "-"}
                                            </p>
                                            <p className="text-sm text-muted-foreground">{member.contactNumber}</p>
                                            <p className="text-xs text-muted-foreground break-all">{member.email || "No email provided"}</p>
                                            <p className="text-xs text-muted-foreground">
                                              Submitted: {format(new Date(member.createdAt), "MMM d, yyyy")}
                                            </p>
                                          </div>

                                          <div className="flex flex-wrap gap-2">
                                            {applicationInsights.hasApprovedDirectoryRecord ? (
                                              <Badge variant="default">Official Directory (Approved Member)</Badge>
                                            ) : applicationInsights.inOfficialDirectory ? (
                                              <Badge variant="outline">Directory Record (Pending, Not Yet Member)</Badge>
                                            ) : (
                                              <Badge variant="secondary">No Directory Record Yet</Badge>
                                            )}

                                            <Badge variant="outline">{member.barangayId ? "Barangay Applicant" : "Chapter Direct"}</Badge>

                                            {applicationInsights.duplicateCount > 0 ? (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => openDuplicateDialog(member)}
                                                data-testid={`button-view-duplicate-member-application-${member.id}`}
                                              >
                                                Duplicate x{applicationInsights.duplicateCount}
                                              </Button>
                                            ) : (
                                              <Badge variant="secondary">No Duplicate</Badge>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap justify-end gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openApplicantDetailsDialog(member)}
                                            data-testid={`button-view-member-application-${member.id}`}
                                          >
                                            View
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => updateMutation.mutate({ id: member.id, data: { applicationStatus: "approved" } })}
                                            disabled={updatingMemberId === member.id}
                                            data-testid={`button-approve-member-application-${member.id}`}
                                          >
                                            <Check className="h-4 w-4 mr-1" />
                                            Approve
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => updateMutation.mutate({ id: member.id, data: { applicationStatus: "rejected" } })}
                                            disabled={updatingMemberId === member.id}
                                            data-testid={`button-reject-member-application-${member.id}`}
                                          >
                                            <X className="h-4 w-4 mr-1" />
                                            Reject
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  </div>

                                  <div className="flex flex-col gap-2 border-t bg-muted/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
                                    <p className="text-xs text-muted-foreground">
                                      Showing {groupPagination.startItem}-{groupPagination.endItem} of {groupPagination.totalItems} applications
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setApplicationGroupPage(group.groupKey, groupPagination.currentPage - 1, groupPagination.totalPages)}
                                        disabled={groupPagination.currentPage <= 1}
                                      >
                                        Previous
                                      </Button>
                                      <span className="text-xs text-muted-foreground">
                                        Page {groupPagination.currentPage} / {groupPagination.totalPages}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setApplicationGroupPage(group.groupKey, groupPagination.currentPage + 1, groupPagination.totalPages)}
                                        disabled={groupPagination.currentPage >= groupPagination.totalPages}
                                      >
                                        Next
                                      </Button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </section>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Dialog
              open={applicantDetailsOpen}
              onOpenChange={(open) => {
                setApplicantDetailsOpen(open);
                if (!open) {
                  setSelectedApplicant(null);
                }
              }}
            >
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Applicant Details</DialogTitle>
                  <DialogDescription>
                    Review submitted details before approving or rejecting this membership application.
                  </DialogDescription>
                </DialogHeader>

                {!selectedApplicant ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No applicant selected.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                      <div className="rounded-md border p-3 space-y-3">
                        <Avatar className="aspect-square h-auto w-full border">
                          <AvatarImage
                            src={getMemberProfilePhotoSrc(selectedApplicant.photoUrl)}
                            alt={`${selectedApplicant.fullName} submitted 1x1`}
                            className="object-cover"
                          />
                          <AvatarFallback className="bg-primary/10 text-primary text-3xl font-semibold">
                            {getMemberInitials(selectedApplicant.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Application Reference</p>
                          <p className="font-mono text-sm">{selectedApplicant.applicationReferenceId || "-"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{getApplicantTypeLabel(selectedApplicant)}</Badge>
                          <Badge variant="secondary">PENDING</Badge>
                        </div>
                      </div>

                      <div className="rounded-md border p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Full Name</p>
                            <p className="text-sm font-medium break-words">{selectedApplicant.fullName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Age</p>
                            <p className="text-sm font-medium">{selectedApplicant.age || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Contact Number</p>
                            <p className="text-sm font-medium">{selectedApplicant.contactNumber || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p className="text-sm font-medium break-all">{selectedApplicant.email || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Birthdate</p>
                            <p className="text-sm font-medium">
                              {selectedApplicant.birthdate ? formatManilaDateTime(selectedApplicant.birthdate) : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Submitted</p>
                            <p className="text-sm font-medium">{format(new Date(selectedApplicant.createdAt), "MMM d, yyyy")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Barangay</p>
                            <p className="text-sm font-medium">{getApplicantBarangayLabel(selectedApplicant)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Chapter</p>
                            <p className="text-sm font-medium">{getChapterName(selectedApplicant.chapterId)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Registered Voter</p>
                            <p className="text-sm font-medium">{selectedApplicant.registeredVoter ? "Yes" : "No"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Household Size</p>
                            <p className="text-sm font-medium">{selectedApplicant.householdSize || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Household Voters</p>
                            <p className="text-sm font-medium">{selectedApplicant.householdVoters ?? "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Facebook</p>
                            <p className="text-sm font-medium break-all">{selectedApplicant.facebookLink || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Directory Check</p>
                            <p className="text-sm font-medium">
                              {selectedApplicantInsights
                                ? getDirectoryCheckLabel(selectedApplicantInsights)
                                : "No Directory Record Yet"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Duplicate Probability</p>
                            <p className="text-sm font-medium">
                              {selectedApplicantInsights && selectedApplicantInsights.duplicateCount > 0
                                ? `${selectedApplicantInsights.duplicateCount} possible duplicate(s)`
                                : "No strong duplicate match"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <DialogFooter className="gap-2">
                      {selectedApplicantInsights && selectedApplicantInsights.duplicateCount > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            openDuplicateDialog(selectedApplicant);
                            setApplicantDetailsOpen(false);
                            setSelectedApplicant(null);
                          }}
                          data-testid="button-view-duplicates-from-member-application-details"
                        >
                          View Duplicates
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          updateMutation.mutate({ id: selectedApplicant.id, data: { applicationStatus: "rejected" } });
                          setApplicantDetailsOpen(false);
                          setSelectedApplicant(null);
                        }}
                        disabled={updatingMemberId === selectedApplicant.id}
                        data-testid="button-reject-from-member-application-details"
                      >
                        Reject Application
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          updateMutation.mutate({ id: selectedApplicant.id, data: { applicationStatus: "approved" } });
                          setApplicantDetailsOpen(false);
                          setSelectedApplicant(null);
                        }}
                        disabled={updatingMemberId === selectedApplicant.id}
                        data-testid="button-approve-from-member-application-details"
                      >
                        Approve Application
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog
              open={duplicateDialogOpen}
              onOpenChange={(open) => {
                setDuplicateDialogOpen(open);
                if (!open) {
                  setSelectedDuplicateMember(null);
                  setDuplicateMatches([]);
                }
              }}
            >
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Duplicate Applications</DialogTitle>
                  <DialogDescription>
                    {selectedDuplicateMember
                      ? `Applications matching ${selectedDuplicateMember.fullName} in ${getChapterName(selectedDuplicateMember.chapterId)}.`
                      : "Applications with matching name and contact number."}
                  </DialogDescription>
                </DialogHeader>

                {duplicateMatches.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No duplicate applications found for this record.
                  </div>
                ) : (
                  <div className="max-h-[340px] overflow-y-auto rounded-md border">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/40">
                          <th className="p-3 text-left text-xs font-medium">Name</th>
                          <th className="p-3 text-left text-xs font-medium">Reference ID</th>
                          <th className="p-3 text-left text-xs font-medium">Status</th>
                          <th className="p-3 text-left text-xs font-medium">Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicateMatches.map((match) => (
                          <tr key={match.id} className="border-t">
                            <td className="p-3 text-sm">
                              <div className="font-medium">{match.fullName}</div>
                              <div className="text-xs text-muted-foreground">{match.contactNumber}</div>
                            </td>
                            <td className="p-3 text-xs font-mono text-muted-foreground">
                              {match.applicationReferenceId || "-"}
                            </td>
                            <td className="p-3 text-sm">
                              <Badge
                                variant={
                                  getMemberApplicationStatus(match) === "approved"
                                    ? "default"
                                    : getMemberApplicationStatus(match) === "rejected"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {getMemberApplicationStatus(match)}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {format(new Date(match.createdAt), "MMM d, yyyy")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog
              open={applicationsExportDialogOpen}
              onOpenChange={(open) => {
                if (isExportingApplicationsPdf) {
                  return;
                }
                setApplicationsExportDialogOpen(open);
              }}
            >
              <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Export Admin Applications PDF</DialogTitle>
                  <DialogDescription>
                    Customize the admin applications report before downloading.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="admin-applications-export-report-title">Report Title</Label>
                    <Input
                      id="admin-applications-export-report-title"
                      value={applicationsExportReportTitle}
                      onChange={(event) => setApplicationsExportReportTitle(event.target.value)}
                      placeholder="Admin Membership Applications Report"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Quick Presets</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => applyApplicationsExportPreset("minimal")}>
                        Minimal
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => applyApplicationsExportPreset("standard")}>
                        Standard
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => applyApplicationsExportPreset("full")}>
                        Full
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Sections to Include</Label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Checkbox
                          checked={applicationsExportSections.scope}
                          onCheckedChange={(checked) => toggleApplicationsExportSection("scope", checked === true)}
                        />
                        Report Scope
                      </label>
                      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Checkbox
                          checked={applicationsExportSections.applicationsTable}
                          onCheckedChange={(checked) => toggleApplicationsExportSection("applicationsTable", checked === true)}
                        />
                        Applications Table
                      </label>
                      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Checkbox
                          checked={applicationsExportSections.chapterDistribution}
                          onCheckedChange={(checked) => toggleApplicationsExportSection("chapterDistribution", checked === true)}
                        />
                        Top Chapters Distribution
                      </label>
                      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Checkbox
                          checked={applicationsExportSections.originDistribution}
                          onCheckedChange={(checked) => toggleApplicationsExportSection("originDistribution", checked === true)}
                        />
                        Applicant Origin Breakdown
                      </label>
                    </div>
                  </div>

                  {applicationsExportSections.applicationsTable ? (
                    <div className="space-y-2">
                      <Label>Applications Table Columns</Label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.name} onCheckedChange={(checked) => toggleApplicationsExportColumn("name", checked === true)} />
                          Name
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.referenceId} onCheckedChange={(checked) => toggleApplicationsExportColumn("referenceId", checked === true)} />
                          Reference ID
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.chapter} onCheckedChange={(checked) => toggleApplicationsExportColumn("chapter", checked === true)} />
                          Chapter
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.type} onCheckedChange={(checked) => toggleApplicationsExportColumn("type", checked === true)} />
                          Type
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.barangay} onCheckedChange={(checked) => toggleApplicationsExportColumn("barangay", checked === true)} />
                          Barangay
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.contact} onCheckedChange={(checked) => toggleApplicationsExportColumn("contact", checked === true)} />
                          Contact
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.submitted} onCheckedChange={(checked) => toggleApplicationsExportColumn("submitted", checked === true)} />
                          Submitted
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.directoryCheck} onCheckedChange={(checked) => toggleApplicationsExportColumn("directoryCheck", checked === true)} />
                          Directory Check
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.duplicateCheck} onCheckedChange={(checked) => toggleApplicationsExportColumn("duplicateCheck", checked === true)} />
                          Duplicate Check
                        </label>
                        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                          <Checkbox checked={applicationsExportColumns.voterStatus} onCheckedChange={(checked) => toggleApplicationsExportColumn("voterStatus", checked === true)} />
                          Voter Status
                        </label>
                      </div>
                    </div>
                  ) : null}

                  <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={() => setApplicationsExportDialogOpen(false)} disabled={isExportingApplicationsPdf}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleExportApplicationsPdf} disabled={isExportingApplicationsPdf}>
                      <FileDown className="h-4 w-4 mr-2" />
                      {isExportingApplicationsPdf ? "Generating PDF..." : "Download PDF"}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="directory" className="space-y-6">

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full min-w-0 sm:flex-1 sm:min-w-[220px]">
            <Label>Search Members</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email, phone, or reference ID..."
                className="pl-10"
                data-testid="input-search-members"
              />
            </div>
          </div>
          <div className="w-full sm:w-[220px]">
            <Label>Filter by Chapter</Label>
            <Select value={filterChapter} onValueChange={setFilterChapter}>
              <SelectTrigger data-testid="select-filter-chapter">
                <SelectValue placeholder="All Chapters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chapters</SelectItem>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    {chapter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto">
            <Label>View</Label>
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              className="mt-2"
              testIdPrefix="members-view-mode"
            />
          </div>
          <div className="w-full sm:w-auto">
            <Label>Export</Label>
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full sm:w-auto"
              onClick={() => setDirectoryExportDialogOpen(true)}
              disabled={isExportingDirectoryPdf}
              data-testid="button-export-admin-directory-pdf"
            >
              <FileDown className="h-4 w-4 mr-2" />
              {isExportingDirectoryPdf ? "Exporting PDF..." : "Export PDF"}
            </Button>
          </div>
        </div>

        {viewMode === "table" ? (
          <div className="space-y-4">
            {isDashboardDataLoading ? (
              <Card>
                <CardContent className="p-4">
                  <LoadingState label="Loading members..." rows={3} compact />
                </CardContent>
              </Card>
            ) : groupedDirectoryMembers.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No members found. {searchTerm && "Try adjusting your search."}
                </CardContent>
              </Card>
            ) : (
              groupedDirectoryMembers.map((group) => {
                const isExpanded = isDirectoryGroupExpanded(group.groupKey);
                const groupPagination = getGroupPagination(group.members, directoryGroupPages[group.groupKey]);

                return (
                  <section key={group.groupKey} className="rounded-lg border overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 -ml-2"
                        onClick={() => toggleDirectoryGroup(group.groupKey)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 mr-1" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-1" />
                        )}
                        <span className="text-sm font-semibold">{group.chapterName}</span>
                      </Button>
                      <Badge variant="outline">
                        {group.members.length} {group.members.length === 1 ? "Member" : "Members"}
                      </Badge>
                    </div>

                    {isExpanded && (
                      <>
                      <div className="divide-y">
                        {groupPagination.totalItems === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground">No members in this chapter.</div>
                        ) : groupPagination.paginatedItems.map((member) => (
                          <div
                            key={member.id}
                            className="space-y-3 p-4 cursor-pointer hover:bg-muted/20"
                            role="button"
                            tabIndex={0}
                            onClick={() => openDirectoryMemberDetailsDialog(member)}
                            onKeyDown={(event) => {
                              if (event.target !== event.currentTarget) {
                                return;
                              }

                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openDirectoryMemberDetailsDialog(member);
                              }
                            }}
                            data-testid={`button-open-member-directory-details-${member.id}`}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 space-y-2">
                                <div className="font-medium break-words">{member.fullName}</div>
                                {member.facebookLink && (
                                  <a
                                    href={member.facebookLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    Facebook Profile
                                  </a>
                                )}

                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                  <span>Age: {member.age}</span>
                                  <span data-testid={`text-member-household-size-${member.id}`}>
                                    Household: {member.householdSize ?? 1}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {member.contactNumber}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(member.createdAt), "MMM d, yyyy")}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant={member.registeredVoter ? "default" : "outline"}
                                  onClick={() => updateMutation.mutate({
                                    id: member.id,
                                    data: { registeredVoter: !member.registeredVoter }
                                  })}
                                  disabled={updatingMemberId === member.id}
                                  data-testid={`button-toggle-voter-${member.id}`}
                                >
                                  {member.registeredVoter ? (
                                    <><Check className="h-3 w-3 mr-1" /> Yes</>
                                  ) : (
                                    <><X className="h-3 w-3 mr-1" /> No</>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={member.isActive ? "default" : "outline"}
                                  onClick={() => updateMutation.mutate({
                                    id: member.id,
                                    data: { isActive: !member.isActive }
                                  })}
                                  disabled={updatingMemberId === member.id}
                                  data-testid={`button-toggle-active-${member.id}`}
                                >
                                  {member.isActive ? (
                                    <><Check className="h-3 w-3 mr-1" /> Yes</>
                                  ) : (
                                    <><X className="h-3 w-3 mr-1" /> No</>
                                  )}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteMember(member.id)}
                                  disabled={deleteMutation.isPending}
                                  data-testid={`button-delete-member-${member.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {groupPagination.totalItems > 0 && (
                        <div className="flex flex-col gap-2 border-t bg-muted/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <p className="text-xs text-muted-foreground">
                            Showing {groupPagination.startItem}-{groupPagination.endItem} of {groupPagination.totalItems} members
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDirectoryGroupPage(group.groupKey, groupPagination.currentPage - 1, groupPagination.totalPages)}
                              disabled={groupPagination.currentPage <= 1}
                            >
                              Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Page {groupPagination.currentPage} / {groupPagination.totalPages}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDirectoryGroupPage(group.groupKey, groupPagination.currentPage + 1, groupPagination.totalPages)}
                              disabled={groupPagination.currentPage >= groupPagination.totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                      </>
                    )}
                  </section>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {isDashboardDataLoading ? (
              <Card>
                <CardContent className="p-4">
                  <LoadingState label="Loading members..." rows={3} compact />
                </CardContent>
              </Card>
            ) : groupedDirectoryMembers.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No members found. {searchTerm && "Try adjusting your search."}
                </CardContent>
              </Card>
            ) : (
              groupedDirectoryMembers.map((group) => {
                const isExpanded = isDirectoryGroupExpanded(group.groupKey);
                const groupPagination = getGroupPagination(group.members, directoryGroupPages[group.groupKey]);

                return (
                <div key={group.groupKey} className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 -ml-2"
                      onClick={() => toggleDirectoryGroup(group.groupKey)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 mr-1" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-1" />
                      )}
                      <h3 className="text-sm font-semibold tracking-wide">{group.chapterName}</h3>
                    </Button>
                    <Badge variant="outline">
                      {group.members.length} {group.members.length === 1 ? "Member" : "Members"}
                    </Badge>
                  </div>

                  {isExpanded && (
                  <>
                  {groupPagination.totalItems === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No members in this chapter.</div>
                  ) : (
                    <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {groupPagination.paginatedItems.map((member) => (
                        <Card
                          key={member.id}
                          className="overflow-hidden cursor-pointer hover:bg-muted/20"
                          role="button"
                          tabIndex={0}
                          onClick={() => openDirectoryMemberDetailsDialog(member)}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }

                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDirectoryMemberDetailsDialog(member);
                            }
                          }}
                          data-testid={`member-tile-${member.id}`}
                        >
                          <CardContent className="space-y-3 p-4">
                            <div className="space-y-1">
                              <div className="font-semibold">{member.fullName}</div>
                              {member.facebookLink && (
                                <a
                                  href={member.facebookLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Facebook Profile
                                </a>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="text-muted-foreground">Age: {member.age}</span>
                            </div>

                            <div className="space-y-1">
                              <Label>Household Size</Label>
                              <p className="text-sm text-muted-foreground" data-testid={`text-member-household-size-tile-${member.id}`}>
                                {member.householdSize ?? 1}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{member.contactNumber}</span>
                            </div>

                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{format(new Date(member.createdAt), "MMM d, yyyy")}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
                              <Button
                                size="sm"
                                variant={member.registeredVoter ? "default" : "outline"}
                                onClick={() => updateMutation.mutate({
                                  id: member.id,
                                  data: { registeredVoter: !member.registeredVoter }
                                })}
                                disabled={updatingMemberId === member.id}
                                data-testid={`button-toggle-voter-${member.id}`}
                              >
                                {member.registeredVoter ? (
                                  <><Check className="h-3 w-3 mr-1" /> Voter</>
                                ) : (
                                  <><X className="h-3 w-3 mr-1" /> Voter</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant={member.isActive ? "default" : "outline"}
                                onClick={() => updateMutation.mutate({
                                  id: member.id,
                                  data: { isActive: !member.isActive }
                                })}
                                disabled={updatingMemberId === member.id}
                                data-testid={`button-toggle-active-${member.id}`}
                              >
                                {member.isActive ? (
                                  <><Check className="h-3 w-3 mr-1" /> Active</>
                                ) : (
                                  <><X className="h-3 w-3 mr-1" /> Active</>
                                )}
                              </Button>
                            </div>

                            <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteMember(member.id)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-member-${member.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 border rounded-md bg-muted/10 px-3 py-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Showing {groupPagination.startItem}-{groupPagination.endItem} of {groupPagination.totalItems} members
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDirectoryGroupPage(group.groupKey, groupPagination.currentPage - 1, groupPagination.totalPages)}
                          disabled={groupPagination.currentPage <= 1}
                        >
                          Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page {groupPagination.currentPage} / {groupPagination.totalPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDirectoryGroupPage(group.groupKey, groupPagination.currentPage + 1, groupPagination.totalPages)}
                          disabled={groupPagination.currentPage >= groupPagination.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                    </>
                  )}
                  </>
                  )}
                </div>
                );
              })
            )}
          </div>
        )}

        <Dialog
          open={directoryDetailsOpen}
          onOpenChange={(open) => {
            setDirectoryDetailsOpen(open);
            if (!open) {
              setSelectedDirectoryMemberId(null);
              setIsEditingDirectoryInfo(false);
              setDirectoryEditForm(defaultDirectoryEditFormState);
              setDirectoryEditRegisteredVoter(false);
              setDirectoryEditIsActive(false);
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Member Details</DialogTitle>
              <DialogDescription>
                Review complete member information, then use the action buttons below to update this member.
              </DialogDescription>
            </DialogHeader>

            {!selectedDirectoryMember ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No member selected.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-16 w-16 border">
                      <AvatarImage
                        src={getMemberProfilePhotoSrc(selectedDirectoryMember.photoUrl)}
                        alt={`${selectedDirectoryMember.fullName} profile photo`}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                        {getMemberInitials(selectedDirectoryMember.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold break-words">{selectedDirectoryMember.fullName}</p>
                      <p className="text-xs text-muted-foreground break-all">{selectedDirectoryMember.email || "No email provided"}</p>
                      <p className="text-xs text-muted-foreground">{getDirectoryMemberBarangayLabel(selectedDirectoryMember)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isEditingDirectoryInfo ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDirectoryEditForm(toDirectoryEditFormState(selectedDirectoryMember));
                            setDirectoryEditRegisteredVoter(Boolean(selectedDirectoryMember.registeredVoter));
                            setDirectoryEditIsActive(Boolean(selectedDirectoryMember.isActive));
                            setIsEditingDirectoryInfo(false);
                          }}
                          disabled={updatingMemberId === selectedDirectoryMember.id}
                        >
                          Cancel Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={submitDirectoryMemberInfoUpdate}
                          disabled={updatingMemberId === selectedDirectoryMember.id}
                        >
                          Save Info
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingDirectoryInfo(true)}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                      >
                        Edit Info
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        value={directoryEditForm.fullName}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, fullName: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                      />
                    ) : (
                      <p className="text-sm font-medium">{selectedDirectoryMember.fullName}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p className="text-sm font-medium">{selectedDirectoryMember.barangayId ? "Barangay Member" : "Chapter Member"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Barangay</p>
                    <p className="text-sm font-medium">{getDirectoryMemberBarangayLabel(selectedDirectoryMember)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contact Number</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        value={directoryEditForm.contactNumber}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, contactNumber: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                      />
                    ) : (
                      <p className="text-sm font-medium">{selectedDirectoryMember.contactNumber || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        type="email"
                        value={directoryEditForm.email}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, email: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        placeholder="No email"
                      />
                    ) : (
                      <p className="text-sm font-medium break-all">{selectedDirectoryMember.email || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        type="number"
                        min={1}
                        value={directoryEditForm.age}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, age: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                      />
                    ) : (
                      <p className="text-sm font-medium">{selectedDirectoryMember.age ?? "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Birthdate</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        type="date"
                        value={directoryEditForm.birthdate}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, birthdate: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                      />
                    ) : (
                      <p className="text-sm font-medium">
                        {selectedDirectoryMember.birthdate ? formatManilaDateTime(selectedDirectoryMember.birthdate) : "-"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date Added</p>
                    <p className="text-sm font-medium">{format(new Date(selectedDirectoryMember.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Registered Voter</p>
                    <p className="text-sm font-medium">{(isEditingDirectoryInfo ? directoryEditRegisteredVoter : selectedDirectoryMember.registeredVoter) ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-sm font-medium">{(isEditingDirectoryInfo ? directoryEditIsActive : selectedDirectoryMember.isActive) ? "Yes" : "No"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Facebook</p>
                    {isEditingDirectoryInfo ? (
                      <Input
                        value={directoryEditForm.facebookLink}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, facebookLink: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id}
                        placeholder="Facebook profile link"
                      />
                    ) : selectedDirectoryMember.facebookLink ? (
                      <a
                        href={selectedDirectoryMember.facebookLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline break-all"
                      >
                        {selectedDirectoryMember.facebookLink}
                      </a>
                    ) : (
                      <p className="text-sm font-medium">-</p>
                    )}
                  </div>
                </div>

                <div className="rounded-md border p-4 space-y-3">
                  <p className="text-sm font-semibold">Actions</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="block text-xs text-muted-foreground">Household Size</Label>
                      <Input
                        type="number"
                        min={1}
                        value={directoryEditForm.householdSize}
                        onChange={(event) => setDirectoryEditForm((prev) => ({ ...prev, householdSize: event.target.value }))}
                        disabled={updatingMemberId === selectedDirectoryMember.id || !isEditingDirectoryInfo}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Registered Voter</span>
                        <Switch
                          checked={directoryEditRegisteredVoter}
                          onCheckedChange={setDirectoryEditRegisteredVoter}
                          disabled={updatingMemberId === selectedDirectoryMember.id || !isEditingDirectoryInfo}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">Active</span>
                        <Switch
                          checked={directoryEditIsActive}
                          onCheckedChange={setDirectoryEditIsActive}
                          disabled={updatingMemberId === selectedDirectoryMember.id || !isEditingDirectoryInfo}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={async () => {
                        await handleDeleteMember(selectedDirectoryMember.id);
                        setDirectoryDetailsOpen(false);
                      }}
                      disabled={deleteMutation.isPending || updatingMemberId === selectedDirectoryMember.id}
                    >
                      Delete Member
                    </Button>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" onClick={() => setDirectoryDetailsOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={directoryExportDialogOpen}
          onOpenChange={(open) => {
            if (isExportingDirectoryPdf) {
              return;
            }
            setDirectoryExportDialogOpen(open);
          }}
        >
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Export Admin Directory PDF</DialogTitle>
              <DialogDescription>
                Customize the admin member directory report before downloading.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="admin-directory-export-report-title">Report Title</Label>
                <Input
                  id="admin-directory-export-report-title"
                  value={directoryExportReportTitle}
                  onChange={(event) => setDirectoryExportReportTitle(event.target.value)}
                  placeholder="Admin Member Directory Report"
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Presets</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => applyDirectoryExportPreset("minimal")}>
                    Minimal
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyDirectoryExportPreset("standard")}>
                    Standard
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyDirectoryExportPreset("full")}>
                    Full
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sections to Include</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={directoryExportSections.scope} onCheckedChange={(checked) => toggleDirectoryExportSection("scope", checked === true)} />
                    Report Scope
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={directoryExportSections.summaryStats} onCheckedChange={(checked) => toggleDirectoryExportSection("summaryStats", checked === true)} />
                    Summary Stats
                  </label>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2">
                    <Checkbox checked={directoryExportSections.directoryTable} onCheckedChange={(checked) => toggleDirectoryExportSection("directoryTable", checked === true)} />
                    Member Directory Table
                  </label>
                </div>
              </div>

              {directoryExportSections.directoryTable ? (
                <div className="space-y-2">
                  <Label>Directory Table Columns</Label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.name} onCheckedChange={(checked) => toggleDirectoryExportColumn("name", checked === true)} />
                      Name
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.chapter} onCheckedChange={(checked) => toggleDirectoryExportColumn("chapter", checked === true)} />
                      Chapter
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.type} onCheckedChange={(checked) => toggleDirectoryExportColumn("type", checked === true)} />
                      Type
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.barangay} onCheckedChange={(checked) => toggleDirectoryExportColumn("barangay", checked === true)} />
                      Barangay
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.contact} onCheckedChange={(checked) => toggleDirectoryExportColumn("contact", checked === true)} />
                      Contact
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.email} onCheckedChange={(checked) => toggleDirectoryExportColumn("email", checked === true)} />
                      Email
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.age} onCheckedChange={(checked) => toggleDirectoryExportColumn("age", checked === true)} />
                      Age
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.household} onCheckedChange={(checked) => toggleDirectoryExportColumn("household", checked === true)} />
                      Household
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.voter} onCheckedChange={(checked) => toggleDirectoryExportColumn("voter", checked === true)} />
                      Voter
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox checked={directoryExportColumns.active} onCheckedChange={(checked) => toggleDirectoryExportColumn("active", checked === true)} />
                      Active
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm md:col-span-2">
                      <Checkbox checked={directoryExportColumns.dateAdded} onCheckedChange={(checked) => toggleDirectoryExportColumn("dateAdded", checked === true)} />
                      Date Added
                    </label>
                  </div>
                </div>
              ) : null}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setDirectoryExportDialogOpen(false)} disabled={isExportingDirectoryPdf}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleExportDirectoryPdf} disabled={isExportingDirectoryPdf}>
                  <FileDown className="h-4 w-4 mr-2" />
                  {isExportingDirectoryPdf ? "Generating PDF..." : "Download PDF"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
