import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LoadingState from "@/components/ui/loading-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { ChapterRequest, Chapter } from "@shared/schema";

export default function ChapterRequestsPanel() {
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<ChapterRequest | null>(null);

  const {
    data: requests = [],
    isLoading: requestsLoading,
    isFetched: requestsFetched,
  } = useQuery<ChapterRequest[]>({
    queryKey: ["/api/chapter-requests"]
  });

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
    isFetched: chaptersFetched,
  } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"]
  });

  const isDashboardDataLoading =
    requestsLoading ||
    !requestsFetched ||
    chaptersLoading ||
    !chaptersFetched;

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      apiRequest("PATCH", `/api/chapter-requests/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chapter-requests"] });
      toast({
        title: "Success",
        description: "Request status updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update request status",
        variant: "destructive",
      });
    }
  });

  const getChapterName = (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    return chapter?.name || "Unknown Chapter";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="secondary"><AlertCircle className="h-3 w-3 mr-1" /> New</Badge>;
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

  const getPreviewText = (request: ChapterRequest) => {
    if (request.rationale) return request.rationale;
    if (request.howNationalCanHelp) return request.howNationalCanHelp;
    if (request.details) return request.details;
    return "No additional details provided.";
  };

  if (isDashboardDataLoading) {
    return <LoadingState label="Loading chapter requests..." rows={3} compact />;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Chapter Requests</CardTitle>
          <CardDescription>View and manage funding requests and other requests from chapters</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground">No chapter requests yet.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <Card
                  key={request.id}
                  className="hover-elevate transition-all cursor-pointer"
                  onClick={() => setSelectedRequest(request)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedRequest(request);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="w-full min-w-0 sm:flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <Badge variant="outline" className="capitalize">{request.type.replace(/_/g, ' ')}</Badge>
                          {getStatusBadge(request.status)}
                        </div>
                        <h3 className="text-base font-semibold leading-tight break-words sm:text-lg">{request.proposedActivityName || "Unnamed Request"}</h3>
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
                        <div className="mt-3">
                          <p className="text-sm font-medium">Preview</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words overflow-hidden [display:-webkit-box] [-webkit-line-clamp:3] sm:[-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                            {getPreviewText(request)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">Tap card to view full details</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Submitted: {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
                        </p>
                      </div>
                      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end" onClick={(e) => e.stopPropagation()}>
                        {request.status === "new" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 sm:flex-none"
                            onClick={() => updateStatusMutation.mutate({ id: request.id, status: "in_review" })}
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
                              onClick={() => updateStatusMutation.mutate({ id: request.id, status: "approved" })}
                              disabled={updateStatusMutation.isPending}
                              data-testid={`button-approve-request-${request.id}`}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="flex-1 sm:flex-none"
                              onClick={() => updateStatusMutation.mutate({ id: request.id, status: "rejected" })}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border p-0 gap-0 flex flex-col sm:w-full">
          {selectedRequest && (
            <>
              <DialogHeader className="flex-none border-b bg-background/95 px-4 py-3 pr-14 backdrop-blur-sm md:px-6">
                <DialogTitle className="break-words">{selectedRequest.proposedActivityName || "Unnamed Request"}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 flex-wrap pt-1">
                  <Badge variant="outline" className="capitalize">{selectedRequest.type.replace(/_/g, ' ')}</Badge>
                  {getStatusBadge(selectedRequest.status)}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
                <div className="space-y-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {getChapterName(selectedRequest.chapterId)}
                </p>

                {selectedRequest.date && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(selectedRequest.date), "MMMM d, yyyy")}
                    {selectedRequest.time && ` at ${selectedRequest.time}`}
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
                    <p className="text-sm font-medium">How National Can Help:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.howNationalCanHelp}</p>
                  </div>
                )}

                {selectedRequest.details && (
                  <div>
                    <p className="text-sm font-medium">Additional Details:</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{selectedRequest.details}</p>
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
                      onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: "in_review" })}
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
                        onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: "approved" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-modal-approve-request-${selectedRequest.id}`}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="w-full sm:w-auto"
                        onClick={() => updateStatusMutation.mutate({ id: selectedRequest.id, status: "rejected" })}
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
    </>
  );
}
