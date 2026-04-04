import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/ui/loading-state";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import PaginationControls from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/use-pagination";
import {
  Archive,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  MapPin,
  MessageSquare,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { format } from "date-fns";
import type { NationalRequest, Chapter, BarangayUser } from "@shared/schema";

type SenderFilter = "all" | "chapter" | "barangay";
type InboxUrgencyFilter = "all" | "overdue" | "due-soon" | "on-track";
type ArchiveReplyFilter = "all" | "with-reply" | "without-reply";
type InboxQuickFilter = "all" | "new" | "in-review" | "overdue";

export default function NationalRequestsManager() {
  const { toast } = useToast();
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<NationalRequest | null>(null);
  const [replyText, setReplyText] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");
  const [inboxSearchTerm, setInboxSearchTerm] = useState("");
  const [inboxSenderFilter, setInboxSenderFilter] = useState<SenderFilter>("all");
  const [inboxUrgencyFilter, setInboxUrgencyFilter] = useState<InboxUrgencyFilter>("all");
  const [inboxQuickFilter, setInboxQuickFilter] = useState<InboxQuickFilter>("all");
  const [archiveSearchTerm, setArchiveSearchTerm] = useState("");
  const [archiveSenderFilter, setArchiveSenderFilter] = useState<SenderFilter>("all");
  const [archiveReplyFilter, setArchiveReplyFilter] = useState<ArchiveReplyFilter>("all");

  const {
    data: requests = [],
    isLoading: requestsLoading,
    isFetched: requestsFetched,
  } = useQuery<NationalRequest[]>({
    queryKey: ["/api/national-requests"],
  });

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const {
    data: barangayUsers = [],
    isLoading: barangayUsersLoading,
    isFetched: barangayUsersFetched,
  } = useQuery<BarangayUser[]>({
    queryKey: ["/api/barangay-users"],
  });

  const isDashboardDataLoading =
    requestsLoading ||
    !requestsFetched ||
    chaptersLoading ||
    !chaptersFetched ||
    barangayUsersLoading ||
    !barangayUsersFetched;

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; status: string; adminReply?: string }) => {
      return await apiRequest("PATCH", `/api/national-requests/${data.id}`, {
        status: data.status,
        adminReply: data.adminReply
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Request updated successfully" });
      setShowReplyDialog(false);
      setSelectedRequest(null);
      setReplyText("");
      setNewStatus("");
      queryClient.invalidateQueries({ queryKey: ["/api/national-requests"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const getSenderName = (request: NationalRequest) => {
    if (request.senderType === "chapter") {
      const chapter = chapters.find(c => c.id === request.senderId);
      return chapter?.name || "Unknown Chapter";
    } else {
      const barangay = barangayUsers.find(b => b.id === request.senderId);
      return barangay?.barangayName || "Unknown Barangay";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "NEW":
        return <Badge variant="outline">New</Badge>;
      case "IN_REVIEW":
        return <Badge className="bg-yellow-500">In Review</Badge>;
      case "COMPLETED":
        return <Badge className="bg-green-500">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleOpenReply = (request: NationalRequest) => {
    setSelectedRequest(request);
    setReplyText(request.adminReply || "");
    setNewStatus(request.status);
    setShowReplyDialog(true);
  };

  const handleOpenDetails = (request: NationalRequest) => {
    setSelectedRequest(request);
    setShowDetailsDialog(true);
  };

  const handleSubmitReply = () => {
    if (!selectedRequest || !newStatus) return;
    updateMutation.mutate({
      id: selectedRequest.id,
      status: newStatus,
      adminReply: replyText || undefined
    });
  };

  if (isDashboardDataLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState label="Loading requests..." rows={2} compact />
        </CardContent>
      </Card>
    );
  }

  const todayStart = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, [requests.length]);

  const sevenDaysOut = useMemo(() => {
    const value = new Date(todayStart);
    value.setDate(value.getDate() + 7);
    return value;
  }, [todayStart]);

  const normalizedInboxQuery = inboxSearchTerm.trim().toLowerCase();
  const normalizedArchiveQuery = archiveSearchTerm.trim().toLowerCase();

  const newRequests = useMemo(() => requests.filter((request) => request.status === "NEW"), [requests]);
  const inReviewRequests = useMemo(() => requests.filter((request) => request.status === "IN_REVIEW"), [requests]);
  const completedRequests = useMemo(() => requests.filter((request) => request.status === "COMPLETED"), [requests]);

  const hasAdminReply = (request: NationalRequest) => Boolean(request.adminReply?.trim());

  const isOverdue = (request: NationalRequest) => {
    if (request.status === "COMPLETED") return false;
    return new Date(request.dateNeeded) < todayStart;
  };

  const isDueSoon = (request: NationalRequest) => {
    if (request.status === "COMPLETED") return false;
    const neededDate = new Date(request.dateNeeded);
    return neededDate >= todayStart && neededDate <= sevenDaysOut;
  };

  const matchesSearch = (request: NationalRequest, query: string) => {
    if (!query) return true;
    const searchableText = [
      request.subject,
      request.message,
      getSenderName(request),
      request.senderType,
      request.status,
    ]
      .join(" ")
      .toLowerCase();
    return searchableText.includes(query);
  };

  const matchesSender = (request: NationalRequest, filter: SenderFilter) => {
    if (filter === "all") return true;
    return request.senderType === filter;
  };

  const matchesUrgency = (request: NationalRequest) => {
    if (inboxUrgencyFilter === "all") return true;
    if (inboxUrgencyFilter === "overdue") return isOverdue(request);
    if (inboxUrgencyFilter === "due-soon") return isDueSoon(request);
    return !isOverdue(request) && !isDueSoon(request);
  };

  const filteredNewRequests = useMemo(
    () =>
      newRequests.filter(
        (request) =>
          matchesSearch(request, normalizedInboxQuery) &&
          matchesSender(request, inboxSenderFilter) &&
          matchesUrgency(request),
      ),
    [newRequests, normalizedInboxQuery, inboxSenderFilter, inboxUrgencyFilter, todayStart, sevenDaysOut],
  );

  const filteredInReviewRequests = useMemo(
    () =>
      inReviewRequests.filter(
        (request) =>
          matchesSearch(request, normalizedInboxQuery) &&
          matchesSender(request, inboxSenderFilter) &&
          matchesUrgency(request),
      ),
    [inReviewRequests, normalizedInboxQuery, inboxSenderFilter, inboxUrgencyFilter, todayStart, sevenDaysOut],
  );

  const filteredCompletedRequests = useMemo(
    () =>
      completedRequests.filter((request) => {
        const matchesArchiveSearch = matchesSearch(request, normalizedArchiveQuery);
        const matchesArchiveSender = matchesSender(request, archiveSenderFilter);
        const matchesArchiveReply =
          archiveReplyFilter === "all" ||
          (archiveReplyFilter === "with-reply" && hasAdminReply(request)) ||
          (archiveReplyFilter === "without-reply" && !hasAdminReply(request));

        return matchesArchiveSearch && matchesArchiveSender && matchesArchiveReply;
      }),
    [completedRequests, normalizedArchiveQuery, archiveSenderFilter, archiveReplyFilter],
  );

  const newRequestsPagination = usePagination(filteredNewRequests, {
    pageSize: 5,
    resetKey: `new-${normalizedInboxQuery}-${inboxSenderFilter}-${inboxUrgencyFilter}-${filteredNewRequests.length}`,
  });

  const inReviewPagination = usePagination(filteredInReviewRequests, {
    pageSize: 5,
    resetKey: `review-${normalizedInboxQuery}-${inboxSenderFilter}-${inboxUrgencyFilter}-${filteredInReviewRequests.length}`,
  });

  const archivePagination = usePagination(filteredCompletedRequests, {
    pageSize: 6,
    resetKey: `archive-${normalizedArchiveQuery}-${archiveSenderFilter}-${archiveReplyFilter}-${filteredCompletedRequests.length}`,
  });

  const showNewSection = inboxQuickFilter !== "in-review";
  const showInReviewSection = inboxQuickFilter !== "new";

  const handleQuickInboxFilter = (value: InboxQuickFilter) => {
    setInboxQuickFilter(value);

    if (value === "overdue") {
      setInboxUrgencyFilter("overdue");
      return;
    }

    if (inboxUrgencyFilter === "overdue") {
      setInboxUrgencyFilter("all");
    }
  };

  const overdueCount = requests.filter((request) => isOverdue(request)).length;
  const dueSoonCount = requests.filter((request) => isDueSoon(request)).length;
  const completedWithReplyCount = completedRequests.filter((request) => hasAdminReply(request)).length;
  const completedReplyRate =
    completedRequests.length === 0
      ? 0
      : Math.round((completedWithReplyCount / completedRequests.length) * 100);
  const chapterRequestCount = requests.filter((request) => request.senderType === "chapter").length;
  const barangayRequestCount = requests.filter((request) => request.senderType === "barangay").length;

  const renderRequestCard = (request: NationalRequest, isArchive = false) => (
    <Card
      key={request.id}
      className="hover-elevate cursor-pointer"
      onClick={() => handleOpenDetails(request)}
      data-testid={`card-request-${request.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {request.senderType === "chapter" ? (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <MapPin className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-muted-foreground">
                {request.senderType === "chapter" ? "Chapter" : "Barangay"}: {getSenderName(request)}
              </span>
            </div>

            <h4 className="font-medium truncate">{request.subject}</h4>

            <div className="mt-1 max-h-14 overflow-hidden">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-2 text-justify">
                {request.message}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Needed: {format(new Date(request.dateNeeded), "MMM d, yyyy")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Received: {format(new Date(request.createdAt), "MMM d, yyyy")}
              </span>
              {isArchive && (
                <span className="text-xs text-muted-foreground">
                  Reply: {hasAdminReply(request) ? "Provided" : "Not provided"}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(request.status)}
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenReply(request);
              }}
              data-testid={`button-reply-request-${request.id}`}
            >
              <Send className="h-4 w-4 mr-2" />
              Reply
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            National Request Inbox
          </CardTitle>
          <CardDescription>
            View and respond to messages from chapters and barangays
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Requests</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-2xl font-semibold">{requests.length}</p>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">New Requests</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-2xl font-semibold">{newRequests.length}</p>
                  <TriangleAlert className="h-4 w-4 text-amber-500" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{overdueCount} overdue</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">In Review</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-2xl font-semibold">{inReviewRequests.length}</p>
                  <Clock3 className="h-4 w-4 text-yellow-500" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{dueSoonCount} due within 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Completed</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-2xl font-semibold">{completedRequests.length}</p>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{completedReplyRate}% with admin reply</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Sender Mix</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Chapters: {chapterRequestCount}</p>
                  <p className="text-sm font-medium">Barangays: {barangayRequestCount}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No requests yet.</p>
          ) : (
            <section className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="font-semibold">Active Inbox</h3>
                <p className="text-sm text-muted-foreground">Track all new and in-review requests from one workspace.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={inboxQuickFilter === "all" ? "default" : "outline"}
                  onClick={() => handleQuickInboxFilter("all")}
                  data-testid="button-national-inbox-quick-all"
                >
                  All Active ({newRequests.length + inReviewRequests.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={inboxQuickFilter === "new" ? "default" : "outline"}
                  onClick={() => handleQuickInboxFilter("new")}
                  data-testid="button-national-inbox-quick-new"
                >
                  New ({newRequests.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={inboxQuickFilter === "in-review" ? "default" : "outline"}
                  onClick={() => handleQuickInboxFilter("in-review")}
                  data-testid="button-national-inbox-quick-in-review"
                >
                  In Review ({inReviewRequests.length})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={inboxQuickFilter === "overdue" ? "default" : "outline"}
                  onClick={() => handleQuickInboxFilter("overdue")}
                  data-testid="button-national-inbox-quick-overdue"
                >
                  Overdue ({overdueCount})
                </Button>
              </div>

              <div className="flex flex-col gap-3 xl:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={inboxSearchTerm}
                    onChange={(event) => setInboxSearchTerm(event.target.value)}
                    placeholder="Search subject, sender, or message"
                    className="pl-10"
                    data-testid="input-national-inbox-search"
                  />
                </div>

                <Select value={inboxSenderFilter} onValueChange={(value) => setInboxSenderFilter(value as SenderFilter)}>
                  <SelectTrigger className="w-full xl:w-[180px]" data-testid="select-national-inbox-sender-filter">
                    <SelectValue placeholder="Sender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Senders</SelectItem>
                    <SelectItem value="chapter">Chapter</SelectItem>
                    <SelectItem value="barangay">Barangay</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={inboxUrgencyFilter} onValueChange={(value) => setInboxUrgencyFilter(value as InboxUrgencyFilter)}>
                  <SelectTrigger className="w-full xl:w-[180px]" data-testid="select-national-inbox-urgency-filter">
                    <SelectValue placeholder="Urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Urgency</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="due-soon">Due Soon</SelectItem>
                    <SelectItem value="on-track">On Track</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className={`grid gap-4 ${showNewSection && showInReviewSection ? "xl:grid-cols-2" : "grid-cols-1"}`}>
                {showNewSection && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">New</h4>
                      <Badge variant="outline">{filteredNewRequests.length}</Badge>
                    </div>

                    {filteredNewRequests.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No new requests match your filters.</p>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {newRequestsPagination.paginatedItems.map((request) => renderRequestCard(request))}
                        </div>
                        <PaginationControls
                          currentPage={newRequestsPagination.currentPage}
                          totalPages={newRequestsPagination.totalPages}
                          itemsPerPage={newRequestsPagination.itemsPerPage}
                          totalItems={newRequestsPagination.totalItems}
                          startItem={newRequestsPagination.startItem}
                          endItem={newRequestsPagination.endItem}
                          onPageChange={newRequestsPagination.setCurrentPage}
                          onItemsPerPageChange={newRequestsPagination.setItemsPerPage}
                          itemLabel="new requests"
                        />
                      </>
                    )}
                  </div>
                )}

                {showInReviewSection && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">In Review</h4>
                      <Badge className="bg-yellow-500">{filteredInReviewRequests.length}</Badge>
                    </div>

                    {filteredInReviewRequests.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No in-review requests match your filters.</p>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {inReviewPagination.paginatedItems.map((request) => renderRequestCard(request))}
                        </div>
                        <PaginationControls
                          currentPage={inReviewPagination.currentPage}
                          totalPages={inReviewPagination.totalPages}
                          itemsPerPage={inReviewPagination.itemsPerPage}
                          totalItems={inReviewPagination.totalItems}
                          startItem={inReviewPagination.startItem}
                          endItem={inReviewPagination.endItem}
                          onPageChange={inReviewPagination.setCurrentPage}
                          onItemsPerPageChange={inReviewPagination.setItemsPerPage}
                          itemLabel="in-review requests"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Archives
          </CardTitle>
          <CardDescription>
            Completed requests, searchable with dedicated filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={archiveSearchTerm}
                onChange={(event) => setArchiveSearchTerm(event.target.value)}
                placeholder="Search archived requests"
                className="pl-10"
                data-testid="input-national-archive-search"
              />
            </div>

            <Select value={archiveSenderFilter} onValueChange={(value) => setArchiveSenderFilter(value as SenderFilter)}>
              <SelectTrigger className="w-full xl:w-[180px]" data-testid="select-national-archive-sender-filter">
                <SelectValue placeholder="Sender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Senders</SelectItem>
                <SelectItem value="chapter">Chapter</SelectItem>
                <SelectItem value="barangay">Barangay</SelectItem>
              </SelectContent>
            </Select>

            <Select value={archiveReplyFilter} onValueChange={(value) => setArchiveReplyFilter(value as ArchiveReplyFilter)}>
              <SelectTrigger className="w-full xl:w-[180px]" data-testid="select-national-archive-reply-filter">
                <SelectValue placeholder="Reply" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Replies</SelectItem>
                <SelectItem value="with-reply">With Reply</SelectItem>
                <SelectItem value="without-reply">Without Reply</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredCompletedRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No archived requests match your filters.</p>
          ) : (
            <>
              <div className="space-y-4">
                {archivePagination.paginatedItems.map((request) => renderRequestCard(request, true))}
              </div>
              <PaginationControls
                currentPage={archivePagination.currentPage}
                totalPages={archivePagination.totalPages}
                itemsPerPage={archivePagination.itemsPerPage}
                totalItems={archivePagination.totalItems}
                startItem={archivePagination.startItem}
                endItem={archivePagination.endItem}
                onPageChange={archivePagination.setCurrentPage}
                onItemsPerPageChange={archivePagination.setItemsPerPage}
                itemLabel="archived requests"
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
            <DialogHeader className="border-b px-6 py-4 pr-12">
              <DialogTitle>{selectedRequest?.subject}</DialogTitle>
              <DialogDescription>
                Received on {selectedRequest && format(new Date(selectedRequest.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">From</p>
                  <p className="mt-1 flex items-center gap-2">
                    {selectedRequest?.senderType === "chapter" ? (
                      <Building2 className="h-4 w-4" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                    {selectedRequest && getSenderName(selectedRequest)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                  <div className="mt-1">{selectedRequest && getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Date Needed</p>
                  <p className="mt-1">{selectedRequest && format(new Date(selectedRequest.dateNeeded), "MMMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Message</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-justify">{selectedRequest?.message}</p>
                </div>
                {selectedRequest?.adminReply && (
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-sm font-medium">Your Reply</p>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap text-justify">{selectedRequest.adminReply}</p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Close
              </Button>
              {selectedRequest && (
                <Button
                  onClick={() => {
                    setShowDetailsDialog(false);
                    handleOpenReply(selectedRequest);
                  }}
                  data-testid="button-open-reply-from-details"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Reply / Update
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReplyDialog} onOpenChange={setShowReplyDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reply to Request</DialogTitle>
            <DialogDescription>
              {selectedRequest?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">From</p>
              <p className="mt-1 flex items-center gap-2">
                {selectedRequest?.senderType === "chapter" ? (
                  <Building2 className="h-4 w-4" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                {selectedRequest && getSenderName(selectedRequest)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Message</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-justify">{selectedRequest?.message}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date Needed</p>
              <p className="mt-1">{selectedRequest && format(new Date(selectedRequest.dateNeeded), "MMMM d, yyyy")}</p>
            </div>
            <div className="space-y-2">
              <Label>Update Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="IN_REVIEW">In Review</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reply">Reply (Optional)</Label>
              <Textarea
                id="reply"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply here..."
                rows={4}
                data-testid="input-reply"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowReplyDialog(false)} data-testid="button-cancel-reply">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitReply} 
              disabled={updateMutation.isPending || !newStatus}
              data-testid="button-submit-reply"
            >
              <Send className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
