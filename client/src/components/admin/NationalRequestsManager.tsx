import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageSquare, Calendar, Clock, Send, Eye, Building2, MapPin } from "lucide-react";
import { format } from "date-fns";
import type { NationalRequest, Chapter, BarangayUser } from "@shared/schema";

export default function NationalRequestsManager() {
  const { toast } = useToast();
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<NationalRequest | null>(null);
  const [replyText, setReplyText] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");

  const { data: requests = [], isLoading } = useQuery<NationalRequest[]>({
    queryKey: ["/api/national-requests"],
  });

  const { data: chapters = [] } = useQuery<Chapter[]>({
    queryKey: ["/api/chapters"],
  });

  const { data: barangayUsers = [] } = useQuery<BarangayUser[]>({
    queryKey: ["/api/barangay-users"],
  });

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

  const handleSubmitReply = () => {
    if (!selectedRequest || !newStatus) return;
    updateMutation.mutate({
      id: selectedRequest.id,
      status: newStatus,
      adminReply: replyText || undefined
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3" role="status" aria-label="Loading requests">
            <div className="h-5 w-48 rounded-md bg-muted skeleton-shimmer" />
            <div className="h-14 w-full rounded-lg bg-muted skeleton-shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const newRequests = requests.filter(r => r.status === "NEW");
  const inReviewRequests = requests.filter(r => r.status === "IN_REVIEW");
  const completedRequests = requests.filter(r => r.status === "COMPLETED");

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
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Badge variant="outline" className="text-base px-4 py-2">
              New: {newRequests.length}
            </Badge>
            <Badge className="bg-yellow-500 text-base px-4 py-2">
              In Review: {inReviewRequests.length}
            </Badge>
            <Badge className="bg-green-500 text-base px-4 py-2">
              Completed: {completedRequests.length}
            </Badge>
          </div>

          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No requests yet.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <Card key={request.id} className="hover-elevate" data-testid={`card-request-${request.id}`}>
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
                        <h4 className="font-medium">{request.subject}</h4>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{request.message}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Needed: {format(new Date(request.dateNeeded), "MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Received: {format(new Date(request.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                        {request.adminReply && (
                          <div className="mt-3 p-3 bg-muted rounded-md">
                            <p className="text-sm font-medium">Your Reply:</p>
                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{request.adminReply}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(request.status)}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleOpenReply(request)}
                          data-testid={`button-reply-request-${request.id}`}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Reply
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <p className="mt-1 whitespace-pre-wrap text-sm">{selectedRequest?.message}</p>
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
