import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { ChapterRequest, Chapter } from "@shared/schema";

export default function ChapterRequestsPanel() {
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useQuery<ChapterRequest[]>({
    queryKey: ["/api/chapter-requests"]
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"]
  });

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

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
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
              <Card key={request.id} className="hover-elevate transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge variant="outline" className="capitalize">{request.type.replace(/_/g, ' ')}</Badge>
                        {getStatusBadge(request.status)}
                      </div>
                      <h3 className="font-semibold text-lg">{request.proposedActivityName || "Unnamed Request"}</h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Users className="h-3 w-3" />
                        {getChapterName(request.chapterId)}
                      </p>
                      {request.date && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(request.date), "MMMM d, yyyy")}
                          {request.time && ` at ${request.time}`}
                        </p>
                      )}
                      {request.rationale && (
                        <div className="mt-3">
                          <p className="text-sm font-medium">Rationale:</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.rationale}</p>
                        </div>
                      )}
                      {request.howNationalCanHelp && (
                        <div className="mt-3">
                          <p className="text-sm font-medium">How National Can Help:</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.howNationalCanHelp}</p>
                        </div>
                      )}
                      {request.details && (
                        <div className="mt-3">
                          <p className="text-sm font-medium">Additional Details:</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{request.details}</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-3">
                        Submitted: {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {request.status === "new" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: request.id, status: "in_review" })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-review-request-${request.id}`}
                          >
                            Mark In Review
                          </Button>
                        </>
                      )}
                      {(request.status === "new" || request.status === "in_review") && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => updateStatusMutation.mutate({ id: request.id, status: "approved" })}
                            disabled={updateStatusMutation.isPending}
                            data-testid={`button-approve-request-${request.id}`}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
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
  );
}
