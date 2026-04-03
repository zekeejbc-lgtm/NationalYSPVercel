import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import PaginationControls from "@/components/ui/pagination-controls";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePagination } from "@/hooks/use-pagination";
import { UserCheck, Plus, Save, Trash2, Edit2, Phone, Mail, Calendar } from "lucide-react";
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

function formatManilaDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" ? value : "-";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
}

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

  const renderOfficerRow = (officer: ChapterOfficer, useBarangayLabel = false, showActions = true) => {
    const displayPosition = ((level === "barangay" || useBarangayLabel) && officer.position === "City/Municipality President")
      ? "Barangay President"
      : officer.position;

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
        <div className="flex items-center justify-between">
          <Badge variant={summaryOfficers.length === positions.length ? "default" : "outline"}>
            {summaryOfficers.length} / {positions.length} positions filled
          </Badge>
          {!isFormOpen && summaryOfficers.length < positions.length && (
            <Button onClick={openAddForm} data-testid="button-add-officer">
              <Plus className="h-4 w-4 mr-2" />
              Add Officer
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 py-2" role="status" aria-label="Loading officers">
            <div className="h-4 w-full rounded-md bg-muted skeleton-shimmer" />
            <div className="h-4 w-5/6 rounded-md bg-muted skeleton-shimmer" />
            <div className="h-4 w-2/3 rounded-md bg-muted skeleton-shimmer" />
          </div>
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
