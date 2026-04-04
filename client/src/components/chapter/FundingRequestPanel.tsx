import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useDeleteConfirmation } from "@/hooks/use-confirm-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import LoadingState from "@/components/ui/loading-state";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import { Calendar, Clock, Plus, CheckCircle, XCircle, AlertCircle, Send, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import type { ChapterRequest } from "@shared/schema";

const fundingRequestFormSchema = z.object({
  proposedActivityName: z.string().min(1, "Activity name is required"),
  requestedAmount: z
    .string()
    .trim()
    .min(1, "Requested amount is required")
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }, "Requested amount must be greater than 0"),
  date: z.string().optional(),
  time: z.string().optional(),
  rationale: z.string().min(1, "Rationale is required"),
  howNationalCanHelp: z.string().min(1, "This field is required"),
  details: z.string().optional(),
});

type FundingRequestFormValues = z.infer<typeof fundingRequestFormSchema>;

const defaultFormValues: FundingRequestFormValues = {
  proposedActivityName: "",
  requestedAmount: "",
  date: "",
  time: "",
  rationale: "",
  howNationalCanHelp: "",
  details: "",
};

interface FundingRequestPanelProps {
  chapterId: string;
}

export default function FundingRequestPanel({ chapterId }: FundingRequestPanelProps) {
  const { toast } = useToast();
  const confirmDelete = useDeleteConfirmation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<ChapterRequest | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ChapterRequest | null>(null);

  const form = useForm<FundingRequestFormValues>({
    resolver: zodResolver(fundingRequestFormSchema),
    defaultValues: defaultFormValues,
  });

  const { data: requests = [], isLoading } = useQuery<ChapterRequest[]>({
    queryKey: ["/api/chapter-requests/my-requests"],
    queryFn: async () => {
      const res = await fetch("/api/chapter-requests/my-requests", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: (data: FundingRequestFormValues) => 
      apiRequest("POST", "/api/chapter-requests", {
        ...data,
        requestedAmount: Math.round(Number(data.requestedAmount)),
        type: "funding_request",
        date: data.date ? new Date(data.date).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-requests/my-requests"] });
      toast({
        title: "Request Submitted",
        description: "Your funding request has been sent to YSP National.",
      });
      setIsDialogOpen(false);
      setEditingRequest(null);
      form.reset(defaultFormValues);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to submit request",
        variant: "destructive",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FundingRequestFormValues }) =>
      apiRequest("PATCH", `/api/chapter-requests/${id}/my-request`, {
        proposedActivityName: data.proposedActivityName,
        requestedAmount: Math.round(Number(data.requestedAmount)),
        date: data.date ? new Date(data.date).toISOString() : null,
        time: data.time || null,
        rationale: data.rationale,
        howNationalCanHelp: data.howNationalCanHelp,
        details: data.details || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-requests/my-requests"] });
      toast({
        title: "Request Updated",
        description: "Your funding request has been updated.",
      });
      setIsDialogOpen(false);
      setEditingRequest(null);
      setSelectedRequest(null);
      form.reset(defaultFormValues);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error?.message || "Unable to update funding request",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (requestId: string) => apiRequest("DELETE", `/api/chapter-requests/${requestId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-requests/my-requests"] });
      setSelectedRequest(null);
      toast({
        title: "Request Deleted",
        description: "Your requested funding entry has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error?.message || "Unable to delete funding request",
        variant: "destructive",
      });
    },
  });

  const canModifyRequest = (request: ChapterRequest) => request.status === "new";

  const openCreateDialog = () => {
    setEditingRequest(null);
    form.reset(defaultFormValues);
    setIsDialogOpen(true);
  };

  const openEditDialog = (request: ChapterRequest) => {
    if (!canModifyRequest(request)) {
      toast({
        title: "Editing Locked",
        description: "Only requested funding entries can be edited.",
        variant: "destructive",
      });
      return;
    }

    setEditingRequest(request);
    form.reset({
      proposedActivityName: request.proposedActivityName || "",
      requestedAmount:
        typeof request.requestedAmount === "number" && Number.isFinite(request.requestedAmount)
          ? String(Math.round(request.requestedAmount))
          : "",
      date: request.date ? format(new Date(request.date), "yyyy-MM-dd") : "",
      time: request.time || "",
      rationale: request.rationale || "",
      howNationalCanHelp: request.howNationalCanHelp || "",
      details: request.details || "",
    });
    setIsDialogOpen(true);
  };

  const handleDeleteRequest = async (request: ChapterRequest) => {
    if (!canModifyRequest(request)) {
      toast({
        title: "Delete Locked",
        description: "Only requested funding entries can be deleted.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = await confirmDelete(
      "This will permanently delete your funding request. This action cannot be undone.",
      "Delete Funding Request",
    );
    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(request.id);
  };

  const onSubmit = (data: FundingRequestFormValues) => {
    if (editingRequest) {
      updateMutation.mutate({ id: editingRequest.id, data });
      return;
    }

    createMutation.mutate(data);
  };

  const requestedRequests = useMemo(() => requests.filter((request) => request.status === "new"), [requests]);
  const inReviewRequests = useMemo(() => requests.filter((request) => request.status === "in_review"), [requests]);
  const approvedRequests = useMemo(() => requests.filter((request) => request.status === "approved"), [requests]);
  const rejectedRequests = useMemo(() => requests.filter((request) => request.status === "rejected"), [requests]);

  const requestedPagination = usePagination(requestedRequests, {
    pageSize: 4,
    resetKey: requestedRequests.length,
  });

  const inReviewPagination = usePagination(inReviewRequests, {
    pageSize: 4,
    resetKey: inReviewRequests.length,
  });

  const approvedPagination = usePagination(approvedRequests, {
    pageSize: 4,
    resetKey: approvedRequests.length,
  });

  const rejectedPagination = usePagination(rejectedRequests, {
    pageSize: 5,
    resetKey: rejectedRequests.length,
  });

  const approvedFundingTotal = useMemo(
    () =>
      approvedRequests.reduce((sum, request) => {
        const amount = request.approvedAmount ?? request.requestedAmount ?? 0;
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [approvedRequests],
  );

  const formatAmount = (amount: number | null | undefined) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return null;
    }

    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" /> Requested</Badge>;
      case "approved":
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      case "in_review":
        return <Badge className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" /> In Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderSection = (
    title: string,
    description: string,
    sectionRequests: ChapterRequest[],
    pagination: ReturnType<typeof usePagination<ChapterRequest>>,
    itemLabel: string,
  ) => {
    if (sectionRequests.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No {itemLabel} requests.</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pagination.paginatedItems.map((request) => {
            const canModify = canModifyRequest(request);

            return (
              <Card
                key={request.id}
                className="hover-elevate cursor-pointer transition-all"
                onClick={() => setSelectedRequest(request)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedRequest(request);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">{getStatusBadge(request.status)}</div>
                      {canModify && (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedRequest(null);
                              openEditDialog(request);
                            }}
                            data-testid={`button-edit-request-${request.id}`}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteRequest(request);
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-request-${request.id}`}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>

                    <h3 className="text-base font-semibold leading-tight break-words sm:text-lg">
                      {request.proposedActivityName || "Unnamed Activity"}
                    </h3>

                    {request.date && (
                      <p className="mt-1 flex items-center gap-1 break-words text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(request.date), "MMMM d, yyyy")}
                        {request.time && ` at ${request.time}`}
                      </p>
                    )}

                    {request.rationale && (
                      <div className="mt-1">
                        <p className="text-sm font-medium">Rationale:</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                          {request.rationale}
                        </p>
                      </div>
                    )}

                    {formatAmount(request.requestedAmount) && (
                      <p className="text-sm text-muted-foreground">
                        Requested Amount: <span className="font-medium text-foreground">{formatAmount(request.requestedAmount)}</span>
                      </p>
                    )}

                    {formatAmount(request.approvedAmount) && (
                      <p className="text-sm text-muted-foreground">
                        Approved Amount: <span className="font-medium text-green-600">{formatAmount(request.approvedAmount)}</span>
                      </p>
                    )}

                    {request.adminReply && (
                      <div>
                        <p className="text-sm font-medium">Admin Reply:</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{request.adminReply}</p>
                      </div>
                    )}

                    {request.rejectionReason && (
                      <div>
                        <p className="text-sm font-medium text-destructive">Reason for Rejection:</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{request.rejectionReason}</p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">Submitted: {format(new Date(request.createdAt), "MMM d, yyyy")}</p>
                    <p className="text-xs text-muted-foreground">Tap card to view full details</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <PaginationControls
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            itemsPerPage={pagination.itemsPerPage}
            totalItems={pagination.totalItems}
            startItem={pagination.startItem}
            endItem={pagination.endItem}
            onPageChange={pagination.setCurrentPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            itemLabel="requests"
          />
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState label="Loading funding requests..." rows={3} compact />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Funding Requests
              </CardTitle>
              <CardDescription>
                Submit requests for YSP National support for your chapter activities.
              </CardDescription>
            </div>
            <Button className="w-full sm:w-auto" onClick={openCreateDialog} data-testid="button-new-request">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Requested</p>
              <p className="text-2xl font-semibold" data-testid="summary-requested-count">{requestedRequests.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">In Review</p>
              <p className="text-2xl font-semibold" data-testid="summary-in-review-count">{inReviewRequests.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Approved</p>
              <p className="text-2xl font-semibold" data-testid="summary-approved-count">{approvedRequests.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs font-medium text-muted-foreground">Rejected</p>
              <p className="text-2xl font-semibold" data-testid="summary-rejected-count">{rejectedRequests.length}</p>
            </div>
            <div className="col-span-2 rounded-lg border bg-card p-3 xl:col-span-1">
              <p className="text-xs font-medium text-muted-foreground">Approved Funding Amount</p>
              <p className="text-xl font-semibold" data-testid="summary-approved-amount">
                {formatAmount(approvedFundingTotal) || "PHP 0"}
              </p>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No requests submitted yet.</p>
              <p className="text-sm text-muted-foreground">
                Submit a funding request when you need support from YSP National for your chapter activities.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {renderSection(
                "Requested",
                "You can still edit or delete requests while they remain requested.",
                requestedRequests,
                requestedPagination,
                "requested",
              )}
              {renderSection(
                "In Review",
                "YSP National is currently reviewing these requests.",
                inReviewRequests,
                inReviewPagination,
                "in-review",
              )}
              {renderSection(
                "Approved",
                "Requests approved by YSP National.",
                approvedRequests,
                approvedPagination,
                "approved",
              )}
              {renderSection(
                "Rejected",
                "Requests that were not approved.",
                rejectedRequests,
                rejectedPagination,
                "rejected",
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRequest ? "Edit Funding Request" : "New Funding Request"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="proposedActivityName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proposed Activity Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Tree Planting Activity"
                        data-testid="input-activity-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="requestedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requested Amount (PHP) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="e.g., 15000"
                          data-testid="input-requested-amount"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proposed Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          data-testid="input-activity-date"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proposed Time</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., 9:00 AM - 12:00 PM"
                        data-testid="input-activity-time"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rationale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rationale *</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Why is this activity important? What are its goals?"
                        data-testid="input-rationale"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="howNationalCanHelp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>How Can YSP National Help? *</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="What specific support do you need? (e.g., funding amount, materials, volunteers)"
                        data-testid="input-how-national-can-help"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="details"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Details (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Any other information that would help with your request..."
                        data-testid="input-additional-details"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto"
                  disabled={createMutation.isPending || updateMutation.isPending} 
                  data-testid="button-submit-request"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? editingRequest
                      ? "Saving..."
                      : "Submitting..."
                    : editingRequest
                      ? "Save Changes"
                      : "Submit Request"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingRequest(null);
                    form.reset(defaultFormValues);
                  }}
                  data-testid="button-cancel-request"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-full">
          {selectedRequest && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRequest.proposedActivityName || "Unnamed Activity"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">{getStatusBadge(selectedRequest.status)}</div>

                {selectedRequest.date && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(selectedRequest.date), "MMMM d, yyyy")}
                    {selectedRequest.time && ` at ${selectedRequest.time}`}
                  </p>
                )}

                {formatAmount(selectedRequest.requestedAmount) && (
                  <p className="text-sm text-muted-foreground">
                    Requested Amount: <span className="font-medium text-foreground">{formatAmount(selectedRequest.requestedAmount)}</span>
                  </p>
                )}

                {formatAmount(selectedRequest.approvedAmount) && (
                  <p className="text-sm text-muted-foreground">
                    Approved Amount: <span className="font-medium text-green-600">{formatAmount(selectedRequest.approvedAmount)}</span>
                  </p>
                )}

                {selectedRequest.rationale && (
                  <div>
                    <p className="text-sm font-medium">Rationale:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.rationale}</p>
                  </div>
                )}

                {selectedRequest.howNationalCanHelp && (
                  <div>
                    <p className="text-sm font-medium">How YSP National Can Help:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.howNationalCanHelp}</p>
                  </div>
                )}

                {selectedRequest.details && (
                  <div>
                    <p className="text-sm font-medium">Additional Details:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.details}</p>
                  </div>
                )}

                {selectedRequest.adminReply && (
                  <div>
                    <p className="text-sm font-medium">Admin Reply:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.adminReply}</p>
                  </div>
                )}

                {selectedRequest.rejectionReason && (
                  <div>
                    <p className="text-sm font-medium text-destructive">Reason for Rejection:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.rejectionReason}</p>
                  </div>
                )}

                {selectedRequest.approvedAt && (
                  <p className="text-xs text-muted-foreground">
                    Approved on: {format(new Date(selectedRequest.approvedAt), "MMM d, yyyy h:mm a")}
                  </p>
                )}

                {selectedRequest.rejectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Rejected on: {format(new Date(selectedRequest.rejectedAt), "MMM d, yyyy h:mm a")}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Submitted: {format(new Date(selectedRequest.createdAt), "MMM d, yyyy h:mm a")}
                </p>

                {canModifyRequest(selectedRequest) && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const requestToEdit = selectedRequest;
                        setSelectedRequest(null);
                        openEditDialog(requestToEdit);
                      }}
                      data-testid={`button-detail-edit-request-${selectedRequest.id}`}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Request
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        void handleDeleteRequest(selectedRequest);
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-detail-delete-request-${selectedRequest.id}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Request
                    </Button>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                  data-testid={`button-close-request-details-${selectedRequest.id}`}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
