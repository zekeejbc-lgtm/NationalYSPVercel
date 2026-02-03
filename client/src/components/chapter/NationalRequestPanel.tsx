import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MessageSquare, Plus, Calendar, Clock, Send, Eye } from "lucide-react";
import { format } from "date-fns";
import type { NationalRequest } from "@shared/schema";

interface NationalRequestPanelProps {
  senderType: "chapter" | "barangay";
}

export default function NationalRequestPanel({ senderType }: NationalRequestPanelProps) {
  const { toast } = useToast();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<NationalRequest | null>(null);
  
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");

  const { data: requests = [], isLoading } = useQuery<NationalRequest[]>({
    queryKey: ["/api/national-requests/my-requests"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { subject: string; message: string; dateNeeded: string }) => {
      return await apiRequest("POST", "/api/national-requests", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Message sent to YSP National" });
      setShowNewDialog(false);
      setSubject("");
      setMessage("");
      setDateNeeded("");
      queryClient.invalidateQueries({ queryKey: ["/api/national-requests/my-requests"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message || !dateNeeded) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate({ subject, message, dateNeeded });
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Loading messages...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Messages to YSP National
              </CardTitle>
              <CardDescription>
                Send requests or messages to YSP National office
              </CardDescription>
            </div>
            <Button onClick={() => setShowNewDialog(true)} data-testid="button-new-message">
              <Plus className="h-4 w-4 mr-2" />
              New Message
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No messages yet. Click "New Message" to send a request to YSP National.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <Card 
                  key={request.id} 
                  className="hover-elevate cursor-pointer" 
                  onClick={() => {
                    setSelectedRequest(request);
                    setShowViewDialog(true);
                  }}
                  data-testid={`card-request-${request.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{request.subject}</h4>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Needed: {format(new Date(request.dateNeeded), "MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Sent: {format(new Date(request.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(request.status)}
                        <Button variant="ghost" size="icon" data-testid={`button-view-request-${request.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {request.adminReply && (
                      <div className="mt-3 p-3 bg-muted rounded-md">
                        <p className="text-sm font-medium">Reply from YSP National:</p>
                        <p className="text-sm text-muted-foreground mt-1">{request.adminReply}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message to YSP National</DialogTitle>
            <DialogDescription>
              Submit a request or message to the YSP National office
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your request"
                required
                data-testid="input-subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Provide details about your request..."
                rows={5}
                required
                data-testid="input-message"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateNeeded">Date Needed *</Label>
              <Input
                id="dateNeeded"
                type="date"
                value={dateNeeded}
                onChange={(e) => setDateNeeded(e.target.value)}
                required
                data-testid="input-date-needed"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewDialog(false)} data-testid="button-cancel-new-message">
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-send-message">
                <Send className="h-4 w-4 mr-2" />
                {createMutation.isPending ? "Sending..." : "Send Message"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedRequest?.subject}</DialogTitle>
            <DialogDescription>
              Sent on {selectedRequest && format(new Date(selectedRequest.createdAt), "MMMM d, yyyy 'at' h:mm a")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
              <p className="mt-1 whitespace-pre-wrap">{selectedRequest?.message}</p>
            </div>
            {selectedRequest?.adminReply && (
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm font-medium">Reply from YSP National</p>
                <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{selectedRequest.adminReply}</p>
                {selectedRequest.repliedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Replied on {format(new Date(selectedRequest.repliedAt), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
