import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PaginationControls from "@/components/ui/pagination-controls";
import LoadingState from "@/components/ui/loading-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { usePagination } from "@/hooks/use-pagination";
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertCircle, Search, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import type { ChapterRequest, Chapter } from "@shared/schema";
import ChapterRequestsAnalyticsPanel from "@/components/admin/ChapterRequestsAnalyticsPanel";

type ChapterRequestStatus = "new" | "in_review" | "approved" | "rejected";
type SortOrder = "oldest" | "newest";

type SectionControls = {
  search: string;
  chapterFilter: string;
  typeFilter: string;
};

const CHAPTER_FILTER_ALL = "all";
const TYPE_FILTER_ALL = "all";

const defaultSectionControls: SectionControls = {
  search: "",
  chapterFilter: CHAPTER_FILTER_ALL,
  typeFilter: TYPE_FILTER_ALL,
};

export default function ChapterRequestsPanel() {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<ChapterRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<ChapterRequest | null>(null);
  const [approveReply, setApproveReply] = useState("");
  const [approveAmount, setApproveAmount] = useState("");
  const [rejectTarget, setRejectTarget] = useState<ChapterRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [requestsSubTab, setRequestsSubTab] = useState<"manage" | "analytics">("manage");

  const [newControls, setNewControls] = useState<SectionControls>(defaultSectionControls);
  const [newSortOrder, setNewSortOrder] = useState<SortOrder>("oldest");
  const [inReviewControls, setInReviewControls] = useState<SectionControls>(defaultSectionControls);
  const [approvedControls, setApprovedControls] = useState<SectionControls>(defaultSectionControls);
  const [rejectedControls, setRejectedControls] = useState<SectionControls>(defaultSectionControls);

  const {
    data: requests = [],
    isLoading: requestsLoading,
    isFetched: requestsFetched,
  } = useQuery<ChapterRequest[]>({
    queryKey: ["/api/chapter-requests"],
  });

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const isDashboardDataLoading =
    requestsLoading ||
    !requestsFetched ||
    chaptersLoading ||
    !chaptersFetched;

  const getChapterName = (chapterId: string) => {
    const chapter = chapters.find((item) => item.id === chapterId);
    return chapter?.name || "Unknown Chapter";
  };

  const requestTypeOptions = useMemo(() => {
    return Array.from(new Set(requests.map((request) => request.type).filter(Boolean))).sort();
  }, [requests]);

  const formatCurrency = (amount: number | null | undefined) => {
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return null;
    }

    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getRequestedAmountLabel = (request: ChapterRequest) => {
    const requestedAmountLabel = formatCurrency(request.requestedAmount);
    if (requestedAmountLabel) {
      return requestedAmountLabel;
    }

    if (request.type === "funding_request") {
      return "Not provided";
    }

    return null;
  };

  const updateStatusMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status: ChapterRequestStatus;
      adminReply?: string | null;
      approvedAmount?: number | null;
      rejectionReason?: string | null;
    }) => apiRequest("PATCH", `/api/chapter-requests/${payload.id}`, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-requests"] });
      toast({
        title: "Success",
        description:
          variables.status === "approved"
            ? "Request approved with a reply and approved amount."
            : variables.status === "rejected"
              ? "Request rejected with reason."
              : "Request status updated.",
      });
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : "Failed to update request status";
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return (
          <Badge variant="secondary">
            <AlertCircle className="mr-1 h-3 w-3" /> New
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-600">
            <CheckCircle className="mr-1 h-3 w-3" /> Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Rejected
          </Badge>
        );
      case "in_review":
        return (
          <Badge className="bg-yellow-600">
            <Clock className="mr-1 h-3 w-3" /> In Review
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPreviewText = (request: ChapterRequest) => {
    if (request.rationale) return request.rationale;
    if (request.howNationalCanHelp) return request.howNationalCanHelp;
    if (request.details) return request.details;
    return "No additional details provided.";
  };

  const getCreatedAtMs = (request: ChapterRequest) => new Date(request.createdAt).getTime();

  const applySectionFilters = (
    list: ChapterRequest[],
    controls: SectionControls,
    sortOrder: SortOrder = "newest",
  ) => {
    const normalizedQuery = controls.search.trim().toLowerCase();

    const filtered = list.filter((request) => {
      const chapterName = getChapterName(request.chapterId);
      const searchableText = [
        request.proposedActivityName,
        request.rationale,
        request.howNationalCanHelp,
        request.details,
        request.adminReply,
        request.rejectionReason,
        request.type,
        request.status,
        chapterName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
      const matchesChapter =
        controls.chapterFilter === CHAPTER_FILTER_ALL || request.chapterId === controls.chapterFilter;
      const matchesType = controls.typeFilter === TYPE_FILTER_ALL || request.type === controls.typeFilter;

      return matchesSearch && matchesChapter && matchesType;
    });

    const sorted = [...filtered].sort((left, right) => getCreatedAtMs(left) - getCreatedAtMs(right));
    if (sortOrder === "newest") {
      sorted.reverse();
    }

    return sorted;
  };

  const newRequests = useMemo(
    () => requests.filter((request) => request.status === "new"),
    [requests],
  );
  const inReviewRequests = useMemo(
    () => requests.filter((request) => request.status === "in_review"),
    [requests],
  );
  const approvedRequests = useMemo(
    () => requests.filter((request) => request.status === "approved"),
    [requests],
  );
  const rejectedRequests = useMemo(
    () => requests.filter((request) => request.status === "rejected"),
    [requests],
  );

  const filteredNewRequests = useMemo(
    () => applySectionFilters(newRequests, newControls, newSortOrder),
    [newRequests, newControls, newSortOrder, chapters],
  );
  const filteredInReviewRequests = useMemo(
    () => applySectionFilters(inReviewRequests, inReviewControls, "newest"),
    [inReviewRequests, inReviewControls, chapters],
  );
  const filteredApprovedRequests = useMemo(
    () => applySectionFilters(approvedRequests, approvedControls, "newest"),
    [approvedRequests, approvedControls, chapters],
  );
  const filteredRejectedRequests = useMemo(
    () => applySectionFilters(rejectedRequests, rejectedControls, "newest"),
    [rejectedRequests, rejectedControls, chapters],
  );

  const newPagination = usePagination(filteredNewRequests, {
    pageSize: 4,
    resetKey: `new-${newControls.search}-${newControls.chapterFilter}-${newControls.typeFilter}-${newSortOrder}-${filteredNewRequests.length}`,
  });

  const inReviewPagination = usePagination(filteredInReviewRequests, {
    pageSize: 4,
    resetKey: `in_review-${inReviewControls.search}-${inReviewControls.chapterFilter}-${inReviewControls.typeFilter}-${filteredInReviewRequests.length}`,
  });

  const approvedPagination = usePagination(filteredApprovedRequests, {
    pageSize: 4,
    resetKey: `approved-${approvedControls.search}-${approvedControls.chapterFilter}-${approvedControls.typeFilter}-${filteredApprovedRequests.length}`,
  });

  const rejectedPagination = usePagination(filteredRejectedRequests, {
    pageSize: 4,
    resetKey: `rejected-${rejectedControls.search}-${rejectedControls.chapterFilter}-${rejectedControls.typeFilter}-${filteredRejectedRequests.length}`,
  });

  const openApproveDialog = (request: ChapterRequest) => {
    setApproveTarget(request);
    setApproveReply(request.adminReply || "");
    if (typeof request.approvedAmount === "number") {
      setApproveAmount(String(request.approvedAmount));
    } else if (typeof request.requestedAmount === "number") {
      setApproveAmount(String(request.requestedAmount));
    } else {
      setApproveAmount("");
    }
  };

  const openRejectDialog = (request: ChapterRequest) => {
    setRejectTarget(request);
    setRejectReason(request.rejectionReason || "");
  };

  const handleMarkInReview = (requestId: string) => {
    updateStatusMutation.mutate({
      id: requestId,
      status: "in_review",
      adminReply: null,
      approvedAmount: null,
      rejectionReason: null,
    });
  };

  const handleApproveSubmit = () => {
    if (!approveTarget) {
      return;
    }

    const normalizedReply = approveReply.trim();
    const parsedAmount = Number(approveAmount);

    if (!normalizedReply) {
      toast({
        title: "Reply message required",
        description: "Please enter a reply message before approving this request.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Approved amount required",
        description: "Please enter a valid approved amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    updateStatusMutation.mutate(
      {
        id: approveTarget.id,
        status: "approved",
        adminReply: normalizedReply,
        approvedAmount: Math.round(parsedAmount),
        rejectionReason: null,
      },
      {
        onSuccess: () => {
          setApproveTarget(null);
          setApproveReply("");
          setApproveAmount("");
          if (selectedRequest?.id === approveTarget.id) {
            setSelectedRequest(null);
          }
        },
      },
    );
  };

  const handleRejectSubmit = () => {
    if (!rejectTarget) {
      return;
    }

    const normalizedReason = rejectReason.trim();
    if (!normalizedReason) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason before rejecting this request.",
        variant: "destructive",
      });
      return;
    }

    updateStatusMutation.mutate(
      {
        id: rejectTarget.id,
        status: "rejected",
        rejectionReason: normalizedReason,
        adminReply: null,
        approvedAmount: null,
      },
      {
        onSuccess: () => {
          setRejectTarget(null);
          setRejectReason("");
          if (selectedRequest?.id === rejectTarget.id) {
            setSelectedRequest(null);
          }
        },
      },
    );
  };

  const renderRequestCard = (request: ChapterRequest) => {
    const requestedAmountLabel = getRequestedAmountLabel(request);
    const approvedAmountLabel = formatCurrency(request.approvedAmount);

    return (
      <Card
        key={request.id}
        className="cursor-pointer transition-all hover-elevate"
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="w-full min-w-0 sm:flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {request.type.replace(/_/g, " ")}
                </Badge>
                {getStatusBadge(request.status)}
              </div>
              <h3 className="text-base font-semibold leading-tight break-words sm:text-lg">
                {request.proposedActivityName || "Unnamed Request"}
              </h3>
              <p className="mt-1 flex items-center gap-1 break-words text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                {getChapterName(request.chapterId)}
              </p>
              {request.date && (
                <p className="flex items-center gap-1 break-words text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(request.date), "MMMM d, yyyy")}
                  {request.time && ` at ${request.time}`}
                </p>
              )}

              {requestedAmountLabel && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Requested:{" "}
                  <span
                    className={
                      requestedAmountLabel === "Not provided"
                        ? "font-medium text-amber-500"
                        : "font-medium text-foreground"
                    }
                  >
                    {requestedAmountLabel}
                  </span>
                </p>
              )}

              {approvedAmountLabel && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Approved: <span className="font-medium text-green-600">{approvedAmountLabel}</span>
                </p>
              )}

              {request.adminReply && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  Admin reply: {request.adminReply}
                </p>
              )}

              {request.rejectionReason && (
                <p className="mt-1 text-sm text-destructive line-clamp-2">
                  Reason: {request.rejectionReason}
                </p>
              )}

              <div className="mt-3">
                <p className="text-sm font-medium">Preview</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:3] sm:[-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                  {getPreviewText(request)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Tap card to view full details</p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Submitted: {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end" onClick={(event) => event.stopPropagation()}>
              {request.status === "new" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => handleMarkInReview(request.id)}
                  disabled={updateStatusMutation.isPending}
                  data-testid={`button-review-request-${request.id}`}
                >
                  Mark In Review
                </Button>
              )}
              {(request.status === "new" || request.status === "in_review") && (
                <>
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 sm:flex-none"
                    onClick={() => openApproveDialog(request)}
                    disabled={updateStatusMutation.isPending}
                    data-testid={`button-approve-request-${request.id}`}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1 sm:flex-none"
                    onClick={() => openRejectDialog(request)}
                    disabled={updateStatusMutation.isPending}
                    data-testid={`button-reject-request-${request.id}`}
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSection = ({
    title,
    description,
    controls,
    setControls,
    paginatedItems,
    pagination,
    totalFilteredItems,
    itemLabel,
    includeSortToggle,
  }: {
    title: string;
    description: string;
    controls: SectionControls;
    setControls: React.Dispatch<React.SetStateAction<SectionControls>>;
    paginatedItems: ChapterRequest[];
    pagination: ReturnType<typeof usePagination<ChapterRequest>>;
    totalFilteredItems: number;
    itemLabel: string;
    includeSortToggle?: boolean;
  }) => (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{totalFilteredItems}</Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={controls.search}
            onChange={(event) => setControls((prev) => ({ ...prev, search: event.target.value }))}
            placeholder={`Search ${itemLabel}`}
            className="pl-10"
            data-testid={`input-${itemLabel.replace(/\s+/g, "-")}-search`}
          />
        </div>

        <Select
          value={controls.chapterFilter}
          onValueChange={(value) => setControls((prev) => ({ ...prev, chapterFilter: value }))}
        >
          <SelectTrigger data-testid={`select-${itemLabel.replace(/\s+/g, "-")}-chapter-filter`}>
            <SelectValue placeholder="Filter chapter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CHAPTER_FILTER_ALL}>All Chapters</SelectItem>
            {chapters.map((chapter) => (
              <SelectItem key={chapter.id} value={chapter.id}>
                {chapter.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={controls.typeFilter}
          onValueChange={(value) => setControls((prev) => ({ ...prev, typeFilter: value }))}
        >
          <SelectTrigger data-testid={`select-${itemLabel.replace(/\s+/g, "-")}-type-filter`}>
            <SelectValue placeholder="Filter type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_FILTER_ALL}>All Types</SelectItem>
            {requestTypeOptions.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {includeSortToggle && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Default for New is oldest first. Use order to switch newest-first.
          </p>
          <Select value={newSortOrder} onValueChange={(value) => setNewSortOrder(value as SortOrder)}>
            <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-new-request-order">
              <SelectValue placeholder="Sort order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {totalFilteredItems === 0 ? (
        <p className="text-sm text-muted-foreground">No requests match these filters.</p>
      ) : (
        <>
          <div className="space-y-3">{paginatedItems.map((request) => renderRequestCard(request))}</div>
          <PaginationControls
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            itemsPerPage={pagination.itemsPerPage}
            totalItems={pagination.totalItems}
            startItem={pagination.startItem}
            endItem={pagination.endItem}
            onPageChange={pagination.setCurrentPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            itemLabel={itemLabel}
          />
        </>
      )}
    </section>
  );

  if (isDashboardDataLoading) {
    return <LoadingState label="Loading chapter requests..." rows={3} compact />;
  }

  return (
    <>
      <Tabs
        value={requestsSubTab}
        onValueChange={(value) => setRequestsSubTab(value as "manage" | "analytics")}
        className="space-y-4"
        data-testid="tabs-admin-chapter-requests"
      >
        <TabsList>
          <TabsTrigger value="manage" data-testid="tab-admin-chapter-requests-manage">
            Manage Requests
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-admin-chapter-requests-analytics">
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Chapter Requests
              </CardTitle>
              <CardDescription>
                View and manage funding requests and other requests from chapters
              </CardDescription>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <p className="text-muted-foreground">No chapter requests yet.</p>
              ) : (
                <div className="space-y-6">
                  {renderSection({
                    title: "New",
                    description: "Fresh requests awaiting first review",
                    controls: newControls,
                    setControls: setNewControls,
                    paginatedItems: newPagination.paginatedItems,
                    pagination: newPagination,
                    totalFilteredItems: filteredNewRequests.length,
                    itemLabel: "new requests",
                    includeSortToggle: true,
                  })}

                  {renderSection({
                    title: "In Review",
                    description: "Requests currently being evaluated",
                    controls: inReviewControls,
                    setControls: setInReviewControls,
                    paginatedItems: inReviewPagination.paginatedItems,
                    pagination: inReviewPagination,
                    totalFilteredItems: filteredInReviewRequests.length,
                    itemLabel: "in-review requests",
                  })}

                  {renderSection({
                    title: "Approved",
                    description: "Requests with approved support",
                    controls: approvedControls,
                    setControls: setApprovedControls,
                    paginatedItems: approvedPagination.paginatedItems,
                    pagination: approvedPagination,
                    totalFilteredItems: filteredApprovedRequests.length,
                    itemLabel: "approved requests",
                  })}

                  {renderSection({
                    title: "Rejected",
                    description: "Requests declined with reasons",
                    controls: rejectedControls,
                    setControls: setRejectedControls,
                    paginatedItems: rejectedPagination.paginatedItems,
                    pagination: rejectedPagination,
                    totalFilteredItems: filteredRejectedRequests.length,
                    itemLabel: "rejected requests",
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <ChapterRequestsAnalyticsPanel requests={requests} chapters={chapters} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl border p-0 sm:w-full">
          {selectedRequest && (
            <>
              <DialogHeader className="flex-none border-b bg-background/95 px-4 py-3 pr-14 backdrop-blur-sm md:px-6">
                <DialogTitle className="break-words">
                  {selectedRequest.proposedActivityName || "Unnamed Request"}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline" className="capitalize">
                    {selectedRequest.type.replace(/_/g, " ")}
                  </Badge>
                  {getStatusBadge(selectedRequest.status)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
                <div className="space-y-4">
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {getChapterName(selectedRequest.chapterId)}
                  </p>

                  {selectedRequest.date && (
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(selectedRequest.date), "MMMM d, yyyy")}
                      {selectedRequest.time && ` at ${selectedRequest.time}`}
                    </p>
                  )}

                  {getRequestedAmountLabel(selectedRequest) && (
                    <p className="text-sm text-muted-foreground">
                      Requested Amount:{" "}
                      <span
                        className={
                          getRequestedAmountLabel(selectedRequest) === "Not provided"
                            ? "font-medium text-amber-500"
                            : "font-medium text-foreground"
                        }
                      >
                        {getRequestedAmountLabel(selectedRequest)}
                      </span>
                    </p>
                  )}

                  {formatCurrency(selectedRequest.approvedAmount) && (
                    <p className="text-sm text-muted-foreground">
                      Approved Amount:{" "}
                      <span className="font-medium text-green-600">
                        {formatCurrency(selectedRequest.approvedAmount)}
                      </span>
                    </p>
                  )}

                  {selectedRequest.rationale && (
                    <div>
                      <p className="text-sm font-medium">Rationale:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {selectedRequest.rationale}
                      </p>
                    </div>
                  )}

                  {selectedRequest.howNationalCanHelp && (
                    <div>
                      <p className="text-sm font-medium">How National Can Help:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {selectedRequest.howNationalCanHelp}
                      </p>
                    </div>
                  )}

                  {selectedRequest.adminReply && (
                    <div>
                      <p className="text-sm font-medium">Admin Reply:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {selectedRequest.adminReply}
                      </p>
                    </div>
                  )}

                  {selectedRequest.rejectionReason && (
                    <div>
                      <p className="text-sm font-medium text-destructive">Reason for Rejection:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {selectedRequest.rejectionReason}
                      </p>
                    </div>
                  )}

                  {selectedRequest.details && (
                    <div>
                      <p className="text-sm font-medium">Additional Details:</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {selectedRequest.details}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Submitted: {format(new Date(selectedRequest.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              </div>

              <DialogFooter className="flex-none border-t bg-background/95 px-4 py-3 md:px-6">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setSelectedRequest(null)}
                    data-testid={`button-modal-close-request-${selectedRequest.id}`}
                  >
                    Close
                  </Button>
                  {selectedRequest.status === "new" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => handleMarkInReview(selectedRequest.id)}
                      disabled={updateStatusMutation.isPending}
                      data-testid={`button-modal-review-request-${selectedRequest.id}`}
                    >
                      Mark In Review
                    </Button>
                  )}
                  {(selectedRequest.status === "new" || selectedRequest.status === "in_review") && (
                    <>
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 sm:w-auto"
                        onClick={() => openApproveDialog(selectedRequest)}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-modal-approve-request-${selectedRequest.id}`}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full sm:w-auto"
                        onClick={() => openRejectDialog(selectedRequest)}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-modal-reject-request-${selectedRequest.id}`}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(approveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null);
            setApproveReply("");
            setApproveAmount("");
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              Add a reply message and approved amount before confirming approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="approve-reply">Reply Message *</Label>
              <Textarea
                id="approve-reply"
                rows={4}
                value={approveReply}
                onChange={(event) => setApproveReply(event.target.value)}
                placeholder="Share the approval details, conditions, and next steps"
                data-testid="textarea-approve-request-reply"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approve-amount">Approved Amount (PHP) *</Label>
              <Input
                id="approve-amount"
                type="number"
                min={1}
                step={1}
                value={approveAmount}
                onChange={(event) => setApproveAmount(event.target.value)}
                placeholder="e.g., 10000"
                data-testid="input-approve-request-amount"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setApproveTarget(null);
                setApproveReply("");
                setApproveAmount("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApproveSubmit}
              disabled={updateStatusMutation.isPending}
              data-testid="button-submit-approve-request"
            >
              {updateStatusMutation.isPending ? "Approving..." : "Approve Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Provide a clear reason so the chapter understands why this request was rejected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason for Rejection *</Label>
            <Textarea
              id="reject-reason"
              rows={5}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Explain the reason for rejection and what can be improved"
              data-testid="textarea-reject-request-reason"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={updateStatusMutation.isPending}
              data-testid="button-submit-reject-request"
            >
              {updateStatusMutation.isPending ? "Rejecting..." : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
