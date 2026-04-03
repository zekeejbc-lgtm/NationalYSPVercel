import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingState from "@/components/ui/loading-state";
import ViewModeToggle, { type ViewMode } from "@/components/ui/view-mode-toggle";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Users, Search, Trash2, Phone, Calendar, Download, Plus, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { Chapter, Member } from "@shared/schema";
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

const GROUP_PAGE_SIZE = 10;

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

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: members = [], isLoading } = useQuery<Member[]>({
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

    return Array.from(chapterGroups.entries())
      .map(([groupKey, group]) => ({
        groupKey,
        chapterName: group.chapterName,
        members: [...group.members].sort((a, b) => a.fullName.localeCompare(b.fullName)),
      }))
      .sort((a, b) => a.chapterName.localeCompare(b.chapterName));
  }, [chapters, filteredMembers]);

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

  const groupedApplications = useMemo(() => {
    const chapterNameById = new Map(chapters.map((chapter) => [chapter.id, chapter.name]));
    const grouped = new Map<string, { chapterName: string; members: Member[] }>();

    for (const member of pendingApplications) {
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
  }, [pendingApplications, chapters]);

  const handleDeleteMember = async (id: string) => {
    if (!(await confirmDelete("Are you sure you want to delete this member?"))) {
      return;
    }

    deleteMutation.mutate(id);
  };

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Download Excel
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-member">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
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
                    <div className="flex gap-6">
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
                {pendingApplications.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No pending applications right now.
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {groupedApplications.map((group) => {
                        const isExpanded = isApplicationGroupExpanded(group.groupKey);
                        const groupPagination = getGroupPagination(group.members, applicationGroupPages[group.groupKey]);

                        return (
                          <section key={group.groupKey} className="rounded-md border overflow-hidden">
                            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
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
                                          <p className="text-xs text-muted-foreground">
                                            Submitted: {format(new Date(member.createdAt), "MMM d, yyyy")}
                                          </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                          {applicationInsights.hasApprovedDirectoryRecord ? (
                                            <Badge variant="default">Official Directory (Approved)</Badge>
                                          ) : applicationInsights.inOfficialDirectory ? (
                                            <Badge variant="outline">In Directory (Pending)</Badge>
                                          ) : (
                                            <Badge variant="secondary">Not Yet in Directory</Badge>
                                          )}

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
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

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
          </TabsContent>

          <TabsContent value="directory" className="space-y-6">

        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
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
          <div className="w-64">
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
        </div>

        {viewMode === "table" ? (
          <div className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="p-4">
                  <LoadingState label="Loading members..." rows={3} compact />
                </CardContent>
              </Card>
            ) : filteredMembers.length === 0 ? (
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
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
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
                        {groupPagination.paginatedItems.map((member) => (
                          <div key={member.id} className="space-y-3 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 space-y-2">
                                <div className="font-medium break-words">{member.fullName}</div>
                                {member.facebookLink && (
                                  <a
                                    href={member.facebookLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline"
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

                              <div className="flex flex-wrap items-center gap-2">
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
                      </>
                    )}
                  </section>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {isLoading ? (
              <Card>
                <CardContent className="p-4">
                  <LoadingState label="Loading members..." rows={3} compact />
                </CardContent>
              </Card>
            ) : filteredMembers.length === 0 ? (
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groupPagination.paginatedItems.map((member) => (
                      <Card key={member.id} className="overflow-hidden" data-testid={`member-tile-${member.id}`}>
                        <CardContent className="space-y-3 p-4">
                          <div className="space-y-1">
                            <div className="font-semibold">{member.fullName}</div>
                            {member.facebookLink && (
                              <a
                                href={member.facebookLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
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

                          <div className="grid grid-cols-2 gap-2 pt-1">
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

                          <div className="flex justify-end">
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
                </div>
                );
              })
            )}
          </div>
        )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
